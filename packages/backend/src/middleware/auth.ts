import { Request, Response, NextFunction } from 'express';
import { DiscordAuthService } from '../auth/discord';
import { jwtService } from '../utils/jwt';
import { logger } from '../utils/logger';
import { AppError } from './centralizedErrorHandler';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { jwtCache } from './jwtCache';

export interface AuthenticatedUser {
  id: string;
  discordId: string;
  username: string;
  avatar: string | null;
  email: string | null;
  discordAccessToken: string;
  discordRefreshToken: string;
  discordExpiresAt: number;
  roles?: string[];
  permissions?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export class AuthMiddleware {
  private discordAuth: DiscordAuthService;
  private ownershipCache: Map<string, { ownedServers: string[], timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.discordAuth = new DiscordAuthService();
  }

  /**
   * Middleware to authenticate JWT tokens
   */
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const token = jwtService.extractTokenFromHeader(req.headers.authorization);
      
      // Check JWT cache first
      const cachedUser = jwtCache.get(token || '');
      if (cachedUser) {
        req.user = cachedUser;
        logger.debug('JWT cache hit', { userId: cachedUser.id });
        return next();
      }
      
      logger.debug('Authentication attempt', {
        hasAuthHeader: !!req.headers.authorization,
        authHeaderLength: req.headers.authorization?.length || 0,
        hasToken: !!token,
        tokenLength: token?.length || 0,
        url: req.url,
        method: req.method,
        userAgent: req.headers['user-agent']?.substring(0, 50),
      });
      
      if (!token) {
        logger.warn('Missing authorization token', {
          url: req.url,
          method: req.method,
          ip: req.ip,
        });
        throw new AppError('Authorization token is required', 401, 'MISSING_TOKEN');
      }

      try {
        const payload = jwtService.verifyToken(token);
        
        // Validate token payload structure
        if (!jwtService.validateTokenPayload(payload)) {
          logger.warn('Invalid token payload structure', {
            hasUserId: !!(payload as any).userId,
            hasDiscordId: !!(payload as any).discordId,
            hasUsername: !!(payload as any).username,
          });
          throw new AppError('Invalid token payload', 401, 'INVALID_TOKEN_PAYLOAD');
        }
        
        // Check if Discord token needs refresh
        if (this.discordAuth.needsTokenRefresh(payload)) {
          logger.info('Discord token needs refresh', { 
            userId: payload.userId,
            expiresAt: payload.discordExpiresAt,
            now: Date.now()
          });
          
          try {
            const refreshedTokens = await this.discordAuth.refreshAccessToken(
              payload.discordRefreshToken
            );
            
            // Generate new JWT with refreshed Discord tokens
            const newJWT = jwtService.generateToken({
              userId: payload.userId,
              discordId: payload.discordId,
              username: payload.username,
              avatar: payload.avatar,
              email: payload.email,
              discordAccessToken: refreshedTokens.accessToken,
              discordRefreshToken: refreshedTokens.refreshToken,
              discordExpiresAt: Date.now() + refreshedTokens.expiresIn * 1000,
            });
            
            // Set new JWT in response header for client to update
            res.setHeader('X-New-Token', newJWT);
            
            // Update payload for current request
            payload.discordAccessToken = refreshedTokens.accessToken;
            payload.discordRefreshToken = refreshedTokens.refreshToken;
            payload.discordExpiresAt = Date.now() + refreshedTokens.expiresIn * 1000;
            
            logger.info('Discord tokens refreshed successfully', { userId: payload.userId });
          } catch (refreshError) {
            logger.error('Token refresh failed:', {
              error: refreshError instanceof Error ? refreshError.message : 'Unknown error',
              userId: payload.userId,
              hasRefreshToken: !!payload.discordRefreshToken,
            });
            throw new AppError('Failed to refresh authentication token. Please sign in again.', 401, 'TOKEN_REFRESH_FAILED');
          }
        }

        // Attach user info to request
        const user = {
          id: (payload as any).userId,
          discordId: (payload as any).discordId,
          username: (payload as any).username,
          avatar: (payload as any).avatar,
          email: (payload as any).email,
          discordAccessToken: (payload as any).discordAccessToken,
          discordRefreshToken: (payload as any).discordRefreshToken,
          discordExpiresAt: (payload as any).discordExpiresAt,
        };

        req.user = user;

        // Cache the user for future requests
        const expiresAt = user.discordExpiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000);
        jwtCache.set(token, user, expiresAt);

        logger.debug('User authenticated successfully', { 
          userId: user.id,
          discordId: user.discordId,
          tokenAge: Date.now() - ((payload as any).iat || 0) * 1000,
        });
        next();
      } catch (jwtError) {
        if (jwtError instanceof AppError) {
          throw jwtError;
        }
        
        logger.warn('JWT verification failed', {
          error: jwtError instanceof Error ? jwtError.message : 'Unknown error',
          tokenLength: token.length,
          url: req.url,
        });
        
        if (jwtError instanceof Error) {
          if (jwtError.message.includes('expired')) {
            throw new AppError('Authentication token has expired. Please sign in again.', 401, 'TOKEN_EXPIRED');
          } else if (jwtError.message.includes('invalid')) {
            throw new AppError('Invalid authentication token. Please sign in again.', 401, 'INVALID_TOKEN');
          }
        }
        
        throw new AppError('Authentication token verification failed', 401, 'TOKEN_VERIFICATION_FAILED');
      }
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      logger.error('Authentication middleware error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        url: req.url,
        method: req.method,
      });
      return next(new AppError('Authentication service error', 500, 'AUTH_ERROR'));
    }
  };

  /**
   * Middleware to check if user owns a specific Discord server
   */
  requireServerOwnership = (serverIdParam: string = 'serverId') => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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

        const serverId = req.params[serverIdParam];
        if (!serverId) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'MISSING_SERVER_ID',
              message: 'Server ID is required',
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Check cache first
        const cacheKey = req.user.id;
        const cached = this.ownershipCache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
          // Use cached data
          if (!cached.ownedServers.includes(serverId)) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'INSUFFICIENT_PERMISSIONS',
                message: 'You must be the owner of this Discord server',
                timestamp: new Date().toISOString(),
              },
            });
          }
          next();
          return;
        }

        // Get user's Discord guilds to verify ownership
        try {
          const guilds = await this.discordAuth.getDiscordGuilds(req.user.discordAccessToken);
          const ownedServers = guilds.filter(guild => guild.owner).map(guild => guild.id);
          
          // Cache the result
          this.ownershipCache.set(cacheKey, {
            ownedServers,
            timestamp: now
          });

          if (!ownedServers.includes(serverId)) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'INSUFFICIENT_PERMISSIONS',
                message: 'You must be the owner of this Discord server',
                timestamp: new Date().toISOString(),
              },
            });
          }

          next();
        } catch (discordError) {
          console.error('Discord API error:', discordError);
          
          // If we have stale cache data, use it as fallback
          if (cached) {
            logger.warn('Using stale cache data due to Discord API error', { userId: req.user.id });
            if (!cached.ownedServers.includes(serverId)) {
              return res.status(403).json({
                success: false,
                error: {
                  code: 'INSUFFICIENT_PERMISSIONS',
                  message: 'You must be the owner of this Discord server',
                  timestamp: new Date().toISOString(),
                },
              });
            }
            next();
            return;
          }
          
          return res.status(503).json({
            success: false,
            error: {
              code: 'DISCORD_API_ERROR',
              message: 'Unable to verify server ownership',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        console.error('Server ownership middleware error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'Authorization service error',
            timestamp: new Date().toISOString(),
          },
        });
      }
    };
  };

  /**
   * Optional authentication middleware (doesn't fail if no token)
   */
  optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return next(); // Continue without authentication
    }

    try {
      const payload = jwtService.verifyToken(token);
      
      if (jwtService.validateTokenPayload(payload)) {
        req.user = {
          id: payload.userId,
          discordId: payload.discordId,
          username: payload.username,
          avatar: payload.avatar,
          email: payload.email,
          discordAccessToken: payload.discordAccessToken,
          discordRefreshToken: payload.discordRefreshToken,
          discordExpiresAt: payload.discordExpiresAt,
        };
      }
    } catch (error) {
      // Log error but continue without authentication
      logger.warn('Optional authentication failed:', error);
    }
    
    next();
  };

  /**
   * Middleware to require specific roles
   */
  requireRoles = (roles: string[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
        }

        const userRoles = req.user.roles || [];
        const hasRequiredRole = roles.some(role => userRoles.includes(role));

        if (!hasRequiredRole) {
          throw new AppError(
            `Access denied. Required roles: ${roles.join(', ')}`,
            403,
            'INSUFFICIENT_ROLES'
          );
        }

        logger.debug('Role authorization successful', {
          userId: req.user.id,
          requiredRoles: roles,
          userRoles,
        });

        next();
      } catch (error) {
        if (error instanceof AppError) {
          return next(error);
        }
        logger.error('Role authorization error:', error);
        return next(new AppError('Authorization service error', 500, 'AUTHORIZATION_ERROR'));
      }
    };
  };

  /**
   * Middleware to require specific permissions
   */
  requirePermissions = (permissions: string[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
        }

        const userPermissions = req.user.permissions || [];
        const hasAllPermissions = permissions.every(permission => 
          userPermissions.includes(permission)
        );

        if (!hasAllPermissions) {
          throw new AppError(
            `Access denied. Required permissions: ${permissions.join(', ')}`,
            403,
            'INSUFFICIENT_PERMISSIONS'
          );
        }

        logger.debug('Permission authorization successful', {
          userId: req.user.id,
          requiredPermissions: permissions,
          userPermissions,
        });

        next();
      } catch (error) {
        if (error instanceof AppError) {
          return next(error);
        }
        logger.error('Permission authorization error:', error);
        return next(new AppError('Authorization service error', 500, 'AUTHORIZATION_ERROR'));
      }
    };
  };

  /**
   * Middleware to check if user is a server owner (admin role)
   */
  requireServerAdmin = () => {
    return this.requireRoles(['server_owner', 'admin']);
  };

  /**
   * Middleware to check if user can manage bots
   */
  requireBotManager = () => {
    return this.requirePermissions(['manage_bots', 'configure_bots']);
  };
}

// Export singleton instance
export const authMiddleware = new AuthMiddleware();

// Export commonly used middleware functions
export const authenticateToken = authMiddleware.authenticate;
export const requireServerOwnership = authMiddleware.requireServerOwnership;
export const requireRoles = authMiddleware.requireRoles;
export const requirePermissions = authMiddleware.requirePermissions;
export const optionalAuth = authMiddleware.optionalAuth;