import { CacheInvalidator, CacheWarmer, redis } from '../middleware/apiCaching';

// Service-specific cache invalidation
export class CacheService {
  // Product-related cache invalidation
  static async invalidateProductCache(productId?: string, userId?: string) {
    const invalidationPromises = [
      CacheInvalidator.invalidateByTags(['products']),
      CacheInvalidator.invalidateByPattern('*products*'),
      CacheInvalidator.invalidateByPattern('*categories*') // Products affect category counts
    ];

    if (productId) {
      invalidationPromises.push(
        CacheInvalidator.invalidateByPattern(`*product:${productId}*`)
      );
    }

    if (userId) {
      invalidationPromises.push(
        CacheInvalidator.invalidateUser(userId)
      );
    }

    await Promise.all(invalidationPromises);
  }

  // Category-related cache invalidation
  static async invalidateCategoryCache(categoryId?: string, userId?: string) {
    const invalidationPromises = [
      CacheInvalidator.invalidateByTags(['categories']),
      CacheInvalidator.invalidateByPattern('*categories*'),
      CacheInvalidator.invalidateByPattern('*products*') // Categories affect product listings
    ];

    if (categoryId) {
      invalidationPromises.push(
        CacheInvalidator.invalidateByPattern(`*category:${categoryId}*`)
      );
    }

    if (userId) {
      invalidationPromises.push(
        CacheInvalidator.invalidateUser(userId)
      );
    }

    await Promise.all(invalidationPromises);
  }

  // Bot configuration cache invalidation
  static async invalidateBotConfigCache(serverId?: string, userId?: string) {
    const invalidationPromises = [
      CacheInvalidator.invalidateByTags(['botconfig']),
      CacheInvalidator.invalidateByPattern('*botconfig*')
    ];

    if (serverId) {
      invalidationPromises.push(
        CacheInvalidator.invalidateByPattern(`*server:${serverId}*`)
      );
    }

    if (userId) {
      invalidationPromises.push(
        CacheInvalidator.invalidateUser(userId)
      );
    }

    await Promise.all(invalidationPromises);
  }

  // User-specific cache invalidation
  static async invalidateUserCache(userId: string) {
    await Promise.all([
      CacheInvalidator.invalidateUser(userId),
      CacheInvalidator.invalidateByPattern(`*user:${userId}*`)
    ]);
  }

  // OKX API cache invalidation
  static async invalidateOkxCache() {
    await Promise.all([
      CacheInvalidator.invalidateByTags(['okx']),
      CacheInvalidator.invalidateByPattern('*okx*')
    ]);
  }

  // Server-specific cache invalidation
  static async invalidateServerCache(serverId: string) {
    await Promise.all([
      CacheInvalidator.invalidateByPattern(`*server:${serverId}*`),
      CacheInvalidator.invalidateByPattern(`*botconfig*`) // Server changes affect bot config
    ]);
  }

  // Wallet-related cache invalidation
  static async invalidateWalletCache(userId: string) {
    await Promise.all([
      CacheInvalidator.invalidateByPattern(`*wallet*`),
      CacheInvalidator.invalidateByPattern(`*okx*`), // Wallet operations affect OKX data
      CacheInvalidator.invalidateUser(userId)
    ]);
  }

  // Transaction-related cache invalidation
  static async invalidateTransactionCache(userId: string) {
    await Promise.all([
      CacheInvalidator.invalidateByPattern(`*transactions*`),
      CacheInvalidator.invalidateByPattern(`*wallet*`),
      CacheInvalidator.invalidateUser(userId)
    ]);
  }

  // Cache warming for common endpoints
  static async warmCommonCaches(baseUrl: string) {
    const commonEndpoints = [
      '/api/categories',
      '/api/products?page=1&limit=20',
      '/api/okx/currencies',
      '/api/okx/balance'
    ];

    commonEndpoints.forEach(endpoint => {
      CacheWarmer.addToWarmingQueue(`${baseUrl}${endpoint}`);
    });

    await CacheWarmer.warmCache();
  }

  // Smart cache invalidation based on operation type
  static async smartInvalidate(operation: {
    type: 'create' | 'update' | 'delete';
    entity: 'product' | 'category' | 'botconfig' | 'user' | 'server' | 'wallet' | 'transaction';
    entityId?: string;
    userId?: string;
    serverId?: string;
  }) {
    const { type, entity, entityId, userId, serverId } = operation;

    switch (entity) {
      case 'product':
        await this.invalidateProductCache(entityId, userId);
        break;
      
      case 'category':
        await this.invalidateCategoryCache(entityId, userId);
        break;
      
      case 'botconfig':
        await this.invalidateBotConfigCache(serverId, userId);
        break;
      
      case 'user':
        await this.invalidateUserCache(entityId || userId!);
        break;
      
      case 'server':
        await this.invalidateServerCache(entityId || serverId!);
        break;
      
      case 'wallet':
        await this.invalidateWalletCache(userId!);
        break;
      
      case 'transaction':
        await this.invalidateTransactionCache(userId!);
        break;
    }

    // Additional invalidation for delete operations
    if (type === 'delete') {
      await CacheInvalidator.invalidateByPattern('*list*');
      await CacheInvalidator.invalidateByPattern('*count*');
    }
  }

