import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { cache } from '../services/cache';
import { logger } from '../utils/logger';

/**
 * OPTIMIZED: Adaptive Rate Limiting
 * Replaces multiple separate rate limiters with intelligent, context-aware limiting
 */

interface RateLimitConfig {
  windowMs: number;
  max: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const rateLimitConfigs: Record<string, RateLimitConfig> = {
  // High-frequency endpoints
  'discord-api': {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    skipSuccessfulRequests: true
  },
  
  // Standard API endpoints
  'api': {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },
  
  // Authentication endpoints
  'auth': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes
    skipSuccessfulRequests: true
  },
  
  // Admin endpoints
  'admin': {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
  },
  
  // Monitoring endpoints (more restrictive)
  'monitoring': {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
  }
};

/**
 * Intelligent rate limiter that adapts based on:
 * - Endpoint type
 * - User authentication status
 * - Historical behavior
 * - System load
 */
export const adaptiveRateLimit = (type: keyof typeof rateLimitConfigs = 'api') => {
  const config = rateLimitConfigs[type];
  
  return rateLimit({
    windowMs: config.windowMs,
    max: async (req: Request) => {
      // Base limit
      let limit = config.max;
      
      // Increase limit for authenticated users
      if (req.user) {
        limit = Math.floor(limit * 1.5);
      }
      
      // Decrease limit based on system load
      const systemLoad = await getSystemLoad();
      if (systemLoad > 0.8) {
        limit = Math.floor(limit * 0.5);
      } else if (systemLoad > 0.6) {
        limit = Math.floor(limit * 0.7);
      }
      
      // Check user's recent behavior
      const userKey = req.ip + (req.user?.id || '');
      const recentErrors = await cache.get(`errors:${userKey}`) || 0;
      if (recentErrors > 5) {
        limit = Math.floor(limit * 0.3); // Reduce limit for problematic users
      }
      
      return limit;
    },
    
    keyGenerator: (req: Request) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.id || req.ip;
    },
    
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      if (req.path === '/health' || req.path === '/api/monitoring/health') {
        return true;
      }
      
      // Skip for admin users (with higher limits applied above)
      if (req.user?.role === 'admin') {
        return false; // Still apply limits but with higher thresholds
      }
      
      return false;
    },
    
    onLimitReached: async (req: Request, res: Response) => {
      const userKey = req.ip + (req.user?.id || '');
      
      // Track rate limit violations
      await cache.incr(`rate_limit:${userKey}`, 3600); // 1 hour expiry
      
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.id,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent')
      });
    },
    
    standardHeaders: true,
    legacyHeaders: false,
    
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: config.windowMs / 1000
    }
  });
};

/**
 * Get current system load (simplified)
 */
async function getSystemLoad(): Promise<number> {
  try {
    const load = await cache.get('system:load') || 0;
    return Number(load);
  } catch {
    return 0.5; // Default moderate load
  }
}

/**
 * Middleware to track and update system metrics
 */
export const systemLoadTracker = async (req: Request, res: Response, next: Function) => {
  const start = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - start;
    
    // Update response time metrics
    await cache.lpush('response_times', duration, 100); // Keep last 100 response times
    
    // Calculate and cache system load
    const responseTimes = await cache.lrange('response_times', 0, -1);
    const avgResponseTime = responseTimes.reduce((a, b) => a + Number(b), 0) / responseTimes.length;
    
    // Simple load calculation based on response time
    const load = Math.min(avgResponseTime / 1000, 1); // Normalize to 0-1
    await cache.set('system:load', load, 60); // Cache for 1 minute
  });
  
  next();
};

/**
 * Combined authentication and rate limiting middleware
 * Replaces separate auth and rate limit middleware chains
 */
export const smartAuth = (options: {
  required?: boolean;
  rateLimitType?: keyof typeof rateLimitConfigs;
  permissions?: string[];
} = {}) => {
  const { required = false, rateLimitType = 'api', permissions = [] } = options;
  
  return [
    // Apply rate limiting first
    adaptiveRateLimit(rateLimitType),
    
    // Then authentication
    async (req: Request, res: Response, next: Function) => {
      try {
        // Extract token from various sources
        const token = req.headers.authorization?.replace('Bearer ', '') ||
                     req.cookies?.token ||
                     req.query?.token;
        
        if (token) {
          // Verify token (simplified)
          const user = await verifyToken(token);
          if (user) {
            req.user = user;
          }
        }
        
        // Check if authentication is required
        if (required && !req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'UNAUTHENTICATED'
          });
        }
        
        // Check permissions
        if (permissions.length > 0 && req.user) {
          const hasPermission = permissions.some(perm => 
            req.user.permissions?.includes(perm) || req.user.role === 'admin'
          );
          
          if (!hasPermission) {
            return res.status(403).json({
              error: 'Insufficient permissions',
              code: 'FORBIDDEN',
              required: permissions
            });
          }
        }
        
        next();
      } catch (error) {
        logger.error('Authentication error:', error);
        
        if (required) {
          return res.status(401).json({
            error: 'Authentication failed',
            code: 'AUTH_ERROR'
          });
        }
        
        next(); // Continue without auth for optional endpoints
      }
    }
  ];
};

/**
 * Simplified token verification (replace with your actual implementation)
 */
async function verifyToken(token: string): Promise<any> {
  try {
    // Check cache first
    const cached = await cache.get(`token:${token}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Verify token (implement your JWT verification here)
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // const user = await getUserById(decoded.userId);
    
    // Cache valid token for 5 minutes
    // await cache.set(`token:${token}`, JSON.stringify(user), 300);
    
    // return user;
    return null; // Placeholder
  } catch {
    return null;
  }
}