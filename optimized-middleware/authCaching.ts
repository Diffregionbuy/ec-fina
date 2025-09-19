import { Request, Response, NextFunction } from 'express';
import { cache } from '../services/cache';
import { logger } from '../utils/logger';

/**
 * OPTIMIZED: Authentication caching to eliminate redundant auth requests
 * Fixes the 6+ auth requests per page load issue
 */

interface CachedAuth {
  user: any;
  timestamp: number;
  expiresAt: number;
}

// In-memory cache for very recent auth results (prevents duplicate requests)
const authCache = new Map<string, CachedAuth>();
const AUTH_CACHE_TTL = 60000; // 1 minute in-memory cache
const REDIS_AUTH_TTL = 300; // 5 minutes Redis cache

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
  authenticate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract token
      const token = req.headers.authorization?.replace('Bearer ', '') ||
                   req.cookies?.token ||
                   req.query?.token as string;

      if (!token) {
        return next(); // Continue without auth for optional endpoints
      }

      const cacheKey = getAuthCacheKey(token);
      
      // 1. Check in-memory cache first (fastest)
      const memoryCache = authCache.get(cacheKey);
      if (memoryCache && isAuthValid(memoryCache)) {
        req.user = memoryCache.user;
        return next();
      }

      // 2. Check Redis cache
      try {
        const redisCache = await cache.get(cacheKey);
        if (redisCache) {
          const cached: CachedAuth = JSON.parse(redisCache);
          if (isAuthValid(cached)) {
            // Update in-memory cache
            authCache.set(cacheKey, cached);
            req.user = cached.user;
            return next();
          }
        }
      } catch (error) {
        logger.debug('Redis auth cache miss', { error: error.message });
      }

      // 3. Verify token (only if not cached)
      const user = await verifyAndCacheToken(token, cacheKey);
      if (user) {
        req.user = user;
      }

      next();
    } catch (error) {
      logger.error('Authentication error', { 
        error: error.message,
        path: req.path 
      });
      
      // Don't fail the request, let endpoint decide if auth is required
      next();
    }
  },

  requireAuth: (req: Request, res: Response, next: NextFunction) => {
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
    // Your actual token verification logic here
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // const user = await getUserById(decoded.userId);
    
    // Placeholder - replace with your actual verification
    const user = await mockVerifyToken(token);
    
    if (user) {
      const cached: CachedAuth = {
        user,
        timestamp: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
      };

      // Cache in both memory and Redis
      authCache.set(cacheKey, cached);
      await cache.set(cacheKey, JSON.stringify(cached), REDIS_AUTH_TTL);

      logger.debug('Token verified and cached', { 
        userId: user.id,
        cacheKey: cacheKey.substring(0, 20) + '...'
      });
    }

    return user;
  } catch (error) {
    logger.warn('Token verification failed', { 
      error: error.message,
      cacheKey: cacheKey.substring(0, 20) + '...'
    });
    return null;
  }
}

/**
 * Mock token verification - replace with your actual implementation
 */
async function mockVerifyToken(token: string): Promise<any> {
  // This is a placeholder - implement your actual JWT verification
  // For now, return null to indicate no user found
  return null;
}

/**
 * Request deduplication middleware
 * Prevents multiple identical requests from being processed simultaneously
 */
const pendingRequests = new Map<string, Promise<any>>();

export const requestDeduplication = (req: Request, res: Response, next: NextFunction) => {
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
  
  // Remove from Redis cache
  await cache.deletePattern(`auth:*:${userId}`);
  
  logger.info('User auth cache invalidated', { userId });
};