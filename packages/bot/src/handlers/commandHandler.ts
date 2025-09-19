import { ChatInputCommandInteraction, Collection } from 'discord.js';
import { commandLogger, logCommand } from '../utils/logger';
import { Command } from '../types';

export class CommandHandler {
    private bot: any; // ECBot instance
    private cooldowns: Collection<string, Collection<string, number>>;

    constructor(bot: any) {
        this.bot = bot;
        this.cooldowns = new Collection();
    }

    /**
     * Handle slash command execution
     */
    public async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const command = this.bot.commands.get(interaction.commandName);

        if (!command) {
            commandLogger.warn(`Unknown command: ${interaction.commandName}`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            
            await interaction.reply({
                content: '❌ Unknown command.',
                flags: 64
            });
            return;
        }

        // Check if command is guild-only and interaction is in DM
        if (command.guildOnly && !interaction.guildId) {
            logCommand(interaction.commandName, interaction.user.id, interaction.guildId || undefined, false, 'Guild only command used in DM');
            
            await interaction.reply({
                content: '❌ This command can only be used in a server.',
                flags: 64
            });
            return;
        }

        // Check if command is admin-only
        if (command.adminOnly && interaction.guildId) {
            const member = interaction.guild?.members.cache.get(interaction.user.id);
            const isAdmin = member?.permissions.has('Administrator') || 
                           member?.permissions.has('ManageGuild');

            if (!isAdmin) {
                logCommand(interaction.commandName, interaction.user.id, interaction.guildId, false, 'Insufficient permissions');
                
                await interaction.reply({
                    content: '❌ You need administrator permissions to use this command.',
                    flags: 64
                });
                return;
            }
        }

        // Check permissions
        if (command.permissions && interaction.guildId) {
            const member = interaction.guild?.members.cache.get(interaction.user.id);
            const hasPermissions = command.permissions.every((permission: any) => 
                member?.permissions.has(permission)
            );

            if (!hasPermissions) {
                logCommand(interaction.commandName, interaction.user.id, interaction.guildId, false, 'Missing required permissions');
                
                await interaction.reply({
                    content: '❌ You don\'t have the required permissions to use this command.',
                    flags: 64
                });
                return;
            }
        }

        // Check cooldown
        if (command.cooldown) {
            const cooldownResult = this.checkCooldown(command, interaction);
            if (!cooldownResult.allowed) {
                logCommand(interaction.commandName, interaction.user.id, interaction.guildId || undefined, false, 'Command on cooldown');
                
                await interaction.reply({
                    content: `❌ Please wait ${cooldownResult.timeLeft} seconds before using this command again.`,
                    flags: 64
                });
                return;
            }
        }

        // Execute command
        try {
            commandLogger.info(`Executing command: ${interaction.commandName}`, {
                userId: interaction.user.id,
                username: interaction.user.username,
                guildId: interaction.guildId,
                guildName: interaction.guild?.name
            });

            await command.execute(interaction);
            
            logCommand(interaction.commandName, interaction.user.id, interaction.guildId || undefined, true);
        } catch (error: any) {
            logCommand(interaction.commandName, interaction.user.id, interaction.guildId || undefined, false, error);
            
            commandLogger.error(`Error executing command ${interaction.commandName}:`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

            const errorMessage = '❌ There was an error executing this command. Please try again later.';

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: errorMessage,
                        flags: 64
                    });
                } else {
                    await interaction.reply({
                        content: errorMessage,
                        flags: 64
                    });
                }
            } catch (followUpError) {
                commandLogger.error('Failed to send error message:', followUpError);
            }
        }
    }

    /**
     * Check command cooldown
     */
    private checkCooldown(command: Command, interaction: ChatInputCommandInteraction): { allowed: boolean; timeLeft?: number } {
        if (!command.cooldown) {
            return { allowed: true };
        }

        const now = Date.now();
        const timestamps = this.cooldowns.get(command.data.name) || new Collection();
        const cooldownAmount = command.cooldown * 1000;

        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id)! + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = Math.ceil((expirationTime - now) / 1000);
                return { allowed: false, timeLeft };
            }
        }

        // Set cooldown
        timestamps.set(interaction.user.id, now);
        this.cooldowns.set(command.data.name, timestamps);

        // Clean up expired cooldowns
        setTimeout(() => {
            timestamps.delete(interaction.user.id);
        }, cooldownAmount);

        return { allowed: true };
    }

    /**
     * Get command statistics
     */
    public getCommandStats(): { totalCommands: number; commandNames: string[] } {
        return {
            totalCommands: this.bot.commands.size,
            commandNames: Array.from(this.bot.commands.keys())
        };
    }

    /**
     * Get cooldown statistics
     */
    public getCooldownStats(): { activeCooldowns: number; commandsWithCooldowns: string[] } {
        let activeCooldowns = 0;
        const commandsWithCooldowns: string[] = [];

        this.cooldowns.forEach((timestamps, commandName) => {
            if (timestamps.size > 0) {
                activeCooldowns += timestamps.size;
                commandsWithCooldowns.push(commandName);
            }
        });

        return {
            activeCooldowns,
            commandsWithCooldowns
        };
    }

    /**
     * Clear cooldowns for a user or command
     */
    public clearCooldowns(userId?: string, commandName?: string): void {
        if (commandName && userId) {
            // Clear specific user's cooldown for specific command
            const timestamps = this.cooldowns.get(commandName);
            if (timestamps) {
                timestamps.delete(userId);
                commandLogger.info(`Cleared cooldown for user ${userId} on command ${commandName}`);
            }
        } else if (commandName) {
            // Clear all cooldowns for specific command
            this.cooldowns.delete(commandName);
            commandLogger.info(`Cleared all cooldowns for command ${commandName}`);
        } else if (userId) {
            // Clear all cooldowns for specific user
            this.cooldowns.forEach((timestamps, cmd) => {
                timestamps.delete(userId);
            });
            commandLogger.info(`Cleared all cooldowns for user ${userId}`);
        } else {
            // Clear all cooldowns
            this.cooldowns.clear();
            commandLogger.info('Cleared all cooldowns');
        }
    }

    /**
     * Check if user has active cooldown for command
     */
    public hasActiveCooldown(userId: string, commandName: string): boolean {
        const timestamps = this.cooldowns.get(commandName);
        if (!timestamps) return false;

        const command = this.bot.commands.get(commandName);
        if (!command?.cooldown) return false;

        const now = Date.now();
        const userTimestamp = timestamps.get(userId);
        if (!userTimestamp) return false;

        const cooldownAmount = command.cooldown * 1000;
        return now < (userTimestamp + cooldownAmount);
    }

    /**
     * Get remaining cooldown time for user and command
     */
    public getRemainingCooldown(userId: string, commandName: string): number {
        const timestamps = this.cooldowns.get(commandName);
        if (!timestamps) return 0;

        const command = this.bot.commands.get(commandName);
        if (!command?.cooldown) return 0;

        const now = Date.now();
        const userTimestamp = timestamps.get(userId);
        if (!userTimestamp) return 0;

        const cooldownAmount = command.cooldown * 1000;
        const expirationTime = userTimestamp + cooldownAmount;

        if (now >= expirationTime) return 0;

        return Math.ceil((expirationTime - now) / 1000);
    }
}