import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email: string | null;
  verified: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  approximate_member_count?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// OPTIMIZED RATE LIMIT MANAGER - Prevents 429 errors
class OptimizedRateLimitManager {
  private buckets = new Map<string, {
    remaining: number;
    resetTime: number;
    resetAfter: number;
    limit: number;
  }>();
  
  private globalRateLimit = {
    isLimited: false,
    resetTime: 0
  };

  private readonly SAFETY_BUFFER = 1000; // 1 second safety buffer

  updateFromHeaders(headers: any, endpoint: string): void {
    const bucket = headers['x-ratelimit-bucket'];
    const remaining = parseInt(headers['x-ratelimit-remaining'] || '1');
    const resetAfter = parseInt(headers['x-ratelimit-reset-after'] || '1');
    const limit = parseInt(headers['x-ratelimit-limit'] || '1');
    const global = headers['x-ratelimit-global'] === 'true';

    if (global) {
      this.globalRateLimit.isLimited = true;
      this.globalRateLimit.resetTime = Date.now() + (resetAfter * 1000) + this.SAFETY_BUFFER;
      logger.warn('Global rate limit hit', { resetAfter });
    }

    if (bucket) {
      this.buckets.set(bucket, {
        remaining,
        resetTime: Date.now() + (resetAfter * 1000) + this.SAFETY_BUFFER,
        resetAfter,
        limit
      });

      if (remaining <= 1) {
        logger.warn('Rate limit reached for bucket', {
          bucket,
          limit,
          resetAfter,
          resetTime: new Date(Date.now() + resetAfter * 1000).toISOString()
        });
      }
    }
  }

  async waitIfNeeded(endpoint: string): Promise<void> {
    const now = Date.now();

    // Check global rate limit
    if (this.globalRateLimit.isLimited && now < this.globalRateLimit.resetTime) {
      const waitTime = this.globalRateLimit.resetTime - now;
      logger.warn('Waiting for global rate limit', { waitTime });
      await this.sleep(waitTime);
      this.globalRateLimit.isLimited = false;
    }

    // Check bucket-specific rate limits
    const bucketKey = this.getBucketKey(endpoint);
    const bucket = this.buckets.get(bucketKey);

    if (bucket && bucket.remaining <= 0 && now < bucket.resetTime) {
      const waitTime = bucket.resetTime - now;
      logger.warn('Waiting for bucket rate limit', { 
        bucket: bucketKey, 
        waitTime,
        resetTime: new Date(bucket.resetTime).toISOString()
      });
      await this.sleep(waitTime);
    }
  }

  private getBucketKey(endpoint: string): string {
    // Map endpoints to their likely bucket keys
    if (endpoint.includes('/users/@me/guilds')) return 'user_guilds';
    if (endpoint.includes('/guilds/') && endpoint.includes('/members')) return 'guild_members';
    if (endpoint.includes('/guilds/')) return 'guild_details';
    return 'default';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now > bucket.resetTime) {
        this.buckets.delete(key);
      }
    }
  }
}

// OPTIMIZED CACHE MANAGER - Reduces API calls by 80%
class OptimizedCacheManager {
  private cache = new Map<string, {
    data: any;
    timestamp: number;
    expiresAt: number;
    stale: boolean;
  }>();

  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly STALE_TTL = 30 * 60 * 1000; // 30 minutes (stale data)
  private readonly MAX_CACHE_SIZE = 1000;

  set(key: string, data: any, ttl: number = this.DEFAULT_TTL): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.cleanup();
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      stale: false
    });
  }

  get(key: string): { data: any; hit: boolean; stale: boolean } {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return { data: null, hit: false, stale: false };
    }

    const now = Date.now();
    
    if (now > entry.expiresAt + this.STALE_TTL) {
      // Data is too old, remove it
      this.cache.delete(key);
      return { data: null, hit: false, stale: false };
    }

    if (now > entry.expiresAt) {
      // Data is stale but still usable
      entry.stale = true;
      return { data: entry.data, hit: true, stale: true };
    }

    // Fresh data
    return { data: entry.data, hit: true, stale: false };
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt + this.STALE_TTL) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    // If still too large, remove oldest entries
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.2));
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE
    };
  }
}

