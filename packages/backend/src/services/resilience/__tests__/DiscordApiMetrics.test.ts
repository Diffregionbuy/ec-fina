import { DiscordApiMetricsCollector } from '../DiscordApiMetrics';

describe('DiscordApiMetricsCollector', () => {
  let metricsCollector: DiscordApiMetricsCollector;

  beforeEach(() => {
    metricsCollector = new DiscordApiMetricsCollector();
  });

  afterEach(() => {
    metricsCollector.destroy();
  });

  describe('recordSuccess', () => {
    it('should record successful requests correctly', () => {
      metricsCollector.recordSuccess(100, false);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.averageResponseTime).toBe(100);
    });

    it('should record cache hits correctly', () => {
      metricsCollector.recordSuccess(50, true);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(0);
    });

    it('should reset consecutive failures on success', () => {
      // Record some failures first
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      
      // Then record success
      metricsCollector.recordSuccess(100);
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.consecutiveFailures).toBe(0);
    });

    it('should update average response time correctly', () => {
      metricsCollector.recordSuccess(100);
      metricsCollector.recordSuccess(200);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.averageResponseTime).toBe(150);
    });
  });

  describe('recordFailure', () => {
    it('should record failed requests correctly', () => {
      metricsCollector.recordFailure('HTTP_503', 1000);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.errorsByType['HTTP_503']).toBe(1);
      expect(metrics.averageResponseTime).toBe(1000);
    });

    it('should increment consecutive failures', () => {
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_502');
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.consecutiveFailures).toBe(2);
    });

    it('should track different error types', () => {
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_502');
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.errorsByType['HTTP_503']).toBe(2);
      expect(metrics.errorsByType['HTTP_502']).toBe(1);
    });
  });

  describe('recordRetry', () => {
    it('should record retried requests', () => {
      metricsCollector.recordRetry(3);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.retriedRequests).toBe(1);
    });
  });

  describe('recordRateLimit', () => {
    it('should record rate limit hits', () => {
      metricsCollector.recordRateLimit(5000);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.rateLimitHits).toBe(1);
      expect(metrics.rateLimitWaitTime).toBe(5000);
    });

    it('should calculate moving average of wait times', () => {
      metricsCollector.recordRateLimit(4000);
      metricsCollector.recordRateLimit(6000);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.rateLimitHits).toBe(2);
      expect(metrics.rateLimitWaitTime).toBe(5000); // (4000 + 6000) / 2
    });
  });

  describe('recordStaleHit', () => {
    it('should record stale cache hits', () => {
      metricsCollector.recordStaleHit();
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.staleHits).toBe(1);
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should calculate error rate correctly', () => {
      metricsCollector.recordSuccess(100);
      metricsCollector.recordSuccess(100);
      metricsCollector.recordFailure('HTTP_503');
      
      const performance = metricsCollector.getPerformanceMetrics();
      expect(performance.errorRate).toBeCloseTo(0.333, 2); // 1 failure out of 3 requests
    });

    it('should calculate cache hit rate correctly', () => {
      metricsCollector.recordSuccess(100, true); // cache hit
      metricsCollector.recordSuccess(100, false); // cache miss
      metricsCollector.recordSuccess(100, true); // cache hit
      
      const performance = metricsCollector.getPerformanceMetrics();
      expect(performance.cacheHitRate).toBeCloseTo(0.667, 2); // 2 hits out of 3 requests
    });

    it('should calculate retry rate correctly', () => {
      metricsCollector.recordSuccess(100);
      metricsCollector.recordRetry(2);
      metricsCollector.recordSuccess(100);
      
      const performance = metricsCollector.getPerformanceMetrics();
      expect(performance.retryRate).toBe(0.5); // 1 retry out of 2 requests
    });

    it('should handle zero requests gracefully', () => {
      const performance = metricsCollector.getPerformanceMetrics();
      expect(performance.errorRate).toBe(0);
      expect(performance.cacheHitRate).toBe(0);
      expect(performance.retryRate).toBe(0);
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status for good metrics', () => {
      metricsCollector.recordSuccess(100);
      metricsCollector.recordSuccess(150);
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.consecutiveFailures).toBe(0);
      expect(healthStatus.errorRate).toBe(0);
    });

    it('should return degraded status for elevated error rate', () => {
      metricsCollector.recordSuccess(100);
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.status).toBe('degraded');
      expect(healthStatus.errorRate).toBe(0.75); // 3 failures out of 4 requests
    });

    it('should return unhealthy status for high error rate', () => {
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.status).toBe('unhealthy');
      expect(healthStatus.errorRate).toBe(1.0); // 100% error rate
    });

    it('should return degraded status for consecutive failures', () => {
      // Record 5 consecutive failures (threshold for degraded)
      for (let i = 0; i < 5; i++) {
        metricsCollector.recordFailure('HTTP_503');
      }
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.status).toBe('degraded');
      expect(healthStatus.consecutiveFailures).toBe(5);
    });

    it('should return unhealthy status for many consecutive failures', () => {
      // Record 10 consecutive failures (threshold for unhealthy)
      for (let i = 0; i < 10; i++) {
        metricsCollector.recordFailure('HTTP_503');
      }
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.status).toBe('unhealthy');
      expect(healthStatus.consecutiveFailures).toBe(10);
    });

    it('should return degraded status for slow response times', () => {
      metricsCollector.recordSuccess(6000); // 6 seconds (above 5s threshold)
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.status).toBe('degraded');
      expect(healthStatus.responseTime).toBe(6000);
    });

    it('should return unhealthy status for very slow response times', () => {
      metricsCollector.recordSuccess(12000); // 12 seconds (above 10s threshold)
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.status).toBe('unhealthy');
      expect(healthStatus.responseTime).toBe(12000);
    });
  });

  describe('alerts', () => {
    it('should create high error rate alert', () => {
      // Create enough failures to trigger high error rate alert (>10%)
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      
      const alerts = metricsCollector.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('high_error_rate');
      expect(alerts[0].severity).toBe('high');
    });

    it('should create consecutive failures alert', () => {
      // Create 5 consecutive failures to trigger alert
      for (let i = 0; i < 5; i++) {
        metricsCollector.recordFailure('HTTP_503');
      }
      
      const alerts = metricsCollector.getActiveAlerts();
      expect(alerts.some(a => a.type === 'consecutive_failures')).toBe(true);
    });

    it('should create slow response alert', () => {
      metricsCollector.recordSuccess(6000); // Above 5s threshold
      
      const alerts = metricsCollector.getActiveAlerts();
      expect(alerts.some(a => a.type === 'slow_response')).toBe(true);
    });

    it('should create retry storm alert', () => {
      // Create scenario where >50% of requests are retried
      metricsCollector.recordSuccess(100);
      metricsCollector.recordRetry(2);
      metricsCollector.recordRetry(3);
      
      const alerts = metricsCollector.getActiveAlerts();
      expect(alerts.some(a => a.type === 'retry_storm')).toBe(true);
    });

    it('should create rate limit alert', () => {
      // Create scenario where >5% of requests hit rate limits
      metricsCollector.recordSuccess(100);
      metricsCollector.recordRateLimit(1000);
      
      const alerts = metricsCollector.getActiveAlerts();
      expect(alerts.some(a => a.type === 'rate_limit_exceeded')).toBe(true);
    });

    it('should not create duplicate alerts of same type', () => {
      // Trigger the same alert condition multiple times
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      
      const alerts = metricsCollector.getActiveAlerts();
      const highErrorRateAlerts = alerts.filter(a => a.type === 'high_error_rate');
      expect(highErrorRateAlerts).toHaveLength(1);
    });

    it('should resolve alerts', () => {
      // Create an alert
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordFailure('HTTP_503');
      
      const alerts = metricsCollector.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      
      // Resolve the alert
      const resolved = metricsCollector.resolveAlert(alerts[0].id);
      expect(resolved).toBe(true);
      
      const activeAlerts = metricsCollector.getActiveAlerts();
      expect(activeAlerts).toHaveLength(0);
    });

    it('should return false when resolving non-existent alert', () => {
      const resolved = metricsCollector.resolveAlert('non-existent-id');
      expect(resolved).toBe(false);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to initial state', () => {
      // Record some data
      metricsCollector.recordSuccess(100);
      metricsCollector.recordFailure('HTTP_503');
      metricsCollector.recordRetry(2);
      metricsCollector.recordRateLimit(1000);
      
      // Reset metrics
      metricsCollector.resetMetrics();
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.retriedRequests).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(0);
      expect(metrics.staleHits).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
      expect(Object.keys(metrics.errorsByType)).toHaveLength(0);
      expect(metrics.rateLimitHits).toBe(0);
      expect(metrics.rateLimitWaitTime).toBe(0);
      
      const healthStatus = metricsCollector.getHealthStatus();
      expect(healthStatus.consecutiveFailures).toBe(0);
    });
  });

  describe('percentile calculations', () => {
    it('should calculate response time percentiles correctly', () => {
      // Record various response times
      const responseTimes = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      responseTimes.forEach(time => metricsCollector.recordSuccess(time));
      
      const performance = metricsCollector.getPerformanceMetrics();
      
      // P95 should be around 950 (95% of 10 values = 9.5, so index 9 = 1000)
      expect(performance.p95ResponseTime).toBe(1000);
      
      // P99 should be 1000 (99% of 10 values = 9.9, so index 9 = 1000)
      expect(performance.p99ResponseTime).toBe(1000);
    });

    it('should handle empty response times array', () => {
      const performance = metricsCollector.getPerformanceMetrics();
      expect(performance.p95ResponseTime).toBe(0);
      expect(performance.p99ResponseTime).toBe(0);
    });
  });
});