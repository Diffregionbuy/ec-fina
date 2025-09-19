import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { commandLogger } from '../utils/logger';

const adminCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin panel for bot configuration')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show bot status and statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('templates')
                .setDescription('Manage server templates')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('products')
                .setDescription('View product statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('payments')
                .setDescription('View payment analytics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cache')
                .setDescription('Manage bot cache')
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Cache action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Clear All', value: 'clear_all' },
                            { name: 'Clear Templates', value: 'clear_templates' },
                            { name: 'Clear Payments', value: 'clear_payments' },
                            { name: 'View Stats', value: 'view_stats' }
                        )
                )
        ),
    
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        // Check if user has admin permissions
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                flags: 64
            });
            return;
        }

        await interaction.deferReply({ flags: 64 });

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'status':
                    await handleStatus(interaction);
                    break;
                case 'templates':
                    await handleTemplates(interaction);
                    break;
                case 'products':
                    await handleProducts(interaction);
                    break;
                case 'payments':
                    await handlePayments(interaction);
                    break;
                case 'cache':
                    await handleCache(interaction);
                    break;
                default:
                    await interaction.editReply({
                        content: '❌ Unknown subcommand.'
                    });
            }
        } catch (error) {
            commandLogger.error('Admin command error:', error);
            await interaction.editReply({
                content: '❌ An error occurred while executing the admin command.'
            });
        }
    },
    
    permissions: [PermissionFlagsBits.Administrator],
    adminOnly: true,
    guildOnly: true,
    cooldown: 5
};

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    const { BotApiService } = await import('../services/botApiService');
    
    try {
        // Get API health status
        const healthStatus = await BotApiService.getInstance().healthCheck();
        
        const statusEmbed = new EmbedBuilder()
            .setTitle('🤖 Bot Status')
            .setColor(healthStatus.success ? 0x00FF00 : 0xFF0000)
            .addFields(
                {
                    name: '🔗 API Connection',
                    value: healthStatus.success ? '✅ Connected' : '❌ Disconnected',
                    inline: true
                },
                {
                    name: '📊 Response Time',
                    value: `${healthStatus.responseTime || 'N/A'}ms`,
                    inline: true
                },
                {
                    name: '🕐 Uptime',
                    value: formatUptime(process.uptime()),
                    inline: true
                },
                {
                    name: '💾 Memory Usage',
                    value: formatMemoryUsage(),
                    inline: true
                },
                {
                    name: '🏠 Guild Count',
                    value: interaction.client.guilds.cache.size.toString(),
                    inline: true
                },
                {
                    name: '👥 User Count',
                    value: interaction.client.users.cache.size.toString(),
                    inline: true
                }
            )
            .setTimestamp();

        await interaction.editReply({
            embeds: [statusEmbed]
        });

    } catch (error) {
        commandLogger.error('Status check error:', error);
        await interaction.editReply({
            content: '❌ Failed to retrieve bot status.'
        });
    }
}

async function handleTemplates(interaction: ChatInputCommandInteraction): Promise<void> {
    const { TemplateService } = await import('../services/templateService');
    
    try {
        const serverId = interaction.guildId!;
        const templates = await TemplateService.getInstance().getServerTemplates(serverId);
        
        const templateEmbed = new EmbedBuilder()
            .setTitle('📋 Server Templates')
            .setColor(0x0099FF)
            .setDescription(`Found **${templates.length}** templates for this server`)
            .setTimestamp();

        if (templates.length > 0) {
            templates.slice(0, 10).forEach((template: any, index: number) => {
                templateEmbed.addFields({
                    name: `${index + 1}. ${template.name}`,
                    value: `Type: ${template.type}\nVariables: ${template.variables?.length || 0}`,
                    inline: true
                });
            });

            if (templates.length > 10) {
                templateEmbed.setFooter({
                    text: `Showing 10 of ${templates.length} templates`
                });
            }
        } else {
            templateEmbed.setDescription('No templates found for this server.');
        }

        const refreshButton = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('refresh_templates')
                    .setLabel('🔄 Refresh Cache')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({
            embeds: [templateEmbed],
            components: [refreshButton]
        });

    } catch (error) {
        commandLogger.error('Templates fetch error:', error);
        await interaction.editReply({
            content: '❌ Failed to retrieve templates.'
        });
    }
}

