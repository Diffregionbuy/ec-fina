import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  private getKey(req: Request): string {
    // Use user ID if authenticated, otherwise fall back to IP
    const userId = (req as any).user?.id;
    if (userId) {
      return `user:${userId}`;
    }
    return `ip:${req.ip || req.connection.remoteAddress || 'unknown'}`;
  }

  createMiddleware(maxRequests: number = 100, windowMs: number = 60000) {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req);
      const now = Date.now();
      
      let entry = this.requests.get(key);
      
      if (!entry || now > entry.resetTime) {
        // Create new entry or reset expired one
        entry = {
          count: 1,
          resetTime: now + windowMs,
        };
        this.requests.set(key, entry);
        return next();
      }
      
      if (entry.count >= maxRequests) {
        const resetIn = Math.ceil((entry.resetTime - now) / 1000);
        
        logger.warn('Rate limit exceeded', {
          key,
          count: entry.count,
          maxRequests,
          resetIn,
          endpoint: req.path,
          method: req.method,
        });
        
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
            retryAfter: resetIn,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      entry.count++;
      next();
    };
  }

  // Specific rate limiters for different endpoints
  authLimiter() {
    // More restrictive for auth endpoints
    return this.createMiddleware(10, 60000); // 10 requests per minute
  }

  apiLimiter() {
    // More generous rate limiting for API endpoints to prevent user frustration
    return this.createMiddleware(300, 60000); // 300 requests per minute (5 per second)
  }

  discordApiLimiter() {
    // Increased limit for Discord API calls while still being conservative
    return this.createMiddleware(120, 60000); // 120 requests per minute (2 per second)
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.requests.clear();
  }
}

export const rateLimiter = new RateLimiter();

// Export commonly used middleware
export const authRateLimit = rateLimiter.authLimiter();
export const apiRateLimit = rateLimiter.apiLimiter();
export const discordApiRateLimit = rateLimiter.discordApiLimiter();