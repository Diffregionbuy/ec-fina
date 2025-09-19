import { Guild } from 'discord.js';
import { eventLogger, logEvent } from '../utils/logger';

export class EventHandler {
    private bot: any; // ECBot instance

    constructor(bot: any) {
        this.bot = bot;
    }

    /**
     * Handle bot joining a new guild
     */
    public async handleGuildJoin(guild: Guild): Promise<void> {
        try {
            logEvent('guild_join', {
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount,
                ownerId: guild.ownerId
            });

            eventLogger.info(`Bot joined guild: ${guild.name} (${guild.id})`, {
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount,
                ownerId: guild.ownerId,
                features: guild.features
            });

            // Send welcome message to the guild owner or system channel
            await this.sendWelcomeMessage(guild);

            // Initialize guild settings if needed
            await this.initializeGuildSettings(guild);

        } catch (error: any) {
            logEvent('guild_join', {
                guildId: guild.id,
                guildName: guild.name,
                error: error.message
            }, false, error);

            eventLogger.error(`Error handling guild join for ${guild.name}:`, error);
        }
    }

    /**
     * Handle bot leaving a guild
     */
    public async handleGuildLeave(guild: Guild): Promise<void> {
        try {
            logEvent('guild_leave', {
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount
            });

            eventLogger.info(`Bot left guild: ${guild.name} (${guild.id})`, {
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount
            });

            // Clean up guild-specific data if needed
            await this.cleanupGuildData(guild);

        } catch (error: any) {
            logEvent('guild_leave', {
                guildId: guild.id,
                guildName: guild.name,
                error: error.message
            }, false, error);

            eventLogger.error(`Error handling guild leave for ${guild.name}:`, error);
        }
    }

    /**
     * Send welcome message to new guild
     */
    private async sendWelcomeMessage(guild: Guild): Promise<void> {
        try {
            // Try to find the best channel to send welcome message
            let targetChannel = guild.systemChannel;

            // If no system channel, try to find a general channel
            if (!targetChannel) {
                const channels = guild.channels.cache.filter(channel => 
                    channel.isTextBased() && 
                    channel.permissionsFor(guild.members.me!)?.has('SendMessages')
                );

                // Look for common channel names
                const commonNames = ['general', 'welcome', 'bot-commands', 'commands'];
                for (const name of commonNames) {
                    const channel = channels.find(ch => ch.name.toLowerCase().includes(name));
                    if (channel && channel.isTextBased()) {
                        targetChannel = channel as any;
                        break;
                    }
                }

                // If still no channel, use the first available text channel
                if (!targetChannel) {
                    const firstChannel = channels.first();
                    if (firstChannel && firstChannel.isTextBased()) {
                        targetChannel = firstChannel as any;
                    }
                }
            }

            if (targetChannel && targetChannel.isTextBased()) {
                const welcomeEmbed = this.bot.templateService.createInfoEmbed(
                    '🎉 Welcome to EC Bot!',
                    `Thank you for adding EC Bot to **${guild.name}**!\n\n` +
                    '**Getting Started:**\n' +
                    '• Use `/shop` to browse products\n' +
                    '• Use `/admin` to configure the bot (Admin only)\n' +
                    '• Use `/link` to connect your Minecraft account\n\n' +
                    '**Features:**\n' +
                    '• 🛍️ Product browsing and purchasing\n' +
                    '• 💳 Secure cryptocurrency payments\n' +
                    '• ⛏️ Minecraft account integration\n' +
                    '• 📊 Analytics and reporting\n\n' +
                    'Need help? Contact our support team!'
                );

                await targetChannel.send({ embeds: [welcomeEmbed] });

                eventLogger.info(`Sent welcome message to ${guild.name} in channel ${targetChannel.name}`);
            } else {
                eventLogger.warn(`Could not find suitable channel to send welcome message in guild ${guild.name}`);
            }

        } catch (error: any) {
            eventLogger.error(`Failed to send welcome message to guild ${guild.name}:`, error);
        }
    }

    /**
     * Initialize guild settings
     */
    private async initializeGuildSettings(guild: Guild): Promise<void> {
        try {
            // Check if guild already has templates configured
            const templates = await this.bot.templateService.getServerTemplates(guild.id);
            
            if (templates.length === 0) {
                eventLogger.info(`Guild ${guild.name} has no templates configured`);
                
                // Could send a message to admin about setting up templates
                const owner = await guild.fetchOwner();
                if (owner) {
                    try {
                        const setupEmbed = this.bot.templateService.createWarningEmbed(
                            '⚙️ Setup Required',
                            `Hello! EC Bot has been added to **${guild.name}**, but no templates are configured yet.\n\n` +
                            'To get started:\n' +
                            '1. Visit the EC Bot dashboard\n' +
                            '2. Configure your server templates\n' +
                            '3. Set up your products and categories\n' +
                            '4. Configure payment settings\n\n' +
                            'Use `/admin` in your server for quick setup options!'
                        );

                        await owner.send({ embeds: [setupEmbed] });
                        eventLogger.info(`Sent setup message to owner of ${guild.name}`);
                    } catch (dmError) {
                        eventLogger.warn(`Could not send DM to owner of ${guild.name}:`, dmError);
                    }
                }
            } else {
                eventLogger.info(`Guild ${guild.name} has ${templates.length} templates configured`);
            }

        } catch (error: any) {
            eventLogger.error(`Failed to initialize settings for guild ${guild.name}:`, error);
        }
    }

    /**
     * Clean up guild-specific data
     */
    private async cleanupGuildData(guild: Guild): Promise<void> {
        try {
            // Clear template cache for this guild
            this.bot.templateService.clearCache(guild.id);
            
            // Clear payment cache (if any orders are cached for this guild)
            this.bot.paymentService.clearCache();

            eventLogger.info(`Cleaned up data for guild ${guild.name}`);

        } catch (error: any) {
            eventLogger.error(`Failed to cleanup data for guild ${guild.name}:`, error);
        }
    }

    /**
     * Handle member join (if needed in the future)
     */
    public async handleMemberJoin(member: any): Promise<void> {
        // Implementation for member join events if needed
        logEvent('member_join', {
            userId: member.id,
            username: member.user.username,
            guildId: member.guild.id,
            guildName: member.guild.name
        });
    }

    /**
     * Handle member leave (if needed in the future)
     */
    public async handleMemberLeave(member: any): Promise<void> {
        // Implementation for member leave events if needed
        logEvent('member_leave', {
            userId: member.id,
            username: member.user.username,
            guildId: member.guild.id,
            guildName: member.guild.name
        });
    }

    /**
     * Get event statistics
     */
    public getEventStats(): Record<string, number> {
        // This would be implemented with actual tracking
        return {
            guildJoins: 0,
            guildLeaves: 0,
            memberJoins: 0,
            memberLeaves: 0
        };
    }
}