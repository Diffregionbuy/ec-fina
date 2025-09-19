import { Router, Response } from 'express';
import { DiscordApiClient } from '../services/DiscordApiClient';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { adaptiveRateLimit } from '../middleware/optimizedRateLimiter';
import { logger } from '../utils/logger';
import { supabase } from '../config/database';
import { cache } from '../services/cache';

const router = Router();
const discordApiClient = new DiscordApiClient();

/**
 * OPTIMIZED: Consolidated server endpoints
 * Replaces multiple scattered endpoints with a single, efficient route
 */

/**
 * GET /api/servers
 * Get user's servers with optional filtering and pagination
 * Consolidates: /api/users/servers functionality
 */
router.get('/', authMiddleware.authenticate, adaptiveRateLimit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  const { 
    include = 'basic', // basic, config, stats, channels
    configured,
    owned,
    page = 1,
    limit = 20 
  } = req.query;

  try {
    // Check cache first
    const cacheKey = `servers:${req.user.id}:${include}:${configured}:${owned}:${page}:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Single optimized query with JOINs instead of N+1
    const guilds = await discordApiClient.getDiscordGuilds(req.user.discordAccessToken, req.user.id);
    const managableGuilds = discordApiClient.filterManageableGuilds(guilds);
    const guildIds = managableGuilds.map(g => g.id);

    // Single database query with all needed data
    let query = supabase
      .from('servers')
      .select(`
        id,
        discord_server_id,
        name,
        icon,
        bot_invited,
        bot_enabled,
        subscription_tier,
        created_at,
        updated_at,
        ${include.includes('config') ? 'bot_config,' : ''}
        ${include.includes('stats') ? 'member_count, message_count,' : ''}
        bot_configurations(*)
      `)
      .in('discord_server_id', guildIds);

    // Apply filters
    if (configured !== undefined) {
      query = query.eq('bot_invited', configured === 'true');
    }

    const { data: serverConfigs, error } = await query;
    if (error) throw error;

    // Combine Discord and database data efficiently
    const servers = managableGuilds.map(guild => {
      const config = serverConfigs?.find(c => c.discord_server_id === guild.id);
      
      // Minimal response payload - only essential data
      const serverData: any = {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: guild.owner,
        memberCount: guild.approximate_member_count || 0,
        configured: !!config,
        botEnabled: config?.bot_enabled || false,
        tier: config?.subscription_tier || 'free'
      };

      // Conditionally include additional data based on 'include' parameter
      if (include.includes('config') && config) {
        serverData.config = {
          prefix: config.bot_config?.prefix,
          welcomeChannel: config.bot_config?.welcome_channel_id,
          logChannel: config.bot_config?.log_channel_id
        };
      }

      if (include.includes('stats') && config) {
        serverData.stats = {
          members: config.member_count || 0,
          messages: config.message_count || 0
        };
      }

      return serverData;
    });

    // Apply ownership filter
    const filteredServers = owned !== undefined 
      ? servers.filter(s => s.owner === (owned === 'true'))
      : servers;

    // Pagination
    const startIndex = (Number(page) - 1) * Number(limit);
    const paginatedServers = filteredServers.slice(startIndex, startIndex + Number(limit));

    const response = {
      success: true,
      data: {
        servers: paginatedServers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: filteredServers.length,
          totalPages: Math.ceil(filteredServers.length / Number(limit))
        }
      }
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);

    res.json(response);
  } catch (error) {
    logger.error('Get servers error:', { error, userId: req.user.id });
    throw new AppError('Failed to fetch servers', 500, 'SERVERS_ERROR');
  }
}));

/**
 * GET /api/servers/:serverId
 * Get detailed server information with optional includes
 * Consolidates: /api/servers/:serverId/details, /api/users/servers/:serverId
 */
router.get('/:serverId', 
  authMiddleware.authenticate,
  authMiddleware.requireServerAccess(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { serverId } = req.params;
    const { include = 'config' } = req.query; // config, channels, members, stats

    try {
      // Check cache
      const cacheKey = `server:${serverId}:${include}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Single query with all needed data
      const { data: serverData, error } = await supabase
        .from('servers')
        .select(`
          *,
          bot_configurations(*),
          ${include.includes('stats') ? 'server_stats(*),' : ''}
          ${include.includes('members') ? 'server_members(*),' : ''}
        `)
        .eq('discord_server_id', serverId)
        .single();

      if (error) throw error;

      // Get Discord guild data
      const guilds = await discordApiClient.getDiscordGuilds(req.user!.discordAccessToken);
      const guild = guilds.find(g => g.id === serverId);

      if (!guild) {
        throw new AppError('Server not found', 404, 'SERVER_NOT_FOUND');
      }

      // Build response with minimal data
      const response: any = {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: guild.owner,
        memberCount: guild.approximate_member_count || 0,
        configured: !!serverData
      };

      // Conditionally include additional data
      if (include.includes('config') && serverData) {
        response.config = {
          prefix: serverData.bot_config?.prefix || '!',
          welcomeChannel: serverData.bot_config?.welcome_channel_id,
          logChannel: serverData.bot_config?.log_channel_id,
          autoRole: serverData.bot_config?.auto_role_id,
          enabled: serverData.bot_enabled
        };
      }

      if (include.includes('channels')) {
        // Fetch channels only when requested
        response.channels = await discordApiClient.getGuildChannels(serverId);
      }

      if (include.includes('stats') && serverData?.server_stats) {
        response.stats = serverData.server_stats[0] || {};
      }

      const result = {
        success: true,
        data: { server: response }
      };

      // Cache for 2 minutes
      await cache.set(cacheKey, result, 120);

      res.json(result);
    } catch (error) {
      logger.error('Get server details error:', { error, serverId });
      throw new AppError('Failed to get server details', 500, 'SERVER_DETAILS_ERROR');
    }
  })
);

