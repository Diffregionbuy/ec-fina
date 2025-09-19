import { Router } from 'express';
import { 
  authenticateBotService, 
  generateBotServiceJWT, 
  authenticateServiceJWT,
  requireBotPermissions,
  botServiceAuth,
  BotServiceRequest 
} from '../middleware/botAuth';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/centralizedErrorHandler';
import { rateLimiter } from '../middleware/rateLimiter';
import { supabase } from '../config/database';
import { paymentService } from '../services/paymentService';
import { tatumService } from '../services/tatumService';

const router = Router();

/**
 * Generate JWT token for bot service operations
 * POST /api/bot-service/auth
 */
router.post('/auth', 
  rateLimiter.createMiddleware(100, 15 * 60 * 1000), // 100 requests per 15 minutes
  authenticateBotService,
  generateBotServiceJWT
);

/**
 * Get bot service information and permissions
 * GET /api/bot-service/info
 */
router.get('/info',
  authenticateServiceJWT,
  async (req: BotServiceRequest, res) => {
    try {
      const botService = req.botService!;
      
      res.json({
        success: true,
        data: {
          service: botService.serviceId,
          type: botService.type,
          permissions: botService.permissions,
          authenticated: botService.authenticated
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get bot service info:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVICE_INFO_ERROR',
          message: 'Failed to retrieve service information',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Health check for bot services
 * GET /api/bot-service/health
 */
router.get('/health',
  authenticateServiceJWT,
  async (req: BotServiceRequest, res) => {
    try {
      const stats = botServiceAuth.getStats();
      
      res.json({
        success: true,
        data: {
          status: 'healthy',
          service: req.botService!.serviceId,
          timestamp: new Date().toISOString(),
          stats: {
            activeServices: stats.registeredServices,
            activeTokens: stats.activeTokens
          }
        }
      });
    } catch (error) {
      logger.error('Bot service health check failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Health check failed',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Get server templates (for Discord bot)
 * GET /api/bot-service/templates/:serverId
 */
router.get('/templates/:serverId',
  authenticateServiceJWT,
  requireBotPermissions(['read_templates', 'read_bot_config']),
  async (req: BotServiceRequest, res) => {
    try {
      const { serverId } = req.params;
      
      if (!serverId) {
        throw new AppError('Server ID is required', 400, 'MISSING_SERVER_ID');
      }

      logger.info('Bot service requesting templates', {
        service: req.botService!.serviceId,
        serverId,
        permissions: req.botService!.permissions
      });

      // Fetch bot config from servers table using discord_server_id
      const { data: server, error } = await supabase
        .from('servers')
        .select('bot_config, name')
        .eq('discord_server_id', serverId)
        .single();

      if (error) {
        logger.error('Failed to fetch server from database:', error);
        throw new AppError('Server not found', 404, 'SERVER_NOT_FOUND');
      }

      // Handle case where bot is invited but not configured yet
      const botConfig = server.bot_config || {};
      const isConfigured = botConfig && Object.keys(botConfig).length > 0;
      
      res.json({
        success: true,
        data: {
          serverId,
          serverName: server.name,

          templates: botConfig.templates || {},
          settings: botConfig.settings || {},
          product_display_settings: botConfig.product_display_settings || botConfig.productDisplaySettings || null,
          vouchChannelId: botConfig.vouch_channel_id || null,
          vouchFooterMessage: botConfig.vouch_footer_message || null,
          confirmationNote: botConfig.confirmation_note || null,
          isConfigured,
          message: isConfigured ? 'Bot is configured' : 'Bot is invited but not configured yet'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to get server templates:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TEMPLATE_FETCH_ERROR',
          message: 'Failed to retrieve server templates',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Get server products (for Discord bot)
 * GET /api/bot-service/products/:serverId
 */
router.get('/products/:serverId',
  authenticateServiceJWT,
  requireBotPermissions(['read_products']),
  async (req: BotServiceRequest, res) => {
    try {
      const { serverId } = req.params;
      
      if (!serverId) {
        throw new AppError('Server ID is required', 400, 'MISSING_SERVER_ID');
      }

      logger.info('Bot service requesting products', {
        service: req.botService!.serviceId,
        serverId,
        permissions: req.botService!.permissions
      });

      // Resolve internal server UUID from discord_server_id, then fetch products
      const { data: serverRow, error: serverErr } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverErr || !serverRow) {
        logger.warn('Server not found when fetching products', { serverId, serverErr });
        return res.json({
          success: true,
          data: {
            serverId,
            products: []
          },
          timestamp: new Date().toISOString()
        });
      }

      const { data: products, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          description,
          price,
          currency,
          category_id,
          minecraft_commands,
          is_active,
          stock_quantity,
          categories (
            id,
            name
          )
        `)
        .eq('server_id', serverRow.id)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        logger.warn('Failed to fetch products from database, returning empty list', { error });
        return res.json({
          success: true,
          data: {
            serverId,
            products: []
          },
          timestamp: new Date().toISOString()
        });
      }

      // Fetch ratings and compute aggregates (average 0–5 and count) for returned products
      const productIds = (products || []).map(p => p.id);
      let ratingMap: Record<string, { sum: number; count: number }> = {};
      if (productIds.length > 0) {
        const { data: ratings, error: ratingsErr } = await supabase
          .from('product_ratings')
          .select('product_id, rating_value')
          .in('product_id', productIds as any);

        if (ratingsErr) {
          logger.warn('Failed to fetch product ratings:', ratingsErr);
        } else if (ratings && ratings.length) {
          for (const r of ratings as any[]) {
            const pid = r.product_id;
            const val = Number(r.rating_value) || 0;
            if (!ratingMap[pid]) ratingMap[pid] = { sum: 0, count: 0 };
            ratingMap[pid].sum += val;
            ratingMap[pid].count += 1;
          }
        }
      }

      // Attach rating_avg and rating_count to each product
      const productsWithRatings = (products || []).map(p => {
        const stats = ratingMap[p.id] || { sum: 0, count: 0 };
        const rating_count = stats.count;
        const rating_avg = rating_count > 0 ? Math.max(0, Math.min(5, Number((stats.sum / rating_count).toFixed(2)))) : 0;
        return { ...p, rating_count, rating_avg };
      });
      
      res.json({
        success: true,
        data: {
          serverId,
          products: productsWithRatings
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to get server products:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PRODUCT_FETCH_ERROR',
          message: 'Failed to retrieve server products',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Get server categories (for Discord bot)
 * GET /api/bot-service/categories/:serverId
 */
router.get('/categories/:serverId',
  authenticateServiceJWT,
  requireBotPermissions(['read_categories']),
  async (req: BotServiceRequest, res) => {
    try {
      const { serverId } = req.params;
      
      if (!serverId) {
        throw new AppError('Server ID is required', 400, 'MISSING_SERVER_ID');
      }

      logger.info('Bot service requesting categories', {
        service: req.botService!.serviceId,
        serverId,
        permissions: req.botService!.permissions
      });

      // Resolve internal server UUID from discord_server_id, then fetch categories
      const { data: serverRow, error: serverErr } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverErr || !serverRow) {
        logger.warn('Server not found when fetching categories', { serverId, serverErr });
        return res.json({
          success: true,
          data: {
            serverId,
            categories: []
          },
          timestamp: new Date().toISOString()
        });
      }

      const { data: categories, error } = await supabase
        .from('categories')
        .select(`
          id,
          name,
          description,
          image_url
        `)
        .eq('server_id', serverRow.id)
        .order('name', { ascending: true });

      if (error) {
        logger.warn('Failed to fetch categories from database, returning empty list', { error });
        return res.json({
          success: true,
          data: {
            serverId,
            categories: []
          },
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        data: {
          serverId,
          categories: categories || []
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to get server categories:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CATEGORY_FETCH_ERROR',
          message: 'Failed to retrieve server categories',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Create payment order (for Discord bot)
 * POST /api/bot-service/orders
 */
router.post('/orders',
  rateLimiter.createMiddleware(50, 15 * 60 * 1000), // 50 requests per 15 minutes
  authenticateServiceJWT,
  requireBotPermissions(['create_payments']),
  async (req: BotServiceRequest, res) => {
    try {
      const { serverId, userId, discordUserId, products, paymentMethod = false, discordChannelId } = req.body;
      
      // Validate required fields
      if (!serverId || (!userId && !discordUserId) || !products || !Array.isArray(products) || products.length === 0) {
        throw new AppError('Missing required fields or invalid products array', 400, 'MISSING_REQUIRED_FIELDS');
      }

      logger.info('Bot service creating payment order', {
        service: req.botService!.serviceId,
        serverId,
        userId,
        discordUserId,
        products,
        paymentMethod
      });

      // Resolve internal server UUID from discord_server_id for order operations
      const { data: serverRow, error: serverErr } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverErr || !serverRow) {
        logger.warn('Server not found when creating order', { serverId, serverErr });
        throw new AppError('Server not found', 404, 'SERVER_NOT_FOUND');
      }
      const internalServerId = serverRow.id;

      // Resolve internal user UUID (users.id) from userId or discordUserId
      const UUID_REGEX = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
      const SNOWFLAKE_REGEX = /^\d{17,20}$/;

      let internalUserId: string | undefined;

      // If userId provided, determine whether it's an internal UUID or a Discord snowflake
      if (userId) {
        if (UUID_REGEX.test(String(userId))) {
          const { data: existingUser, error: existingUserErr } = await supabase
            .from('users')
            .select('id')
            .eq('id', String(userId))
            .single();
          if (existingUser && !existingUserErr) {
            internalUserId = existingUser.id;
          } else {
            logger.warn('Provided userId is UUID format but not found in users', { userId });
          }
        } else if (SNOWFLAKE_REGEX.test(String(userId))) {
          // Treat provided userId as Discord snowflake
          const { data: userByDiscord, error: userByDiscordErr } = await supabase
            .from('users')
            .select('id')
            .eq('discord_id', String(userId))
            .single();
          if (userByDiscord && !userByDiscordErr) {
            internalUserId = userByDiscord.id;
          } else {
            // Create minimal user with this Discord ID
            const fallbackUsername = `user_${String(userId).slice(-8)}`;
            const { data: createdUser, error: createUserErr } = await supabase
              .from('users')
              .insert({
                discord_id: String(userId),
                username: fallbackUsername
              })
              .select('id')
              .single();
            if (createUserErr || !createdUser) {
              logger.error('Failed to create minimal user from numeric userId (treated as Discord ID)', { userId, error: createUserErr });
              throw new AppError('Failed to create user for order', 500, 'USER_CREATE_FAILED');
            }
            internalUserId = createdUser.id;
          }
        }
      }

      // If still unresolved and discordUserId is provided, resolve or create by Discord ID
      if (!internalUserId && discordUserId) {
        if (!SNOWFLAKE_REGEX.test(String(discordUserId))) {
          throw new AppError('Invalid Discord user ID format', 400, 'INVALID_DISCORD_USER_ID');
        }
        const { data: userByDiscord2, error: userByDiscordErr2 } = await supabase
          .from('users')
          .select('id')
          .eq('discord_id', String(discordUserId))
          .single();
        if (userByDiscord2 && !userByDiscordErr2) {
          internalUserId = userByDiscord2.id;
        } else {
          const fallbackUsername = `user_${String(discordUserId).slice(-8)}`;
          const { data: createdUser2, error: createUserErr2 } = await supabase
            .from('users')
            .insert({
              discord_id: String(discordUserId),
              username: fallbackUsername
            })
            .select('id')
            .single();
          if (createUserErr2 || !createdUser2) {
            logger.error('Failed to create minimal user from discordUserId', { discordUserId, error: createUserErr2 });
            throw new AppError('Failed to create user for order', 500, 'USER_CREATE_FAILED');
          }
          internalUserId = createdUser2.id;
        }
      }

      if (!internalUserId) {
        throw new AppError('User not found. Provide a valid users.id or discordUserId', 404, 'USER_NOT_FOUND');
      }

      // Single-product flow (no cart): expect exactly one product
      if (!Array.isArray(products) || products.length !== 1) {
        throw new AppError('Cart is not supported. Provide exactly one product', 400, 'CART_NOT_SUPPORTED');
      }

      const item = products[0];
      const quantity = item.quantity ?? 1;

      // Use PaymentService to create order with Tatum integration
      const paymentOrder = await paymentService.createPaymentOrder({
        serverId,
        userId: internalUserId,
        productId: item.id,
        quantity,
        paymentMethod,
        discordChannelId
      });

      res.json({
        success: true,
        data: paymentOrder,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to create payment order:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ORDER_CREATION_ERROR',
          message: 'Failed to create payment order',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Get order status (for Discord bot)
 * GET /api/bot-service/orders/:orderId
 */
router.get('/orders/:orderId',
  authenticateServiceJWT,
  requireBotPermissions(['read_orders']),
  async (req: BotServiceRequest, res) => {
    try {
      const { orderId } = req.params;
      
      if (!orderId) {
        throw new AppError('Order ID is required', 400, 'MISSING_ORDER_ID');
      }

      logger.info('Bot service requesting order status', {
        service: req.botService!.serviceId,
        orderId
      });

      const orderStatus = await paymentService.getPaymentOrderStatus(orderId);
      
      res.json({
        success: true,
        data: orderStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to get order status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ORDER_STATUS_ERROR',
          message: 'Failed to retrieve order status',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Generate Minecraft account linking code
 * POST /api/bot-service/minecraft/link-code
 */
router.post('/minecraft/link-code',
  authenticateServiceJWT,
  requireBotPermissions(['minecraft_integration']),
  async (req: BotServiceRequest, res) => {
    try {
      const { serverId, discordUserId } = req.body;
      
      if (!serverId || !discordUserId) {
        throw new AppError('Server ID and Discord User ID are required', 400, 'MISSING_REQUIRED_FIELDS');
      }

      // Resolve internal server UUID from discord_server_id
      const { data: mcServerRow, error: mcServerErr } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();
      if (mcServerErr || !mcServerRow) {
        logger.warn('Server not found for minecraft link-code', { serverId, mcServerErr });
        throw new AppError('Server not found', 404, 'SERVER_NOT_FOUND');
      }
      const internalServerId = mcServerRow.id;

      // Resolve internal user UUID from discordUserId (supports UUID or Discord snowflake)
      const UUID_REGEX = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
      const SNOWFLAKE_REGEX = /^\d{17,20}$/;
      let internalUserId: string | undefined;
      if (UUID_REGEX.test(String(discordUserId))) {
        const { data: existingUser, error: existingUserErr } = await supabase
          .from('users')
          .select('id')
          .eq('id', String(discordUserId))
          .single();
        if (existingUser && !existingUserErr) {
          internalUserId = existingUser.id;
        } else {
          throw new AppError('User not found. Provide a valid users.id or a Discord snowflake', 404, 'USER_NOT_FOUND');
        }
      } else if (SNOWFLAKE_REGEX.test(String(discordUserId))) {
        const { data: userByDiscord, error: userByDiscordErr } = await supabase
          .from('users')
          .select('id')
          .eq('discord_id', String(discordUserId))
          .single();
        if (userByDiscord && !userByDiscordErr) {
          internalUserId = userByDiscord.id;
        } else {
          const fallbackUsername = `user_${String(discordUserId).slice(-8)}`;
          const { data: createdUser, error: createUserErr } = await supabase
            .from('users')
            .insert({ discord_id: String(discordUserId), username: fallbackUsername })
            .select('id')
            .single();
          if (createUserErr || !createdUser) {
            logger.error('Failed to create minimal user for minecraft link', { discordUserId, error: createUserErr });
            throw new AppError('Failed to create user for link', 500, 'USER_CREATE_FAILED');
          }
          internalUserId = createdUser.id;
        }
      } else {
        throw new AppError('Invalid Discord user ID format', 400, 'INVALID_DISCORD_USER_ID');
      }

      logger.info('Bot service generating Minecraft link code', {
        service: req.botService!.serviceId,
        serverId,
        discordUserId
      });

      // Check if user already has an active link
      const { data: existingLink } = await supabase
        .from('minecraft_accounts')
        .select('*')
        .eq('discord_user_id', internalUserId)
        .eq('server_id', internalServerId)
        .eq('is_active', true)
        .single();

      if (existingLink && existingLink.is_verified) {
        return res.json({
          success: true,
          data: {
            alreadyLinked: true,
            minecraftUsername: existingLink.minecraft_username,
            linkedAt: existingLink.linked_at
          },
          timestamp: new Date().toISOString()
        });
      }

      // Create or update link code
      const { data: linkAccount, error } = await supabase
        .from('minecraft_accounts')
        .upsert({
          discord_user_id: internalUserId,
          server_id: internalServerId,
          is_active: true,
          is_verified: false
        }, {
          onConflict: 'discord_user_id,server_id'
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create Minecraft link code:', error);
        throw new AppError('Failed to generate link code', 500, 'LINK_CODE_ERROR');
      }

      res.json({
        success: true,
        data: {
          linkCode: linkAccount.link_code,
          expiresAt: linkAccount.link_code_expires_at,
          instructions: `Go to your Minecraft server and type: /ecbot link ${linkAccount.link_code}`
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to generate Minecraft link code:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LINK_CODE_ERROR',
          message: 'Failed to generate Minecraft link code',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Verify Minecraft account linking (called by Minecraft plugin)
 * POST /api/bot-service/minecraft/verify-link
 */
router.post('/minecraft/verify-link',
  authenticateServiceJWT,
  requireBotPermissions(['minecraft_integration']),
  async (req: BotServiceRequest, res) => {
    try {
      const { linkCode, minecraftUuid, minecraftUsername, serverId } = req.body;
      
      if (!linkCode || !minecraftUuid || !minecraftUsername || !serverId) {
        throw new AppError('Missing required fields', 400, 'MISSING_REQUIRED_FIELDS');
      }

      logger.info('Minecraft plugin verifying link', {
        service: req.botService!.serviceId,
        linkCode,
        minecraftUuid,
        minecraftUsername,
        serverId
      });

      // Find and verify the link code
      const { data: linkAccount, error: findError } = await supabase
        .from('minecraft_accounts')
        .select('*')
        .eq('link_code', linkCode)
        .eq('server_id', serverId)
        .eq('is_active', true)
        .gte('link_code_expires_at', new Date().toISOString())
        .single();

      if (findError || !linkAccount) {
        throw new AppError('Invalid or expired link code', 400, 'INVALID_LINK_CODE');
      }

      // Update with Minecraft account details
      const { data: updatedAccount, error: updateError } = await supabase
        .from('minecraft_accounts')
        .update({
          minecraft_uuid: minecraftUuid,
          minecraft_username: minecraftUsername,
          is_verified: true,
          linked_at: new Date().toISOString(),
          link_code: null, // Clear the link code
          link_code_expires_at: null
        })
        .eq('id', linkAccount.id)
        .select()
        .single();

      if (updateError) {
        logger.error('Failed to update Minecraft account link:', updateError);
        throw new AppError('Failed to complete account linking', 500, 'LINK_UPDATE_ERROR');
      }

      res.json({
        success: true,
        data: {
          discordUserId: updatedAccount.discord_user_id,
          minecraftUuid: updatedAccount.minecraft_uuid,
          minecraftUsername: updatedAccount.minecraft_username,
          linkedAt: updatedAccount.linked_at,
          verified: true
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to verify Minecraft link:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LINK_VERIFICATION_ERROR',
          message: 'Failed to verify Minecraft account link',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Test TatumService (for debugging)
 * GET /api/bot-service/test-tatum
 */
router.get('/test-tatum',
  authenticateServiceJWT,
  async (req: BotServiceRequest, res) => {
    try {
      logger.info('Testing TatumService');
      
      // Test basic TatumService functionality
      const healthStatus = tatumService.getHealthStatus();
      logger.info('TatumService health status', { healthStatus });
      
      res.json({
        success: true,
        data: {
          message: 'TatumService test successful',
          healthStatus
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('TatumService test failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TATUM_TEST_ERROR',
          message: error.message || 'TatumService test failed',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Check payment status for an order (for Discord bot)
 * POST /api/bot-service/payments/:orderId/check
 */
router.post('/payments/:orderId/check',
  authenticateServiceJWT,
  requireBotPermissions(['read_orders']),
  async (req: BotServiceRequest, res) => {
    try {
      const { orderId } = req.params;
      
      if (!orderId) {
        throw new AppError('Order ID is required', 400, 'MISSING_ORDER_ID');
      }

      logger.info('Bot service checking payment status', {
        service: req.botService!.serviceId,
        orderId
      });

      logger.info('Starting payment check', { orderId });

      // Get order details
      const { data: order, error: orderError } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        logger.error('Order not found', { orderId, orderError });
        throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      }

      logger.info('Order found', { 
        orderId, 
        status: order.status, 
        hasCryptoInfo: !!order.crypto_info,
        address: order.crypto_info?.address 
      });

      // Perform manual payment check using TatumService
      logger.info('Calling tatumService.checkOrderPaymentStatus');
      let paymentStatus;
      try {
        paymentStatus = await tatumService.checkOrderPaymentStatus(orderId);
        logger.info('Payment status received', { paymentStatus });
      } catch (tatumError) {
        logger.error('TatumService error', { 
          error: tatumError.message, 
          stack: tatumError.stack,
          orderId 
        });
        throw tatumError;
      }

      // Get currency from order crypto_info
      const currency = order.crypto_info?.coin || 'ETH';

      res.json({
        success: true,
        data: {
          orderId,
          status: paymentStatus.status,
          expectedAmount: paymentStatus.expectedAmount,
          receivedAmount: paymentStatus.receivedAmount,
          address: paymentStatus.address,
          transactionHash: paymentStatus.transactionHash,
          currency: currency,
          checkedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to check payment status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PAYMENT_CHECK_ERROR',
          message: 'Failed to check payment status',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Get Minecraft account info for Discord user
 * GET /api/bot-service/minecraft/:serverId/:discordUserId
 */
router.get('/minecraft/:serverId/:discordUserId',
  authenticateServiceJWT,
  requireBotPermissions(['minecraft_integration']),
  async (req: BotServiceRequest, res) => {
    try {
      const { serverId, discordUserId } = req.params;

      // Resolve internal server UUID from discord_server_id
      const { data: mcServerRow, error: mcServerErr } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();
      if (mcServerErr || !mcServerRow) {
        logger.warn('Server not found for minecraft info', { serverId, mcServerErr });
        throw new AppError('Server not found', 404, 'SERVER_NOT_FOUND');
      }
      const internalServerId = mcServerRow.id;

      // Resolve internal user id from discordUserId (UUID or snowflake)
      const UUID_REGEX = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
      const SNOWFLAKE_REGEX = /^\d{17,20}$/;
      let internalUserId: string | undefined;
      if (UUID_REGEX.test(String(discordUserId))) {
        internalUserId = String(discordUserId);
      } else if (SNOWFLAKE_REGEX.test(String(discordUserId))) {
        const { data: userByDiscord, error: userByDiscordErr } = await supabase
          .from('users')
          .select('id')
          .eq('discord_id', String(discordUserId))
          .single();
        internalUserId = userByDiscord?.id;
      }

      const { data: minecraftAccount, error } = await supabase
        .from('minecraft_accounts')
        .select('*')
        .eq('discord_user_id', internalUserId || '')
        .eq('server_id', internalServerId)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Failed to fetch Minecraft account:', error);
        throw new AppError('Failed to fetch Minecraft account', 500, 'MINECRAFT_FETCH_ERROR');
      }

      res.json({
        success: true,
        data: {
          linked: !!minecraftAccount,
          verified: minecraftAccount?.is_verified || false,
          minecraftUsername: minecraftAccount?.minecraft_username || null,
          minecraftUuid: minecraftAccount?.minecraft_uuid || null,
          linkedAt: minecraftAccount?.linked_at || null
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      logger.error('Failed to get Minecraft account info:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'MINECRAFT_INFO_ERROR',
          message: 'Failed to retrieve Minecraft account information',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

/**
 * Admin endpoint to get bot service statistics
 * GET /api/bot-service/admin/stats
 */
router.get('/admin/stats',
  authenticateServiceJWT,
  requireBotPermissions(['admin_access']),
  async (req: BotServiceRequest, res) => {
    try {
      const stats = botServiceAuth.getStats();
      
      res.json({
        success: true,
        data: {
          ...stats,
          requestedBy: req.botService!.serviceId
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get bot service stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: 'Failed to retrieve service statistics',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

export default router;