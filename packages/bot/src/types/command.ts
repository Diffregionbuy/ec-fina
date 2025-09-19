import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionResolvable } from 'discord.js';

export interface Command {
    data: any; // Allow any command builder type
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    permissions?: PermissionResolvable[];
    cooldown?: number; // in seconds
    category?: string;
    adminOnly?: boolean;
    guildOnly?: boolean;
}

export interface CommandOptions {
    name: string;
    description: string;
    permissions?: PermissionResolvable[];
    cooldown?: number;
    category?: string;
    adminOnly?: boolean;
    guildOnly?: boolean;
}