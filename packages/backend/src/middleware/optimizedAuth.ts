import { Request, Response, NextFunction } from 'express';
import { DiscordAuthService } from '../auth/discord';
import { jwtService } from '../utils/jwt';
import { logger } from '../utils/logger';
import { AppError } from './centralizedErrorHandler';

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

// OPTIMIZED JWT CACHE - Prevents token spam
class OptimizedJWTCache {
  private cache = new Map<string, { user: AuthenticatedUser; expiresAt: number; lastUsed: number }>();
  private readonly maxSize = 1000;
  private readonly bufferTime = 10 * 60 * 1000; // 10 minutes buffer
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  set(token: string, user: AuthenticatedUser, expiresAt: number): void {
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    this.cache.set(token, {
      user,
      expiresAt,
      lastUsed: Date.now()
    });
  }

  get(token: string): AuthenticatedUser | null {
    const entry = this.cache.get(token);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    
    // Check if token is expired (with buffer)
    if (now >= (entry.expiresAt - this.bufferTime)) {
      this.cache.delete(token);
      return null;
    }

    // Update last used time
    entry.lastUsed = now;
    return entry.user;
  }

  delete(token: string): void {
    this.cache.delete(token);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [token, entry] of this.cache.entries()) {
      // Remove expired entries
      if (now >= (entry.expiresAt - this.bufferTime)) {
        keysToDelete.push(token);
      }
      // Remove unused entries older than 1 hour
      else if (now - entry.lastUsed > 60 * 60 * 1000) {
        keysToDelete.push(token);
      }
    }

    keysToDelete.forEach(token => this.cache.delete(token));
    
    // If still too large, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      
      const toRemove = entries.slice(0, Math.floor(this.maxSize * 0.2));
      toRemove.forEach(([token]) => this.cache.delete(token));
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// OPTIMIZED REQUEST DEDUPLICATION - Prevents auth storms
class RequestDeduplication {
  private pendingRequests = new Map<string, Promise<AuthenticatedUser>>();
  private readonly maxPendingTime = 30000; // 30 seconds max

  async deduplicate(
    key: string,
    authFunction: () => Promise<AuthenticatedUser>
  ): Promise<AuthenticatedUser> {
    // If there's already a pending request for this key, wait for it
    if (this.pendingRequests.has(key)) {
      logger.debug('Request deduplication hit', { key });
      return this.pendingRequests.get(key)!;
    }

    // Create new request
    const requestPromise = this.executeWithTimeout(authFunction);
    this.pendingRequests.set(key, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up
      this.pendingRequests.delete(key);
    }
  }

  private async executeWithTimeout(
    authFunction: () => Promise<AuthenticatedUser>
  ): Promise<AuthenticatedUser> {
    return Promise.race([
      authFunction(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Authentication timeout')), this.maxPendingTime)
      )
    ]);
  }

  clear(): void {
    this.pendingRequests.clear();
  }
}

export class OptimizedAuthMiddleware {
  private discordAuth: DiscordAuthService;
  private jwtCache: OptimizedJWTCache;
  private deduplication: RequestDeduplication;
  private ownershipCache: Map<string, { ownedServers: string[], timestamp: number }> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.discordAuth = new DiscordAuthService();
    this.jwtCache = new OptimizedJWTCache();
    this.deduplication = new RequestDeduplication();
  }

  /**
   * OPTIMIZED AUTHENTICATION - Eliminates token spam
   */
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Skip authentication for health check and public endpoints
      const publicPaths = ['/health', '/api/health', '/api', '/api/tatum/supported'];
      const authPaths = ['/api/auth/login', '/api/auth/callback', '/api/auth/refresh'];
      const botServicePaths = ['/api/bot-service', '/api/fees', '/api/okx/currencies', '/api/backend/okx/currencies'];
      const isPublicPath = publicPaths.includes(req.path) || 
                          req.path.startsWith('/nonexistent') ||
                          authPaths.some(path => req.path.startsWith(path)) ||
                          botServicePaths.some(path => req.path.startsWith(path)) ||
                          (req.path === '/api' && req.method === 'GET');
      
      if (isPublicPath) {
        return next();
      }

