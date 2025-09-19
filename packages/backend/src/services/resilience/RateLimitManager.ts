import { logger } from '../../utils/logger';

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  resetAfter: number;
  bucket?: string;
  global?: boolean;
}

export interface RateLimitState {
  bucket: string;
  limit: number;
  remaining: number;
  resetTime: number;
  resetAfter: number;
  global: boolean;
}

export interface RateLimitMetrics {
  totalRateLimits: number;
  globalRateLimits: number;
  bucketRateLimits: Record<string, number>;
  averageWaitTime: number;
  longestWaitTime: number;
  rateLimitsByEndpoint: Record<string, number>;
}

export class RateLimitManager {
  private rateLimitStates: Map<string, RateLimitState> = new Map();
  private globalRateLimit: RateLimitState | null = null;
  private metrics: RateLimitMetrics;

  constructor() {
    this.metrics = {
      totalRateLimits: 0,
      globalRateLimits: 0,
      bucketRateLimits: {},
      averageWaitTime: 0,
      longestWaitTime: 0,
      rateLimitsByEndpoint: {}
    };
  }

  /**
   * Parse rate limit headers from Discord API response
   */
  parseRateLimitHeaders(headers: Record<string, any>): RateLimitInfo | null {
    // Discord rate limit headers
    const limit = headers['x-ratelimit-limit'];
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    const resetAfter = headers['x-ratelimit-reset-after'];
    const bucket = headers['x-ratelimit-bucket'];
    const global = headers['x-ratelimit-global'];

    // Also check for Retry-After header (used in 429 responses)
    const retryAfter = headers['retry-after'];

    if (!limit && !retryAfter && !resetAfter) {
      return null;
    }

    return {
      limit: limit ? parseInt(limit) || 0 : 0,
      remaining: remaining ? parseInt(remaining) || 0 : 0,
      reset: reset ? parseFloat(reset) || 0 : 0,
      resetAfter: resetAfter ? parseFloat(resetAfter) || 0 : (retryAfter ? parseFloat(retryAfter) || 0 : 0),
      bucket: bucket ? String(bucket) : 'unknown',
      global: global === 'true' || global === true
    };
  }

  /**
   * Update rate limit state from response headers
   */
  updateRateLimitState(headers: Record<string, any>, endpoint: string): void {
    const rateLimitInfo = this.parseRateLimitHeaders(headers);
    
    if (!rateLimitInfo) {
      return;
    }

    const bucket = rateLimitInfo.bucket !== 'unknown' ? rateLimitInfo.bucket : this.getBucketForEndpoint(endpoint);
    const resetTime = Date.now() + (rateLimitInfo.resetAfter * 1000);

    const state: RateLimitState = {
      bucket,
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.remaining,
      resetTime,
      resetAfter: rateLimitInfo.resetAfter,
      global: rateLimitInfo.global || false
    };

    if (state.global) {
      this.globalRateLimit = { ...state, bucket: 'global' };
      logger.warn('Global rate limit detected', {
        resetAfter: state.resetAfter,
        resetTime: new Date(state.resetTime).toISOString()
      });
    } else {
      this.rateLimitStates.set(bucket, state);
      
      if (state.remaining === 0) {
        // Only log in development if not disabled
        if (process.env.DISABLE_HEAVY_LOGGING !== 'true') {
          logger.warn('Rate limit reached for bucket', {
            bucket,
            limit: state.limit,
            resetAfter: state.resetAfter,
            resetTime: new Date(state.resetTime).toISOString()
          });
        }
      } else {
        logger.debug('Rate limit state updated', {
          bucket,
          remaining: state.remaining,
          limit: state.limit
        });
      }
    }
  }

