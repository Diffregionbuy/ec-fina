import { CacheManager, CacheOptions, defaultDiscordCacheOptions } from '../CacheManager';

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockOptions: CacheOptions;

  beforeEach(() => {
    mockOptions = {
      ttl: 1000, // 1 second for faster tests
      staleWhileRevalidate: true,
      maxSize: 3,
    };
    jest.clearAllTimers();
    jest.useFakeTimers();
    cacheManager = new CacheManager(mockOptions);
  });

  afterEach(() => {
    cacheManager.destroy();
    jest.useRealTimers();
  });

  describe('generateKey', () => {
    it('should generate correct key for guilds', () => {
      const key = cacheManager.generateKey('guilds');
      expect(key).toBe('discord:guilds');
    });

    it('should generate correct key for user', () => {
      const key = cacheManager.generateKey('user', '123456');
      expect(key).toBe('discord:user:123456');
    });

    it('should generate correct key for guild', () => {
      const key = cacheManager.generateKey('guild', '789012');
      expect(key).toBe('discord:guild:789012');
    });

    it('should throw error for invalid parameters', () => {
      expect(() => cacheManager.generateKey('user')).toThrow('Invalid cache key parameters');
      expect(() => cacheManager.generateKey('guild')).toThrow('Invalid cache key parameters');
    });
  });

  describe('set and get', () => {
    it('should store and retrieve data successfully', () => {
      const testData = { id: '123', name: 'Test Server' };
      const key = 'test:key';

      const setResult = cacheManager.set(key, testData);
      expect(setResult).toBe(true);

      const getResult = cacheManager.get(key);
      expect(getResult.hit).toBe(true);
      expect(getResult.stale).toBe(false);
      expect(getResult.data).toEqual(testData);
      expect(getResult.timestamp).toBeDefined();
    });

    it('should return cache miss for non-existent key', () => {
      const result = cacheManager.get('non-existent');
      expect(result.hit).toBe(false);
      expect(result.stale).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should use custom TTL when provided', () => {
      const testData = { test: 'data' };
      const key = 'test:custom-ttl';
      const customTtl = 2000;

      cacheManager.set(key, testData, customTtl);
      
      // Advance time by 1.5 seconds (less than custom TTL)
      jest.advanceTimersByTime(1500);
      
      const result = cacheManager.get(key);
      expect(result.hit).toBe(true);
      expect(result.stale).toBe(false);
    });

    it('should update statistics correctly', () => {
      const key = 'test:stats';
      const data = { test: 'data' };

      // Initial stats
      let stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);

      // Set data
      cacheManager.set(key, data);
      stats = cacheManager.getStats();
      expect(stats.sets).toBe(1);

      // Cache hit
      cacheManager.get(key);
      stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);

      // Cache miss
      cacheManager.get('non-existent');
      stats = cacheManager.getStats();
      expect(stats.misses).toBe(1);
    });
  });

  describe('TTL and expiration', () => {
    it('should return stale data when staleWhileRevalidate is enabled', () => {
      const testData = { id: '123', name: 'Test' };
      const key = 'test:stale';

      cacheManager.set(key, testData);
      
      // Advance time beyond TTL
      jest.advanceTimersByTime(1500);
      
      const result = cacheManager.get(key);
      expect(result.hit).toBe(true);
      expect(result.stale).toBe(true);
      expect(result.data).toEqual(testData);
    });

    it('should remove expired data when staleWhileRevalidate is disabled', () => {
      const noStaleOptions: CacheOptions = {
        ...mockOptions,
        staleWhileRevalidate: false,
      };
      const noStaleCacheManager = new CacheManager(noStaleOptions);
      
      const testData = { id: '123', name: 'Test' };
      const key = 'test:no-stale';

      noStaleCacheManager.set(key, testData);
      
      // Advance time beyond TTL
      jest.advanceTimersByTime(1500);
      
      const result = noStaleCacheManager.get(key);
      expect(result.hit).toBe(false);
      expect(result.stale).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should track stale hits in statistics', () => {
      const testData = { test: 'data' };
      const key = 'test:stale-stats';

      cacheManager.set(key, testData);
      
      // Advance time beyond TTL
      jest.advanceTimersByTime(1500);
      
      cacheManager.get(key);
      
      const stats = cacheManager.getStats();
      expect(stats.staleHits).toBe(1);
    });
  });

  describe('has and hasStaleData', () => {
    it('should return true for existing non-expired data', () => {
      const key = 'test:has';
      cacheManager.set(key, { test: 'data' });
      
      expect(cacheManager.has(key)).toBe(true);
      expect(cacheManager.hasStaleData(key)).toBe(false);
    });

    it('should handle expired data correctly based on staleWhileRevalidate', () => {
      const key = 'test:has-expired';
      cacheManager.set(key, { test: 'data' });
      
      // Advance time beyond TTL
      jest.advanceTimersByTime(1500);
      
      expect(cacheManager.has(key)).toBe(true); // staleWhileRevalidate is true
      expect(cacheManager.hasStaleData(key)).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(cacheManager.has('non-existent')).toBe(false);
      expect(cacheManager.hasStaleData('non-existent')).toBe(false);
    });
  });

  describe('getStaleData', () => {
    it('should return stale data for expired entries', () => {
      const testData = { id: '123', name: 'Stale Test' };
      const key = 'test:get-stale';

      cacheManager.set(key, testData);
      
      // Advance time beyond TTL
      jest.advanceTimersByTime(1500);
      
      const staleData = cacheManager.getStaleData(key);
      expect(staleData).toEqual(testData);
    });

    it('should return null for non-existent keys', () => {
      const staleData = cacheManager.getStaleData('non-existent');
      expect(staleData).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when maxSize is reached', () => {
      // Fill cache to maxSize (3)
      cacheManager.set('key1', { data: '1' });
      cacheManager.set('key2', { data: '2' });
      cacheManager.set('key3', { data: '3' });

      // Access key1 to make it more recently used
      cacheManager.get('key1');

      // Add another entry, should evict key2 (least recently used)
      cacheManager.set('key4', { data: '4' });

      expect(cacheManager.has('key1')).toBe(true);
      expect(cacheManager.has('key2')).toBe(false); // Should be evicted
      expect(cacheManager.has('key3')).toBe(true);
      expect(cacheManager.has('key4')).toBe(true);

      const stats = cacheManager.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should not evict when updating existing entry', () => {
      // Fill cache to maxSize
      cacheManager.set('key1', { data: '1' });
      cacheManager.set('key2', { data: '2' });
      cacheManager.set('key3', { data: '3' });

      // Update existing entry
      cacheManager.set('key1', { data: '1-updated' });

      // All keys should still exist
      expect(cacheManager.has('key1')).toBe(true);
      expect(cacheManager.has('key2')).toBe(true);
      expect(cacheManager.has('key3')).toBe(true);

      const stats = cacheManager.getStats();
      expect(stats.evictions).toBe(0);
    });
  });

  describe('delete and clear', () => {
    it('should delete specific entries', () => {
      cacheManager.set('key1', { data: '1' });
      cacheManager.set('key2', { data: '2' });

      const deleted = cacheManager.delete('key1');
      expect(deleted).toBe(true);
      expect(cacheManager.has('key1')).toBe(false);
      expect(cacheManager.has('key2')).toBe(true);
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cacheManager.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should clear all entries', () => {
      cacheManager.set('key1', { data: '1' });
      cacheManager.set('key2', { data: '2' });

      cacheManager.clear();

      expect(cacheManager.has('key1')).toBe(false);
      expect(cacheManager.has('key2')).toBe(false);
      expect(cacheManager.getStats().size).toBe(0);
    });
  });

  describe('invalidate', () => {
    it('should invalidate entries matching pattern', () => {
      cacheManager.set('discord:user:123', { id: '123' });
      cacheManager.set('discord:user:456', { id: '456' });
      cacheManager.set('discord:guild:789', { id: '789' });

      const invalidated = cacheManager.invalidate('user');
      expect(invalidated).toBe(2);

      expect(cacheManager.has('discord:user:123')).toBe(false);
      expect(cacheManager.has('discord:user:456')).toBe(false);
      expect(cacheManager.has('discord:guild:789')).toBe(true);
    });

    it('should return 0 when no entries match pattern', () => {
      cacheManager.set('discord:guild:789', { id: '789' });

      const invalidated = cacheManager.invalidate('user');
      expect(invalidated).toBe(0);
    });
  });

  describe('statistics and monitoring', () => {
    it('should calculate hit rate correctly', () => {
      cacheManager.set('key1', { data: '1' });

      // 2 hits, 1 miss
      cacheManager.get('key1');
      cacheManager.get('key1');
      cacheManager.get('non-existent');

      const hitRate = cacheManager.getHitRate();
      expect(hitRate).toBeCloseTo(0.667, 2); // 2/3
    });

    it('should return 0 hit rate when no operations', () => {
      const hitRate = cacheManager.getHitRate();
      expect(hitRate).toBe(0);
    });

    it('should reset statistics', () => {
      cacheManager.set('key1', { data: '1' });
      cacheManager.get('key1');
      cacheManager.get('non-existent');

      let stats = cacheManager.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
      expect(stats.sets).toBeGreaterThan(0);

      cacheManager.resetStats();

      stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
    });

    it('should provide detailed cache entries for debugging', () => {
      const testData1 = { id: '1', name: 'Test 1' };
      const testData2 = { id: '2', name: 'Test 2' };

      cacheManager.set('key1', testData1);
      cacheManager.set('key2', testData2);

      const entries = cacheManager.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        key: 'key1',
        data: testData1,
        expired: false,
      });
      expect(entries[0].timestamp).toBeDefined();
      expect(entries[0].ttl).toBeDefined();
    });
  });

  describe('cleanup process', () => {
    it('should clean up very old entries even with staleWhileRevalidate', () => {
      const testData = { test: 'data' };
      const key = 'test:cleanup';

      cacheManager.set(key, testData);
      
      // Advance time beyond 2x TTL (very old)
      jest.advanceTimersByTime(2500);
      
      // Manually trigger cleanup to test the logic
      (cacheManager as any).cleanup();
      
      expect(cacheManager.has(key)).toBe(false);
    });

    it('should preserve stale entries within 2x TTL', () => {
      const testData = { test: 'data' };
      const key = 'test:preserve-stale';

      cacheManager.set(key, testData);
      
      // Advance time beyond TTL but less than 2x TTL
      jest.advanceTimersByTime(1500);
      
      // Manually trigger cleanup
      (cacheManager as any).cleanup();
      
      expect(cacheManager.has(key)).toBe(true);
      expect(cacheManager.hasStaleData(key)).toBe(true);
    });
  });

  describe('default configuration', () => {
    it('should have correct default Discord cache options', () => {
      expect(defaultDiscordCacheOptions.ttl).toBe(5 * 60 * 1000); // 5 minutes
      expect(defaultDiscordCacheOptions.staleWhileRevalidate).toBe(true);
      expect(defaultDiscordCacheOptions.maxSize).toBe(1000);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully during set operations', () => {
      // Mock console.error to avoid test output noise
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Create a cache manager with invalid options to trigger errors
      const invalidCacheManager = new CacheManager({
        ttl: -1,
        staleWhileRevalidate: true,
        maxSize: 0,
      });

      // This should handle the error gracefully
      const result = invalidCacheManager.set('test', { data: 'test' });
      
      // The method should still return a boolean
      expect(typeof result).toBe('boolean');
      
      consoleSpy.mockRestore();
    });
  });
});