async function handleProducts(interaction: ChatInputCommandInteraction): Promise<void> {
    const { BotApiService } = await import('../services/botApiService');
    
    try {
        const serverId = interaction.guildId!;
        const [products, categories] = await Promise.all([
            BotApiService.getInstance().getProducts(serverId),
            BotApiService.getInstance().getCategories(serverId)
        ]);

        const productEmbed = new EmbedBuilder()
            .setTitle('🛍️ Product Statistics')
            .setColor(0x0099FF)
            .addFields(
                {
                    name: '📦 Total Products',
                    value: products.length.toString(),
                    inline: true
                },
                {
                    name: '✅ Active Products',
                    value: products.filter((p: any) => p.is_active).length.toString(),
                    inline: true
                },
                {
                    name: '📂 Categories',
                    value: categories.length.toString(),
                    inline: true
                }
            )
            .setTimestamp();

        if (categories.length > 0) {
            categories.slice(0, 5).forEach((category: any) => {
                const categoryProducts = products.filter((p: any) => p.category_id === category.id);
                productEmbed.addFields({
                    name: `📁 ${category.name}`,
                    value: `${categoryProducts.length} products`,
                    inline: true
                });
            });
        }

        await interaction.editReply({
            embeds: [productEmbed]
        });

    } catch (error) {
        commandLogger.error('Products fetch error:', error);
        await interaction.editReply({
            content: '❌ Failed to retrieve product statistics.'
        });
    }
}

async function handlePayments(interaction: ChatInputCommandInteraction): Promise<void> {
    const paymentEmbed = new EmbedBuilder()
        .setTitle('💳 Payment Analytics')
        .setColor(0x0099FF)
        .setDescription('Payment analytics feature coming soon!')
        .addFields(
            {
                name: '🔄 Status',
                value: 'Under Development',
                inline: true
            },
            {
                name: '📊 Features',
                value: '• Order statistics\n• Revenue tracking\n• Payment methods\n• Transaction history',
                inline: false
            }
        )
        .setTimestamp();

    await interaction.editReply({
        embeds: [paymentEmbed]
    });
}

async function handleCache(interaction: ChatInputCommandInteraction): Promise<void> {
    const action = interaction.options.getString('action', true);
    const { TemplateService } = await import('../services/templateService');
    const { PaymentService } = await import('../services/paymentService');
    
    try {
        let resultMessage = '';

        switch (action) {
            case 'clear_all':
                TemplateService.getInstance().clearCache();
                PaymentService.getInstance().clearCache();
                resultMessage = '✅ All caches cleared successfully!';
                break;
            
            case 'clear_templates':
                TemplateService.getInstance().clearCache();
                resultMessage = '✅ Template cache cleared successfully!';
                break;
            
            case 'clear_payments':
                PaymentService.getInstance().clearCache();
                resultMessage = '✅ Payment cache cleared successfully!';
                break;
            
            case 'view_stats':
                const templateStats = TemplateService.getInstance().getCacheStats();
                const paymentStats = PaymentService.getInstance().getCacheStats();
                
                const statsEmbed = new EmbedBuilder()
                    .setTitle('📊 Cache Statistics')
                    .setColor(0x0099FF)
                    .addFields(
                        {
                            name: '📋 Template Cache',
                            value: `Total Cached: ${templateStats.totalCached}\nServers: ${templateStats.servers?.length ?? 0}`,
                            inline: true
                        },
                        {
                            name: '💳 Payment Cache',
                            value: `Entries: ${paymentStats.entries}\nHits: ${paymentStats.hits}\nMisses: ${paymentStats.misses}`,
                            inline: true
                        }
                    )
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [statsEmbed]
                });
                return;
            
            default:
                resultMessage = '❌ Unknown cache action.';
        }

        await interaction.editReply({
            content: resultMessage
        });

    } catch (error) {
        commandLogger.error('Cache management error:', error);
        await interaction.editReply({
            content: '❌ Failed to manage cache.'
        });
    }
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function formatMemoryUsage(): string {
    const used = process.memoryUsage();
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024 * 100) / 100;
    
    return `${mb(used.heapUsed)}MB / ${mb(used.heapTotal)}MB`;
}

function logCommand(command: string, userId: string, guildId: string | undefined, success: boolean, error?: string): void {
    commandLogger.info('Admin command executed', {
        command,
        userId,
        guildId,
        success,
        error
    });
}

export default adminCommand;