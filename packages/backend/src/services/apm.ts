import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { cacheService } from './cache';

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  userAgent?: string;
  ip?: string;
}

interface SystemMetrics {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  uptime: number;
  timestamp: number;
}

class APMService {
  
  // Memory optimization: Limit array sizes based on environment
  private readonly MAX_METRICS = process.env.DISABLE_APM_DETAILED === 'true' ? 10 : 100;
  private readonly MAX_REQUEST_METRICS = process.env.DISABLE_APM_DETAILED === 'true' ? 20 : 200;
  private readonly MAX_SYSTEM_METRICS = process.env.DISABLE_APM_DETAILED === 'true' ? 5 : 50;

  private metrics: PerformanceMetric[] = [];
  private requestMetrics: RequestMetrics[] = [];
  private systemMetrics: SystemMetrics[] = [];
  private metricsRetentionTime = process.env.DISABLE_APM_DETAILED === 'true' ? 
    5 * 60 * 1000 : // 5 minutes for dev
    1 * 60 * 60 * 1000; // 1 hour for production
  private metricsCollectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Only start if not disabled
    if (process.env.DISABLE_APM_DETAILED !== 'true') {
      this.startMetricsCollection();
    }
  }

  // Middleware to track request performance
  requestTracker = (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const startHrTime = process.hrtime();

    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const endTime = Date.now();
      const diff = process.hrtime(startHrTime);
      const responseTime = diff[0] * 1000 + diff[1] * 1e-6; // Convert to milliseconds

      // Record request metrics
      const requestMetric: RequestMetrics = {
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        responseTime,
        timestamp: endTime,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      };

      apmService.recordRequestMetric(requestMetric);

      // Log slow requests
      if (responseTime > 1000) {
        logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          responseTime: `${responseTime.toFixed(2)}ms`,
          statusCode: res.statusCode,
        });
      }

      // Call original end method
      originalEnd.call(this, chunk, encoding);
    };

    next();
  };

  // Record a custom performance metric
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    // Skip if APM is disabled
    if (process.env.DISABLE_APM_DETAILED === 'true') return;

    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
    };

    this.metrics.push(metric);
    this.enforceArrayLimits();
    this.cleanupOldMetrics();

    // Log significant metrics
    if (this.isSignificantMetric(name, value)) {
      logger.info('Performance metric recorded', metric);
    }
  }

  // Record request metrics
  recordRequestMetric(metric: RequestMetrics): void {
    // Skip if APM is disabled
    if (process.env.DISABLE_APM_DETAILED === 'true') return;

    this.requestMetrics.push(metric);
    this.enforceArrayLimits();
    this.cleanupOldRequestMetrics();

    // Update aggregated metrics
    this.updateAggregatedMetrics(metric);
  }

  // Record system metrics
  recordSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const systemMetric: SystemMetrics = {
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      uptime: process.uptime(),
      timestamp: Date.now(),
    };

    this.systemMetrics.push(systemMetric);
    this.cleanupOldSystemMetrics();

    // Check for memory leaks
    this.checkMemoryUsage(systemMetric);
  }

  // Get performance summary
  getPerformanceSummary(timeRange: number = 3600000): any { // Default 1 hour
    const now = Date.now();
    const cutoff = now - timeRange;

    // Filter metrics within time range
    const recentRequests = this.requestMetrics.filter(m => m.timestamp > cutoff);
    const recentSystemMetrics = this.systemMetrics.filter(m => m.timestamp > cutoff);

    if (recentRequests.length === 0) {
      return {
        requests: { total: 0 },
        system: this.getLatestSystemMetrics(),
        cache: null,
      };
    }

    // Calculate request statistics
    const requestStats = this.calculateRequestStats(recentRequests);
    const systemStats = this.calculateSystemStats(recentSystemMetrics);
    const cacheStats = cacheService.getStats();

    return {
      timeRange: timeRange / 1000, // Convert to seconds
      requests: requestStats,
      system: systemStats,
      cache: cacheStats,
      timestamp: now,
    };
  }

  // Calculate request statistics
  private calculateRequestStats(requests: RequestMetrics[]): any {
    if (requests.length === 0) return { total: 0 };

    const responseTimes = requests.map(r => r.responseTime);
    const statusCodes = requests.reduce((acc, r) => {
      acc[r.statusCode] = (acc[r.statusCode] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const methods = requests.reduce((acc, r) => {
      acc[r.method] = (acc[r.method] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const paths = requests.reduce((acc, r) => {
      acc[r.path] = (acc[r.path] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate percentiles
    const sortedTimes = responseTimes.sort((a, b) => a - b);
    const p50 = this.percentile(sortedTimes, 0.5);
    const p95 = this.percentile(sortedTimes, 0.95);
    const p99 = this.percentile(sortedTimes, 0.99);

    return {
      total: requests.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      p50ResponseTime: p50,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      statusCodes,
      methods,
      topPaths: Object.entries(paths)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .reduce((acc, [path, count]) => ({ ...acc, [path]: count }), {}),
      errorRate: (statusCodes[500] || 0) / requests.length,
      throughput: requests.length / (60 * 60), // requests per hour
    };
  }

  // Calculate system statistics
  private calculateSystemStats(systemMetrics: SystemMetrics[]): any {
    if (systemMetrics.length === 0) return this.getLatestSystemMetrics();

    const latest = systemMetrics[systemMetrics.length - 1];
    const memoryUsages = systemMetrics.map(m => m.memory.heapUsed);
    
    return {
      current: latest,
      memory: {
        averageHeapUsed: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
        maxHeapUsed: Math.max(...memoryUsages),
        minHeapUsed: Math.min(...memoryUsages),
        heapUsagePercent: (latest.memory.heapUsed / latest.memory.heapTotal) * 100,
      },
      uptime: latest.uptime,
    };
  }

  // Get latest system metrics
  private getLatestSystemMetrics(): any {
    const memUsage = process.memoryUsage();
    return {
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        heapUsagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      uptime: process.uptime(),
      timestamp: Date.now(),
    };
  }

  // Update aggregated metrics
  private updateAggregatedMetrics(metric: RequestMetrics): void {
    // Record response time metric
    this.recordMetric('http_request_duration', metric.responseTime, {
      method: metric.method,
      status_code: metric.statusCode.toString(),
    });

    // Record request count
    this.recordMetric('http_requests_total', 1, {
      method: metric.method,
      status_code: metric.statusCode.toString(),
    });

    // Record error rate
    if (metric.statusCode >= 400) {
      this.recordMetric('http_errors_total', 1, {
        method: metric.method,
        status_code: metric.statusCode.toString(),
      });
    }
  }

  // Check for memory leaks
  private checkMemoryUsage(systemMetric: SystemMetrics): void {
    const heapUsagePercent = (systemMetric.memory.heapUsed / systemMetric.memory.heapTotal) * 100;
    
    if (heapUsagePercent > 95) {
      logger.error('Critical memory usage detected', {
        heapUsagePercent: heapUsagePercent.toFixed(2),
        heapUsed: Math.round(systemMetric.memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(systemMetric.memory.heapTotal / 1024 / 1024),
      });
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection due to high memory usage');
      }
    } else if (heapUsagePercent > 90) {
      logger.warn('High memory usage detected', {
        heapUsagePercent: heapUsagePercent.toFixed(2),
        heapUsed: Math.round(systemMetric.memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(systemMetric.memory.heapTotal / 1024 / 1024),
      });
    }
  }

  // Check if metric is significant enough to log
  private isSignificantMetric(name: string, value: number): boolean {
    switch (name) {
      case 'http_request_duration':
        return value > 1000; // Log requests taking more than 1 second
      case 'database_query_duration':
        return value > 500; // Log database queries taking more than 500ms
      case 'cache_miss_rate':
        return value > 0.5; // Log if cache miss rate is above 50%
      default:
        return false;
    }
  }

  // Calculate percentile
  private percentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[index] || 0;
  }

  // Cleanup old metrics
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.metricsRetentionTime;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  private cleanupOldRequestMetrics(): void {
    const cutoff = Date.now() - this.metricsRetentionTime;
    this.requestMetrics = this.requestMetrics.filter(m => m.timestamp > cutoff);
  }

  private cleanupOldSystemMetrics(): void {
    const cutoff = Date.now() - this.metricsRetentionTime;
    this.systemMetrics = this.systemMetrics.filter(m => m.timestamp > cutoff);
  }

  // Enforce array size limits to prevent memory leaks
  private enforceArrayLimits(): void {
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
    if (this.requestMetrics.length > this.MAX_REQUEST_METRICS) {
      this.requestMetrics = this.requestMetrics.slice(-this.MAX_REQUEST_METRICS);
    }
    if (this.systemMetrics.length > this.MAX_SYSTEM_METRICS) {
      this.systemMetrics = this.systemMetrics.slice(-this.MAX_SYSTEM_METRICS);
    }
  }

  // Start metrics collection
  private startMetricsCollection(): void {
    // Collect system metrics with longer intervals in dev mode
    const interval = process.env.DISABLE_APM_DETAILED === 'true' ? 
      5 * 60 * 1000 : // 5 minutes for dev
      60 * 1000; // 1 minute for production
    
    this.metricsCollectionInterval = setInterval(() => {
      this.recordSystemMetrics();
    }, interval);

    logger.info(`APM metrics collection started (interval: ${interval}ms)`);
  }

  // Stop metrics collection
  stopMetricsCollection(): void {
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
      this.metricsCollectionInterval = null;
      logger.info('APM metrics collection stopped');
    }
  }

  // Export metrics for external monitoring systems
  exportMetrics(): {
    metrics: PerformanceMetric[];
    requests: RequestMetrics[];
    system: SystemMetrics[];
  } {
    return {
      metrics: [...this.metrics],
      requests: [...this.requestMetrics],
      system: [...this.systemMetrics],
    };
  }

  // Get metrics in Prometheus format (basic implementation)
  getPrometheusMetrics(): string {
    const summary = this.getPerformanceSummary();
    let output = '';

    // HTTP request duration
    output += `# HELP http_request_duration_seconds HTTP request duration in seconds\n`;
    output += `# TYPE http_request_duration_seconds histogram\n`;
    output += `http_request_duration_seconds_sum ${(summary.requests.averageResponseTime || 0) / 1000}\n`;
    output += `http_request_duration_seconds_count ${summary.requests.total}\n`;

    // HTTP requests total
    output += `# HELP http_requests_total Total number of HTTP requests\n`;
    output += `# TYPE http_requests_total counter\n`;
    output += `http_requests_total ${summary.requests.total}\n`;

    // Memory usage
    output += `# HELP memory_usage_bytes Memory usage in bytes\n`;
    output += `# TYPE memory_usage_bytes gauge\n`;
    output += `memory_usage_bytes{type="heap_used"} ${summary.system.current?.memory.heapUsed || 0}\n`;
    output += `memory_usage_bytes{type="heap_total"} ${summary.system.current?.memory.heapTotal || 0}\n`;

    // Cache metrics
    if (summary.cache) {
      output += `# HELP cache_hits_total Total number of cache hits\n`;
      output += `# TYPE cache_hits_total counter\n`;
      output += `cache_hits_total ${summary.cache.hits}\n`;

      output += `# HELP cache_misses_total Total number of cache misses\n`;
      output += `# TYPE cache_misses_total counter\n`;
      output += `cache_misses_total ${summary.cache.misses}\n`;
    }

    return output;
  }

  // Health check for APM service
  healthCheck(): { status: string; metricsCount: number; uptime: number } {
    return {
      status: 'healthy',
      metricsCount: this.metrics.length + this.requestMetrics.length + this.systemMetrics.length,
      uptime: process.uptime(),
    };
  }
}

export const apmService = new APMService();