  /**
   * Handle rate limit error (429 response)
   */
  handleRateLimitError(error: any, endpoint: string): number {
    const headers = error.response?.headers || {};
    const rateLimitInfo = this.parseRateLimitHeaders(headers);
    
    if (!rateLimitInfo) {
      // Fallback delay if no rate limit info available
      logger.warn('Rate limit error without proper headers', { endpoint });
      // Still update metrics for fallback case
      this.metrics.totalRateLimits++;
      this.metrics.rateLimitsByEndpoint[endpoint] = (this.metrics.rateLimitsByEndpoint[endpoint] || 0) + 1;
      const fallbackWaitTime = 2000; // Increased from 1s to 2s
      this.updateWaitTimeMetrics(fallbackWaitTime);
      return fallbackWaitTime;
    }

    // Update metrics
    this.metrics.totalRateLimits++;
    
    const bucket = rateLimitInfo.bucket !== 'unknown' ? rateLimitInfo.bucket : this.getBucketForEndpoint(endpoint);
    // Add buffer time to prevent immediate re-rate limiting
    const waitTime = Math.max((rateLimitInfo.resetAfter * 1000) + 500, 1000); // Add 500ms buffer, minimum 1s
    
    if (rateLimitInfo.global) {
      this.metrics.globalRateLimits++;
      this.globalRateLimit = {
        bucket: 'global',
        limit: rateLimitInfo.limit,
        remaining: 0,
        resetTime: Date.now() + waitTime,
        resetAfter: rateLimitInfo.resetAfter,
        global: true
      };
      
      logger.warn('Global rate limit hit', {
        endpoint,
        waitTimeMs: waitTime,
        resetAfter: rateLimitInfo.resetAfter
      });
    } else {
      this.metrics.bucketRateLimits[bucket] = (this.metrics.bucketRateLimits[bucket] || 0) + 1;
      this.rateLimitStates.set(bucket, {
        bucket,
        limit: rateLimitInfo.limit,
        remaining: 0,
        resetTime: Date.now() + waitTime,
        resetAfter: rateLimitInfo.resetAfter,
        global: false
      });
      
      logger.warn('Bucket rate limit hit', {
        endpoint,
        bucket,
        waitTimeMs: waitTime,
        resetAfter: rateLimitInfo.resetAfter
      });
    }

    // Update endpoint-specific metrics
    this.metrics.rateLimitsByEndpoint[endpoint] = (this.metrics.rateLimitsByEndpoint[endpoint] || 0) + 1;
    
    // Update wait time metrics
    this.updateWaitTimeMetrics(waitTime);
    
    return waitTime;
  }

  /**
   * Check if we should wait before making a request
   */
  shouldWaitForRateLimit(endpoint: string): number {
    const now = Date.now();
    
    // Check global rate limit first
    if (this.globalRateLimit && this.globalRateLimit.resetTime > now) {
      const waitTime = this.globalRateLimit.resetTime - now;
      logger.info('Waiting for global rate limit reset', {
        waitTimeMs: waitTime,
        resetTime: new Date(this.globalRateLimit.resetTime).toISOString()
      });
      return waitTime;
    }

    // Clear expired global rate limit
    if (this.globalRateLimit && this.globalRateLimit.resetTime <= now) {
      logger.info('Global rate limit expired');
      this.globalRateLimit = null;
    }

    // Check bucket-specific rate limit
    const bucket = this.getBucketForEndpoint(endpoint);
    const bucketState = this.rateLimitStates.get(bucket);
    
    if (bucketState && bucketState.remaining === 0 && bucketState.resetTime > now) {
      const waitTime = bucketState.resetTime - now;
      logger.info('Waiting for bucket rate limit reset', {
        bucket,
        endpoint,
        waitTimeMs: waitTime,
        resetTime: new Date(bucketState.resetTime).toISOString()
      });
      return waitTime;
    }

    // Clear expired bucket rate limit
    if (bucketState && bucketState.resetTime <= now) {
      logger.debug('Bucket rate limit expired', { bucket, endpoint });
      this.rateLimitStates.delete(bucket);
    }

    return 0;
  }

  /**
   * Wait for rate limit to reset if necessary
   */
  async waitForRateLimit(endpoint: string): Promise<void> {
    const waitTime = this.shouldWaitForRateLimit(endpoint);
    
    if (waitTime > 0) {
      logger.info('Waiting for rate limit reset', {
        endpoint,
        waitTimeMs: waitTime
      });
      
      await this.sleep(waitTime);
      
      logger.info('Rate limit wait completed', {
        endpoint,
        waitedMs: waitTime
      });
    }
  }

