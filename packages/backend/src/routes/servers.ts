import { Router, Response } from 'express';
import { supabase } from '../config/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { DiscordApiClient } from '../services/DiscordApiClient';
import { createCacheMiddleware, cacheConfigs } from '../middleware/requestCache';
import Joi from 'joi';

const router = Router();
const discordApiClient = new DiscordApiClient();

// Validation schemas
const botConfigSchema = Joi.object({
  name: Joi.string().min(1).max(32).optional(),
  avatar: Joi.string().uri().optional(),
  status: Joi.string().valid('online', 'idle', 'dnd', 'invisible').optional(),
  activity: Joi.object({
    type: Joi.string().valid('PLAYING', 'STREAMING', 'LISTENING', 'WATCHING', 'CUSTOM').optional(),
    name: Joi.string().max(128).optional(),
    url: Joi.string().uri().optional()
  }).optional(),
  embed_color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
  prefix: Joi.string().min(1).max(5).optional(),
  welcome_message: Joi.string().max(2000).optional(),
  shop_channel_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  admin_role_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  log_channel_id: Joi.string().pattern(/^\d{17,19}$/).optional(),
  currency_symbol: Joi.string().max(10).optional(),
  auto_role_id: Joi.string().pattern(/^\d{17,19}$/).optional()
});

const serverUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  bot_config: botConfigSchema.optional()
});

/**
 * GET /api/servers/:serverId
 * Retrieve server settings and configuration
 */
