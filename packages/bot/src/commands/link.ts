import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../types';
import { commandLogger } from '../utils/logger';

const linkCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Minecraft account linking system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('minecraft')
                .setDescription('Generate a linking code for your Minecraft account')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check your account linking status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unlink')
                .setDescription('Unlink your Minecraft account')
        ),
    
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guildId) {
            await interaction.reply({
                content: '❌ This command can only be used in a server.',
                flags: 64
            });
            return;
        }

        await interaction.deferReply({ flags: 64 });

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'minecraft':
                    await handleMinecraftLink(interaction);
                    break;
                case 'status':
                    await handleLinkStatus(interaction);
                    break;
                case 'unlink':
                    await handleUnlink(interaction);
                    break;
                default:
                    await interaction.editReply({
                        content: '❌ Unknown subcommand.'
                    });
            }
        } catch (error) {
            commandLogger.error('Link command error:', error);
            await interaction.editReply({
                content: '❌ An error occurred while processing your request.'
            });
        }
    },
    
    guildOnly: true,
    cooldown: 10
};

async function handleMinecraftLink(interaction: ChatInputCommandInteraction): Promise<void> {
    const { BotApiService } = await import('../services/botApiService');
    
    try {
        const serverId = interaction.guildId!;
        const userId = interaction.user.id;

        // Check if user is already linked
        const mcAccount = await BotApiService.getInstance().getMinecraftAccount(serverId, userId);
        
        if (mcAccount) {
            const statusEmbed = new EmbedBuilder()
                .setTitle('✅ Already Linked')
                .setColor(0x00FF00)
                .setDescription('Your Discord account is already linked to a Minecraft account.')
                .addFields(
                    {
                        name: '🎮 Minecraft Username',
                        value: mcAccount.minecraft_username || 'Unknown',
                        inline: true
                    },
                    {
                        name: '🔗 Linked Since',
                        value: mcAccount.linked_at ? new Date(mcAccount.linked_at).toLocaleDateString() : 'Unknown',
                        inline: true
                    }
                )
                .setTimestamp();

            const unlinkButton = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('unlink_minecraft')
                        .setLabel('🔓 Unlink Account')
                        .setStyle(ButtonStyle.Danger)
                );

            await interaction.editReply({
                embeds: [statusEmbed],
                components: [unlinkButton]
            });
            return;
        }

        // Generate new linking code
        const linkCode = await BotApiService.getInstance().generateMinecraftLinkCode(serverId, userId);
        if (!linkCode) {
            await interaction.editReply({ content: '❌ Failed to generate linking code. Please try again later.' });
            return;
        }
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        const linkEmbed = new EmbedBuilder()
            .setTitle('🔗 Minecraft Account Linking')
            .setColor(0x0099FF)
            .setDescription('Follow these steps to link your Minecraft account:')
            .addFields(
                {
                    name: '1️⃣ Join the Minecraft Server',
                    value: 'Connect to the server using your Minecraft client',
                    inline: false
                },
                {
                    name: '2️⃣ Use the Link Command',
                    value: `Type in chat: \`/link ${linkCode}\``,
                    inline: false
                },
                {
                    name: '🔢 Your Linking Code',
                    value: `\`${linkCode}\``,
                    inline: true
                },
                {
                    name: '⏰ Expires',
                    value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
                    inline: true
                }
            )
            .setFooter({
                text: 'This code will expire in 10 minutes. Keep this message private!'
            })
            .setTimestamp();

        const refreshButton = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('refresh_link_code')
                    .setLabel('🔄 Generate New Code')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('check_link_status')
                    .setLabel('✅ Check Status')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.editReply({
            embeds: [linkEmbed],
            components: [refreshButton]
        });

        logCommand('link_minecraft', interaction.user.id, interaction.guildId || undefined, true);

    } catch (error) {
        commandLogger.error('Minecraft link error:', error);
        await interaction.editReply({
            content: '❌ Failed to generate linking code. Please try again later.'
        });
        logCommand('link_minecraft', interaction.user.id, interaction.guildId || undefined, false, error as string);
    }
}

async function handleLinkStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    const { BotApiService } = await import('../services/botApiService');
    
    try {
        const serverId = interaction.guildId!;
        const userId = interaction.user.id;

        const linkStatus = await BotApiService.getInstance().getMinecraftAccount(serverId, userId);
        
        const statusEmbed = new EmbedBuilder()
            .setTitle('🔗 Account Linking Status')
            .setColor(linkStatus ? 0x00FF00 : 0xFF9900)
            .setTimestamp();

        if (linkStatus) {
            statusEmbed
                .setDescription('✅ Your Discord account is linked to a Minecraft account.')
                .addFields(
                    {
                        name: '🎮 Minecraft Username',
                        value: linkStatus.minecraft_username || 'Unknown',
                        inline: true
                    },
                    {
                        name: '🔗 Linked Since',
                        value: linkStatus.linked_at ? new Date(linkStatus.linked_at).toLocaleDateString() : 'Unknown',
                        inline: true
                    },
                    {
                        name: '🏠 Server',
                        value: interaction.guild?.name || 'Unknown',
                        inline: true
                    }
                );

            const unlinkButton = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('unlink_minecraft')
                        .setLabel('🔓 Unlink Account')
                        .setStyle(ButtonStyle.Danger)
                );

            await interaction.editReply({
                embeds: [statusEmbed],
                components: [unlinkButton]
            });
        } else {
            statusEmbed
                .setDescription('❌ Your Discord account is not linked to any Minecraft account.')
                .addFields(
                    {
                        name: '🔗 Get Started',
                        value: 'Use `/link minecraft` to generate a linking code',
                        inline: false
                    },
                    {
                        name: '📋 Benefits of Linking',
                        value: '• Access to exclusive features\n• Synchronized permissions\n• Enhanced server experience',
                        inline: false
                    }
                );

            const linkButton = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('generate_link_code')
                        .setLabel('🔗 Link Account')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.editReply({
                embeds: [statusEmbed],
                components: [linkButton]
            });
        }

        logCommand('link_status', interaction.user.id, interaction.guildId || undefined, true);

    } catch (error) {
        commandLogger.error('Link status error:', error);
        await interaction.editReply({
            content: '❌ Failed to check linking status. Please try again later.'
        });
        logCommand('link_status', interaction.user.id, interaction.guildId || undefined, false, error as string);
    }
}

async function handleUnlink(interaction: ChatInputCommandInteraction): Promise<void> {
    // Placeholder for unlink functionality
    const unlinkEmbed = new EmbedBuilder()
        .setTitle('🔓 Unlink Account')
        .setColor(0xFF9900)
        .setDescription('Account unlinking feature is under development.')
        .addFields(
            {
                name: '🔄 Status',
                value: 'Coming Soon',
                inline: true
            },
            {
                name: '📋 Features',
                value: '• Safe account unlinking\n• Confirmation process\n• Data cleanup\n• Re-linking support',
                inline: false
            },
            {
                name: '🛠️ Temporary Solution',
                value: 'Contact a server administrator for manual unlinking',
                inline: false
            }
        )
        .setTimestamp();

    const backButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back_to_link_status')
                .setLabel('⬅️ Back to Status')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.editReply({
        embeds: [unlinkEmbed],
        components: [backButton]
    });
}

function logCommand(command: string, userId: string, guildId: string | undefined, success: boolean, error?: string): void {
    commandLogger.info('Link command executed', {
        command,
        userId,
        guildId,
        success,
        error
    });
}

export default linkCommand;