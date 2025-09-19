import { Router, Response } from 'express';
import { DiscordApiClient } from '../services/DiscordApiClient';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { discordApiRateLimit } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';
import { supabase } from '../config/database';
import { SubscriptionService } from '../services/SubscriptionService';

const router = Router();
const discordApiClient = new DiscordApiClient();

/**
 * GET /api/users/profile
 * Get current user profile information
 */
router.get('/profile', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  try {
    // Get user data from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (userError) {
      logger.error('Failed to fetch user profile:', userError);
      throw new AppError('Failed to fetch user profile', 500, 'DATABASE_ERROR');
    }

    // Get fresh Discord user data
    const discordUser = await discordApiClient.getDiscordUser(req.user.discordAccessToken);

    res.json({
      success: true,
      data: {
        user: {
          id: userData.id,
          discordId: userData.discord_id,
          username: discordUser.username,
          avatar: discordUser.avatar,
          email: discordUser.email,
          createdAt: userData.created_at,
          updatedAt: userData.updated_at,
          preferences: userData.preferences || {},
        },
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Get user profile error:', error);
    throw new AppError('Failed to get user profile', 500, 'PROFILE_ERROR');
  }
}));

/**
 * PUT /api/users/profile
 * Update user profile information
 */
router.put('/profile', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  const { preferences, notifications } = req.body;

  try {
    // Validate preferences structure
    if (preferences && typeof preferences !== 'object') {
      throw new AppError('Preferences must be an object', 400, 'INVALID_PREFERENCES');
    }

    // Update user preferences in database
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (preferences) {
      updateData.preferences = preferences;
    }

    if (notifications !== undefined) {
      updateData.notifications_enabled = Boolean(notifications);
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.user.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update user profile:', updateError);
      throw new AppError('Failed to update user profile', 500, 'DATABASE_ERROR');
    }

    logger.info('User profile updated', { userId: req.user.id });

    res.json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          discordId: updatedUser.discord_id,
          username: updatedUser.username,
          avatar: updatedUser.avatar,
          email: updatedUser.email,
          createdAt: updatedUser.created_at,
          updatedAt: updatedUser.updated_at,
          preferences: updatedUser.preferences || {},
          notificationsEnabled: updatedUser.notifications_enabled,
        },
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Update user profile error:', error);
    throw new AppError('Failed to update user profile', 500, 'PROFILE_UPDATE_ERROR');
  }
}));

/**
 * GET /api/users/wallet-mode
 * Returns the user's preferred wallet custody mode
 */
router.get('/wallet-mode', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', req.user.id)
    .single();

  if (error) {
    logger.error('Failed to fetch wallet mode:', error);
    throw new AppError('Failed to fetch wallet mode', 500, 'DATABASE_ERROR');
  }

  const prefs = (user as any)?.preferences || {};
  const mode = typeof prefs.walletMode === 'string' ? prefs.walletMode : 'non_custody';

  res.json({ success: true, data: { mode }, timestamp: new Date().toISOString() });
}));

/**
 * PUT /api/users/wallet-mode
 * Updates the user's preferred wallet custody mode
 */
router.put('/wallet-mode', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  const { mode } = req.body || {};
  const validModes = ['non_custody', 'custody'];
  if (!validModes.includes(mode)) {
    throw new AppError('Invalid wallet mode', 400, 'INVALID_WALLET_MODE');
  }

  // Load current preferences and merge
  const { data: current, error: fetchErr } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', req.user.id)
    .single();

  if (fetchErr) {
    logger.error('Failed to load current preferences:', fetchErr);
    throw new AppError('Failed to update wallet mode', 500, 'DATABASE_ERROR');
  }

  const prefs = (current as any)?.preferences && typeof (current as any).preferences === 'object'
    ? { ...(current as any).preferences }
    : {};
  prefs.walletMode = mode;

  const { error: updateErr } = await supabase
    .from('users')
    .update({ preferences: prefs, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);

  if (updateErr) {
    logger.error('Failed to update wallet mode:', updateErr);
    throw new AppError('Failed to update wallet mode', 500, 'DATABASE_ERROR');
  }

  logger.info('Wallet mode updated', { userId: req.user.id, mode });
  res.json({ success: true, data: { mode }, timestamp: new Date().toISOString() });
}));

