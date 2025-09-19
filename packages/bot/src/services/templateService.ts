import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle } from 'discord.js';
import { BotApiService } from './botApiService';
import { templateLogger, logTemplate } from '../utils/logger';
import { 
    ServerTemplate, 
    EmbedTemplate, 
    ButtonTemplate, 
    SelectMenuTemplate, 
    ProcessedTemplate,
    TemplateVariable 
} from '../types';

export class TemplateService {
    private static instance: TemplateService;
    private apiService: BotApiService;
    private templateCache: Map<string, ServerTemplate[]> = new Map();
    private cacheExpiry: Map<string, number> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private cacheHits = 0;
    private cacheMisses = 0;

    private constructor() {
        this.apiService = BotApiService.getInstance();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): TemplateService {
        if (!TemplateService.instance) {
            TemplateService.instance = new TemplateService();
        }
        return TemplateService.instance;
    }

    /**
     * Get all templates for a server (with caching)
     */
    public async getTemplates(serverId: string): Promise<ServerTemplate[]> {
        const now = Date.now();
        const expiry = this.cacheExpiry.get(serverId) || 0;

        if (this.templateCache.has(serverId) && now < expiry) {
            this.cacheHits++;
            return this.templateCache.get(serverId)!;
        }

        this.cacheMisses++;
        // Use 404-safe API that logs less noise when templates are not configured
        const templates = await this.apiService.getServerTemplates(serverId);
        this.templateCache.set(serverId, templates);
        this.cacheExpiry.set(serverId, now + this.CACHE_TTL);
        return templates;
    }

    /**
     * Render a template into Discord components
     */
    public async renderTemplateData(template: ServerTemplate, variables: Record<string, any>): Promise<{ embed?: EmbedBuilder; embeds?: EmbedBuilder[]; components?: any[]; content?: string }> {
        const processed = this.processTemplateContent(template.content, variables);
        const result: { embed?: EmbedBuilder; embeds?: EmbedBuilder[]; components?: any[]; content?: string } = {};

        if (processed.embeds?.length) {
            // Convert template embed data to real EmbedBuilder
            result.embeds = processed.embeds.map((e: any) => this.processEmbed(e as any, variables));
            // convenience: first embed as 'embed'
            result.embed = result.embeds[0];
        }

        if (processed.components?.length) {
            result.components = processed.components.map((c: any) => this.processComponent(c as any, variables));
        }

        if (processed.content) {
            result.content = this.replaceVariables(processed.content, variables);
        }

        return result;
    }





