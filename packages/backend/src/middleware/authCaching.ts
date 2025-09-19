import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { jwtService } from '../utils/jwt';
import { DiscordAuthService } from '../auth/discord';
import { AppError } from './errorHandler';

/**
 * OPTIMIZED: Authentication caching to eliminate redundant auth requests
 * Fixes the 6+ auth requests per page load issue
 */

interface CachedAuth {
  user: any;
  timestamp: number;
  expiresAt: number;
}

interface AuthenticatedRequest extends Request {
  user?: any;
  requestId?: string;
}

// In-memory cache for very recent auth results (prevents duplicate requests)
const authCache = new Map<string, CachedAuth>();
const AUTH_CACHE_TTL = 60000; // 1 minute in-memory cache

/**
 * Generate cache key for authentication
 */
function getAuthCacheKey(token: string): string {
  // Use first 16 chars of token for cache key (avoid storing full token)
  return `auth:${token.substring(0, 16)}`;
}

/**
 * Check if cached auth is still valid
 */
function isAuthValid(cached: CachedAuth): boolean {
  const now = Date.now();
  return cached.timestamp + AUTH_CACHE_TTL > now && cached.expiresAt > now;
}

/**
 * Optimized authentication middleware with caching
 */
export const cachedAuthMiddleware = {
  authenticate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Extract token
      const token = jwtService.extractTokenFromHeader(req.headers.authorization);

      if (!token) {
        return next(); // Continue without auth for optional endpoints
      }

      const cacheKey = getAuthCacheKey(token);
      
      // Check in-memory cache first (fastest)
      const memoryCache = authCache.get(cacheKey);
      if (memoryCache && isAuthValid(memoryCache)) {
        req.user = memoryCache.user;
        return next();
      }

      // Verify token (only if not cached)
      const user = await verifyAndCacheToken(token, cacheKey);
      if (user) {
        req.user = user;
      }

      next();
    } catch (error) {
      logger.error('Authentication error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path 
      });
      
      // Don't fail the request, let endpoint decide if auth is required
      next();
    }
  },

  requireAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'UNAUTHENTICATED',
          timestamp: new Date().toISOString()
        }
      });
    }
    next();
  }
};

/**
 * Verify token and cache the result
 */
async function verifyAndCacheToken(token: string, cacheKey: string): Promise<any> {
  try {
    const payload = jwtService.verifyToken(token);
    
    // Validate token payload structure
    if (!jwtService.validateTokenPayload(payload)) {
      logger.warn('Invalid token payload structure');
      return null;
    }

    const discordAuth = new DiscordAuthService();
    
    // Check if Discord token needs refresh
    if (discordAuth.needsTokenRefresh(payload)) {
      try {
        const refreshedTokens = await discordAuth.refreshAccessToken(
          payload.discordRefreshToken
        );
        
        // Update payload with refreshed tokens
        payload.discordAccessToken = refreshedTokens.accessToken;
        payload.discordRefreshToken = refreshedTokens.refreshToken;
        payload.discordExpiresAt = Date.now() + refreshedTokens.expiresIn * 1000;
        
        logger.debug('Discord tokens refreshed', { userId: payload.userId });
      } catch (refreshError) {
        logger.error('Token refresh failed', { 
          userId: payload.userId,
          error: refreshError instanceof Error ? refreshError.message : 'Unknown error'
        });
        return null;
      }
    }

    const user = {
      id: payload.userId,
      discordId: payload.discordId,
      username: payload.username,
      avatar: payload.avatar,
      email: payload.email,
      discordAccessToken: payload.discordAccessToken,
      discordRefreshToken: payload.discordRefreshToken,
      discordExpiresAt: payload.discordExpiresAt,
    };

    const cached: CachedAuth = {
      user,
      timestamp: Date.now(),
      expiresAt: payload.discordExpiresAt || (Date.now() + (7 * 24 * 60 * 60 * 1000)) // 7 days
    };

    // Cache in memory
    authCache.set(cacheKey, cached);

    logger.debug('Token verified and cached', { 
      userId: user.id,
      cacheKey: cacheKey.substring(0, 20) + '...'
    });

    return user;
  } catch (error) {
    logger.warn('Token verification failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      cacheKey: cacheKey.substring(0, 20) + '...'
    });
    return null;
  }
}

/**
 * Request deduplication middleware
 * Prevents multiple identical requests from being processed simultaneously
 */
const pendingRequests = new Map<string, Promise<any>>();

export const requestDeduplication = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Only deduplicate GET requests and auth requests
  if (req.method !== 'GET' && !req.path.includes('/auth/')) {
    return next();
  }

  const requestKey = `${req.method}:${req.path}:${req.user?.id || req.ip}`;
  
  // If same request is already pending, wait for it
  const pending = pendingRequests.get(requestKey);
  if (pending) {
    logger.debug('Request deduplicated', { 
      requestKey: requestKey.substring(0, 50) + '...',
      method: req.method,
      path: req.path
    });
    
    // Wait for the pending request to complete
    pending.finally(() => {
      pendingRequests.delete(requestKey);
      next();
    });
    return;
  }

  // Mark this request as pending
  const requestPromise = new Promise<void>((resolve) => {
    res.on('finish', resolve);
    res.on('close', resolve);
  });

  pendingRequests.set(requestKey, requestPromise);
  
  // Clean up when request completes
  requestPromise.finally(() => {
    pendingRequests.delete(requestKey);
  });

  next();
};

/**
 * Clean up expired cache entries periodically
 */
setInterval(() => {
  const now = Date.now();
  
  for (const [key, cached] of authCache.entries()) {
    if (!isAuthValid(cached)) {
      authCache.delete(key);
    }
  }
  
  // Clean up pending requests that might be stuck
  if (pendingRequests.size > 100) {
    logger.warn('High number of pending requests', { 
      count: pendingRequests.size 
    });
  }
}, 60000); // Clean every minute

/**
 * Invalidate auth cache for a user (e.g., on logout)
 */
export const invalidateUserAuth = async (userId: string) => {
  // Remove from memory cache
  for (const [key, cached] of authCache.entries()) {
    if (cached.user?.id === userId) {
      authCache.delete(key);
    }
  }
  
  logger.info('User auth cache invalidated', { userId });
};