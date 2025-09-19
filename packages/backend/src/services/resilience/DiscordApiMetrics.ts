import { logger } from '../../utils/logger';
import { DiscordApiMetrics as IDiscordApiMetrics } from '../DiscordApiClient';

export interface DiscordApiHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastSuccessfulRequest?: number;
  consecutiveFailures: number;
  responseTime?: number;
  rateLimitStatus: {
    isLimited: boolean;
    resetTime?: number;
    remaining?: number;
  };
  errorRate: number;
  details?: string;
}

export interface DiscordApiAlert {
  id: string;
  type: 'high_error_rate' | 'rate_limit_exceeded' | 'consecutive_failures' | 'slow_response' | 'retry_storm';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  timestamp: number;
  resolved: boolean;
  metadata?: Record<string, any>;
}

export interface DiscordApiPerformanceMetrics {
  requestsPerMinute: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  retryRate: number;
  rateLimitHitRate: number;
}

export class DiscordApiMetricsCollector {
  private metrics: IDiscordApiMetrics;
  
  // Memory optimization: Reduce limits in development
  private readonly MAX_RESPONSE_TIMES = process.env.DISABLE_METRICS_COLLECTION === 'true' ? 10 : 100;
  private readonly MAX_REQUEST_TIMESTAMPS = process.env.DISABLE_METRICS_COLLECTION === 'true' ? 10 : 100;
  private readonly MAX_ALERTS = process.env.DISABLE_METRICS_COLLECTION === 'true' ? 5 : 50;

