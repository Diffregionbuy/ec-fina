import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import crypto from 'crypto';

/**
 * Redis client configuration with enhanced error handling
 * DISABLE_REDIS/CACHE_DISABLED=true will export a no-op client to avoid any network attempts.
 */
const DISABLE_REDIS = String(process.env.DISABLE_REDIS || process.env.CACHE_DISABLED || 'true').toLowerCase() === 'true';

function createNoopRedis() {
  const noop = async (..._args: any[]) => null as any;
  const noopNum = async (..._args: any[]) => 0 as any;
  const noopStr = async (..._args: any[]) => 'OK' as any;
  const noopArr = async (..._args: any[]) => [] as any[];
  const noopOn = (_e: string, _h: any) => {};
  return {
    // Common operations
    get: noop,
    set: noopStr,
    setex: noopStr,
    del: noopNum,
    keys: noopArr,
    ping: async () => 'PONG',
    info: async () => '',
    flushdb: noopStr,
    // Sets and TTL helpers used elsewhere
    smembers: noopArr,
    sadd: noopNum,
    expire: noopNum,
    ttl: async () => -2,
    // Diagnostics often used in monitors
    memory: noopNum,
    config: async (..._args: any[]) => ['maxmemory', '0'],
    object: noop,
    dbsize: noopNum,
    // Event handlers
    on: noopOn,
    quit: async () => {}
  } as any;
}

const redis: any = DISABLE_REDIS
  ? createNoopRedis()
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: 2, // Reduced to fail faster
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 5000, // Reduced timeout
      commandTimeout: 3000, // Reduced timeout
      enableOfflineQueue: false, // Don't queue commands when disconnected
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        return err.message.includes(targetError);
      }
    });

// Redis connection state tracking
let redisConnected = false;
let lastConnectionCheck = 0;
const CONNECTION_CHECK_INTERVAL = 30000; // 30 seconds

// Handle Redis connection events
redis.on('connect', () => {
  console.log('Redis connected successfully');
  redisConnected = true;
});

redis.on('ready', () => {
  console.log('Redis ready for commands');
  redisConnected = true;
});

redis.on('error', (err) => {
  console.warn('Redis connection error (continuing without cache):', err.message);
  redisConnected = false;
});

redis.on('close', () => {
  console.log('Redis connection closed');
  redisConnected = false;
});

redis.on('reconnecting', () => {
  console.log('Redis reconnecting...');
  redisConnected = false;
});

// Check Redis connection health
async function checkRedisConnection(): Promise<boolean> {
  const now = Date.now();
  
  // Use cached result if recent
  if (now - lastConnectionCheck < CONNECTION_CHECK_INTERVAL) {
    return redisConnected;
  }
  
  try {
    await redis.ping();
    redisConnected = true;
    lastConnectionCheck = now;
    return true;
  } catch (error) {
    redisConnected = false;
    lastConnectionCheck = now;
    return false;
  }
}

// Safe Redis operations with fallback
async function safeRedisGet(key: string): Promise<string | null> {
  if (!await checkRedisConnection()) {
    return null;
  }
  
  try {
    return await redis.get(key);
  } catch (error) {
    console.warn(`Redis GET failed for key ${key}:`, error);
    redisConnected = false;
    return null;
  }
}

async function safeRedisSet(key: string, value: string, ttl?: number): Promise<boolean> {
  if (!await checkRedisConnection()) {
    return false;
  }
  
  try {
    if (ttl) {
      await redis.setex(key, ttl, value);
    } else {
      await redis.set(key, value);
    }
    return true;
  } catch (error) {
    console.warn(`Redis SET failed for key ${key}:`, error);
    redisConnected = false;
    return false;
  }
}

async function safeRedisDel(key: string): Promise<boolean> {
  if (!await checkRedisConnection()) {
    return false;
  }
  
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.warn(`Redis DEL failed for key ${key}:`, error);
    redisConnected = false;
    return false;
  }
}

// Cache configuration interface
export interface CacheConfig {
  ttl: number; // Time to live in seconds
  keyPrefix?: string;
  tags?: string[];
  varyBy?: string[]; // Headers/params to vary cache by
  skipCache?: (req: Request) => boolean;
  skipCacheOnError?: boolean;
  warmCache?: boolean;
  compression?: boolean;
  maxSize?: number; // Max response size to cache (bytes)
}

