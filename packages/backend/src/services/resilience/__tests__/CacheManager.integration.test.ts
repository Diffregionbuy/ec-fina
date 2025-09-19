import { CacheManager, getDiscordCacheManager, destroyDiscordCacheManager } from '../CacheManager';

describe('CacheManager Integration Tests', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = getDiscordCacheManager();
    cacheManager.clear();
    cacheManager.resetStats();
  });

  afterAll(() => {
    destroyDiscordCacheManager();
  });

  describe('Discord-specific caching scenarios', () => {
    it('should cache Discord guilds data', () => {
      const guildsData = [
        { id: '123456789', name: 'Test Server 1', icon: 'icon1.png' },
        { id: '987654321', name: 'Test Server 2', icon: 'icon2.png' },
      ];

      const key = cacheManager.generateKey('guilds');
      cacheManager.set(key, guildsData);

      const result = cacheManager.get(key);
      expect(result.hit).toBe(true);
      expect(result.stale).toBe(false);
      expect(result.data).toEqual(guildsData);
    });

    it('should cache Discord user data', () => {
      const userData = {
        id: '123456789',
        username: 'testuser',
        discriminator: '1234',
        avatar: 'avatar.png',
      };

      const key = cacheManager.generateKey('user', '123456789');
      cacheManager.set(key, userData);

      const result = cacheManager.get(key);
      expect(result.hit).toBe(true);
      expect(result.data).toEqual(userData);
    });

    it('should cache individual guild data', () => {
      const guildData = {
        id: '123456789',
        name: 'Test Server',
        icon: 'icon.png',
        owner: true,
        permissions: '8',
      };

      const key = cacheManager.generateKey('guild', '123456789');
      cacheManager.set(key, guildData);

      const result = cacheManager.get(key);
      expect(result.hit).toBe(true);
      expect(result.data).toEqual(guildData);
    });

    it('should handle cache invalidation for user-specific data', () => {
      const userId = '123456789';
      
      // Cache user data and guilds
      const userKey = cacheManager.generateKey('user', userId);
      const guildsKey = cacheManager.generateKey('guilds');
      
      cacheManager.set(userKey, { id: userId, username: 'testuser' });
      cacheManager.set(guildsKey, [{ id: '1', name: 'Server 1' }]);

      // Verify data is cached
      expect(cacheManager.has(userKey)).toBe(true);
      expect(cacheManager.has(guildsKey)).toBe(true);

      // Invalidate user-specific data
      const invalidated = cacheManager.invalidate(`user:${userId}`);
      expect(invalidated).toBe(1);

      // User data should be gone, guilds should remain
      expect(cacheManager.has(userKey)).toBe(false);
      expect(cacheManager.has(guildsKey)).toBe(true);
    });

    it('should provide stale data when Discord API fails', () => {
      const guildsData = [{ id: '123', name: 'Test Server' }];
      const key = cacheManager.generateKey('guilds');

      // Cache data with short TTL for testing
      cacheManager.set(key, guildsData, 100); // 100ms TTL

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const result = cacheManager.get(key);
          
          // Should return stale data
          expect(result.hit).toBe(true);
          expect(result.stale).toBe(true);
          expect(result.data).toEqual(guildsData);
          
          resolve();
        }, 150);
      });
    });

    it('should track cache performance metrics', () => {
      const key1 = cacheManager.generateKey('guilds');
      const key2 = cacheManager.generateKey('user', '123');

      // Generate some cache activity
      cacheManager.set(key1, [{ id: '1', name: 'Server 1' }]);
      cacheManager.set(key2, { id: '123', username: 'user' });

      // Cache hits
      cacheManager.get(key1);
      cacheManager.get(key1);

      // Cache miss
      cacheManager.get('non-existent');

      const stats = cacheManager.getStats();
      expect(stats.sets).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(2);

      const hitRate = cacheManager.getHitRate();
      expect(hitRate).toBeCloseTo(0.667, 2); // 2 hits out of 3 total
    });

    it('should handle concurrent cache operations', async () => {
      const promises = [];
      
      // Simulate concurrent Discord API responses being cached
      for (let i = 0; i < 10; i++) {
        const promise = Promise.resolve().then(() => {
          const key = cacheManager.generateKey('guild', `guild-${i}`);
          const data = { id: `guild-${i}`, name: `Guild ${i}` };
          cacheManager.set(key, data);
          return cacheManager.get(key);
        });
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      
      // All operations should succeed
      results.forEach((result, index) => {
        expect(result.hit).toBe(true);
        expect(result.data.id).toBe(`guild-${index}`);
      });

      expect(cacheManager.getStats().size).toBe(10);
    });

    it('should properly clean up resources', () => {
      const testCacheManager = new CacheManager({
        ttl: 1000,
        staleWhileRevalidate: true,
        maxSize: 100,
      });

      // Add some data
      testCacheManager.set('test', { data: 'test' });
      expect(testCacheManager.getStats().size).toBe(1);

      // Destroy should clean up everything
      testCacheManager.destroy();
      expect(testCacheManager.getStats().size).toBe(0);
    });
  });

  describe('Real-world Discord API patterns', () => {
    it('should handle typical Discord API response caching', () => {
      // Simulate caching Discord guilds response
      const discordGuildsResponse = {
        data: [
          {
            id: '123456789012345678',
            name: 'My Awesome Server',
            icon: 'a1b2c3d4e5f6g7h8i9j0',
            owner: true,
            permissions: '2147483647',
            features: ['COMMUNITY', 'NEWS'],
          },
          {
            id: '876543210987654321',
            name: 'Another Server',
            icon: null,
            owner: false,
            permissions: '104324161',
            features: [],
          },
        ],
        cached: false,
        timestamp: Date.now(),
      };

      const key = cacheManager.generateKey('guilds');
      cacheManager.set(key, discordGuildsResponse);

      const cached = cacheManager.get(key);
      expect(cached.hit).toBe(true);
      expect(cached.data.data).toHaveLength(2);
      expect(cached.data.data[0].name).toBe('My Awesome Server');
    });

    it('should handle Discord user profile caching', () => {
      const discordUserResponse = {
        id: '123456789012345678',
        username: 'cooluser',
        discriminator: '1234',
        avatar: 'a1b2c3d4e5f6g7h8i9j0',
        bot: false,
        system: false,
        mfa_enabled: true,
        banner: null,
        accent_color: null,
        locale: 'en-US',
        verified: true,
        email: 'user@example.com',
        flags: 0,
        premium_type: 2,
        public_flags: 0,
      };

      const key = cacheManager.generateKey('user', discordUserResponse.id);
      cacheManager.set(key, discordUserResponse);

      const cached = cacheManager.get(key);
      expect(cached.hit).toBe(true);
      expect(cached.data.username).toBe('cooluser');
      expect(cached.data.verified).toBe(true);
    });
  });
});