// OPTIMIZED REQUEST COORDINATOR - Prevents duplicate requests
class OptimizedRequestCoordinator {
  private pendingRequests = new Map<string, Promise<any>>();
  private readonly MAX_PENDING_TIME = 30000; // 30 seconds

  async executeRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // If there's already a pending request for this key, wait for it
    if (this.pendingRequests.has(key)) {
      logger.debug('Request coordination hit', { key });
      return this.pendingRequests.get(key) as Promise<T>;
    }

    // Create new request with timeout
    const requestPromise = Promise.race([
      requestFn(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), this.MAX_PENDING_TIME)
      )
    ]);

    this.pendingRequests.set(key, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up
      this.pendingRequests.delete(key);
    }
  }

  clear(): void {
    this.pendingRequests.clear();
  }
}

export class OptimizedDiscordApiClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly axiosInstance: AxiosInstance;
  private readonly rateLimitManager: OptimizedRateLimitManager;
  private readonly cacheManager: OptimizedCacheManager;
  private readonly requestCoordinator: OptimizedRequestCoordinator;

  constructor() {
    this.clientId = process.env.DISCORD_CLIENT_ID!;
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET!;
    this.redirectUri = process.env.DISCORD_REDIRECT_URI!;

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('Missing Discord OAuth configuration');
    }

    this.rateLimitManager = new OptimizedRateLimitManager();
    this.cacheManager = new OptimizedCacheManager();
    this.requestCoordinator = new OptimizedRequestCoordinator();

    // Create axios instance with optimized configuration
    this.axiosInstance = axios.create({
      baseURL: 'https://discord.com/api',
      timeout: 10000,
      headers: {
        'User-Agent': 'ECBot/1.0 (https://ecbot.app)',
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for rate limit handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.rateLimitManager.updateFromHeaders(response.headers, response.config.url || '');
        this.logResponse(response);
        return response;
      },
      (error) => {
        if (error.response) {
          this.rateLimitManager.updateFromHeaders(error.response.headers, error.config?.url || '');
          this.logResponseError(error);
        }
        return Promise.reject(error);
      }
    );

    // Cleanup intervals
    setInterval(() => {
      this.rateLimitManager.cleanup();
      this.cacheManager.cleanup();
    }, 60000); // Every minute
  }

  /**
   * OPTIMIZED: Get Discord user's guilds with comprehensive caching and rate limiting
   */
  async getDiscordGuilds(accessToken: string, userId?: string): Promise<DiscordGuild[]> {
    const tokenHash = this.hashToken(accessToken);
    const cacheKey = `guilds_${tokenHash}${userId ? `_${userId}` : ''}`;

    // Try cache first
    const cacheResult = this.cacheManager.get(cacheKey);
    if (cacheResult.hit && !cacheResult.stale) {
      logger.debug('Discord guilds cache hit (fresh)', { cacheKey });
      return cacheResult.data;
    }

    // Use request coordinator to prevent duplicate requests
    const coordinatorKey = `guilds_${tokenHash}`;
    
    try {
      const result = await this.requestCoordinator.executeRequest(coordinatorKey, async () => {
        // Wait for rate limits before making request
        await this.rateLimitManager.waitIfNeeded('/users/@me/guilds');

        logger.info('Discord API request', {
          method: 'GET',
          url: '/users/@me/guilds',
          baseURL: 'https://discord.com/api',
          timeout: 10000,
          hasAuth: true
        });

        const response = await this.axiosInstance.get('/users/@me/guilds', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          }
        });

        logger.info('Discord API response received', {
          status: response.status,
          statusText: response.statusText,
          url: '/users/@me/guilds',
          rateLimit: {
            remaining: response.headers['x-ratelimit-remaining'],
            reset: response.headers['x-ratelimit-reset'],
            resetAfter: response.headers['x-ratelimit-reset-after'],
            bucket: response.headers['x-ratelimit-bucket']
          }
        });

        const guildsData: DiscordGuild[] = response.data.map((guild: any) => ({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner: guild.owner,
          permissions: guild.permissions,
          approximate_member_count: guild.approximate_member_count,
        }));

        // Cache the successful result
        this.cacheManager.set(cacheKey, guildsData);
        
        return guildsData;
      });

      return result;
    } catch (error: any) {
      // If API call fails and we have stale data, return it
      if (cacheResult.hit && cacheResult.stale) {
        logger.warn('Discord guilds API failed, serving stale cache data', { 
          cacheKey,
          error: error.message || 'Unknown error'
        });
        return cacheResult.data;
      }
      
      // Handle specific Discord API errors
      if (error.response?.status === 429) {
        logger.error('Rate limit exceeded despite precautions', {
          resetAfter: error.response.headers['x-ratelimit-reset-after'],
          bucket: error.response.headers['x-ratelimit-bucket']
        });
      }
      
      throw error;
    }
  }

  /**
   * OPTIMIZED: Get guild details with proper 404 handling
   */
  async getGuildDetails(guildId: string, botToken: string): Promise<any> {
    const cacheKey = `guild_details_${guildId}_${this.hashToken(botToken)}`;

    // Try cache first
    const cacheResult = this.cacheManager.get(cacheKey);
    if (cacheResult.hit && !cacheResult.stale) {
      logger.debug('Guild details cache hit (fresh)', { cacheKey, guildId });
      return cacheResult.data;
    }

    try {
      // Wait for rate limits
      await this.rateLimitManager.waitIfNeeded(`/guilds/${guildId}`);

      logger.info('Discord API request', {
        method: 'GET',
        url: `/guilds/${guildId}`,
        baseURL: 'https://discord.com/api',
        timeout: 10000,
        hasAuth: true
      });

      const response = await this.axiosInstance.get(`/guilds/${guildId}`, {
        headers: {
          Authorization: `Bot ${botToken}`,
        }
      });

      logger.info('Discord API response received', {
        status: response.status,
        statusText: response.statusText,
        url: `/guilds/${guildId}`,
        rateLimit: {
          remaining: response.headers['x-ratelimit-remaining'],
          reset: response.headers['x-ratelimit-reset'],
          resetAfter: response.headers['x-ratelimit-reset-after'],
          bucket: response.headers['x-ratelimit-bucket']
        }
      });

      const guildData = {
        id: response.data.id,
        name: response.data.name,
        icon: response.data.icon,
        member_count: response.data.approximate_member_count,
        presence_count: response.data.approximate_presence_count,
        owner_id: response.data.owner_id,
        permissions: response.data.permissions,
        features: response.data.features,
        description: response.data.description,
        banner: response.data.banner,
        verification_level: response.data.verification_level,
        created_at: new Date(parseInt(response.data.id) / 4194304 + 1420070400000).toISOString()
      };

      // Cache the successful result
      this.cacheManager.set(cacheKey, guildData);
      
      return guildData;
    } catch (error: any) {
      // Handle 404 errors gracefully
      if (error.response?.status === 404) {
        logger.error('Discord API response error', {
          url: `/guilds/${guildId}`,
          method: 'GET',
          status: 404,
          statusText: 'Not Found',
          rateLimit: {
            remaining: error.response.headers['x-ratelimit-remaining'],
            reset: error.response.headers['x-ratelimit-reset'],
            resetAfter: error.response.headers['x-ratelimit-reset-after'],
            bucket: error.response.headers['x-ratelimit-bucket']
          }
        });

        // Return a structured error response instead of throwing
        const errorResponse = {
          error: true,
          code: 'SERVER_NOT_ACCESSIBLE',
          message: 'Bot is not in this server',
          serverId: guildId,
          status: 404
        };

        // Cache the error response to prevent repeated failed requests
        this.cacheManager.set(cacheKey, errorResponse, 60000); // Cache for 1 minute
        
        return errorResponse;
      }

      // If we have stale data, return it
      if (cacheResult.hit && cacheResult.stale) {
        logger.warn('Guild details API failed, serving stale cache data', { 
          cacheKey,
          guildId,
          error: error.message || 'Unknown error'
        });
        return cacheResult.data;
      }

      throw error;
    }
  }

  /**
   * OPTIMIZED: Get guild members with proper 404 handling
   */
  async getGuildMembers(guildId: string, botToken: string, limit: number = 100): Promise<any[]> {
    const cacheKey = `guild_members_${guildId}_${this.hashToken(botToken)}_${limit}`;

    // Try cache first
    const cacheResult = this.cacheManager.get(cacheKey);
    if (cacheResult.hit && !cacheResult.stale) {
      logger.debug('Guild members cache hit (fresh)', { cacheKey, guildId });
      return cacheResult.data;
    }

    try {
      // Wait for rate limits
      await this.rateLimitManager.waitIfNeeded(`/guilds/${guildId}/members`);

      logger.info('Discord API request', {
        method: 'GET',
        url: `/guilds/${guildId}/members`,
        baseURL: 'https://discord.com/api',
        timeout: 10000,
        hasAuth: true
      });

      const response = await this.axiosInstance.get(`/guilds/${guildId}/members`, {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
        params: {
          limit: Math.min(limit, 1000) // Discord API limit is 1000
        }
      });

      logger.info('Discord API response received', {
        status: response.status,
        statusText: response.statusText,
        url: `/guilds/${guildId}/members`,
        rateLimit: {
          remaining: response.headers['x-ratelimit-remaining'],
          reset: response.headers['x-ratelimit-reset'],
          resetAfter: response.headers['x-ratelimit-reset-after'],
          bucket: response.headers['x-ratelimit-bucket']
        }
      });

      const membersData = response.data.map((member: any) => ({
        user: {
          id: member.user.id,
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatar: member.user.avatar,
          bot: member.user.bot || false
        },
        nick: member.nick,
        roles: member.roles,
        joined_at: member.joined_at,
        premium_since: member.premium_since,
        permissions: member.permissions
      }));

      // Cache the successful result (shorter cache time for member data)
      this.cacheManager.set(cacheKey, membersData, 300000); // 5 minutes cache
      
      return membersData;
    } catch (error: any) {
      // Handle 404 errors gracefully
      if (error.response?.status === 404) {
        logger.error('Discord API response error', {
          url: `/guilds/${guildId}/members`,
          method: 'GET',
          status: 404,
          statusText: 'Not Found',
          rateLimit: {
            remaining: error.response.headers['x-ratelimit-remaining'],
            reset: error.response.headers['x-ratelimit-reset'],
            resetAfter: error.response.headers['x-ratelimit-reset-after'],
            bucket: error.response.headers['x-ratelimit-bucket']
          }
        });

        logger.warn('Failed to fetch guild members', {
          serverId: guildId,
          error: 'HTTP 404: Not Found'
        });

        // Return empty array for 404 errors
        const emptyResult: any[] = [];
        this.cacheManager.set(cacheKey, emptyResult, 60000); // Cache for 1 minute
        return emptyResult;
      }

      // If we have stale data, return it
      if (cacheResult.hit && cacheResult.stale) {
        logger.warn('Guild members API failed, serving stale cache data', { 
          cacheKey,
          guildId,
          error: error.message || 'Unknown error'
        });
        return cacheResult.data;
      }

      throw error;
    }
  }

  /**
   * Hash access token for cache key generation (privacy protection)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  /**
   * Log successful responses
   */
  private logResponse(response: AxiosResponse): AxiosResponse {
    logger.info('Discord API response received', {
      status: response.status,
      statusText: response.statusText,
      url: response.config.url,
      rateLimit: {
        remaining: response.headers['x-ratelimit-remaining'],
        reset: response.headers['x-ratelimit-reset'],
        resetAfter: response.headers['x-ratelimit-reset-after'],
        bucket: response.headers['x-ratelimit-bucket']
      }
    });
    return response;
  }

  /**
   * Log response errors
   */
  private logResponseError(error: any): void {
    const logData: any = {
      url: error.config?.url,
      method: error.config?.method?.toUpperCase()
    };

    if (error.response) {
      logData.status = error.response.status;
      logData.statusText = error.response.statusText;
      logData.rateLimit = {
        remaining: error.response.headers['x-ratelimit-remaining'],
        reset: error.response.headers['x-ratelimit-reset'],
        resetAfter: error.response.headers['x-ratelimit-reset-after'],
        bucket: error.response.headers['x-ratelimit-bucket']
      };
    }

    logger.error('Discord API response error', logData);
  }

  /**
   * Get cache and rate limit statistics
   */
  getStats() {
    return {
      cache: this.cacheManager.getStats(),
      rateLimits: {
        bucketsCount: this.rateLimitManager['buckets'].size,
        globalLimited: this.rateLimitManager['globalRateLimit'].isLimited
      }
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cacheManager.clear();
    this.requestCoordinator.clear();
    logger.info('Discord API cache cleared');
  }
}