  private responseTimes: number[] = [];
  private requestTimestamps: number[] = [];
  private alerts: DiscordApiAlert[] = [];
  private lastHealthCheck: DiscordApiHealthStatus;
  private consecutiveFailures = 0;
  private lastSuccessfulRequest?: number;
  private cleanupInterval?: NodeJS.Timeout;
  private alertThresholds = {
    errorRate: 0.1, // 10%
    consecutiveFailures: 5,
    slowResponseTime: 5000, // 5 seconds
    retryStormThreshold: 0.5, // 50% of requests being retried
  };

  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      staleHits: 0,
      averageResponseTime: 0,
      errorsByType: {},
      rateLimitHits: 0,
      rateLimitWaitTime: 0,
    };

    this.lastHealthCheck = {
      status: 'healthy',
      consecutiveFailures: 0,
      rateLimitStatus: {
        isLimited: false,
      },
      errorRate: 0,
    };

    // Clean up old data - less frequent in dev mode
    const cleanupInterval = process.env.DISABLE_METRICS_COLLECTION === 'true' ? 
      5 * 60 * 1000 : // 5 minutes for dev
      60 * 1000; // 1 minute for production
    
    this.cleanupInterval = setInterval(() => { 
      this.cleanupOldData(); 
      this.enforceArrayLimits(); 
    }, cleanupInterval);
  }

  /**
   * Record a successful Discord API request
   */
  recordSuccess(responseTime: number, fromCache: boolean = false): void {
    // Skip if metrics collection is disabled
    if (process.env.DISABLE_METRICS_COLLECTION === 'true') return;

    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.consecutiveFailures = 0;
    this.lastSuccessfulRequest = Date.now();

    if (fromCache) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }

    this.recordResponseTime(responseTime);
    this.recordRequestTimestamp();
    this.updateAverageResponseTime(responseTime);

    logger.debug('Discord API success recorded', {
      responseTime,
      fromCache,
      totalRequests: this.metrics.totalRequests,
    });
  }

  /**
   * Record a failed Discord API request
   */
  recordFailure(errorType: string, responseTime?: number): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    this.consecutiveFailures++;

    // Update error counts by type
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;

    if (responseTime) {
      this.recordResponseTime(responseTime);
      this.updateAverageResponseTime(responseTime);
    }

    this.recordRequestTimestamp();

    logger.warn('Discord API failure recorded', {
      errorType,
      responseTime,
      consecutiveFailures: this.consecutiveFailures,
      totalRequests: this.metrics.totalRequests,
    });

    // Check for alerts
    this.checkFailureAlerts(errorType);
  }

  /**
   * Record a retried request
   */
  recordRetry(attempts: number): void {
    this.metrics.retriedRequests++;
    
    logger.debug('Discord API retry recorded', {
      attempts,
      retriedRequests: this.metrics.retriedRequests,
    });

    // Check for retry storm
    this.checkRetryStormAlert();
  }

  /**
   * Record rate limit hit
   */
  recordRateLimit(waitTime: number): void {
    this.metrics.rateLimitHits++;
    this.metrics.rateLimitWaitTime = 
      (this.metrics.rateLimitWaitTime + waitTime) / 2; // Moving average

    logger.warn('Discord API rate limit recorded', {
      waitTime,
      rateLimitHits: this.metrics.rateLimitHits,
      averageWaitTime: this.metrics.rateLimitWaitTime,
    });

    this.checkRateLimitAlert();
  }

  /**
   * Record stale cache hit
   */
  recordStaleHit(): void {
    this.metrics.staleHits++;
    
    logger.debug('Discord API stale cache hit recorded', {
      staleHits: this.metrics.staleHits,
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): IDiscordApiMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): DiscordApiPerformanceMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    // Calculate requests per minute
    const recentRequests = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    const requestsPerMinute = recentRequests.length;

    // Calculate percentiles for recent response times
    const recentResponseTimes = this.responseTimes.slice(-100); // Last 100 requests
    const sortedTimes = [...recentResponseTimes].sort((a, b) => a - b);
    
    const p95ResponseTime = this.calculatePercentile(sortedTimes, 95);
    const p99ResponseTime = this.calculatePercentile(sortedTimes, 99);

    // Calculate rates
    const totalRequests = this.metrics.totalRequests;
    const errorRate = totalRequests > 0 ? this.metrics.failedRequests / totalRequests : 0;
    const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0 
      ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) 
      : 0;
    const retryRate = totalRequests > 0 ? this.metrics.retriedRequests / totalRequests : 0;
    const rateLimitHitRate = totalRequests > 0 ? this.metrics.rateLimitHits / totalRequests : 0;

    return {
      requestsPerMinute,
      averageResponseTime: this.metrics.averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      errorRate,
      cacheHitRate,
      retryRate,
      rateLimitHitRate,
    };
  }

  /**
   * Get Discord API health status
   */
  getHealthStatus(): DiscordApiHealthStatus {
    const performance = this.getPerformanceMetrics();
    const now = Date.now();

    // Determine status based on various factors
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let details = '';

    // Check error rate
    if (performance.errorRate > 0.5) {
      status = 'unhealthy';
      details = `High error rate: ${(performance.errorRate * 100).toFixed(1)}%`;
    } else if (performance.errorRate > 0.2) {
      status = 'degraded';
      details = `Elevated error rate: ${(performance.errorRate * 100).toFixed(1)}%`;
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= 10) {
      status = 'unhealthy';
      details = `${this.consecutiveFailures} consecutive failures`;
    } else if (this.consecutiveFailures >= 5) {
      status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
      details = details || `${this.consecutiveFailures} consecutive failures`;
    }

    // Check response time
    if (performance.averageResponseTime > 10000) {
      status = 'unhealthy';
      details = details || `Very slow response time: ${performance.averageResponseTime.toFixed(0)}ms`;
    } else if (performance.averageResponseTime > 5000) {
      status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
      details = details || `Slow response time: ${performance.averageResponseTime.toFixed(0)}ms`;
    }

    // Check if we haven't had a successful request recently
    const timeSinceLastSuccess = this.lastSuccessfulRequest 
      ? now - this.lastSuccessfulRequest 
      : Infinity;
    
    if (timeSinceLastSuccess > 10 * 60 * 1000) { // 10 minutes
      status = 'unhealthy';
      details = details || 'No successful requests in 10+ minutes';
    } else if (timeSinceLastSuccess > 5 * 60 * 1000) { // 5 minutes
      status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
      details = details || 'No successful requests in 5+ minutes';
    }

    this.lastHealthCheck = {
      status,
      lastSuccessfulRequest: this.lastSuccessfulRequest,
      consecutiveFailures: this.consecutiveFailures,
      responseTime: performance.averageResponseTime,
      rateLimitStatus: {
        isLimited: performance.rateLimitHitRate > 0.1, // More than 10% of requests hit rate limits
        remaining: undefined, // Would need to be updated from actual rate limit headers
      },
      errorRate: performance.errorRate,
      details,
    };

    return this.lastHealthCheck;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): DiscordApiAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(limit: number = 50): DiscordApiAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    logger.info('Discord API alert resolved', { alertId, type: alert.type });
    return true;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      staleHits: 0,
      averageResponseTime: 0,
      errorsByType: {},
      rateLimitHits: 0,
      rateLimitWaitTime: 0,
    };

    this.responseTimes = [];
    this.requestTimestamps = [];
    this.consecutiveFailures = 0;
    this.lastSuccessfulRequest = undefined;

    logger.info('Discord API metrics reset');
  }

  /**
   * Cleanup resources and intervals
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Enforce array size limits to prevent memory leaks
   */
  private enforceArrayLimits(): void {
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes = this.responseTimes.slice(-this.MAX_RESPONSE_TIMES);
    }
    if (this.requestTimestamps.length > this.MAX_REQUEST_TIMESTAMPS) {
      this.requestTimestamps = this.requestTimestamps.slice(-this.MAX_REQUEST_TIMESTAMPS);
    }
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS);
    }
  }

  /**
   * Record response time
   */
  private recordResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);
    this.enforceArrayLimits();
  }

  /**
   * Record request timestamp
   */
  private recordRequestTimestamp(): void {
    this.requestTimestamps.push(Date.now());
    this.enforceArrayLimits();
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(responseTime: number): void {
    const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Check for failure-related alerts
   */
  private checkFailureAlerts(errorType: string): void {
    const performance = this.getPerformanceMetrics();

    // High error rate alert
    if (performance.errorRate > this.alertThresholds.errorRate) {
      this.createAlert(
        'high_error_rate',
        'high',
        `Discord API error rate is ${(performance.errorRate * 100).toFixed(1)}% (threshold: ${(this.alertThresholds.errorRate * 100)}%)`,
        { errorRate: performance.errorRate, errorType }
      );
    }

    // Consecutive failures alert
    if (this.consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
      this.createAlert(
        'consecutive_failures',
        'critical',
        `Discord API has ${this.consecutiveFailures} consecutive failures`,
        { consecutiveFailures: this.consecutiveFailures, errorType }
      );
    }

    // Slow response alert
    if (performance.averageResponseTime > this.alertThresholds.slowResponseTime) {
      this.createAlert(
        'slow_response',
        'medium',
        `Discord API average response time is ${performance.averageResponseTime.toFixed(0)}ms (threshold: ${this.alertThresholds.slowResponseTime}ms)`,
        { averageResponseTime: performance.averageResponseTime }
      );
    }
  }

  /**
   * Check for retry storm alert
   */
  private checkRetryStormAlert(): void {
    const performance = this.getPerformanceMetrics();

    if (performance.retryRate > this.alertThresholds.retryStormThreshold) {
      this.createAlert(
        'retry_storm',
        'high',
        `Discord API retry rate is ${(performance.retryRate * 100).toFixed(1)}% (threshold: ${(this.alertThresholds.retryStormThreshold * 100)}%)`,
        { retryRate: performance.retryRate }
      );
    }
  }

  /**
   * Check for rate limit alert
   */
  private checkRateLimitAlert(): void {
    const performance = this.getPerformanceMetrics();

    if (performance.rateLimitHitRate > 0.05) { // More than 5% of requests hit rate limits
      this.createAlert(
        'rate_limit_exceeded',
        'medium',
        `Discord API rate limit hit rate is ${(performance.rateLimitHitRate * 100).toFixed(1)}%`,
        { rateLimitHitRate: performance.rateLimitHitRate, averageWaitTime: this.metrics.rateLimitWaitTime }
      );
    }
  }

  /**
   * Create an alert
   */
  private createAlert(
    type: DiscordApiAlert['type'],
    severity: DiscordApiAlert['severity'],
    message: string,
    metadata?: Record<string, any>
  ): void {
    // Check if we already have an active alert of this type
    const existingAlert = this.alerts.find(a => a.type === type && !a.resolved);
    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: DiscordApiAlert = {
      id: `discord_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      severity,
      message,
      timestamp: Date.now(),
      resolved: false,
      metadata,
    };

    this.alerts.push(alert);

    logger.warn('Discord API alert created', {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
    });
  }

  /**
   * Clean up old data to prevent memory leaks
   */
  private cleanupOldData(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Clean up old request timestamps
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneHourAgo);

    // Clean up old alerts (keep for 24 hours)
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);

    logger.debug('Discord API metrics cleanup completed', {
      requestTimestamps: this.requestTimestamps.length,
      alerts: this.alerts.length,
    });
  }
}

// Create singleton instance
let _discordApiMetrics: DiscordApiMetricsCollector | null = null;

export const getDiscordApiMetrics = (): DiscordApiMetricsCollector => {
  if (!_discordApiMetrics) {
    _discordApiMetrics = new DiscordApiMetricsCollector();
  }
  return _discordApiMetrics;
};

export const destroyDiscordApiMetrics = (): void => {
  if (_discordApiMetrics) {
    _discordApiMetrics.destroy();
    _discordApiMetrics = null;
  }
};

// For backward compatibility
export const discordApiMetrics = getDiscordApiMetrics();