  // Batch cache operations
  static async batchInvalidate(operations: Array<{
    type: 'create' | 'update' | 'delete';
  entity: 'server' | 'category' | 'user' | 'botconfig' | 'product' | 'wallet' | 'transaction';
    entityId?: string;
    userId?: string;
    serverId?: string;
  }>) {
    const invalidationPromises = operations.map(op => this.smartInvalidate(op));
    await Promise.all(invalidationPromises);
  }

  // Cache preloading for user session
  static async preloadUserCache(userId: string, serverId?: string, baseUrl?: string) {
    if (!baseUrl) return;

    const userEndpoints = [
      `/api/products?userId=${userId}`,
      `/api/categories?userId=${userId}`,
      `/api/wallet/balance`
    ];

    if (serverId) {
      userEndpoints.push(
        `/api/botconfig/${serverId}`,
        `/api/servers/${serverId}/overview`
      );
    }

    userEndpoints.forEach(endpoint => {
      CacheWarmer.addToWarmingQueue(`${baseUrl}${endpoint}`, {
        'Authorization': `Bearer ${userId}` // Simplified for example
      });
    });

    await CacheWarmer.warmCache();
  }

  // Cache cleanup for expired data
  static async cleanupExpiredCache() {
    try {
      // Get all keys with TTL
      const keys = await redis.keys('*');
      const expiredKeys = [];

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) { // No expiration set
          continue;
        }
        if (ttl <= 0) { // Expired
          expiredKeys.push(key);
        }
      }

      if (expiredKeys.length > 0) {
        await redis.del(...expiredKeys);
        console.log(`Cleaned up ${expiredKeys.length} expired cache keys`);
      }
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  // Cache size optimization
  static async optimizeCacheSize() {
    try {
      const info = await redis.memory('usage');
      const maxMemory = await redis.config('get', 'maxmemory');
      
      // If memory usage is high, clear least recently used items
      if (info && maxMemory && info > maxMemory[1] * 0.8) {
        console.log('Cache memory usage high, clearing LRU items');
        
        // Get keys sorted by last access time
        const keys = await redis.keys('*');
        const keyAccessTimes = [];

        for (const key of keys) {
          const lastAccess = await redis.object('idletime', key);
          if (lastAccess !== null) {
            keyAccessTimes.push({ key, idleTime: lastAccess });
          }
        }

        // Sort by idle time (descending) and remove oldest 20%
        keyAccessTimes.sort((a, b) => b.idleTime - a.idleTime);
        const keysToRemove = keyAccessTimes
          .slice(0, Math.floor(keyAccessTimes.length * 0.2))
          .map(item => item.key);

        if (keysToRemove.length > 0) {
          await redis.del(...keysToRemove);
          console.log(`Removed ${keysToRemove.length} LRU cache keys`);
        }
      }
    } catch (error) {
      console.error('Cache optimization error:', error);
    }
  }

  // Schedule periodic cache maintenance
  static scheduleMaintenanceTasks() {
    // Cleanup expired cache every hour
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 3600000);

    // Optimize cache size every 30 minutes
    setInterval(() => {
      this.optimizeCacheSize();
    }, 1800000);

    // Warm common caches every 2 hours
    setInterval(() => {
      const baseUrl = process.env.API_BASE_URL;
      if (baseUrl) {
        this.warmCommonCaches(baseUrl);
      }
    }, 7200000);
  }
}

// Cache event emitter for real-time invalidation
export class CacheEventEmitter {
  private static listeners: Map<string, Array<(data: any) => void>> = new Map();

  static on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  static emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Cache event callback error for ${event}:`, error);
        }
      });
    }
  }

  static off(event: string, callback: (data: any) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
}

// Setup cache event listeners
CacheEventEmitter.on('product:created', (data) => {
  CacheService.invalidateProductCache(data.productId, data.userId);
});

CacheEventEmitter.on('product:updated', (data) => {
  CacheService.invalidateProductCache(data.productId, data.userId);
});

CacheEventEmitter.on('product:deleted', (data) => {
  CacheService.invalidateProductCache(data.productId, data.userId);
});

CacheEventEmitter.on('category:created', (data) => {
  CacheService.invalidateCategoryCache(data.categoryId, data.userId);
});

CacheEventEmitter.on('category:updated', (data) => {
  CacheService.invalidateCategoryCache(data.categoryId, data.userId);
});

CacheEventEmitter.on('category:deleted', (data) => {
  CacheService.invalidateCategoryCache(data.categoryId, data.userId);
});

CacheEventEmitter.on('botconfig:updated', (data) => {
  CacheService.invalidateBotConfigCache(data.serverId, data.userId);
});

CacheEventEmitter.on('wallet:transaction', (data) => {
  CacheService.invalidateWalletCache(data.userId);
});

export default CacheService;