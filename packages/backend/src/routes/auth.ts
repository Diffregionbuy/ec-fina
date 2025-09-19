import { Router, Request, Response } from 'express';
import { DiscordApiClient } from '../services/DiscordApiClient';
import { DiscordAuthService } from '../auth/discord';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { jwtService } from '../utils/jwt';
import { logger } from '../utils/logger';

const router = Router();
const discordApiClient = new DiscordApiClient();
const discordAuth = new DiscordAuthService(); // Keep for database operations and JWT generation

/**
 * GET /api/auth/discord
 * Get Discord OAuth authorization URL
 */
router.get('/discord', (req: Request, res: Response) => {
  try {
    const state = req.query.state as string;
    const authUrl = discordApiClient.getAuthorizationUrl(state);

    res.json({
      success: true,
      data: {
        authUrl,
        clientId: process.env.DISCORD_CLIENT_ID,
      },
    });
  } catch (error) {
    logger.error('Discord auth URL error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'getAuthUrl'
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_URL_ERROR',
        message: 'Failed to generate Discord authorization URL',
        timestamp: new Date().toISOString(),
        retryable: false
      },
    });
  }
});

/**
 * POST /api/auth/login
 * Exchange Discord authorization code for JWT token
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { code, state, discordUser, discordTokens } = req.body;

  // Handle NextAuth integration
  if (code === 'nextauth_integration' && discordUser && discordTokens) {
    try {
      // Create or update user in database using provided Discord user data
      const user = await discordAuth.createOrUpdateUser({
        id: discordUser.id,
        username: discordUser.username,
        discriminator: '0', // Default for new Discord usernames
        avatar: discordUser.avatar,
        email: discordUser.email,
        verified: true,
      });

      // Generate JWT token using the new JWT service
      const jwtToken = jwtService.generateToken({
        userId: user.id,
        discordId: user.discord_id,
        username: user.username,
        avatar: user.avatar,
        email: user.email,
        discordAccessToken: discordTokens.accessToken,
        discordRefreshToken: discordTokens.refreshToken,
        discordExpiresAt: Date.now() + discordTokens.expiresIn * 1000,
      });

      logger.info('User logged in via NextAuth integration', { userId: user.id, discordId: user.discord_id });

      res.json({
        success: true,
        data: {
          token: jwtToken,
          user: {
            id: user.id,
            discordId: user.discord_id,
            username: user.username,
            avatar: user.avatar,
            email: user.email,
          },
        },
      });
      return;
    } catch (error) {
      logger.error('NextAuth integration login error:', error);
      throw new AppError('Failed to authenticate via NextAuth integration', 500, 'NEXTAUTH_ERROR');
    }
  }

  // Original Discord OAuth flow
  if (!code) {
    throw new AppError('Discord authorization code is required', 400, 'MISSING_CODE');
  }

  try {
    // Exchange code for Discord tokens
    const discordTokens = await discordApiClient.exchangeCodeForToken(code);

    // Get Discord user information
    const discordUser = await discordApiClient.getDiscordUser(discordTokens.accessToken);

    // Create or update user in database
    const user = await discordAuth.createOrUpdateUser(discordUser);

    // Generate JWT token using the new JWT service
    const jwtToken = jwtService.generateToken({
      userId: user.id,
      discordId: user.discord_id,
      username: user.username,
      avatar: user.avatar,
      email: user.email,
      discordAccessToken: discordTokens.accessToken,
      discordRefreshToken: discordTokens.refreshToken,
      discordExpiresAt: Date.now() + discordTokens.expiresIn * 1000,
    });

    // Clear any existing cache for this access token to prevent cross-user contamination
    discordApiClient.invalidateUserCache(discordTokens.accessToken);
    
    // Get user's Discord guilds
    const guilds = await discordApiClient.getDiscordGuilds(discordTokens.accessToken);

    logger.info('User logged in successfully', { 
      userId: user.id, 
      discordId: user.discord_id,
      operation: 'login'
    });

    res.json({
      success: true,
      data: {
        token: jwtToken,
        user: {
          id: user.id,
          discordId: user.discord_id,
          username: user.username,
          avatar: user.avatar,
          email: user.email,
        },
        guilds: guilds.map(guild => ({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner: guild.owner,
          permissions: guild.permissions,
        })),
        state,
      },
    });
  } catch (error) {
    logger.error('Discord login error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'login',
      code: code ? 'provided' : 'missing'
    });
    
    if (error instanceof Error) {
      if (error.message.includes('authorization code')) {
        throw new AppError('Invalid or expired authorization code', 400, 'INVALID_CODE', {
          retryable: false,
          operation: 'exchangeCode'
        });
      } else if (error.message.includes('Discord')) {
        throw new AppError('Discord API temporarily unavailable. Please try again later.', 503, 'DISCORD_API_ERROR', {
          retryable: true,
          operation: 'discordApi'
        });
      } else if (error.message.includes('database') || error.message.includes('user')) {
        throw new AppError('Database operation failed', 500, 'DATABASE_ERROR', {
          retryable: true,
          operation: 'database'
        });
      }
    }
    
    throw new AppError('Failed to authenticate with Discord', 500, 'LOGIN_ERROR', {
      retryable: false,
      operation: 'login'
    });
  }
}));

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  try {
    // Refresh Discord tokens
    const refreshedTokens = await discordApiClient.refreshAccessToken(req.user.discordRefreshToken);

    // Generate new JWT using the JWT service
    const newJWT = jwtService.generateToken({
      userId: req.user.id,
      discordId: req.user.discordId,
      username: req.user.username,
      avatar: req.user.avatar,
      email: req.user.email,
      discordAccessToken: refreshedTokens.accessToken,
      discordRefreshToken: refreshedTokens.refreshToken,
      discordExpiresAt: Date.now() + refreshedTokens.expiresIn * 1000,
    });

    logger.info('Token refreshed successfully', { 
      userId: req.user.id,
      operation: 'tokenRefresh'
    });

    res.json({
      success: true,
      data: {
        token: newJWT,
        expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      },
    });
  } catch (error) {
    logger.error('Token refresh error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user.id,
      operation: 'tokenRefresh'
    });
    
    if (error instanceof Error && error.message.includes('Discord')) {
      throw new AppError('Failed to refresh Discord token. Please log in again.', 401, 'DISCORD_REFRESH_ERROR', {
        retryable: false,
        operation: 'refreshToken'
      });
    }
    
    throw new AppError('Failed to refresh authentication token', 401, 'REFRESH_ERROR', {
      retryable: false,
      operation: 'tokenRefresh'
    });
  }
}));

/**
 * POST /api/auth/create-user
 * Create or update user from NextAuth callback
 */