      // Allow webhook bypass with shared token for /api/webhooks/*
      if (req.path.startsWith('/api/webhooks')) {
        const secret = process.env.TATUM_WEBHOOK_TOKEN || process.env.TATUM_WEBHOOK_SECRET || '';
        const qToken = (req.query as any)?.token || '';
        const hToken = (req.headers['x-webhook-token'] as string) || '';
        if (secret && (qToken === secret || hToken === secret)) {
          return next();
        }
      }

      const token = jwtService.extractTokenFromHeader(req.headers.authorization);
      
      if (!token) {
        logger.warn('Missing authorization token', {
          url: req.url,
          method: req.method,
          ip: req.ip,
        });
        throw new AppError('Authorization token is required', 401, 'MISSING_TOKEN');
      }

      // STEP 1: Check JWT cache first (eliminates 95% of token verification)
      const cachedUser = this.jwtCache.get(token);
      if (cachedUser) {
        req.user = cachedUser;
        logger.debug('JWT cache hit - no verification needed', { userId: cachedUser.id });
        return next();
      }

      // STEP 2: Use request deduplication to prevent auth storms
      const deduplicationKey = `auth_${token.substring(0, 20)}`;
      
      const user = await this.deduplication.deduplicate(deduplicationKey, async () => {
        logger.debug('JWT cache miss - verifying token', {
          tokenLength: token.length,
          url: req.url,
          method: req.method,
        });

        try {
          const payload = jwtService.verifyToken(token);
          
          // Validate token payload structure
          if (!jwtService.validateTokenPayload(payload)) {
            logger.warn('Invalid token payload structure');
            throw new AppError('Invalid token payload', 401, 'INVALID_TOKEN_PAYLOAD');
          }
          
          // OPTIMIZED: Only refresh if token is very close to expiry (5 minutes)
          const refreshThreshold = 5 * 60 * 1000; // 5 minutes
          const timeUntilExpiry = payload.discordExpiresAt - Date.now();
          
          if (timeUntilExpiry < refreshThreshold && timeUntilExpiry > 0) {
            logger.info('Discord token needs refresh', { 
              userId: payload.userId,
              timeUntilExpiry: Math.round(timeUntilExpiry / 1000) + 's'
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
              });
              throw new AppError('Failed to refresh authentication token. Please sign in again.', 401, 'TOKEN_REFRESH_FAILED');
            }
          }

          // Create user object
          const authenticatedUser: AuthenticatedUser = {
            id: payload.userId,
            discordId: payload.discordId,
            username: payload.username,
            avatar: payload.avatar,
            email: payload.email,
            discordAccessToken: payload.discordAccessToken,
            discordRefreshToken: payload.discordRefreshToken,
            discordExpiresAt: payload.discordExpiresAt,
          };

          // Cache the user for future requests (CRITICAL: Prevents token spam)
          const expiresAt = authenticatedUser.discordExpiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000);
          this.jwtCache.set(token, authenticatedUser, expiresAt);

          logger.debug('User authenticated and cached', { 
            userId: authenticatedUser.id,
            discordId: authenticatedUser.discordId,
          });

          return authenticatedUser;
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
      });

      req.user = user;
      next();
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
   * OPTIMIZED SERVER OWNERSHIP CHECK - With better caching
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
          logger.error('Discord API error in ownership check:', discordError);
          
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
        logger.error('Server ownership middleware error:', error);
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
   * Get cache statistics
   */
  getStats() {
    return {
      jwtCache: this.jwtCache.getStats(),
      ownershipCache: {
        size: this.ownershipCache.size,
        entries: Array.from(this.ownershipCache.entries()).map(([key, value]) => ({
          userId: key,
          ownedServers: value.ownedServers.length,
          age: Date.now() - value.timestamp
        }))
      }
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.jwtCache.clear();
    this.ownershipCache.clear();
    this.deduplication.clear();
    logger.info('All auth caches cleared');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.jwtCache.destroy();
    this.deduplication.clear();
    this.ownershipCache.clear();
  }
}

// Export singleton instance
export const optimizedAuthMiddleware = new OptimizedAuthMiddleware();

// Export commonly used middleware functions
export const authenticateToken = optimizedAuthMiddleware.authenticate;
export const requireServerOwnership = optimizedAuthMiddleware.requireServerOwnership;
