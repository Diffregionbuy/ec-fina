import Joi from 'joi';
import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

// Bot configuration schema validation
export const botConfigSchema = Joi.object({
  // Bot identity
  name: Joi.string().min(1).max(32).optional(),
  avatar: Joi.string().uri().optional(),
  status: Joi.string().valid('online', 'idle', 'dnd', 'invisible').default('online'),
  
  // Bot activity
  activity: Joi.object({
    type: Joi.string().valid('PLAYING', 'STREAMING', 'LISTENING', 'WATCHING', 'CUSTOM').optional(),
    name: Joi.string().max(128).optional(),
    url: Joi.string().uri().optional()
  }).optional(),
  
  // Bot appearance
  embed_color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).default('#0099FF'),
  prefix: Joi.string().min(1).max(5).default('!'),
  
  // Bot messages
  welcome_message: Joi.string().max(2000).optional(),
  success_message: Joi.string().max(500).default('✅ Command executed successfully!'),
  error_message: Joi.string().max(500).default('❌ An error occurred while processing your request.'),
  
  // Channel configurations
  shop_channel_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  log_channel_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  announcements_channel_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  vouch_channel_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  
  // Role configurations
  admin_role_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  auto_role_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  customer_role_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  
  // Shop settings
  currency_symbol: Joi.string().max(10).default('$'),
  currency_name: Joi.string().max(20).default('USD'),
  tax_rate: Joi.number().min(0).max(1).default(0),
  
  // Payment settings
  payment_methods: Joi.array().items(
    Joi.string().valid('crypto', 'paypal', 'stripe', 'manual')
  ).default(['crypto']),
  
  // Minecraft integration
  minecraft_server: Joi.object({
    host: Joi.string().hostname().optional(),
    port: Joi.number().port().default(25565),
    rcon_password: Joi.string().optional(),
    rcon_port: Joi.number().port().default(25575)
  }).optional(),
  
  // Auto-moderation
  auto_moderation: Joi.object({
    enabled: Joi.boolean().default(false),
    delete_spam: Joi.boolean().default(true),
    warn_threshold: Joi.number().min(1).max(10).default(3),
    mute_duration: Joi.number().min(60).max(86400).default(600) // seconds
  }).default({
    enabled: false,
    delete_spam: true,
    warn_threshold: 3,
    mute_duration: 600
  }),
  
  // Feature toggles
  features: Joi.object({
    shop_enabled: Joi.boolean().default(true),
    inventory_enabled: Joi.boolean().default(true),
    leaderboard_enabled: Joi.boolean().default(true),
    referral_system: Joi.boolean().default(false),
    auto_delivery: Joi.boolean().default(true)
  }).default({
    shop_enabled: true,
    inventory_enabled: true,
    leaderboard_enabled: true,
    referral_system: false,
    auto_delivery: true
  }),
  
  // Custom commands
  custom_commands: Joi.array().items(
    Joi.object({
      name: Joi.string().min(1).max(32).required(),
      description: Joi.string().max(100).optional(),
      response: Joi.string().max(2000).required(),
      permissions: Joi.array().items(Joi.string()).default([]),
      cooldown: Joi.number().min(0).max(3600).default(0)
    })
  ).default([]),
  
  // Webhook configurations
  webhooks: Joi.object({
    purchase_webhook: Joi.string().uri().optional(),
    delivery_webhook: Joi.string().uri().optional(),
    error_webhook: Joi.string().uri().optional()
  }).optional()
});

export interface BotConfig {
  name?: string;
  avatar?: string;
  status?: 'online' | 'idle' | 'dnd' | 'invisible';
  activity?: {
    type?: 'PLAYING' | 'STREAMING' | 'LISTENING' | 'WATCHING' | 'CUSTOM';
    name?: string;
    url?: string;
  };
  embed_color?: string;
  prefix?: string;
  welcome_message?: string;
  success_message?: string;
  error_message?: string;
  shop_channel_id?: string;
  log_channel_id?: string;
  announcements_channel_id?: string;
  vouch_channel_id?: string;
  admin_role_id?: string;
  auto_role_id?: string;
  customer_role_id?: string;
  currency_symbol?: string;
  currency_name?: string;
  tax_rate?: number;
  payment_methods?: string[];
  minecraft_server?: {
    host?: string;
    port?: number;
    rcon_password?: string;
    rcon_port?: number;
  };
  auto_moderation?: {
    enabled?: boolean;
    delete_spam?: boolean;
    warn_threshold?: number;
    mute_duration?: number;
  };
  features?: {
    shop_enabled?: boolean;
    inventory_enabled?: boolean;
    leaderboard_enabled?: boolean;
    referral_system?: boolean;
    auto_delivery?: boolean;
  };
  custom_commands?: Array<{
    name: string;
    description?: string;
    response: string;
    permissions?: string[];
    cooldown?: number;
  }>;
  webhooks?: {
    purchase_webhook?: string;
    delivery_webhook?: string;
    error_webhook?: string;
  };
}