// Cache statistics
export class CacheStats {
  private static stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    totalResponseTime: 0,
    cachedResponseTime: 0
  };

  static recordHit(responseTime: number) {
    this.stats.hits++;
    this.stats.cachedResponseTime += responseTime;
  }

  static recordMiss(responseTime: number) {
    this.stats.misses++;
    this.stats.totalResponseTime += responseTime;
  }

  static recordSet() {
    this.stats.sets++;
  }

  static recordDelete() {
    this.stats.deletes++;
  }

  static recordError() {
    this.stats.errors++;
  }

  static getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    const avgCachedTime = this.stats.hits > 0 ? this.stats.cachedResponseTime / this.stats.hits : 0;
    const avgTotalTime = this.stats.misses > 0 ? this.stats.totalResponseTime / this.stats.misses : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      avgCachedResponseTime: Math.round(avgCachedTime * 100) / 100,
      avgTotalResponseTime: Math.round(avgTotalTime * 100) / 100,
      totalRequests
    };
  }

  static reset() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalResponseTime: 0,
      cachedResponseTime: 0
    };
  }
}

// Cache key generator
export class CacheKeyGenerator {
  static generateKey(req: Request, config: CacheConfig): string {
    const baseKey = `${config.keyPrefix || 'api'}:${req.method}:${req.route?.path || req.path}`;
    
    // Add query parameters
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const queryHash = queryString ? crypto.createHash('md5').update(queryString).digest('hex').substring(0, 8) : '';
    
    // Add vary-by headers
    let varyHash = '';
    if (config.varyBy && config.varyBy.length > 0) {
      const varyData = config.varyBy.map(header => req.get(header) || '').join('|');
      varyHash = varyData ? crypto.createHash('md5').update(varyData).digest('hex').substring(0, 8) : '';
    }
    
    // Add user context for authenticated requests
    const userId = (req as any).user?.id || '';
    const userHash = userId ? crypto.createHash('md5').update(userId).digest('hex').substring(0, 8) : '';
    
    const parts = [baseKey, queryHash, varyHash, userHash].filter(Boolean);
    return parts.join(':');
  }

  static generateTagKey(tag: string): string {
    return `tag:${tag}`;
  }
}

// Cache invalidation manager
export class CacheInvalidator {
  static async invalidateByKey(key: string): Promise<void> {
    try {
      await redis.del(key);
      CacheStats.recordDelete();
    } catch (error) {
      console.error('Cache invalidation error:', error);
      CacheStats.recordError();
    }
  }

  static async invalidateByPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        CacheStats.recordDelete();
      }
    } catch (error) {
      console.error('Cache pattern invalidation error:', error);
      CacheStats.recordError();
    }
  }

  static async invalidateByTags(tags: string[]): Promise<void> {
    try {
      for (const tag of tags) {
        const tagKey = CacheKeyGenerator.generateTagKey(tag);
        const keys = await redis.smembers(tagKey);
        
        if (keys.length > 0) {
          // Delete cached responses
          await redis.del(...keys);
          // Delete tag set
          await redis.del(tagKey);
          CacheStats.recordDelete();
        }
      }
    } catch (error) {
      console.error('Cache tag invalidation error:', error);
      CacheStats.recordError();
    }
  }

  static async invalidateUser(userId: string): Promise<void> {
    const userHash = crypto.createHash('md5').update(userId).digest('hex').substring(0, 8);
    await this.invalidateByPattern(`*:${userHash}`);
  }

  static async invalidateAll(): Promise<void> {
    try {
      await redis.flushdb();
      CacheStats.recordDelete();
    } catch (error) {
      console.error('Cache flush error:', error);
      CacheStats.recordError();
    }
  }
}

// Response compression utility
class ResponseCompressor {
  static compress(data: any): string {
    const jsonString = JSON.stringify(data);
    return Buffer.from(jsonString).toString('base64');
  }

  static decompress(compressedData: string): any {
    const jsonString = Buffer.from(compressedData, 'base64').toString('utf-8');
    return JSON.parse(jsonString);
  }
}