    /**
     * Get templates for a server with caching
     */
    public async getServerTemplates(serverId: string, forceRefresh: boolean = false): Promise<ServerTemplate[]> {
        const cacheKey = `templates_${serverId}`;
        const now = Date.now();

        // Check cache first
        if (!forceRefresh && this.templateCache.has(cacheKey)) {
            const expiry = this.cacheExpiry.get(cacheKey) || 0;
            if (now < expiry) {
                templateLogger.debug(`Using cached templates for server ${serverId}`);
                return this.templateCache.get(cacheKey)!;
            }
        }

        try {
            const templates = await this.apiService.getServerTemplates(serverId);
            
            // Cache the templates
            this.templateCache.set(cacheKey, templates);
            this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);
            
            logTemplate('server_templates', serverId, 'fetch', true);
            templateLogger.info(`Fetched ${templates.length} templates for server ${serverId}`);
            
            return templates;
        } catch (error: any) {
            logTemplate('server_templates', serverId, 'fetch', false, error);
            throw error;
        }
    }

    /**
     * Get a specific template by name
     */
    public async getTemplate(serverId: string, templateName: string): Promise<ServerTemplate | null> {
        try {
            const templates = await this.getServerTemplates(serverId);
            const template = templates.find(t => t.name === templateName || t.type === templateName);
            
            if (template) {
                logTemplate(templateName, serverId, 'get', true);
            } else {
                templateLogger.warn(`Template '${templateName}' not found for server ${serverId}`);
            }
            
            return template || null;
        } catch (error: any) {
            logTemplate(templateName, serverId, 'get', false, error);
            throw error;
        }
    }

    /**
     * Process a template with variables and return Discord components
     */
    public async processTemplate(
        serverId: string, 
        templateName: string, 
        variables: Record<string, any> = {}
    ): Promise<ProcessedTemplate> {
        try {
            const template = await this.getTemplate(serverId, templateName);
            
            if (!template) {
                throw new Error(`Template '${templateName}' not found`);
            }

            // Merge template variables with provided variables
            const allVariables = {
                ...template.variables,
                ...variables,
                // Add default variables
                timestamp: new Date().toISOString(),
                serverId: serverId
            };

            const processed = this.processTemplateContent(template.content, allVariables);
            
            logTemplate(templateName, serverId, 'process', true);
            return processed;
        } catch (error: any) {
            logTemplate(templateName, serverId, 'process', false, error);
            throw error;
        }
    }

    /**
     * Process template content and replace variables
     */
    private processTemplateContent(content: any, variables: Record<string, any>): ProcessedTemplate {
        const processed: ProcessedTemplate = {};

        if (content.embeds && Array.isArray(content.embeds)) {
            processed.embeds = content.embeds.map((embedData: EmbedTemplate) => 
                this.processEmbed(embedData, variables)
            );
        }

        if (content.components && Array.isArray(content.components)) {
            processed.components = content.components.map((componentData: any) => 
                this.processComponent(componentData, variables)
            );
        }

        if (content.content) {
            processed.content = this.replaceVariables(content.content, variables);
        }

        return processed;
    }

    /**
     * Process embed template
     */
    private processEmbed(embedData: EmbedTemplate, variables: Record<string, any>): EmbedBuilder {
        const embed = new EmbedBuilder();

        if (embedData.title) {
            embed.setTitle(this.replaceVariables(embedData.title, variables));
        }

        if (embedData.description) {
            embed.setDescription(this.replaceVariables(embedData.description, variables));
        }

        if (embedData.color) {
            embed.setColor(embedData.color);
        }

        if (embedData.thumbnail?.url) {
            embed.setThumbnail(this.replaceVariables(embedData.thumbnail.url, variables));
        }

        if (embedData.image?.url) {
            embed.setImage(this.replaceVariables(embedData.image.url, variables));
        }

        if (embedData.fields && Array.isArray(embedData.fields)) {
            embedData.fields.forEach((field: any) => {
                embed.addFields({
                    name: this.replaceVariables(field.name, variables),
                    value: this.replaceVariables(field.value, variables),
                    inline: field.inline || false
                });
            });
        }

        if (embedData.footer) {
            embed.setFooter({
                text: this.replaceVariables(embedData.footer.text, variables),
                ...(embedData.footer.icon_url && { 
                    iconURL: this.replaceVariables(embedData.footer.icon_url, variables) 
                })
            });
        }

        if (embedData.timestamp) {
            embed.setTimestamp();
        }

        return embed;
    }

    /**
     * Process component template
     */
    private processComponent(componentData: any, variables: Record<string, any>): ActionRowBuilder<any> {
        const row = new ActionRowBuilder();

        if (componentData.type === 'button' && componentData.buttons) {
            componentData.buttons.forEach((buttonData: ButtonTemplate) => {
                const button = new ButtonBuilder()
                    .setCustomId(this.replaceVariables(buttonData.customId, variables))
                    .setLabel(this.replaceVariables(buttonData.label, variables))
                    .setStyle(buttonData.style || ButtonStyle.Primary);

                if (buttonData.emoji) {
                    button.setEmoji(buttonData.emoji);
                }

                if (buttonData.disabled) {
                    button.setDisabled(buttonData.disabled);
                }

                row.addComponents(button);
            });
        }

        if (componentData.type === 'select' && componentData.select) {
            const selectData: SelectMenuTemplate = componentData.select;
            const select = new StringSelectMenuBuilder()
                .setCustomId(this.replaceVariables(selectData.customId, variables))
                .setPlaceholder(this.replaceVariables(selectData.placeholder, variables));

            if (selectData.minValues) select.setMinValues(selectData.minValues);
            if (selectData.maxValues) select.setMaxValues(selectData.maxValues);

            if (selectData.options && Array.isArray(selectData.options)) {
                const options = selectData.options
                    .filter((option: any) => option && option.label && option.value)
                    .slice(0, 25)
                    .map((option: any) => ({
                        label: this.replaceVariables(option.label, variables),
                        value: this.replaceVariables(option.value, variables),
                        ...(option.description && { 
                            description: this.replaceVariables(option.description, variables) 
                        }),
                        ...(option.emoji && { emoji: option.emoji }),
                        ...(option.default && { default: option.default })
                    }))
                    .filter((opt: any) => opt.label && opt.value);

                if (options.length > 0) {
                    select.addOptions(options);
                }
            }

            row.addComponents(select);
        }

        return row;
    }

    /**
     * Replace variables in a string
     */
    private replaceVariables(text: string, variables: Record<string, any>): string {
        if (typeof text !== 'string') {
            return String(text);
        }

        return text.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
            const value = variables[variableName];
            
            if (value === undefined || value === null) {
                templateLogger.warn(`Variable '${variableName}' not found, keeping placeholder`);
                return match; // Keep the placeholder if variable not found
            }
            
            return String(value);
        });
    }

    /**
     * Create a simple embed with title and description
     */
    public createSimpleEmbed(title: string, description: string, color?: number): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();

        if (color) {
            embed.setColor(color);
        }

        return embed;
    }

    /**
     * Create an error embed
     */
    public createErrorEmbed(title: string, description: string): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setColor(0xFF0000)
            .setTimestamp();
    }

    /**
     * Create a success embed
     */
    public createSuccessEmbed(title: string, description: string): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`✅ ${title}`)
            .setDescription(description)
            .setColor(0x00FF00)
            .setTimestamp();
    }

    /**
     * Create a warning embed
     */
    public createWarningEmbed(title: string, description: string): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`⚠️ ${title}`)
            .setDescription(description)
            .setColor(0xFFFF00)
            .setTimestamp();
    }

    /**
     * Create an info embed
     */
    public createInfoEmbed(title: string, description: string): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`ℹ️ ${title}`)
            .setDescription(description)
            .setColor(0x0099FF)
            .setTimestamp();
    }

    /**
     * Clear template cache for a server
     */
    public clearCache(serverId?: string): void {
        if (serverId) {
            const cacheKey = `templates_${serverId}`;
            this.templateCache.delete(cacheKey);
            this.cacheExpiry.delete(cacheKey);
            templateLogger.info(`Cleared template cache for server ${serverId}`);
        } else {
            this.templateCache.clear();
            this.cacheExpiry.clear();
            templateLogger.info('Cleared all template cache');
        }
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): { totalCached: number; servers: string[] } {
        const servers = Array.from(this.templateCache.keys()).map(key => key.replace('templates_', ''));
        return {
            totalCached: this.templateCache.size,
            servers
        };
    }
}