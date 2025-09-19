import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { DiscordErrorHandler } from '../middleware/discordErrorHandler';
import { RetryManager, RetryResult } from './resilience/RetryManager.js';
import { TimeoutManager } from './resilience/TimeoutManager.js';
import { ErrorClassifier, ClassifiedError } from './resilience/ErrorClassifier.js';
import { ResilienceConfigManager } from './resilience/ResilienceConfig.js';
import { CacheManager, CacheResult, getDiscordCacheManager } from './resilience/CacheManager.js';
import { RateLimitManager } from './resilience/RateLimitManager.js';
import { discordApiMetrics } from './resilience/DiscordApiMetrics.js';
import { discordCoordinator } from '../middleware/discordRateLimit';

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

export interface ApiResponse<T> {
  data: T;
  cached: boolean;
  retryCount: number;
  responseTime: number;
  fromCache?: boolean;
  stale?: boolean;
}

export interface DiscordApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retriedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  staleHits: number;
  averageResponseTime: number;
  errorsByType: Record<string, number>;
  rateLimitHits: number;
  rateLimitWaitTime: number;
}

export class DiscordApiClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly axiosInstance: AxiosInstance;
  private readonly retryManager: RetryManager;
  private readonly timeoutManager: TimeoutManager;
  private readonly configManager: ResilienceConfigManager;
  private readonly cacheManager: CacheManager;
  private readonly rateLimitManager: RateLimitManager;

  constructor() {
    // MEMORY_OPTIMIZED: Reduce memory footprint
    this.clientId = process.env.DISCORD_CLIENT_ID!;
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET!;
    this.redirectUri = process.env.DISCORD_REDIRECT_URI!;

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('Missing Discord OAuth configuration');
    }

    this.configManager = ResilienceConfigManager.getInstance();
    this.rateLimitManager = new RateLimitManager();
    this.retryManager = new RetryManager(this.configManager.getRetryConfig(), this.rateLimitManager);
    this.timeoutManager = new TimeoutManager(this.configManager.getTimeoutConfig());
    this.cacheManager = getDiscordCacheManager();

    // Create axios instance with default configuration
    this.axiosInstance = axios.create({
      baseURL: 'https://discord.com/api',
      timeout: this.configManager.getTimeoutConfig().defaultTimeout,
      headers: {
        'User-Agent': 'ECBot/1.0 (https://ecbot.app)',
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.logRequest(config);
        return config;
      },
      (error) => this.logRequestError(error)
    );

    // Add response interceptor for logging and metrics
    this.axiosInstance.interceptors.response.use(
      (response) => this.logResponse(response),
      (error) => this.logResponseError(error)
    );
  }

  /**
   * Exchange authorization code for Discord access token
   */
  async exchangeCodeForToken(code: string): Promise<AuthTokens> {
    const operation = async (): Promise<AuthTokens> => {
      const controller = this.timeoutManager.createTimeoutController();
      
      const response = await this.axiosInstance.post(
        '/oauth2/token',
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          ...this.timeoutManager.createAxiosTimeoutConfig(),
          signal: controller.signal
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    };

    return this.executeWithResilience(operation, 'exchangeCodeForToken', '/oauth2/token');
  }

  /**
   * Refresh Discord access token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const operation = async (): Promise<AuthTokens> => {
      const controller = this.timeoutManager.createTimeoutController();
      
      const response = await this.axiosInstance.post(
        '/oauth2/token',
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          signal: controller.signal,
          ...this.timeoutManager.createAxiosTimeoutConfig()
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    };

    return this.executeWithResilience(operation, 'refreshAccessToken', '/oauth2/token');
  }

  /**
   * Get Discord user information with caching
   */
  async getDiscordUser(accessToken: string): Promise<DiscordUser> {
    // Generate cache key based on access token hash (for privacy)
    const tokenHash = this.hashToken(accessToken);
    const cacheKey = this.cacheManager.generateKey('user', tokenHash);

    // Try to get from cache first
    const cacheResult: CacheResult<DiscordUser> = this.cacheManager.get(cacheKey);
    
    if (cacheResult.hit && !cacheResult.stale) {
      // Fresh cache hit
      discordApiMetrics.recordSuccess(0, true); // 0ms response time for cache hit
      logger.debug('Discord user cache hit (fresh)', { cacheKey });
      return cacheResult.data!;
    }

    // Cache miss or stale data - try API call
    const operation = async (): Promise<DiscordUser> => {
      const controller = this.timeoutManager.createTimeoutController();
      
        const response = await this.axiosInstance.get('/users/@me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          ...this.timeoutManager.createAxiosTimeoutConfig(),
          signal: controller.signal
        });

      const userData: DiscordUser = {
        id: response.data.id,
        username: response.data.username,
        discriminator: response.data.discriminator,
        avatar: response.data.avatar,
        email: response.data.email,
        verified: response.data.verified,
      };

      // Cache the successful result
      this.cacheManager.set(cacheKey, userData);
      
      return userData;
    };

    try {
      if (cacheResult.stale) {
        discordApiMetrics.recordStaleHit();
        logger.debug('Discord user cache hit (stale), refreshing', { cacheKey });
      }

      return await this.executeWithResilience(operation, 'getDiscordUser', '/users/@me');
    } catch (error) {
      // If API call fails and we have stale data, return it
      if (cacheResult.hit && cacheResult.stale) {
        discordApiMetrics.recordStaleHit();
        logger.warn('Discord user API failed, serving stale cache data', { 
          cacheKey,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return cacheResult.data!;
      }
      
      // No cache data available, re-throw the error
      throw error;
    }
  }

  /**
   * Get Discord user's guilds (servers) with caching and rate limit coordination
   */
  async getDiscordGuilds(accessToken: string, userId?: string): Promise<DiscordGuild[]> {
    // Generate isolated cache key that includes user context
    const cacheKey = this.generateIsolatedCacheKey('guilds', accessToken, userId);

    // Try to get from cache first
    const cacheResult: CacheResult<DiscordGuild[]> = this.cacheManager.get(cacheKey);
    
    if (cacheResult.hit && !cacheResult.stale) {
      // Fresh cache hit
      discordApiMetrics.recordSuccess(0, true); // 0ms response time for cache hit
      logger.debug('Discord guilds cache hit (fresh)', { cacheKey });
      return cacheResult.data!;
    }

    // Use coordinator to prevent duplicate requests
    const coordinatorKey = `guilds_${this.hashToken(accessToken)}`;
    
    try {
      const result = await discordCoordinator.executeRequest(coordinatorKey, async () => {
        // Cache miss or stale data - try API call
        const operation = async (): Promise<DiscordGuild[]> => {
          const controller = this.timeoutManager.createTimeoutController();
          
          const response = await this.axiosInstance.get('/users/@me/guilds', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
            ...this.timeoutManager.createAxiosTimeoutConfig()
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
        };

        if (cacheResult.stale) {
          discordApiMetrics.recordStaleHit();
          logger.debug('Discord guilds cache hit (stale), refreshing', { cacheKey });
        }

        return await this.executeWithResilience(operation, 'getDiscordGuilds', '/users/@me/guilds');
      });

      return result;
    } catch (error) {
      // If API call fails and we have stale data, return it
      if (cacheResult.hit && cacheResult.stale) {
        discordApiMetrics.recordStaleHit();
        logger.warn('Discord guilds API failed, serving stale cache data', { 
          cacheKey,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return cacheResult.data!;
      }
      
      // No cache data available, re-throw the error
      throw error;
    }
  }

  /**
   * Hash access token for cache key generation (privacy protection)
   */
  private hashToken(token: string): string {
    // Use crypto.createHash for secure, collision-resistant hashing
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate isolated cache key that includes user context
   */
  private generateIsolatedCacheKey(baseKey: string, token: string, userId?: string): string {
    const tokenHash = this.hashToken(token);
    const userContext = userId ? `_user_${userId}` : '';
    return `${baseKey}_${tokenHash}${userContext}`;
  }

  /**
   * Get detailed guild information including member count
   * Note: This requires bot permissions to access the guild
   */
  async getGuildDetails(guildId: string, botToken: string): Promise<any> {
    const cacheKey = this.generateIsolatedCacheKey('guild_details', botToken, guildId);

    // Try to get from cache first
    const cacheResult = this.cacheManager.get(cacheKey);
    
    if (cacheResult.hit && !cacheResult.stale) {
      logger.debug('Guild details cache hit (fresh)', { cacheKey, guildId });
      return cacheResult.data!;
    }

    const operation = async () => {
      const controller = this.timeoutManager.createTimeoutController();
      
      try {
        const response = await this.axiosInstance.get(`/guilds/${guildId}`, {
          headers: {
            Authorization: `Bot ${botToken}`,
          },
          ...this.timeoutManager.createAxiosTimeoutConfig(),
          signal: controller.signal
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
        // Handle Discord API errors gracefully
        const errorResult = DiscordErrorHandler.handleDiscordError(error, {
          serverId: guildId,
          endpoint: `/guilds/${guildId}`,
          method: 'GET'
        });

        if (errorResult.shouldRetry === false) {
          // Return a user-friendly error response instead of throwing
          return {
            error: true,
            code: errorResult.error,
            message: errorResult.message,
            serverId: guildId
          };
        }

        // Re-throw retryable errors
        throw error;
      }
    };

    return this.executeWithResilience(operation, 'getGuildDetails', `/guilds/${guildId}`);
  }

  /**
   * Get guild channels (requires bot to be in the guild)
   */
  async getGuildChannels(guildId: string, botToken: string): Promise<any[]> {
    const cacheKey = this.generateIsolatedCacheKey('guild_channels', botToken, guildId);

    // Try to get from cache first
    const cacheResult: CacheResult<any[]> = this.cacheManager.get(cacheKey);
    
    if (cacheResult.hit && !cacheResult.stale) {
      logger.debug('Guild channels cache hit (fresh)', { cacheKey, guildId });
      return cacheResult.data!;
    }

    const operation = async (): Promise<any[]> => {
      const controller = this.timeoutManager.createTimeoutController();
      
      logger.info('Making Discord API request for guild channels', { 
        guildId, 
        endpoint: `/guilds/${guildId}/channels`,
        hasBotToken: !!botToken 
      });
      
      const response = await this.axiosInstance.get(`/guilds/${guildId}/channels`, {
        headers: {
          Authorization: `Bot ${botToken}`,
          'X-RateLimit-Precision': 'millisecond'
        },
        timeout: this.timeoutManager.getTimeoutForOperation('api'),
        signal: controller.signal
      });

      logger.info('Discord API response received', { 
        guildId, 
        status: response.status,
        channelCount: response.data?.length || 0 
      });

      const channelsData = response.data
        .filter((channel: any) => channel.type === 0) // Only text channels
        .map((channel: any) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          position: channel.position,
          parent_id: channel.parent_id
        }))
        .sort((a: any, b: any) => a.position - b.position);

      // Cache the successful result
      this.cacheManager.set(cacheKey, channelsData);
      
      return channelsData;
    };

    return this.executeWithResilience(operation, 'getGuildChannels', `/guilds/${guildId}/channels`);
  }

  /**
   * Get guild members (requires bot to be in the guild)
   * Note: This is rate-limited and requires proper bot permissions
   */
  async getGuildMembers(guildId: string, botToken: string, limit: number = 100): Promise<any[]> {
    const cacheKey = this.generateIsolatedCacheKey('guild_members', botToken, `${guildId}_${limit}`);

    // Try to get from cache first
    const cacheResult = this.cacheManager.get(cacheKey);
    
    if (cacheResult.hit && !cacheResult.stale) {
      logger.debug('Guild members cache hit (fresh)', { cacheKey, guildId });
      return cacheResult.data!;
    }

    const operation = async () => {
      const controller = this.timeoutManager.createTimeoutController();
      
      const response = await this.axiosInstance.get(`/guilds/${guildId}/members`, {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
        params: {
          limit: Math.min(limit, 1000) // Discord API limit is 1000
        },
        signal: controller.signal,
        ...this.timeoutManager.createAxiosTimeoutConfig()
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
      this.cacheManager.set(cacheKey, membersData, 300); // 5 minutes cache
      
      return membersData;
    };

    return this.executeWithResilience(operation, 'getGuildMembers', `/guilds/${guildId}/members`);
  }

  /**
   * Execute operation with resilience features (retry, timeout, rate limiting, logging)
   */
  private async executeWithResilience<T>(
    operation: () => Promise<T>,
    operationName: string,
    endpoint?: string
  ): Promise<T> {
    const startTime = Date.now();

    // Wait for rate limits before attempting the operation
    if (endpoint) {
      const waitTime = this.rateLimitManager.shouldWaitForRateLimit(endpoint);
      if (waitTime > 0) {
        discordApiMetrics.recordRateLimit(waitTime);
        await this.rateLimitManager.waitForRateLimit(endpoint);
      }
    }

    try {
      const result: RetryResult<T> = await this.retryManager.execute(
        operation,
        operationName
      );

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorType = result.error?.code || 'UNKNOWN_ERROR';
        discordApiMetrics.recordFailure(errorType, responseTime);
        throw new Error(result.error?.message || `${operationName} failed after all retries`);
      }

      // Record success
      discordApiMetrics.recordSuccess(responseTime, false);

      // Record retries if any
      if (result.attempts > 1) {
        discordApiMetrics.recordRetry(result.attempts);
      }

      if (this.configManager.isLoggingEnabled('logRequests')) {
        logger.info(`${operationName} completed successfully`, {
          attempts: result.attempts,
          responseTime,
          retried: result.attempts > 1
        });
      }

      return result.data!;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      const classifiedError = ErrorClassifier.logError(error, operationName);
      discordApiMetrics.recordFailure(classifiedError.code || 'UNKNOWN_ERROR', responseTime);
      
      // Record rate limit if this was a rate limit error
      if (classifiedError.statusCode === 429) {
        const rateLimitMetrics = this.rateLimitManager.getMetrics();
        discordApiMetrics.recordRateLimit(rateLimitMetrics.averageWaitTime);
      }
      
      throw error;
    }
  }



  /**
   * Log outgoing requests
   */
  private logRequest(config: any): any {
    if (this.configManager.isLoggingEnabled('logRequests')) {
      logger.info('Discord API request', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        timeout: config.timeout,
        hasAuth: !!config.headers?.Authorization
      });
    }
    return config;
  }

  /**
   * Log request errors
   */
  private logRequestError(error: any): Promise<never> {
    if (this.configManager.isLoggingEnabled('logErrors')) {
      logger.error('Discord API request setup failed', {
        error: error.message,
        code: error.code
      });
    }
    return Promise.reject(error);
  }

  /**
   * Log successful responses and update rate limit state
   */
  private logResponse(response: AxiosResponse): AxiosResponse {
    // Update rate limit state from response headers
    const endpoint = response.config.url || 'unknown';
    this.rateLimitManager.updateRateLimitState(response.headers, endpoint);

    if (this.configManager.isLoggingEnabled('logRequests')) {
      logger.info('Discord API response received', {
        status: response.status,
        statusText: response.statusText,
        url: response.config.url,
        responseTime: response.headers['x-response-time'],
        rateLimit: {
          remaining: response.headers['x-ratelimit-remaining'],
          reset: response.headers['x-ratelimit-reset'],
          resetAfter: response.headers['x-ratelimit-reset-after'],
          bucket: response.headers['x-ratelimit-bucket'],
          global: response.headers['x-ratelimit-global']
        }
      });
    }
    return response;
  }

  /**
   * Log response errors and update rate limit state
   */
  private logResponseError(error: any): Promise<never> {
    // Update rate limit state from error response headers (especially for 429 errors)
    if (error.response?.headers) {
      const endpoint = error.config?.url || 'unknown';
      this.rateLimitManager.updateRateLimitState(error.response.headers, endpoint);
    }

    if (this.configManager.isLoggingEnabled('logErrors')) {
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
          bucket: error.response.headers['x-ratelimit-bucket'],
          global: error.response.headers['x-ratelimit-global']
        };
      } else if (error.request) {
        logData.requestError = 'No response received';
      } else {
        logData.setupError = error.message;
      }

      logger.error('Discord API response error', logData);
    }
    return Promise.reject(error);
  }

  /**
   * Check if user has management permissions for a Discord server
   */
  hasManagementPermissions(guild: DiscordGuild): boolean {
    // Owner always has permissions
    if (guild.owner) return true;
    
    // Check for MANAGE_GUILD or ADMINISTRATOR permissions
    const MANAGE_GUILD = 0x20;
    const ADMINISTRATOR = 0x8;
    const permissions = BigInt(guild.permissions);
    
    return (permissions & BigInt(MANAGE_GUILD)) !== 0n || (permissions & BigInt(ADMINISTRATOR)) !== 0n;
  }

  /**
   * Filter guilds to only include manageable servers
   */
  filterManageableGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
    return guilds.filter(guild => this.hasManagementPermissions(guild));
  }

  /**
   * Get authorization URL for Discord OAuth
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify email guilds',
    });

    if (state) {
      params.append('state', state);
    }

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Get current metrics including cache and rate limit statistics
   */
  getMetrics(): DiscordApiMetrics & { cache: any; rateLimit: any; health: any; performance: any } {
    const cacheStats = this.cacheManager.getStats();
    const rateLimitMetrics = this.rateLimitManager.getMetrics();
    const apiMetrics = discordApiMetrics.getMetrics();
    const healthStatus = discordApiMetrics.getHealthStatus();
    const performance = discordApiMetrics.getPerformanceMetrics();
    
    return { 
      ...apiMetrics,
      cache: {
        ...cacheStats,
        hitRate: this.cacheManager.getHitRate()
      },
      rateLimit: rateLimitMetrics,
      health: healthStatus,
      performance
    };
  }

  /**
   * Reset metrics including cache and rate limit statistics
   */
  resetMetrics(): void {
    discordApiMetrics.resetMetrics();
    
    // Reset cache and rate limit statistics
    this.cacheManager.resetStats();
    this.rateLimitManager.resetMetrics();
    
    logger.info('Discord API metrics reset');
  }

  /**
   * Invalidate cache for a specific user (by token hash)
   */
  invalidateUserCache(accessToken: string): void {
    const tokenHash = this.hashToken(accessToken);
    const userKey = this.cacheManager.generateKey('user', tokenHash);
    const guildsKey = this.cacheManager.generateKey('guilds', tokenHash);
    
    this.cacheManager.delete(userKey);
    this.cacheManager.delete(guildsKey);
    
    logger.debug('Invalidated Discord cache for user', { tokenHash });
  }

  /**
   * Clear all Discord cache data
   */
  clearCache(): void {
    this.cacheManager.clear();
    logger.info('Discord API cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Get rate limit statistics
   */
  getRateLimitStats() {
    return this.rateLimitManager.getMetrics();
  }

  /**
   * Get current rate limit status for all endpoints
   */
  getRateLimitStatus() {
    return this.rateLimitManager.getAllRateLimitStates();
  }

  /**
   * Check if approaching rate limit for a specific endpoint
   */
  isApproachingRateLimit(endpoint: string, threshold?: number): boolean {
    return this.rateLimitManager.isApproachingRateLimit(endpoint, threshold);
  }

  /**
   * Log current rate limit status for monitoring
   */
  logRateLimitStatus(): void {
    this.rateLimitManager.logRateLimitStatus();
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: any): void {
    this.configManager.updateConfig(updates);
    this.retryManager.updateConfig(this.configManager.getRetryConfig());
    this.timeoutManager.updateConfig(this.configManager.getTimeoutConfig());
    
    // Update axios timeout
    this.axiosInstance.defaults.timeout = this.configManager.getTimeoutConfig().defaultTimeout;
    
    logger.info('DiscordApiClient configuration updated');
  }
}