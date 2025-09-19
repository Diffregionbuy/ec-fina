import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { logger } from './utils/logger';
import { CommandHandler } from './handlers/commandHandler';
import { InteractionHandler } from './handlers/interactionHandler';
import { EventHandler } from './handlers/eventHandler';
import { BotApiService } from './services/botApiService';
import { TemplateService } from './services/templateService';
import { PaymentService } from './services/paymentService';
import { Command } from './types/command';
import fs from 'fs';
import path from 'path';

// Env is preloaded via import 'dotenv/config' above

class ECBot {
    public client: Client;
    public commands: Collection<string, Command>;
    public apiService: BotApiService;
    public templateService: TemplateService;
    public paymentService: PaymentService;
    private commandHandler: CommandHandler;
    private interactionHandler: InteractionHandler;
    private eventHandler: EventHandler;

    constructor() {
        // Initialize Discord client with required intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.DirectMessages
            ]
        });

        // Initialize collections and services
        this.commands = new Collection();
        this.apiService = BotApiService.getInstance();
        this.templateService = TemplateService.getInstance();
        this.paymentService = PaymentService.getInstance();

        // Initialize handlers
        this.commandHandler = new CommandHandler(this);
        this.interactionHandler = new InteractionHandler(this);
        this.eventHandler = new EventHandler(this);

        // Set up event listeners
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Bot ready event
        this.client.once('ready', async () => {
            await this.onReady();
        });

        // Interaction events
        this.client.on('interactionCreate', async (interaction) => {
            logger.info('interactionCreate received', {
                type: interaction.type,
                isChatInput: (interaction as any).isChatInputCommand?.() ?? false,
                userId: (interaction as any).user?.id,
                guildId: (interaction as any).guildId
            });
            await this.interactionHandler.handleInteraction(interaction);
        });
        // Raw gateway debug for INTERACTION packets
        this.client.on('raw', (packet) => {
            try {
                const t = (packet as any)?.t;
                if (t && String(t).includes('INTERACTION')) {
                    logger.info('raw INTERACTION packet', { t });
                }
            } catch {}
        });

        // Guild events
        this.client.on('guildCreate', async (guild) => {
            await this.eventHandler.handleGuildJoin(guild);
        });

        this.client.on('guildDelete', async (guild) => {
            await this.eventHandler.handleGuildLeave(guild);
        });

        // Diagnostic: messageCreate to verify gateway delivery
        this.client.on('messageCreate', async (message) => {
            try {
                if (message.author.bot) return;
                logger.info('messageCreate received', {
                    guildId: message.guildId,
                    channelId: message.channelId,
                    content: message.content?.slice(0, 64)
                });
                if (message.content === '!ping') {
                    await message.reply('pong');
                }
            } catch (e) {
                logger.error('messageCreate handler error', e);
            }
        });

        // Error handling
        this.client.on('error', (error) => {
            logger.error('Discord client error:', error);
        });

        this.client.on('warn', (warning) => {
            logger.warn('Discord client warning:', warning);
        });

        // Unhandled promise rejections
        process.on('unhandledRejection', (error) => {
            logger.error('Unhandled promise rejection:', error);
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception:', error);
            process.exit(1);
        });
    }

    private async onReady(): Promise<void> {
        if (!this.client.user) {
            logger.error('Client user is null');
            return;
        }

        logger.info(`Bot is ready! Logged in as ${this.client.user.tag}`);
        logger.info(`Bot is in ${this.client.guilds.cache.size} guilds`);
        const appId = this.client.user.id;
        const cfgId = process.env.DISCORD_CLIENT_ID;
        const invite = `https://discord.com/api/oauth2/authorize?client_id=${cfgId}&scope=bot%20applications.commands&permissions=0`;
        logger.info('Discord IDs and Invite URL', { appId, cfgId, invite });
        if (cfgId && cfgId !== appId) {
            logger.warn('DISCORD_CLIENT_ID does not match logged-in appId. Slash commands may target a different app.', { appId, cfgId });
        }

        // Set bot status
        this.client.user.setActivity('EC Bot | /shop to start', { type: 0 });

        // Load and register commands
        await this.loadCommands();
        await this.registerCommands();

        // Initialize API authentication
        try {
            await this.apiService.authenticate();
            logger.info('Successfully authenticated with backend API');
        } catch (error) {
            logger.error('Failed to authenticate with backend API:', error);
        }

        logger.info('Bot initialization complete');
    }

    private async loadCommands(): Promise<void> {
        const commandsPath = path.join(__dirname, 'commands');
        
        if (!fs.existsSync(commandsPath)) {
            logger.warn('Commands directory does not exist');
            return;
        }

        const commandFiles = fs.readdirSync(commandsPath).filter(file => 
            file.endsWith('.js') || file.endsWith('.ts')
        );

        for (const file of commandFiles) {
            try {
                const filePath = path.join(commandsPath, file);
                let commandModule: any;
                if (file.endsWith('.ts')) {
                    // Use require for .ts in dev to avoid dynamic import issues under ts-node
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    commandModule = require(filePath);
                } else {
                    commandModule = await import(filePath);
                }
                const command: Command = commandModule.default || commandModule;

                if ('data' in command && 'execute' in command) {
                    this.commands.set(command.data.name, command);
                    logger.info(`Loaded command: ${command.data.name}`);
                } else {
                    logger.warn(`Command file ${file} is missing required properties`);
                }
            } catch (error) {
                logger.error(`Error loading command ${file}:`, error);
            }
        }

        logger.info(`Loaded ${this.commands.size} commands`);
    }

    private async registerCommands(): Promise<void> {
        if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
            logger.error('Missing required environment variables for command registration');
            return;
        }

        const commands = Array.from(this.commands.values()).map(command => command.data.toJSON());

        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        const runtimeId = this.client.user?.id as string | undefined;
        const clientId = runtimeId || process.env.DISCORD_CLIENT_ID!;
        const devGuildId = process.env.BOT_DEV_GUILD_ID; // optional: instant guild registration
        if (runtimeId && process.env.DISCORD_CLIENT_ID && runtimeId !== process.env.DISCORD_CLIENT_ID) {
            logger.warn('DISCORD_CLIENT_ID differs from logged-in app id; registering commands using runtime app id', { runtimeId, envId: process.env.DISCORD_CLIENT_ID });
        }

        try {
            if (devGuildId) {
                logger.info('Refreshing guild (/) commands', { guildId: devGuildId });
                await rest.put(
                    Routes.applicationGuildCommands(clientId, devGuildId),
                    { body: commands }
                );
                logger.info(`Successfully reloaded ${commands.length} guild (/) commands`, { guildId: devGuildId });
            } else {
                logger.info('BOT_DEV_GUILD_ID not set, skipping guild command registration');
            }

            // Also register globally (optional, slower propagation)
            logger.info('Refreshing global application (/) commands');
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
            logger.info(`Successfully reloaded ${commands.length} global application (/) commands`);
        } catch (error) {
            logger.error('Error registering commands:', error);
        }
    }

    public async start(): Promise<void> {
        if (!process.env.DISCORD_TOKEN) {
            logger.error('DISCORD_TOKEN is not set in environment variables');
            if (process.env.NODE_ENV === 'production') {
                process.exit(1);
            } else {
                logger.warn('Dev mode: will retry login in 30s...');
                setTimeout(() => this.start().catch(() => {}), 30000);
                return;
            }
        }

        try {
            await this.client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
            logger.error('Failed to login to Discord:', error);
            if (process.env.NODE_ENV === 'production') {
                process.exit(1);
            } else {
                logger.warn('Dev mode: will retry login in 30s (check proxy/VPN to reach discord.com:443)');
                setTimeout(() => this.start().catch(() => {}), 30000);
            }
        }
    }

    public async shutdown(): Promise<void> {
        logger.info('Shutting down bot...');
        
        try {
            this.client.destroy();
            logger.info('Bot shutdown complete');
        } catch (error) {
            logger.error('Error during shutdown:', error);
        }
    }
}

// Create and start the bot
const bot = new ECBot();

// Graceful shutdown handling
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await bot.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await bot.shutdown();
    process.exit(0);
});

// Start the bot
bot.start().catch((error) => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});

export default bot;