  /**
   * Check if we're approaching rate limit for proactive throttling
   */
  isApproachingRateLimit(endpoint: string, threshold: number = 0.1): boolean {
    const bucket = this.getBucketForEndpoint(endpoint);
    const bucketState = this.rateLimitStates.get(bucket);
    
    if (!bucketState || bucketState.limit === 0) {
      return false;
    }
    
    const usageRatio = (bucketState.limit - bucketState.remaining) / bucketState.limit;
    const approaching = usageRatio >= (1 - threshold);
    
    if (approaching) {
      logger.warn('Approaching rate limit threshold', {
        bucket,
        endpoint,
        remaining: bucketState.remaining,
        limit: bucketState.limit,
        usageRatio: usageRatio.toFixed(2),
        threshold
      });
    }
    
    return approaching;
  }

  /**
   * Get current rate limit status for an endpoint
   */
  getRateLimitStatus(endpoint: string): RateLimitState | null {
    // Check global rate limit first
    if (this.globalRateLimit) {
      return this.globalRateLimit;
    }
    
    const bucket = this.getBucketForEndpoint(endpoint);
    return this.rateLimitStates.get(bucket) || null;
  }

  /**
   * Get all current rate limit states
   */
  getAllRateLimitStates(): { global: RateLimitState | null; buckets: Record<string, RateLimitState> } {
    const buckets: Record<string, RateLimitState> = {};
    
    for (const [bucket, state] of this.rateLimitStates.entries()) {
      buckets[bucket] = state;
    }
    
    return {
      global: this.globalRateLimit,
      buckets
    };
  }

  /**
   * Get rate limit metrics
   */
  getMetrics(): RateLimitMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset rate limit metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRateLimits: 0,
      globalRateLimits: 0,
      bucketRateLimits: {},
      averageWaitTime: 0,
      longestWaitTime: 0,
      rateLimitsByEndpoint: {}
    };
    
    logger.info('Rate limit metrics reset');
  }

  /**
   * Clear all rate limit states (for testing or reset)
   */
  clearRateLimitStates(): void {
    this.rateLimitStates.clear();
    this.globalRateLimit = null;
    logger.info('All rate limit states cleared');
  }

  /**
   * Get bucket identifier for an endpoint
   */
  private getBucketForEndpoint(endpoint: string): string {
    // Discord uses different buckets for different endpoints
    // This is a simplified mapping - in practice, Discord provides the bucket in headers
    
    if (endpoint.includes('/users/@me/guilds')) {
      return 'b353d78ff3f98f77197d13d44ed4c164'; // Known bucket from logs
    }
    
    if (endpoint.includes('/users/@me')) {
      return 'user-me';
    }
    
    if (endpoint.includes('/oauth2/token')) {
      return 'oauth-token';
    }
    
    if (endpoint.includes('/guilds/') && endpoint.includes('/channels')) {
      return 'a66d55b18e9649f0915c93ce4c0677af'; // Known bucket from logs
    }
    
    if (endpoint.includes('/guilds/') && endpoint.includes('/members')) {
      return 'guild-members';
    }
    
    if (endpoint.includes('/guilds/')) {
      return 'guild-info';
    }
    
    // Default bucket based on endpoint path
    return endpoint.replace(/\/\d+/g, '/:id'); // Replace IDs with placeholder
  }

  /**
   * Update wait time metrics
   */
  private updateWaitTimeMetrics(waitTime: number): void {
    if (waitTime > this.metrics.longestWaitTime) {
      this.metrics.longestWaitTime = waitTime;
    }
    
    // Update average wait time
    const totalRateLimits = this.metrics.totalRateLimits;
    this.metrics.averageWaitTime = 
      (this.metrics.averageWaitTime * (totalRateLimits - 1) + waitTime) / totalRateLimits;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log current rate limit status for monitoring
   */
  logRateLimitStatus(): void {
    const status = this.getAllRateLimitStates();
    
    logger.info('Current rate limit status', {
      globalRateLimit: status.global ? {
        remaining: status.global.remaining,
        resetTime: new Date(status.global.resetTime).toISOString(),
        resetAfter: status.global.resetAfter
      } : null,
      bucketCount: Object.keys(status.buckets).length,
      buckets: Object.entries(status.buckets).map(([bucket, state]) => ({
        bucket,
        remaining: state.remaining,
        limit: state.limit,
        resetTime: new Date(state.resetTime).toISOString()
      })),
      metrics: this.metrics
    });
  }
}