// Main caching middleware
export function apiCache(config: CacheConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Skip caching for certain conditions
    if (config.skipCache && config.skipCache(req)) {
      return next();
    }

    // Skip caching for non-GET requests by default
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = CacheKeyGenerator.generateKey(req, config);

    try {
      // Try to get cached response
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        // Cache hit
        const responseTime = Date.now() - startTime;
        CacheStats.recordHit(responseTime);

        let parsedData;
        if (config.compression) {
          parsedData = ResponseCompressor.decompress(cachedData);
        } else {
          parsedData = JSON.parse(cachedData);
        }

        // Add cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
          'X-Response-Time': `${responseTime}ms`
        });

        return res.json(parsedData);
      }

      // Cache miss - intercept response
      const originalJson = res.json;
      const originalSend = res.send;

      res.json = function(data: any) {
        // Store response for caching
        cacheResponse(data, cacheKey, config, startTime);
        
        // Add cache headers
        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Key': cacheKey,
          'X-Response-Time': `${Date.now() - startTime}ms`
        });

        return originalJson.call(this, data);
      };

      res.send = function(data: any) {
        // For non-JSON responses
        if (typeof data === 'string') {
          try {
            const jsonData = JSON.parse(data);
            cacheResponse(jsonData, cacheKey, config, startTime);
          } catch {
            // Not JSON, skip caching
          }
        }

        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Key': cacheKey,
          'X-Response-Time': `${Date.now() - startTime}ms`
        });

        return originalSend.call(this, data);
      };

      next();

    } catch (error) {
      console.error('Cache middleware error:', error);
      CacheStats.recordError();
      
      // Continue without caching on error
      next();
    }
  };
}

// Cache response helper
async function cacheResponse(data: any, cacheKey: string, config: CacheConfig, startTime: number) {
  try {
    const responseTime = Date.now() - startTime;
    CacheStats.recordMiss(responseTime);

    // Check response size limit
    const dataSize = JSON.stringify(data).length;
    if (config.maxSize && dataSize > config.maxSize) {
      console.warn(`Response too large to cache: ${dataSize} bytes`);
      return;
    }

    // Skip caching on error responses
    if (config.skipCacheOnError && data.success === false) {
      return;
    }

    // Prepare data for caching
    let cacheData: string;
    if (config.compression) {
      cacheData = ResponseCompressor.compress(data);
    } else {
      cacheData = JSON.stringify(data);
    }

    // Store in cache
    await redis.setex(cacheKey, config.ttl, cacheData);
    CacheStats.recordSet();

    // Handle tags
    if (config.tags && config.tags.length > 0) {
      for (const tag of config.tags) {
        const tagKey = CacheKeyGenerator.generateTagKey(tag);
        await redis.sadd(tagKey, cacheKey);
        await redis.expire(tagKey, config.ttl);
      }
    }

  } catch (error) {
    console.error('Cache storage error:', error);
    CacheStats.recordError();
  }
}

// Predefined cache configurations
export const CacheConfigs = {
  // Short-term cache for frequently changing data
  short: {
    ttl: 300, // 5 minutes
    keyPrefix: 'short',
    compression: false,
    maxSize: 1024 * 1024 // 1MB
  },

  // Medium-term cache for semi-static data
  medium: {
    ttl: 1800, // 30 minutes
    keyPrefix: 'medium',
    compression: true,
    maxSize: 5 * 1024 * 1024 // 5MB
  },

  // Long-term cache for static data
  long: {
    ttl: 3600, // 1 hour
    keyPrefix: 'long',
    compression: true,
    maxSize: 10 * 1024 * 1024 // 10MB
  },

  // User-specific cache
  user: {
    ttl: 900, // 15 minutes
    keyPrefix: 'user',
    varyBy: ['authorization'],
    compression: true,
    maxSize: 2 * 1024 * 1024 // 2MB
  },

  // Product cache with tags
  products: {
    ttl: 1800, // 30 minutes
    keyPrefix: 'products',
    tags: ['products'],
    compression: true,
    skipCacheOnError: true,
    maxSize: 5 * 1024 * 1024 // 5MB
  },

  // Categories cache
  categories: {
    ttl: 3600, // 1 hour
    keyPrefix: 'categories',
    tags: ['categories'],
    compression: true,
    maxSize: 1024 * 1024 // 1MB
  },

  // Bot configuration cache
  botConfig: {
    ttl: 1800, // 30 minutes
    keyPrefix: 'botconfig',
    tags: ['botconfig'],
    varyBy: ['authorization'],
    compression: true,
    maxSize: 2 * 1024 * 1024 // 2MB
  },

  // OKX API cache
  okx: {
    ttl: 60, // 1 minute for real-time data
    keyPrefix: 'okx',
    tags: ['okx'],
    compression: false,
    maxSize: 512 * 1024 // 512KB
  }
};