router.get('/:serverId', 
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;

      // Get server data from database
      const { data: server, error } = await supabase
        .from('servers')
        .select(`
          id,
          discord_server_id,
          name,
          icon,
          bot_invited,
          bot_config,
          created_at,
          updated_at,
          owner:users!servers_owner_id_fkey(
            id,
            discord_id,
            username,
            avatar
          )
        `)
        .eq('discord_server_id', serverId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SERVER_NOT_FOUND',
              message: 'Server not found or not configured',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw error;
      }

      logger.info('Server configuration retrieved', { 
        serverId, 
        userId: req.user?.id 
      });

      res.json({
        success: true,
        data: {
          server: {
            id: server.id,
            discordServerId: server.discord_server_id,
            name: server.name,
            icon: server.icon,
            botInvited: server.bot_invited,
            botConfig: server.bot_config,
            createdAt: server.created_at,
            updatedAt: server.updated_at,
            owner: server.owner
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving server configuration:', error);
      throw new AppError('Failed to retrieve server configuration', 500, 'SERVER_RETRIEVAL_ERROR');
    }
  }
);

/**
 * PUT /api/servers/:serverId
 * Update server configuration
 */
router.put('/:serverId',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      
      // Validate request body
      const { error: validationError, value: validatedData } = serverUpdateSchema.validate(req.body);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationError.details[0].message,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Check if server exists and user owns it
      const { data: existingServer, error: fetchError } = await supabase
        .from('servers')
        .select('id, owner_id, bot_config')
        .eq('discord_server_id', serverId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SERVER_NOT_FOUND',
              message: 'Server not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw fetchError;
      }

      // Merge bot config if provided
      let updatedBotConfig = existingServer.bot_config;
      if (validatedData.bot_config) {
        updatedBotConfig = {
          ...existingServer.bot_config,
          ...validatedData.bot_config
        };
      }

      // Update server
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (validatedData.name) updateData.name = validatedData.name;
      if (validatedData.bot_config) updateData.bot_config = updatedBotConfig;

      const { data: updatedServer, error: updateError } = await supabase
        .from('servers')
        .update(updateData)
        .eq('discord_server_id', serverId)
        .select(`
          id,
          discord_server_id,
          name,
          icon,
          bot_invited,
          bot_config,
          updated_at
        `)
        .single();

      if (updateError) {
        throw updateError;
      }

      logger.info('Server configuration updated', { 
        serverId, 
        userId: req.user?.id,
        updatedFields: Object.keys(updateData)
      });

      res.json({
        success: true,
        data: {
          server: {
            id: updatedServer.id,
            discordServerId: updatedServer.discord_server_id,
            name: updatedServer.name,
            icon: updatedServer.icon,
            botInvited: updatedServer.bot_invited,
            botConfig: updatedServer.bot_config,
            updatedAt: updatedServer.updated_at
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error updating server configuration:', error);
      throw new AppError('Failed to update server configuration', 500, 'SERVER_UPDATE_ERROR');
    }
  }
);

/**
 * GET /api/servers/:serverId/bot-status
 * Check if bot is present in the Discord server
 */
router.get('/:serverId/bot-status',
  authMiddleware.authenticate,
  createCacheMiddleware(cacheConfigs.botStatus),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;

      // First, check if user has access to this Discord server
      const userGuilds = await discordApiClient.getDiscordGuilds(req.user!.discordAccessToken, req.user!.id);
      const userGuild = userGuilds.find(guild => guild.id === serverId);
      
      if (!userGuild) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SERVER_NOT_FOUND',
            message: 'Server not found or no access',
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      // Check if user has management permissions
      const hasPermissions = discordApiClient.hasManagementPermissions(userGuild);
      if (!hasPermissions) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Insufficient permissions to manage this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Get server data from database (create if doesn't exist)
      let server;
      const { data: existingServer, error } = await supabase
        .from('servers')
        .select('id, bot_invited, bot_config, owner_id')
        .eq('discord_server_id', serverId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Server doesn't exist in database, create it
        const { data: newServer, error: createError } = await supabase
          .from('servers')
          .insert({
            discord_server_id: serverId,
            owner_id: req.user!.id,
            name: userGuild.name,
            icon: userGuild.icon,
            bot_invited: false,
            bot_config: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id, bot_invited, bot_config, owner_id')
          .single();
          
        if (createError) {
          logger.error('Failed to create server record', { 
            serverId, 
            userId: req.user!.id,
            error: createError 
          });
          throw createError;
        }
        
        server = newServer;
        logger.info('Created new server record for bot status check', { 
          serverId, 
          userId: req.user!.id 
        });
      } else if (error) {
        throw error;
      } else {
        server = existingServer;
      }

      // Check if bot is actually in the server using Discord API
      let botInServer = false;
      let botPermissions: string[] = [];
      
      try {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        if (botToken) {
          // Try to get guild details - if successful, bot is in the server
          const guildDetails = await discordApiClient.getGuildDetails(serverId, botToken);
          
          // CHECK: DiscordApiClient returns {error: true} for failed API calls
          if (guildDetails.error) {
            botInServer = false;
            botPermissions = [];
            logger.warn('❌ Bot not in server (API returned error)', { 
              serverId, 
              errorCode: guildDetails.code,
              errorMessage: guildDetails.message
            });
          } else {
            // ONLY set to true if we successfully got guild details WITHOUT error
            botInServer = true;
            botPermissions = ['SEND_MESSAGES', 'EMBED_LINKS', 'VIEW_CHANNEL'];
            
            logger.info('✅ Bot verified in server via Discord API', { 
              serverId, 
              guildName: guildDetails.name 
            });
          }
        } else {
          logger.warn('❌ No bot token configured', { serverId });
          botInServer = false;
        }
      } catch (error: any) {
        // ALWAYS set to false on any error - be conservative
        botInServer = false;
        botPermissions = [];
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const statusCode = error.response?.status;
        
        if (statusCode === 404) {
          logger.warn('❌ Bot not in server (404)', { serverId, error: errorMessage });
        } else if (statusCode === 403) {
          logger.warn('❌ Bot lacks permissions (403)', { serverId, error: errorMessage });
        } else {
          logger.warn('❌ Bot status check failed', { 
            serverId, 
            error: errorMessage,
            statusCode
          });
        }
      }
      
      // Update database if bot status has changed
      if (botInServer !== server.bot_invited) {
        try {
          await supabase
            .from('servers')
            .update({ 
              bot_invited: botInServer,
              updated_at: new Date().toISOString()
            })
            .eq('discord_server_id', serverId);
            
          logger.info('Updated bot_invited status in database', { 
            serverId, 
            botInServer 
          });
        } catch (updateError) {
          logger.error('Failed to update bot_invited status', { 
            serverId, 
            error: updateError 
          });
        }
      }
      
      // Check if bot is actually configured with any settings
      const botConfig = server.bot_config || {};
      
      let hasConfiguredSettings = false;
      
      // SIMPLIFIED: If bot_config exists and is not null/empty, mark as configured
      if (botConfig && typeof botConfig === 'object' && Object.keys(botConfig).length > 0) {
        hasConfiguredSettings = true;
      }

      const botStatus = {
        invited: botInServer,
        configured: hasConfiguredSettings,
        online: botInServer,
        permissions: botPermissions,
        lastSeen: botInServer ? new Date().toISOString() : null
      };

      logger.info('Bot status checked', { 
        serverId, 
        userId: req.user?.id,
        botStatus 
      });

      res.json({
        success: true,
        data: {
          botStatus
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error checking bot status:', error);
      throw new AppError('Failed to check bot status', 500, 'BOT_STATUS_ERROR');
    }
  }
);

/**
 * POST /api/servers/:serverId/setup-template
 * Apply a setup template to a server
 */
router.post('/:serverId/setup-template',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const { template_id, custom_config } = req.body;

      if (!template_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_TEMPLATE_ID',
            message: 'Template ID is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Get the template
      const { data: template, error: templateError } = await supabase
        .from('setup_templates')
        .select('*')
        .eq('id', template_id)
        .eq('is_active', true)
        .single();

      if (templateError) {
        if (templateError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'TEMPLATE_NOT_FOUND',
              message: 'Setup template not found or inactive',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw templateError;
      }

      // Get the server
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .select('id, bot_config')
        .eq('discord_server_id', serverId)
        .single();

      if (serverError) {
        if (serverError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SERVER_NOT_FOUND',
              message: 'Server not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw serverError;
      }

      // Merge template config with custom config and existing config
      const mergedBotConfig = {
        ...template.bot_config,
        ...server.bot_config,
        ...custom_config
      };

      // Update server with template configuration
      const { data: updatedServer, error: updateError } = await supabase
        .from('servers')
        .update({
          bot_config: mergedBotConfig,
          updated_at: new Date().toISOString()
        })
        .eq('discord_server_id', serverId)
        .select('id, discord_server_id, name, bot_config, updated_at')
        .single();

      if (updateError) {
        throw updateError;
      }

      // Create default categories if provided in template
      if (template.default_categories && Array.isArray(template.default_categories)) {
        const categoriesData = template.default_categories.map((category: any) => ({
          server_id: server.id,
          name: category.name,
          description: category.description,
          emoji: category.emoji,
          sort_order: category.sort_order || 0,
          created_at: new Date().toISOString()
        }));

        const { error: categoriesError } = await supabase
          .from('categories')
          .upsert(categoriesData, { 
            onConflict: 'server_id,name',
            ignoreDuplicates: true 
          });

        if (categoriesError) {
          logger.warn('Failed to create default categories:', categoriesError);
        }
      }

      // Create default products if provided in template
      if (template.default_products && Array.isArray(template.default_products)) {
        // First get category IDs for products that reference categories
        const { data: categories } = await supabase
          .from('categories')
          .select('id, name')
          .eq('server_id', server.id);

        const categoryMap = new Map(categories?.map(cat => [cat.name, cat.id]) || []);

        const productsData = template.default_products.map((product: any) => ({
          server_id: server.id,
          category_id: product.category_name ? categoryMap.get(product.category_name) : null,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency || 'USD',
          image_url: product.image_url,
          minecraft_commands: product.minecraft_commands || [],
          stock_quantity: product.stock_quantity,
          is_active: product.is_active !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: productsError } = await supabase
          .from('products')
          .insert(productsData);

        if (productsError) {
          logger.warn('Failed to create default products:', productsError);
        }
      }

      logger.info('Setup template applied to server', { 
        serverId, 
        userId: req.user?.id,
        templateId: template_id,
        templateName: template.name
      });

      res.json({
        success: true,
        data: {
          server: {
            id: updatedServer.id,
            discordServerId: updatedServer.discord_server_id,
            name: updatedServer.name,
            botConfig: updatedServer.bot_config,
            updatedAt: updatedServer.updated_at
          },
          appliedTemplate: {
            id: template.id,
            name: template.name,
            category: template.category,
            description: template.description
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error applying setup template:', error);
      throw new AppError('Failed to apply setup template', 500, 'TEMPLATE_APPLICATION_ERROR');
    }
  }
);

/**
 * GET /api/servers/:serverId/details
 * Get detailed server information including member data
 */
router.get('/:serverId/details', authMiddleware.authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Get user's Discord tokens from JWT payload
    const userTokens = {
      accessToken: req.user?.discordAccessToken,
      refreshToken: req.user?.discordRefreshToken,
      expiresAt: req.user?.discordExpiresAt
    };
    
    if (!userTokens.accessToken) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Discord tokens not found',
          code: 'NO_DISCORD_TOKENS',
          timestamp: new Date().toISOString()
        }
      });
    }

    // First, verify user has access to this server
    const userGuilds = await discordApiClient.getDiscordGuilds(userTokens.accessToken, userId);
    const hasAccess = userGuilds.some(guild => guild.id === serverId);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied to this server',
          code: 'ACCESS_DENIED',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Get bot token from environment
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      logger.warn('Bot token not configured, returning basic server info only');
      
      // Return basic info from user guilds
      const basicInfo = userGuilds.find(guild => guild.id === serverId);
      return res.json({
        success: true,
        data: {
          id: basicInfo?.id,
          name: basicInfo?.name,
          icon: basicInfo?.icon,
          member_count: basicInfo?.approximate_member_count || 0,
          owner: basicInfo?.owner,
          permissions: basicInfo?.permissions,
          bot_in_server: false,
          detailed_data_available: false
        }
      });
    }

    try {
      // Try to get detailed guild information (requires bot to be in server)
      const guildDetails = await discordApiClient.getGuildDetails(serverId, botToken);
      
      // Try to get member list (limited sample)
      let members: any[] = [];
      let membersFetchError = null;
      
      try {
        members = await discordApiClient.getGuildMembers(serverId, botToken, 50); // Get first 50 members
      } catch (membersError) {
        membersFetchError = membersError;
        logger.warn('Failed to fetch guild members', { 
          serverId, 
          error: membersError instanceof Error ? membersError.message : 'Unknown error' 
        });
      }

      res.json({
        success: true,
        data: {
          id: guildDetails.id,
          name: guildDetails.name,
          icon: guildDetails.icon,
          banner: guildDetails.banner,
          description: guildDetails.description,
          member_count: guildDetails.member_count,
          presence_count: guildDetails.presence_count,
          owner_id: guildDetails.owner_id,
          verification_level: guildDetails.verification_level,
          features: guildDetails.features,
          created_at: guildDetails.created_at,
          bot_in_server: true,
          detailed_data_available: true,
          members: {
            sample: members,
            total_fetched: members.length,
            fetch_error: membersFetchError ? 'Limited permissions or bot not in server' : null
          }
        }
      });

    } catch (botError) {
      logger.warn('Bot API call failed, falling back to user data', { 
        serverId, 
        error: botError instanceof Error ? botError.message : 'Unknown error' 
      });
      
      // Fallback to basic user guild info
      const basicInfo = userGuilds.find(guild => guild.id === serverId);
      res.json({
        success: true,
        data: {
          id: basicInfo?.id,
          name: basicInfo?.name,
          icon: basicInfo?.icon,
          member_count: basicInfo?.approximate_member_count || 0,
          owner: basicInfo?.owner,
          permissions: basicInfo?.permissions,
          bot_in_server: false,
          detailed_data_available: false,
          error: 'Bot not in server or insufficient permissions'
        }
      });
    }

  } catch (error) {
    logger.error('Failed to fetch server details', { 
      serverId: req.params.serverId,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch server details',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/servers/:serverId/members
 * Get server members (paginated)
 */
router.get('/:serverId/members', authMiddleware.authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({
        success: false,
        error: {
          message: 'Bot token not configured',
          code: 'BOT_NOT_CONFIGURED',
          timestamp: new Date().toISOString()
        }
      });
    }

    const members = await discordApiClient.getGuildMembers(serverId, botToken, limit);
    
    res.json({
      success: true,
      data: {
        members,
        count: members.length,
        limit,
        has_more: members.length === limit
      }
    });

  } catch (error) {
    logger.error('Failed to fetch server members', { 
      serverId: req.params.serverId,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch server members',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/servers/:serverId/bot-config
 * Get bot configuration for a server
 */
router.get('/:serverId/bot-config',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;

      const { data: server, error } = await supabase
        .from('servers')
        .select('bot_config')
        .eq('discord_server_id', serverId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Failed to get bot config:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'CONFIG_FETCH_FAILED',
            message: 'Failed to get bot configuration',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Return default config if server not found
      if (!server) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SERVER_NOT_FOUND',
            message: 'Server not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Return the bot_config JSONB field or default config
      const botConfig = server.bot_config || {
        prefix: '!',
        welcome_message: 'Welcome to the server!',
        auto_role: null,
        moderation_enabled: false,
        logging_channel: null,
      };

      res.json({
        success: true,
        data: botConfig,
      });
    } catch (error) {
      logger.error('Failed to get bot config:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * PUT /api/servers/:serverId/bot-config
 * Update bot configuration for a server
 */
router.put('/:serverId/bot-config',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const configData = req.body;

      // First get the current bot_config
      const { data: currentServer, error: fetchError } = await supabase
        .from('servers')
        .select('bot_config')
        .eq('discord_server_id', serverId)
        .single();

      if (fetchError) {
        logger.error('Failed to fetch current bot config:', fetchError);
        return res.status(500).json({
          success: false,
          error: {
            code: 'CONFIG_FETCH_FAILED',
            message: 'Failed to fetch current bot configuration',
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (!currentServer) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SERVER_NOT_FOUND',
            message: 'Server not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Merge the new config with existing config
      const currentConfig = currentServer.bot_config || {};
      const updatedConfig = {
        ...currentConfig,
        ...configData,
        updated_at: new Date().toISOString(),
      };

      // Update the bot_config JSONB field
      const { data: updatedServer, error: updateError } = await supabase
        .from('servers')
        .update({ 
          bot_config: updatedConfig,
          updated_at: new Date().toISOString()
        })
        .eq('discord_server_id', serverId)
        .select('bot_config')
        .single();

      if (updateError) {
        logger.error('Failed to update bot config:', updateError);
        return res.status(500).json({
          success: false,
          error: {
            code: 'CONFIG_UPDATE_FAILED',
            message: 'Failed to update bot configuration',
            timestamp: new Date().toISOString(),
          },
        });
      }

      res.json({
        success: true,
        data: updatedServer.bot_config,
      });
    } catch (error) {
      logger.error('Failed to update bot config:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * GET /api/servers/:serverId/stats
 * Get server statistics (sales, revenue, products, orders)
 */
router.get('/:serverId/stats',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  createCacheMiddleware(cacheConfigs.serverStats),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;

      // Get server from database to get internal ID
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverError || !server) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SERVER_NOT_FOUND',
            message: 'Server not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Get basic stats - for now return mock data since we don't have orders/sales tables yet
      const stats = {
        total_sales: 0,
        total_revenue: 0,
        active_products: 0,
        total_orders: 0,
        recent_orders: []
      };

      // Get active products count
      const { count: productsCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('server_id', server.id)
        .eq('is_active', true);

      stats.active_products = productsCount || 0;

      logger.info('Server stats retrieved', {
        serverId,
        userId: req.user?.id,
        stats
      });

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving server stats:', error);
      throw new AppError('Failed to retrieve server stats', 500, 'SERVER_STATS_ERROR');
    }
  }
);

/**
 * GET /api/servers/:serverId/channels
 * Get Discord channels for a server (requires bot to be in the server)
 */
router.get('/:serverId/channels',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;

      // Get server from database to verify ownership
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .select('discord_server_id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverError || !server) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SERVER_NOT_FOUND',
            message: 'Server not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Use the bot token from environment variables
      const botToken = process.env.DISCORD_BOT_TOKEN;
      if (!botToken) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'BOT_NOT_CONFIGURED',
            message: 'Bot token is not configured',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Fetch channels from Discord API
      logger.info('Attempting to fetch channels for server', { serverId, hasBotToken: !!botToken });
      
      try {
        const channels = await discordApiClient.getGuildChannels(serverId, botToken);
        logger.info('Successfully fetched channels', { serverId, channelCount: channels.length });
        
        res.json({
          success: true,
          data: {
            channels: channels.map(channel => ({
              id: channel.id,
              name: channel.name,
              type: channel.type,
              position: channel.position,
              parent_id: channel.parent_id
            }))
          },
          timestamp: new Date().toISOString(),
        });
        return;
      } catch (channelError: any) {
        logger.warn('Failed to fetch channels from Discord API', {
          serverId,
          error: channelError.message,
          status: channelError.response?.status
        });
        
        // If it's a rate limit or permission error, return mock channels for development
        if (channelError.response?.status === 429 || channelError.response?.status === 403) {
          // In development, return some mock channels so the UI can be tested
          const mockChannels = process.env.NODE_ENV === 'development' ? [
            { id: '123456789012345678', name: 'general', type: 0, position: 0, parent_id: null },
            { id: '123456789012345679', name: 'announcements', type: 0, position: 1, parent_id: null },
            { id: '123456789012345680', name: 'vouches', type: 0, position: 2, parent_id: null },
          ] : [];
          
          return res.json({
            success: true,
            data: {
              channels: mockChannels
            },
            warning: channelError.response?.status === 429 
              ? 'Rate limited by Discord API. Showing mock channels for development.'
              : 'Bot does not have permission to view channels. Showing mock channels for development.',
            timestamp: new Date().toISOString(),
          });
        }
        
        throw channelError; // Re-throw other errors to be handled by the catch block
      }

    } catch (error: any) {
      logger.error('Error fetching server channels:', {
        serverId: req.params.serverId,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });

      // Handle specific Discord API errors
      if (error.response?.status === 403) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'BOT_MISSING_PERMISSIONS',
            message: 'Bot does not have permission to view channels in this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SERVER_NOT_ACCESSIBLE',
            message: 'Bot is not in this server or server does not exist',
            timestamp: new Date().toISOString(),
          },
        });
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'CHANNELS_FETCH_ERROR',
          message: 'Failed to fetch server channels',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * GET /api/servers/:serverId/discord-test
 * Test Discord API connection and bot permissions
 */
router.get('/:serverId/discord-test',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const botToken = process.env.DISCORD_BOT_TOKEN;

      if (!botToken) {
        return res.json({
          success: false,
          error: 'Bot token not configured',
          tests: {
            botTokenExists: false,
            botInServer: false,
            canViewChannels: false
          }
        });
      }

      const tests = {
        botTokenExists: true,
        botInServer: false,
        canViewChannels: false,
        error: null as string | null
      };

      try {
        // Test if bot can access the guild
        const guildData = await discordApiClient.getGuildDetails(serverId, botToken);
        tests.botInServer = true;
        
        // Test if bot can view channels
        const channels = await discordApiClient.getGuildChannels(serverId, botToken);
        tests.canViewChannels = true;

        return res.json({
          success: true,
          tests,
          guildInfo: {
            name: guildData.name,
            memberCount: guildData.approximate_member_count,
            channelCount: channels.length
          }
        });
      } catch (error: any) {
        tests.error = error.message;
        
        if (error.response?.status === 403) {
          tests.error = 'Bot lacks permissions to access this server';
        } else if (error.response?.status === 404) {
          tests.error = 'Bot is not in this server or server does not exist';
        }

        return res.json({
          success: false,
          tests,
          error: tests.error
        });
      }
    } catch (error: any) {
      logger.error('Discord test error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during Discord test',
        details: error.message
      });
    }
  }
);

export default router;
