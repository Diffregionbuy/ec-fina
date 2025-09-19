import { logger } from '../../utils/logger';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

export interface CacheOptions {
  ttl: number;
  staleWhileRevalidate: boolean;
  maxSize: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  staleHits: number;
}

export interface CacheResult<T> {
  data: T | null;
  hit: boolean;
  stale: boolean;
  timestamp?: number;
}

export class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private accessCounter = 0;
  private cleanupInterval?: NodeJS.Timeout;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    staleHits: 0,
  };

  constructor(private options: CacheOptions) {
    // Start cleanup interval to remove expired entries - more frequent cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000); // Run every 30 seconds
  }

  /**
   * Generate a cache key for Discord API data
   */
  generateKey(type: 'guilds' | 'user' | 'guild', identifier?: string): string {
    if (type === 'guilds') {
      return 'discord:guilds';
    }
    if (type === 'user' && identifier) {
      return `discord:user:${identifier}`;
    }
    if (type === 'guild' && identifier) {
      return `discord:guild:${identifier}`;
    }
    throw new Error('Invalid cache key parameters');
  }

  /**
   * Get data from cache
   */
  get<T>(key: string): CacheResult<T> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return { data: null, hit: false, stale: false };
    }

    // Update access order for LRU
    this.accessOrder.set(key, ++this.accessCounter);

    const now = Date.now();
    const isExpired = now > (entry.timestamp + entry.ttl);

    if (!isExpired) {
      this.stats.hits++;
      return {
        data: entry.data,
        hit: true,
        stale: false,
        timestamp: entry.timestamp,
      };
    }

    // Entry is expired
    if (this.options.staleWhileRevalidate) {
      // Return stale data but mark as stale
      this.stats.staleHits++;
      return {
        data: entry.data,
        hit: true,
        stale: true,
        timestamp: entry.timestamp,
      };
    }

    // Remove expired entry if stale-while-revalidate is disabled
    this.cache.delete(key);
    this.accessOrder.delete(key);
    this.stats.misses++;
    return { data: null, hit: false, stale: false };
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, customTtl?: number): boolean {
    try {
      const ttl = customTtl || this.options.ttl;
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
        key,
      };

      // Check if we need to evict entries to make space
      if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
        this.evictLRU();
      }

      this.cache.set(key, entry);
      this.accessOrder.set(key, ++this.accessCounter);
      this.stats.sets++;

      logger.debug(`Cache set: ${key} (TTL: ${ttl}ms)`);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    const isExpired = now > (entry.timestamp + entry.ttl);
    
    if (isExpired && !this.options.staleWhileRevalidate) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Check if key exists but is stale (expired)
   */
  hasStaleData(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    const isExpired = now > (entry.timestamp + entry.ttl);
    
    return isExpired;
  }

  /**
   * Get stale data (for fallback scenarios)
   */
  getStaleData<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Update access order even for stale access
    this.accessOrder.set(key, ++this.accessCounter);
    
    return entry.data;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.accessOrder.delete(key);
    return deleted;
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern: string): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());
    
    for (const key of keys) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        count++;
      }
    }

    logger.debug(`Cache invalidated ${count} entries matching pattern: ${pattern}`);
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { size: number; maxSize: number } {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.options.maxSize,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      staleHits: 0,
    };
  }

  /**
   * Get cache hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;

    let oldestKey = '';
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.stats.evictions++;
      logger.debug(`Cache evicted LRU entry: ${oldestKey}`);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // More aggressive cleanup for memory management
    for (const [key, entry] of this.cache) {
      const isExpired = now > (entry.timestamp + entry.ttl);
      
      // Remove expired entries immediately, or very old entries (1.5x TTL)
      const veryOld = now > (entry.timestamp + entry.ttl * 1.5);
      
      if (isExpired || veryOld) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        cleanedCount++;
        this.stats.evictions++;
      }
    }

    // If cache is still too large, remove oldest entries (LRU)
    if (this.cache.size > this.options.maxSize * 0.8) {
      const sortedByAccess = Array.from(this.accessOrder.entries())
        .sort((a, b) => a[1] - b[1]); // Sort by access counter (oldest first)
      
      const toRemove = Math.floor(this.cache.size * 0.2); // Remove 20% of entries
      for (let i = 0; i < toRemove && i < sortedByAccess.length; i++) {
        const [key] = sortedByAccess[i];
        this.cache.delete(key);
        this.accessOrder.delete(key);
        cleanedCount++;
        this.stats.evictions++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`Cache cleanup removed ${cleanedCount} entries (${this.cache.size} remaining)`);
    }
  }

  /**
   * Get cache entries for debugging
   */
  getEntries(): Array<{ key: string; data: any; timestamp: number; ttl: number; expired: boolean }> {
    const now = Date.now();
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      data: entry.data,
      timestamp: entry.timestamp,
      ttl: entry.ttl,
      expired: now > (entry.timestamp + entry.ttl),
    }));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
  }
}

// Default cache configuration for Discord data
export const defaultDiscordCacheOptions: CacheOptions = {
  ttl: 5 * 60 * 1000, // 5 minutes - reduced for memory
  staleWhileRevalidate: true,
  maxSize: 100, // Drastically reduced for memory
};

// Create singleton instance for Discord data caching
let _discordCacheManager: CacheManager | null = null;

export const getDiscordCacheManager = (): CacheManager => {
  if (!_discordCacheManager) {
    _discordCacheManager = new CacheManager(defaultDiscordCacheOptions);
  }
  return _discordCacheManager;
};

export const destroyDiscordCacheManager = (): void => {
  if (_discordCacheManager) {
    _discordCacheManager.destroy();
    _discordCacheManager = null;
  }
};

// For backward compatibility
export const discordCacheManager = getDiscordCacheManager();