// Cache warming utility
export class CacheWarmer {
  private static warmingQueue: Array<{ url: string; headers?: Record<string, string> }> = [];
  private static isWarming = false;

  static addToWarmingQueue(url: string, headers?: Record<string, string>) {
    this.warmingQueue.push({ url, headers });
  }

  static async warmCache() {
    if (this.isWarming || this.warmingQueue.length === 0) {
      return;
    }

    this.isWarming = true;
    console.log(`Starting cache warming for ${this.warmingQueue.length} URLs`);

    try {
      // Use axios instead of node-fetch for consistency
      const axios = require('axios');
      
      for (const { url, headers } of this.warmingQueue) {
        try {
          await axios.get(url, { 
            headers: {
              'User-Agent': 'CacheWarmer/1.0',
              ...headers
            },
            timeout: 10000
          });
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.warn(`Cache warming failed for ${url}:`, error);
        }
      }

      console.log('Cache warming completed');
    } catch (error) {
      console.error('Cache warming error:', error);
    } finally {
      this.warmingQueue = [];
      this.isWarming = false;
    }
  }

  static scheduleWarming(intervalMs: number = 3600000) { // Default: 1 hour
    setInterval(() => {
      this.warmCache();
    }, intervalMs);
  }
}

// Cache health check
export class CacheHealthCheck {
  static async checkHealth(): Promise<{
    redis: boolean;
    stats: any;
    memory: any;
  }> {
    try {
      // Test Redis connection
      const pong = await redis.ping();
      const redisHealthy = pong === 'PONG';

      // Get basic Redis info instead of memory usage
      let memoryInfo = null;
      try {
        const info = await redis.info('memory');
        memoryInfo = { info };
      } catch (memError) {
        console.warn('Could not get Redis memory info:', memError);
      }
      
      return {
        redis: redisHealthy,
        stats: CacheStats.getStats(),
        memory: memoryInfo
      };
    } catch (error) {
      console.error('Cache health check error:', error);
      return {
        redis: false,
        stats: CacheStats.getStats(),
        memory: null
      };
    }
  }
}

// Middleware for cache management endpoints
export function cacheManagementRoutes() {
  const router = require('express').Router();

  // Get cache statistics
  router.get('/stats', (req: Request, res: Response) => {
    const stats = CacheStats.getStats();
    res.json({
      success: true,
      data: stats
    });
  });

  // Get cache health
  router.get('/health', async (req: Request, res: Response) => {
    const health = await CacheHealthCheck.checkHealth();
    res.json({
      success: true,
      data: health
    });
  });

  // Clear cache by pattern
  router.delete('/clear/:pattern', async (req: Request, res: Response) => {
    try {
      await CacheInvalidator.invalidateByPattern(req.params.pattern);
      res.json({
        success: true,
        message: `Cache cleared for pattern: ${req.params.pattern}`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache'
      });
    }
  });

  // Clear cache by tags
  router.delete('/tags', async (req: Request, res: Response) => {
    try {
      const { tags } = req.body;
      if (!Array.isArray(tags)) {
        return res.status(400).json({
          success: false,
          error: 'Tags must be an array'
        });
      }

      await CacheInvalidator.invalidateByTags(tags);
      res.json({
        success: true,
        message: `Cache cleared for tags: ${tags.join(', ')}`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache by tags'
      });
    }
  });

  // Warm cache
  router.post('/warm', async (req: Request, res: Response) => {
    try {
      await CacheWarmer.warmCache();
      res.json({
        success: true,
        message: 'Cache warming initiated'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to warm cache'
      });
    }
  });

  return router;
}

// Export everything
export {
  redis
};

export default {
  apiCache,
  CacheConfigs,
  CacheInvalidator,
  CacheWarmer,
  CacheHealthCheck,
  CacheStats,
  cacheManagementRoutes
};