/**
 * GET /api/users/servers
 * Get user's Discord servers with ownership information
 */
router.get('/servers', authMiddleware.authenticate, discordApiRateLimit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  try {
    // Get user's Discord guilds using the access token from the authenticated user
    const guilds = await discordApiClient.getDiscordGuilds(req.user.discordAccessToken, req.user.id);

    // Use the authenticated user's Discord info
    const discordUser = { id: req.user.discordId };

    // Find the user in our database using the authenticated user's ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (userError) {
      logger.warn('User not found in database:', { 
        userId: req.user.id,
        error: userError.message,
        code: userError.code 
      });
      // If user doesn't exist, we can still return Discord servers without configuration
    }

    // Filter guilds to only include those where user has management permissions
    const managableGuilds = discordApiClient.filterManageableGuilds(guilds);

    // Get server configurations from database for manageable servers
    const managableGuildIds = managableGuilds.map(guild => guild.id);

    let serverConfigs = [];
    if (managableGuildIds.length > 0) {
      const { data: configs, error: configError } = await supabase
        .from('servers')
        .select('*')
        .in('discord_server_id', managableGuildIds);

      if (configError) {
        logger.warn('Failed to fetch server configurations:', { 
          error: configError.message,
          code: configError.code,
          userId: req.user.id 
        });
      } else {
        serverConfigs = configs || [];
      }

      // Create server records for any servers that don't exist in the database yet
      const existingServerIds = serverConfigs.map(config => config.discord_server_id);
      const newServers = managableGuilds.filter(guild => !existingServerIds.includes(guild.id));

      if (newServers.length > 0 && user) {
        logger.info('Creating new server records', { 
          userId: user.id,
          newServerCount: newServers.length,
          serverIds: newServers.map(s => s.id)
        });

        const serverInserts = newServers.map(guild => ({
          discord_server_id: guild.id,
          owner_id: user.id,
          name: guild.name,
          icon: guild.icon,
          bot_invited: false,
          bot_config: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        const { data: insertedServers, error: insertError } = await supabase
          .from('servers')
          .insert(serverInserts)
          .select();

        if (insertError) {
          logger.error('Failed to create server records:', { 
            error: insertError.message,
            code: insertError.code,
            userId: user.id,
            serverCount: newServers.length 
          });
        } else {
          logger.info('Successfully created server records', { 
            count: insertedServers?.length || 0,
            userId: user.id 
          });
          
          // Create default subscriptions for new servers
          if (insertedServers && insertedServers.length > 0) {
            for (const server of insertedServers) {
              await SubscriptionService.createDefaultSubscription(user.id, server.id);
            }
          }
          
          // Add the newly created servers to our configs array
          serverConfigs = [...serverConfigs, ...(insertedServers || [])];
        }
      }
    }

    // Combine Discord guild data with database configurations
    const serversWithConfig = managableGuilds.map(guild => {
      const config = serverConfigs.find(c => c.discord_server_id === guild.id);
      
      return {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: guild.owner,
        permissions: guild.permissions,
        approximate_member_count: guild.approximate_member_count || 0,
        configured: !!config,
        botEnabled: config?.bot_enabled || false,
        botInvited: config?.bot_invited || false,
        configuration: config ? {
          id: config.id,
          prefix: config.prefix,
          welcomeChannelId: config.welcome_channel_id,
          logChannelId: config.log_channel_id,
          autoRoleId: config.auto_role_id,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
        } : null,
      };
    });

    // Separate owned and member servers
    const ownedServers = serversWithConfig.filter(server => server.owner);
    const memberServers = serversWithConfig.filter(server => !server.owner);

    logger.info('Fetched Discord servers successfully', { 
      userId: req.user.id,
      discordId: req.user.discordId,
      totalGuilds: guilds.length,
      managableServers: serversWithConfig.length,
      ownedServers: ownedServers.length 
    });

    res.json({
      success: true,
      data: {
        servers: {
          owned: ownedServers,
          member: memberServers,
          total: serversWithConfig.length,
          ownedCount: ownedServers.length,
          memberCount: memberServers.length,
        },
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Get user servers error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user.id,
      operation: 'getDiscordGuilds'
    });
    
    if (error instanceof Error && error.message.includes('Discord')) {
      throw new AppError('Failed to fetch Discord servers. Please try again later.', 503, 'DISCORD_API_ERROR', {
        retryable: true,
        operation: 'getDiscordGuilds'
      });
    }
    
    throw new AppError('Failed to get user servers', 500, 'SERVERS_ERROR', {
      retryable: false,
      operation: 'getUserServers'
    });
  }
}));

/**
 * GET /api/users/servers/:serverId
 * Get detailed information about a specific server (owner only)
 */
router.get('/servers/:serverId', 
  authMiddleware.authenticate, 
  authMiddleware.requireServerOwnership(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { serverId } = req.params;

    try {
      // Get Discord guild information
      const guilds = await discordApiClient.getDiscordGuilds(req.user!.discordAccessToken);
      const guild = guilds.find(g => g.id === serverId);

      if (!guild) {
        throw new AppError('Server not found or no access', 404, 'SERVER_NOT_FOUND', {
          serverId,
          operation: 'getServerDetails'
        });
      }

      // Get server configuration from database
      const { data: serverConfig, error: configError } = await supabase
        .from('servers')
        .select('*')
        .eq('discord_server_id', serverId)
        .single();

      if (configError && configError.code !== 'PGRST116') {
        logger.error('Failed to fetch server configuration:', { 
          error: configError.message,
          code: configError.code,
          serverId,
          userId: req.user!.id 
        });
        throw new AppError('Failed to fetch server configuration', 500, 'DATABASE_ERROR', {
          serverId,
          operation: 'getServerConfig'
        });
      }

      // Get bot configurations for this server
      const { data: botConfigs, error: botError } = await supabase
        .from('bot_configurations')
        .select('*')
        .eq('server_id', serverConfig?.id);

      if (botError) {
        logger.warn('Failed to fetch bot configurations:', { 
          error: botError.message,
          code: botError.code,
          serverId,
          serverConfigId: serverConfig?.id 
        });
      }

      res.json({
        success: true,
        data: {
          server: {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            owner: guild.owner,
            permissions: guild.permissions,
            configured: !!serverConfig,
            configuration: serverConfig ? {
              id: serverConfig.id,
              prefix: serverConfig.prefix,
              welcomeChannelId: serverConfig.welcome_channel_id,
              logChannelId: serverConfig.log_channel_id,
              autoRoleId: serverConfig.auto_role_id,
              botEnabled: serverConfig.bot_enabled,
              createdAt: serverConfig.created_at,
              updatedAt: serverConfig.updated_at,
            } : null,
            botConfigurations: botConfigs || [],
          },
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Get server details error:', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        serverId,
        userId: req.user!.id,
        operation: 'getServerDetails'
      });
      
      if (error instanceof Error && error.message.includes('Discord')) {
        throw new AppError('Failed to fetch server details from Discord. Please try again later.', 503, 'DISCORD_API_ERROR', {
          retryable: true,
          serverId,
          operation: 'getServerDetails'
        });
      }
      
      throw new AppError('Failed to get server details', 500, 'SERVER_DETAILS_ERROR', {
        retryable: false,
        serverId,
        operation: 'getServerDetails'
      });
    }
  })
);

/**
 * POST /api/users/servers/:serverId/setup
 * Set up a server for bot management (create/update server record)
 */
router.post('/servers/:serverId/setup', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  try {
    const { serverId } = req.params;
    const { botConfig = {} } = req.body;

    // Get the specific Discord guild to verify permissions
    const guilds = await discordApiClient.getDiscordGuilds(req.user.discordAccessToken);
    const guild = guilds.find(g => g.id === serverId);

    if (!guild) {
      throw new AppError('Server not found or no access', 404, 'SERVER_NOT_FOUND', {
        serverId,
        operation: 'serverSetup'
      });
    }

    // Check permissions using the DiscordApiClient method
    const hasPermissions = discordApiClient.hasManagementPermissions(guild);

    if (!hasPermissions) {
      throw new AppError('Insufficient permissions to manage this server', 403, 'INSUFFICIENT_PERMISSIONS', {
        serverId,
        permissions: guild.permissions,
        owner: guild.owner,
        operation: 'serverSetup'
      });
    }

    // Create or update server record
    const serverData = {
      discord_server_id: serverId,
      owner_id: req.user.id,
      name: guild.name,
      icon: guild.icon,
      bot_invited: true, // Mark as invited when setting up
      bot_config: botConfig,
      updated_at: new Date().toISOString(),
    };

    const { data: existingServer, error: selectError } = await supabase
      .from('servers')
      .select('*')
      .eq('discord_server_id', serverId)
      .single();

    let serverRecord;
    if (selectError && selectError.code === 'PGRST116') {
      // Server doesn't exist, create it
      const { data, error } = await supabase
        .from('servers')
        .insert({
          ...serverData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      serverRecord = data;
      logger.info('Created new server record', { serverId, userId: req.user.id });
    } else if (existingServer) {
      // Server exists, update it
      const { data, error } = await supabase
        .from('servers')
        .update(serverData)
        .eq('discord_server_id', serverId)
        .select()
        .single();

      if (error) throw error;
      serverRecord = data;
      logger.info('Updated server record', { serverId, userId: req.user.id });
    } else {
      throw selectError;
    }

    res.json({
      success: true,
      data: {
        server: {
          id: serverRecord.id,
          discordServerId: serverRecord.discord_server_id,
          name: serverRecord.name,
          icon: serverRecord.icon,
          botInvited: serverRecord.bot_invited,
          botConfig: serverRecord.bot_config,
          createdAt: serverRecord.created_at,
          updatedAt: serverRecord.updated_at,
        },
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Server setup error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      serverId,
      userId: req.user.id,
      operation: 'serverSetup'
    });
    
    if (error instanceof Error && error.message.includes('Discord')) {
      throw new AppError('Failed to access Discord server. Please try again later.', 503, 'DISCORD_API_ERROR', {
        retryable: true,
        serverId,
        operation: 'serverSetup'
      });
    }
    
    throw new AppError('Failed to set up server', 500, 'SERVER_SETUP_ERROR', {
      retryable: false,
      serverId,
      operation: 'serverSetup'
    });
  }
}));

/**
 * DELETE /api/users/profile
 * Delete user account and all associated data
 */
router.delete('/profile', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  try {
    // Delete user and cascade to related records
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', req.user.id);

    if (deleteError) {
      logger.error('Failed to delete user account:', { 
        error: deleteError.message,
        code: deleteError.code,
        userId: req.user.id 
      });
      throw new AppError('Failed to delete user account', 500, 'DATABASE_ERROR', {
        userId: req.user.id,
        operation: 'deleteAccount'
      });
    }

    logger.info('User account deleted', { userId: req.user.id });

    res.json({
      success: true,
      data: {
        message: 'Account deleted successfully',
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Delete user account error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user.id,
      operation: 'deleteAccount'
    });
    
    throw new AppError('Failed to delete user account', 500, 'ACCOUNT_DELETE_ERROR', {
      retryable: false,
      userId: req.user.id,
      operation: 'deleteAccount'
    });
  }
}));

export default router;
