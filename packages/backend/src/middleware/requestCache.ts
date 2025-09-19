import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  key: (req: Request) => string;
  condition?: (req: Request) => boolean;
}

class RequestCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize = 1000;

  set(key: string, data: any, ttl: number): void {
    // Clean up old entries if cache is getting too large
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    
    // If still too large, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, Math.floor(this.maxSize * 0.2));
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

const requestCache = new RequestCache();

export const createCacheMiddleware = (config: CacheConfig) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip caching if condition is not met
    if (config.condition && !config.condition(req)) {
      return next();
    }

    const cacheKey = config.key(req);
    const cachedData = requestCache.get(cacheKey);

    if (cachedData) {
      logger.debug('Cache hit', { cacheKey, ttl: config.ttl });
      return res.json(cachedData);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache the response
    res.json = function(data: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        requestCache.set(cacheKey, data, config.ttl);
        logger.debug('Cache set', { cacheKey, ttl: config.ttl });
      }
      
      return originalJson(data);
    };

    next();
  };
};

// Predefined cache configurations
export const cacheConfigs = {
  // Bot status - cache for 5 minutes
  botStatus: {
    ttl: 5 * 60 * 1000,
    key: (req: Request) => `bot-status:${req.params.serverId}:${req.user?.id}`,
    condition: (req: Request) => !!req.params.serverId
  },

  // Discord servers - cache for 2 minutes
  discordServers: {
    ttl: 2 * 60 * 1000,
    key: (req: Request) => `discord-servers:${req.user?.id}`,
    condition: (req: Request) => !!req.user?.id
  },

  // Server details - cache for 3 minutes
  serverDetails: {
    ttl: 3 * 60 * 1000,
    key: (req: Request) => `server-details:${req.params.serverId}:${req.user?.id}`,
    condition: (req: Request) => !!req.params.serverId
  },

  // Products - cache for 1 minute
  products: {
    ttl: 60 * 1000,
    key: (req: Request) => `products:${req.params.serverId}:${JSON.stringify(req.query)}`,
    condition: (req: Request) => !!req.params.serverId
  },

  // Categories - cache for 2 minutes
  categories: {
    ttl: 2 * 60 * 1000,
    key: (req: Request) => `categories:${req.params.serverId}`,
    condition: (req: Request) => !!req.params.serverId
  },

  // Server stats - cache for 30 seconds
  serverStats: {
    ttl: 30 * 1000,
    key: (req: Request) => `server-stats:${req.params.serverId}`,
    condition: (req: Request) => !!req.params.serverId
  }
};

// Cache invalidation utilities
export const invalidateCache = {
  botStatus: (serverId: string, userId?: string) => {
    if (userId) {
      requestCache.delete(`bot-status:${serverId}:${userId}`);
    } else {
      // Invalidate all bot status entries for this server
      const keys = Array.from(requestCache['cache'].keys());
      keys.filter(key => key.startsWith(`bot-status:${serverId}:`))
           .forEach(key => requestCache.delete(key));
    }
  },

  discordServers: (userId: string) => {
    requestCache.delete(`discord-servers:${userId}`);
  },

  serverDetails: (serverId: string, userId?: string) => {
    if (userId) {
      requestCache.delete(`server-details:${serverId}:${userId}`);
    } else {
      const keys = Array.from(requestCache['cache'].keys());
      keys.filter(key => key.startsWith(`server-details:${serverId}:`))
           .forEach(key => requestCache.delete(key));
    }
  },

  products: (serverId: string) => {
    const keys = Array.from(requestCache['cache'].keys());
    keys.filter(key => key.startsWith(`products:${serverId}:`))
         .forEach(key => requestCache.delete(key));
  },

  categories: (serverId: string) => {
    requestCache.delete(`categories:${serverId}`);
  },

  serverStats: (serverId: string) => {
    requestCache.delete(`server-stats:${serverId}`);
  },

  all: () => {
    requestCache.clear();
  }
};

export { requestCache };