/**
 * PUT /api/servers/:serverId
 * Update server configuration
 * Consolidates bot config updates
 */
router.put('/:serverId',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { serverId } = req.params;
    const { config, settings } = req.body;

    try {
      // Validate input
      if (!config && !settings) {
        throw new AppError('No configuration provided', 400, 'INVALID_INPUT');
      }

      // Single update query
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (config) {
        updateData.bot_config = config;
        updateData.bot_enabled = true;
      }

      if (settings) {
        Object.assign(updateData, settings);
      }

      const { data: updatedServer, error } = await supabase
        .from('servers')
        .update(updateData)
        .eq('discord_server_id', serverId)
        .select()
        .single();

      if (error) throw error;

      // Clear related caches
      await cache.deletePattern(`server:${serverId}:*`);
      await cache.deletePattern(`servers:${req.user!.id}:*`);

      res.json({
        success: true,
        data: {
          server: {
            id: updatedServer.discord_server_id,
            config: updatedServer.bot_config,
            enabled: updatedServer.bot_enabled,
            updatedAt: updatedServer.updated_at
          }
        }
      });
    } catch (error) {
      logger.error('Update server error:', { error, serverId });
      throw new AppError('Failed to update server', 500, 'SERVER_UPDATE_ERROR');
    }
  })
);

/**
 * POST /api/servers/:serverId/setup
 * Initial server setup with template support
 * Consolidates setup-template functionality
 */
router.post('/:serverId/setup',
  authMiddleware.authenticate,
  authMiddleware.requireServerOwnership(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { serverId } = req.params;
    const { template, config = {} } = req.body;

    try {
      // Get Discord guild info
      const guilds = await discordApiClient.getDiscordGuilds(req.user!.discordAccessToken);
      const guild = guilds.find(g => g.id === serverId);

      if (!guild) {
        throw new AppError('Server not found', 404, 'SERVER_NOT_FOUND');
      }

      // Apply template if provided
      let finalConfig = config;
      if (template) {
        const templateConfig = await getTemplate(template);
        finalConfig = { ...templateConfig, ...config };
      }

      // Upsert server record
      const { data: serverRecord, error } = await supabase
        .from('servers')
        .upsert({
          discord_server_id: serverId,
          owner_id: req.user!.id,
          name: guild.name,
          icon: guild.icon,
          bot_invited: true,
          bot_enabled: true,
          bot_config: finalConfig,
          subscription_tier: 'free',
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Clear caches
      await cache.deletePattern(`server:${serverId}:*`);
      await cache.deletePattern(`servers:${req.user!.id}:*`);

      res.json({
        success: true,
        data: {
          server: {
            id: serverRecord.discord_server_id,
            configured: true,
            template: template || null,
            config: serverRecord.bot_config
          }
        }
      });
    } catch (error) {
      logger.error('Server setup error:', { error, serverId });
      throw new AppError('Failed to setup server', 500, 'SERVER_SETUP_ERROR');
    }
  })
);

/**
 * GET /api/servers/:serverId/channels
 * Get server channels (cached)
 */
router.get('/:serverId/channels',
  authMiddleware.authenticate,
  authMiddleware.requireServerAccess(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { serverId } = req.params;

    try {
      const cacheKey = `channels:${serverId}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const channels = await discordApiClient.getGuildChannels(serverId);
      
      const response = {
        success: true,
        data: { channels }
      };

      // Cache for 10 minutes
      await cache.set(cacheKey, response, 600);

      res.json(response);
    } catch (error) {
      logger.error('Get channels error:', { error, serverId });
      throw new AppError('Failed to get channels', 500, 'CHANNELS_ERROR');
    }
  })
);

/**
 * Helper function to get template configuration
 */
async function getTemplate(templateName: string) {
  const templates = {
    'basic': {
      prefix: '!',
      welcome_enabled: true,
      moderation_enabled: false
    },
    'moderation': {
      prefix: '!',
      welcome_enabled: true,
      moderation_enabled: true,
      auto_mod: true
    },
    'community': {
      prefix: '!',
      welcome_enabled: true,
      moderation_enabled: true,
      levels_enabled: true,
      economy_enabled: true
    }
  };

  return templates[templateName as keyof typeof templates] || templates.basic;
}

export default router;