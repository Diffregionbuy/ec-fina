import { createClient } from 'redis';
import { logger } from '../utils/logger';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

class CacheService {
  private client: any;
  private connected: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    try {
      if (!process.env.REDIS_URL) {
        logger.warn('Redis URL not configured, caching disabled');
        return;
      }

      this.client = createClient({
        url: process.env.REDIS_URL,
        password: process.env.REDIS_PASSWORD,
        socket: {
          tls: process.env.REDIS_TLS === 'true',
          connectTimeout: 10000,
          lazyConnect: true,
        },
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            logger.error('Redis max retry attempts reached');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        },
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.connected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('error', (error: Error) => {
        logger.error('Redis client error:', error);
        this.connected = false;
        this.stats.errors++;
      });

      this.client.on('end', () => {
        logger.warn('Redis client connection ended');
        this.connected = false;
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis client:', error);
      this.connected = false;
    }
  }

  private generateKey(key: string, prefix?: string): string {
    const keyPrefix = prefix || 'ecbot';
    return `${keyPrefix}:${key}`;
  }

  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const cacheKey = this.generateKey(key, options.prefix);
      const value = await this.client.get(cacheKey);
      
      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value);
    } catch (error) {
      logger.error('Cache get error:', error);
      this.stats.errors++;
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key, options.prefix);
      const serializedValue = JSON.stringify(value);
      
      if (options.ttl) {
        await this.client.setEx(cacheKey, options.ttl, serializedValue);
      } else {
        await this.client.set(cacheKey, serializedValue);
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async del(key: string, options: CacheOptions = {}): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key, options.prefix);
      await this.client.del(cacheKey);
      this.stats.deletes++;
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key, options.prefix);
      const exists = await this.client.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async expire(key: string, ttl: number, options: CacheOptions = {}): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key, options.prefix);
      await this.client.expire(cacheKey, ttl);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async flush(pattern?: string): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      if (pattern) {
        const keys = await this.client.keys(this.generateKey(pattern));
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      } else {
        await this.client.flushDb();
      }
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      this.stats.errors++;
      return false;
    }
  }

  // Specific caching methods for common data types

  async cacheUser(userId: string, userData: any, ttl: number = 3600): Promise<boolean> {
    return this.set(`user:${userId}`, userData, { ttl, prefix: 'ecbot' });
  }

  async getCachedUser(userId: string): Promise<any | null> {
    return this.get(`user:${userId}`, { prefix: 'ecbot' });
  }

  async cacheServer(serverId: string, serverData: any, ttl: number = 1800): Promise<boolean> {
    return this.set(`server:${serverId}`, serverData, { ttl, prefix: 'ecbot' });
  }

  async getCachedServer(serverId: string): Promise<any | null> {
    return this.get(`server:${serverId}`, { prefix: 'ecbot' });
  }

  async cacheBotConfig(serverId: string, config: any, ttl: number = 900): Promise<boolean> {
    return this.set(`bot_config:${serverId}`, config, { ttl, prefix: 'ecbot' });
  }

  async getCachedBotConfig(serverId: string): Promise<any | null> {
    return this.get(`bot_config:${serverId}`, { prefix: 'ecbot' });
  }

  async cacheProducts(serverId: string, products: any[], ttl: number = 600): Promise<boolean> {
    return this.set(`products:${serverId}`, products, { ttl, prefix: 'ecbot' });
  }

  async getCachedProducts(serverId: string): Promise<any[] | null> {
    return this.get(`products:${serverId}`, { prefix: 'ecbot' });
  }

  async cacheCategories(serverId: string, categories: any[], ttl: number = 1800): Promise<boolean> {
    return this.set(`categories:${serverId}`, categories, { ttl, prefix: 'ecbot' });
  }

  async getCachedCategories(serverId: string): Promise<any[] | null> {
    return this.get(`categories:${serverId}`, { prefix: 'ecbot' });
  }

  async cacheWalletBalance(userId: string, balance: number, ttl: number = 300): Promise<boolean> {
    return this.set(`wallet:${userId}`, { balance, timestamp: Date.now() }, { ttl, prefix: 'ecbot' });
  }

  async getCachedWalletBalance(userId: string): Promise<{ balance: number; timestamp: number } | null> {
    return this.get(`wallet:${userId}`, { prefix: 'ecbot' });
  }

  // Session management
  async setSession(sessionId: string, sessionData: any, ttl: number = 86400): Promise<boolean> {
    return this.set(`session:${sessionId}`, sessionData, { ttl, prefix: 'ecbot' });
  }

  async getSession(sessionId: string): Promise<any | null> {
    return this.get(`session:${sessionId}`, { prefix: 'ecbot' });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.del(`session:${sessionId}`, { prefix: 'ecbot' });
  }

  // Rate limiting support
  async incrementRateLimit(key: string, window: number = 60): Promise<{ count: number; ttl: number }> {
    if (!this.connected || !this.client) {
      return { count: 0, ttl: 0 };
    }

    try {
      const cacheKey = this.generateKey(`rate_limit:${key}`, 'ecbot');
      const multi = this.client.multi();
      
      multi.incr(cacheKey);
      multi.expire(cacheKey, window);
      multi.ttl(cacheKey);
      
      const results = await multi.exec();
      const count = results[0][1];
      const ttl = results[2][1];
      
      return { count, ttl };
    } catch (error) {
      logger.error('Rate limit increment error:', error);
      this.stats.errors++;
      return { count: 0, ttl: 0 };
    }
  }

  // Cache invalidation patterns
  async invalidateUserCache(userId: string): Promise<void> {
    await Promise.all([
      this.del(`user:${userId}`),
      this.del(`wallet:${userId}`),
      this.flush(`session:*:${userId}`),
    ]);
  }

  async invalidateServerCache(serverId: string): Promise<void> {
    await Promise.all([
      this.del(`server:${serverId}`),
      this.del(`bot_config:${serverId}`),
      this.del(`products:${serverId}`),
      this.del(`categories:${serverId}`),
    ]);
  }

  // Health check
  async healthCheck(): Promise<{ status: string; latency?: number; stats: CacheStats }> {
    if (!this.connected || !this.client) {
      return {
        status: 'disconnected',
        stats: this.stats,
      };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;

      return {
        status: 'connected',
        latency,
        stats: this.stats,
      };
    } catch (error) {
      return {
        status: 'error',
        stats: this.stats,
      };
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Reset statistics
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  // Cleanup
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
      logger.info('Redis client disconnected');
    }
  }
}

export const cacheService = new CacheService();