router.post('/create-user', asyncHandler(async (req: Request, res: Response) => {
  const { discordId, username, avatar, email, accessToken, refreshToken } = req.body;

  if (!discordId || !username) {
    throw new AppError('Discord ID and username are required', 400, 'MISSING_REQUIRED_FIELDS');
  }

  try {
    // Create Discord user object
    const discordUser = {
      id: discordId,
      username,
      avatar,
      email,
    };

    // Create or update user in database
    const user = await discordAuth.createOrUpdateUser(discordUser);

    logger.info('User created/updated from NextAuth', { userId: user.id, discordId: user.discord_id });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          discordId: user.discord_id,
          username: user.username,
          avatar: user.avatar,
          email: user.email,
        },
      },
    });
  } catch (error) {
    logger.error('Create user error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      discordId,
      operation: 'createUser'
    });
    
    throw new AppError('Failed to create or update user', 500, 'USER_CREATION_ERROR', {
      retryable: true,
      operation: 'createUser'
    });
  }
}));

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authMiddleware.authenticate, (req: AuthenticatedRequest, res: Response) => {
  // Since we're using stateless JWT tokens, logout is primarily client-side
  // The client should remove the token from storage
  res.json({
    success: true,
    data: {
      message: 'Logged out successfully',
    },
  });
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', authMiddleware.authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Get fresh Discord user data
    const discordUser = await discordApiClient.getDiscordUser(req.user.discordAccessToken);
    
    // Get user's Discord guilds
    const guilds = await discordApiClient.getDiscordGuilds(req.user.discordAccessToken);

    res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          discordId: req.user.discordId,
          username: discordUser.username,
          avatar: discordUser.avatar,
          email: discordUser.email,
        },
        guilds: guilds.map(guild => ({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner: guild.owner,
          permissions: guild.permissions,
        })),
      },
    });
  } catch (error) {
    logger.error('Get user info error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user.id,
      operation: 'getUserInfo'
    });
    
    const statusCode = error instanceof Error && error.message.includes('Discord') ? 503 : 500;
    const errorCode = error instanceof Error && error.message.includes('Discord') ? 'DISCORD_API_ERROR' : 'USER_INFO_ERROR';
    const message = error instanceof Error && error.message.includes('Discord') 
      ? 'Discord API temporarily unavailable. Please try again later.'
      : 'Failed to get user information';
    
    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
        timestamp: new Date().toISOString(),
        retryable: statusCode === 503
      },
    });
  }
});

export default router;