export interface ConfigVersion {
  id: string;
  serverId: string;
  version: number;
  config: BotConfig;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

export class BotConfigService {
  /**
   * Validate bot configuration against schema
   */
  static validateConfig(config: any): { isValid: boolean; error?: string; validatedConfig?: BotConfig } {
    const { error, value } = botConfigSchema.validate(config, {
      allowUnknown: false,
      stripUnknown: true,
      abortEarly: false
    });

    if (error) {
      return {
        isValid: false,
        error: error.details.map(detail => detail.message).join(', ')
      };
    }

    return {
      isValid: true,
      validatedConfig: value
    };
  }

  /**
   * Get current bot configuration for a server
   */
  static async getCurrentConfig(serverId: string): Promise<BotConfig | null> {
    try {
      const { data: server, error } = await supabase
        .from('servers')
        .select('bot_config')
        .eq('id', serverId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return server.bot_config || {};
    } catch (error) {
      logger.error('Error retrieving bot configuration:', error);
      throw new AppError('Failed to retrieve bot configuration', 500, 'CONFIG_RETRIEVAL_ERROR');
    }
  }

  /**
   * Update bot configuration with versioning
   */
  static async updateConfig(
    serverId: string, 
    newConfig: Partial<BotConfig>, 
    userId: string
  ): Promise<{ config: BotConfig; version: number }> {
    try {
      // Get current configuration
      const currentConfig = await this.getCurrentConfig(serverId) || {};
      
      // Merge with new configuration
      const mergedConfig = {
        ...currentConfig,
        ...newConfig
      };

      // Validate merged configuration
      const validation = this.validateConfig(mergedConfig);
      if (!validation.isValid) {
        throw new AppError(`Configuration validation failed: ${validation.error}`, 400, 'CONFIG_VALIDATION_ERROR');
      }

      // Get current version number
      const { data: versionData, error: versionError } = await supabase
        .from('bot_config_versions')
        .select('version')
        .eq('server_id', serverId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      const nextVersion = versionData ? versionData.version + 1 : 1;

      // Start transaction-like operations
      const now = new Date().toISOString();

      // Update server configuration
      const { error: updateError } = await supabase
        .from('servers')
        .update({
          bot_config: validation.validatedConfig,
          updated_at: now
        })
        .eq('id', serverId);

      if (updateError) {
        throw updateError;
      }

      // Create version record
      const { error: versionInsertError } = await supabase
        .from('bot_config_versions')
        .insert({
          server_id: serverId,
          version: nextVersion,
          config: validation.validatedConfig,
          created_by: userId,
          created_at: now,
          is_active: true
        });

      if (versionInsertError) {
        logger.warn('Failed to create config version record:', versionInsertError);
      }

      // Deactivate previous versions
      await supabase
        .from('bot_config_versions')
        .update({ is_active: false })
        .eq('server_id', serverId)
        .neq('version', nextVersion);

      logger.info('Bot configuration updated', {
        serverId,
        userId,
        version: nextVersion,
        configKeys: Object.keys(newConfig)
      });

      return {
        config: validation.validatedConfig!,
        version: nextVersion
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Error updating bot configuration:', error);
      throw new AppError('Failed to update bot configuration', 500, 'CONFIG_UPDATE_ERROR');
    }
  }

  /**
   * Get configuration version history
   */
  static async getConfigVersions(serverId: string, limit: number = 10): Promise<ConfigVersion[]> {
    try {
      const { data: versions, error } = await supabase
        .from('bot_config_versions')
        .select(`
          id,
          server_id,
          version,
          config,
          created_by,
          created_at,
          is_active,
          creator:users!bot_config_versions_created_by_fkey(
            username,
            avatar
          )
        `)
        .eq('server_id', serverId)
        .order('version', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return versions?.map(version => ({
        id: version.id,
        serverId: version.server_id,
        version: version.version,
        config: version.config,
        createdBy: version.created_by,
        createdAt: version.created_at,
        isActive: version.is_active,
        creator: version.creator
      })) || [];
    } catch (error) {
      logger.error('Error retrieving config versions:', error);
      throw new AppError('Failed to retrieve configuration versions', 500, 'CONFIG_VERSIONS_ERROR');
    }
  }

  /**
   * Rollback to a previous configuration version
   */
  static async rollbackToVersion(
    serverId: string, 
    targetVersion: number, 
    userId: string
  ): Promise<{ config: BotConfig; version: number }> {
    try {
      // Get the target version configuration
      const { data: targetConfig, error: fetchError } = await supabase
        .from('bot_config_versions')
        .select('config')
        .eq('server_id', serverId)
        .eq('version', targetVersion)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new AppError('Configuration version not found', 404, 'VERSION_NOT_FOUND');
        }
        throw fetchError;
      }

      // Create new version with rolled back configuration
      const result = await this.updateConfig(serverId, targetConfig.config, userId);

      logger.info('Configuration rolled back', {
        serverId,
        userId,
        targetVersion,
        newVersion: result.version
      });

      return result;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Error rolling back configuration:', error);
      throw new AppError('Failed to rollback configuration', 500, 'CONFIG_ROLLBACK_ERROR');
    }
  }

  /**
   * Preview configuration changes without saving
   */
  static previewConfig(currentConfig: BotConfig, changes: Partial<BotConfig>): {
    isValid: boolean;
    error?: string;
    previewConfig?: BotConfig;
    changedFields?: string[];
  } {
    const mergedConfig = {
      ...currentConfig,
      ...changes
    };

    const validation = this.validateConfig(mergedConfig);
    
    if (!validation.isValid) {
      return {
        isValid: false,
        error: validation.error
      };
    }

    // Identify changed fields
    const changedFields = Object.keys(changes).filter(key => {
      const currentValue = JSON.stringify(currentConfig[key as keyof BotConfig]);
      const newValue = JSON.stringify(changes[key as keyof BotConfig]);
      return currentValue !== newValue;
    });

    return {
      isValid: true,
      previewConfig: validation.validatedConfig,
      changedFields
    };
  }

  /**
   * Get default configuration for a server type
   */
  static getDefaultConfig(serverType: 'minecraft' | 'gaming' | 'general' = 'general'): BotConfig {
    const baseConfig: BotConfig = {
      status: 'online',
      embed_color: '#0099FF',
      prefix: '!',
      success_message: '✅ Command executed successfully!',
      error_message: '❌ An error occurred while processing your request.',
      currency_symbol: '$',
      currency_name: 'USD',
      tax_rate: 0,
      payment_methods: ['crypto'],
      auto_moderation: {
        enabled: false,
        delete_spam: true,
        warn_threshold: 3,
        mute_duration: 600
      },
      features: {
        shop_enabled: true,
        inventory_enabled: true,
        leaderboard_enabled: true,
        referral_system: false,
        auto_delivery: true
      },
      custom_commands: []
    };

    // Server type specific configurations
    switch (serverType) {
      case 'minecraft':
        return {
          ...baseConfig,
          name: 'MinecraftBot',
          activity: {
            type: 'PLAYING',
            name: 'Minecraft'
          },
          embed_color: '#00AA00',
          minecraft_server: {
            port: 25565,
            rcon_port: 25575
          },
          custom_commands: [
            {
              name: 'server',
              description: 'Get server information',
              response: 'Join our Minecraft server at **play.example.com**!',
              permissions: [],
              cooldown: 30
            }
          ]
        };
      
      case 'gaming':
        return {
          ...baseConfig,
          name: 'GameBot',
          activity: {
            type: 'PLAYING',
            name: 'with the community'
          },
          embed_color: '#FF6600',
          features: {
            ...baseConfig.features,
            referral_system: true
          }
        };
      
      default:
        return baseConfig;
    }
  }
}

export default BotConfigService;