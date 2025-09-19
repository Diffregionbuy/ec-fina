import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import os from 'os';
import { EventEmitter } from 'events';

// Performance metrics interface
export interface PerformanceMetrics {
  timestamp: number;
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  userId?: string;
  serverId?: string;
  cached?: boolean;
  errorType?: string;
  queryCount?: number;
  payloadSize?: number;
}

// Performance analytics aggregator
export class PerformanceAnalytics {
  private static metrics: PerformanceMetrics[] = [];
  private static readonly MAX_METRICS = 10000; // Keep last 10k metrics
  private static eventEmitter = new EventEmitter();
  
  // Real-time statistics
  private static stats = {
    totalRequests: 0,
    totalErrors: 0,
    totalResponseTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    slowQueries: 0,
    memoryLeaks: 0,
    cpuSpikes: 0,
    endpointStats: new Map<string, {
      count: number;
      totalTime: number;
      errors: number;
      avgResponseTime: number;
      p95ResponseTime: number;
      p99ResponseTime: number;
    }>(),
    hourlyStats: new Map<string, {
      requests: number;
      errors: number;
      avgResponseTime: number;
    }>()
  };

  static addMetric(metric: PerformanceMetrics) {
    // Add to metrics array
    this.metrics.push(metric);
    
    // Maintain max size
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    // Update real-time stats
    this.updateStats(metric);
    
    // Emit event for real-time monitoring
    this.eventEmitter.emit('metric', metric);
    
    // Check for performance issues
    this.checkPerformanceIssues(metric);
  }

  private static updateStats(metric: PerformanceMetrics) {
    this.stats.totalRequests++;
    this.stats.totalResponseTime += metric.responseTime;

    // Error tracking
    if (metric.statusCode >= 400) {
      this.stats.totalErrors++;
    }

    // Cache tracking
    if (metric.cached === true) {
      this.stats.cacheHits++;
    } else if (metric.cached === false) {
      this.stats.cacheMisses++;
    }

    // Slow query tracking
    if (metric.responseTime > 1000) { // > 1 second
      this.stats.slowQueries++;
    }

    // Endpoint-specific stats
    const endpointKey = `${metric.method} ${metric.endpoint}`;
    const endpointStat = this.stats.endpointStats.get(endpointKey) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0
    };

    endpointStat.count++;
    endpointStat.totalTime += metric.responseTime;
    endpointStat.avgResponseTime = endpointStat.totalTime / endpointStat.count;

    if (metric.statusCode >= 400) {
      endpointStat.errors++;
    }

    // Calculate percentiles
    const endpointMetrics = this.metrics
      .filter(m => `${m.method} ${m.endpoint}` === endpointKey)
      .map(m => m.responseTime)
      .sort((a, b) => a - b);

    if (endpointMetrics.length > 0) {
      const p95Index = Math.floor(endpointMetrics.length * 0.95);
      const p99Index = Math.floor(endpointMetrics.length * 0.99);
      endpointStat.p95ResponseTime = endpointMetrics[p95Index] || 0;
      endpointStat.p99ResponseTime = endpointMetrics[p99Index] || 0;
    }

    this.stats.endpointStats.set(endpointKey, endpointStat);

    // Hourly stats
    const hour = new Date(metric.timestamp).toISOString().substring(0, 13);
    const hourlyStat = this.stats.hourlyStats.get(hour) || {
      requests: 0,
      errors: 0,
      avgResponseTime: 0
    };

    hourlyStat.requests++;
    if (metric.statusCode >= 400) {
      hourlyStat.errors++;
    }
    hourlyStat.avgResponseTime = (hourlyStat.avgResponseTime * (hourlyStat.requests - 1) + metric.responseTime) / hourlyStat.requests;

    this.stats.hourlyStats.set(hour, hourlyStat);
  }

  private static checkPerformanceIssues(metric: PerformanceMetrics) {
    // Memory leak detection
    const memoryUsageMB = metric.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 400) { // > 400MB
      this.stats.memoryLeaks++;
      this.eventEmitter.emit('alert', {
        type: 'MEMORY_HIGH',
        message: `High memory usage: ${memoryUsageMB.toFixed(2)}MB`,
        metric
      });
    }

    // CPU spike detection
    const cpuPercent = (metric.cpuUsage.user + metric.cpuUsage.system) / 1000000; // Convert to seconds
    if (cpuPercent > 80) { // > 80% CPU
      this.stats.cpuSpikes++;
      this.eventEmitter.emit('alert', {
        type: 'CPU_HIGH',
        message: `High CPU usage: ${cpuPercent.toFixed(2)}%`,
        metric
      });
    }

    // Slow response detection
    if (metric.responseTime > 5000) { // > 5 seconds
      this.eventEmitter.emit('alert', {
        type: 'SLOW_RESPONSE',
        message: `Slow response: ${metric.responseTime}ms for ${metric.method} ${metric.endpoint}`,
        metric
      });
    }

    // Error rate spike detection
    const recentErrors = this.metrics
      .filter(m => m.timestamp > Date.now() - 300000) // Last 5 minutes
      .filter(m => m.statusCode >= 400).length;
    
    const recentTotal = this.metrics
      .filter(m => m.timestamp > Date.now() - 300000).length;

    if (recentTotal > 10 && (recentErrors / recentTotal) > 0.1) { // > 10% error rate
      this.eventEmitter.emit('alert', {
        type: 'HIGH_ERROR_RATE',
        message: `High error rate: ${((recentErrors / recentTotal) * 100).toFixed(2)}%`,
        metric
      });
    }
  }

  static getStats() {
    const avgResponseTime = this.stats.totalRequests > 0 
      ? this.stats.totalResponseTime / this.stats.totalRequests 
      : 0;

    const errorRate = this.stats.totalRequests > 0 
      ? (this.stats.totalErrors / this.stats.totalRequests) * 100 
      : 0;

    const cacheHitRate = (this.stats.cacheHits + this.stats.cacheMisses) > 0 
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100 
      : 0;

    return {
      overview: {
        totalRequests: this.stats.totalRequests,
        totalErrors: this.stats.totalErrors,
        avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100,
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
        slowQueries: this.stats.slowQueries,
        memoryLeaks: this.stats.memoryLeaks,
        cpuSpikes: this.stats.cpuSpikes
      },
      endpoints: Array.from(this.stats.endpointStats.entries()).map(([endpoint, stats]) => ({
        endpoint,
        ...stats,
        errorRate: stats.count > 0 ? (stats.errors / stats.count) * 100 : 0
      })).sort((a, b) => b.count - a.count),
      hourlyTrends: Array.from(this.stats.hourlyStats.entries()).map(([hour, stats]) => ({
        hour,
        ...stats,
        errorRate: stats.requests > 0 ? (stats.errors / stats.requests) * 100 : 0
      })).sort((a, b) => a.hour.localeCompare(b.hour))
    };
  }

  static getMetrics(filters?: {
    startTime?: number;
    endTime?: number;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    userId?: string;
  }) {
    let filteredMetrics = this.metrics;

    if (filters) {
      filteredMetrics = this.metrics.filter(metric => {
        if (filters.startTime && metric.timestamp < filters.startTime) return false;
        if (filters.endTime && metric.timestamp > filters.endTime) return false;
        if (filters.endpoint && !metric.endpoint.includes(filters.endpoint)) return false;
        if (filters.method && metric.method !== filters.method) return false;
        if (filters.statusCode && metric.statusCode !== filters.statusCode) return false;
        if (filters.userId && metric.userId !== filters.userId) return false;
        return true;
      });
    }

    return filteredMetrics;
  }

  static getSystemHealth() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    
    return {
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100, // MB
        rss: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100 // MB
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000), // ms
        system: Math.round(cpuUsage.system / 1000) // ms
      },
      system: {
        uptime: Math.round(uptime),
        loadAverage: os.loadavg(),
        freeMemory: Math.round(os.freemem() / 1024 / 1024), // MB
        totalMemory: Math.round(os.totalmem() / 1024 / 1024), // MB
        cpuCount: os.cpus().length
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
  }

  static onMetric(callback: (metric: PerformanceMetrics) => void) {
    this.eventEmitter.on('metric', callback);
  }

  static onAlert(callback: (alert: any) => void) {
    this.eventEmitter.on('alert', callback);
  }

  static reset() {
    this.metrics = [];
    this.stats = {
      totalRequests: 0,
      totalErrors: 0,
      totalResponseTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      slowQueries: 0,
      memoryLeaks: 0,
      cpuSpikes: 0,
      endpointStats: new Map(),
      hourlyStats: new Map()
    };
  }

  static exportMetrics(format: 'json' | 'csv' = 'json') {
    if (format === 'csv') {
      const headers = [
        'timestamp', 'endpoint', 'method', 'responseTime', 'statusCode',
        'memoryUsed', 'cpuUser', 'cpuSystem', 'userId', 'serverId', 'cached'
      ];
      
      const rows = this.metrics.map(metric => [
        new Date(metric.timestamp).toISOString(),
        metric.endpoint,
        metric.method,
        metric.responseTime,
        metric.statusCode,
        Math.round(metric.memoryUsage.heapUsed / 1024 / 1024),
        Math.round(metric.cpuUsage.user / 1000),
        Math.round(metric.cpuUsage.system / 1000),
        metric.userId || '',
        metric.serverId || '',
        metric.cached || false
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify({
      exportTime: new Date().toISOString(),
      totalMetrics: this.metrics.length,
      stats: this.getStats(),
      systemHealth: this.getSystemHealth(),
      metrics: this.metrics
    }, null, 2);
  }
}

// Performance monitoring middleware
export function performanceMonitoring(options: {
  trackPayloadSize?: boolean;
  trackQueryCount?: boolean;
  excludeEndpoints?: string[];
} = {}) {
  const { trackPayloadSize = true, trackQueryCount = false, excludeEndpoints = [] } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip monitoring for excluded endpoints
    if (excludeEndpoints.some(endpoint => req.path.includes(endpoint))) {
      return next();
    }

    const startTime = performance.now();
    const startCpuUsage = process.cpuUsage();
    const startMemoryUsage = process.memoryUsage();

    // Track payload size
    let payloadSize = 0;
    if (trackPayloadSize && req.body) {
      payloadSize = JSON.stringify(req.body).length;
    }

    // Override res.json to capture response
    const originalJson = res.json;
    const originalSend = res.send;

    res.json = function(data: any) {
      captureMetrics(data);
      return originalJson.call(this, data);
    };

    res.send = function(data: any) {
      captureMetrics(data);
      return originalSend.call(this, data);
    };

    function captureMetrics(responseData?: any) {
      const endTime = performance.now();
      const responseTime = Math.round((endTime - startTime) * 100) / 100;
      const endCpuUsage = process.cpuUsage(startCpuUsage);
      const endMemoryUsage = process.memoryUsage();

      // Check if response was cached
      const cached = res.get('X-Cache') === 'HIT' ? true : 
                    res.get('X-Cache') === 'MISS' ? false : undefined;

      const metric: PerformanceMetrics = {
        timestamp: Date.now(),
        endpoint: req.route?.path || req.path,
        method: req.method,
        responseTime,
        statusCode: res.statusCode,
        memoryUsage: endMemoryUsage,
        cpuUsage: endCpuUsage,
        userId: (req as any).user?.id,
        serverId: req.params.serverId || req.body?.server_id,
        cached,
        payloadSize: trackPayloadSize ? payloadSize : undefined,
        queryCount: trackQueryCount ? (req as any).queryCount : undefined
      };

      // Add error type for failed requests
      if (res.statusCode >= 400 && responseData?.error?.code) {
        metric.errorType = responseData.error.code;
      }

      PerformanceAnalytics.addMetric(metric);
    }

    next();
  };
}

// Query counter middleware (optional)
export function queryCounter(req: Request, res: Response, next: NextFunction) {
  (req as any).queryCount = 0;
  
  // This would need to be integrated with your database layer
  // to actually count queries. For now, it's a placeholder.
  
  next();
}

// Performance optimization recommendations
export class PerformanceOptimizer {
  static analyzePerformance() {
    const stats = PerformanceAnalytics.getStats();
    const recommendations: string[] = [];

    // Analyze response times
    if (stats.overview.avgResponseTime > 1000) {
      recommendations.push('Average response time is high (>1s). Consider implementing caching or optimizing database queries.');
    }

    // Analyze error rates
    if (stats.overview.errorRate > 5) {
      recommendations.push('Error rate is high (>5%). Review error logs and implement better error handling.');
    }

    // Analyze cache hit rate
    if (stats.overview.cacheHitRate < 70) {
      recommendations.push('Cache hit rate is low (<70%). Review caching strategy and TTL settings.');
    }

    // Analyze slow endpoints
    const slowEndpoints = stats.endpoints.filter(ep => ep.avgResponseTime > 2000);
    if (slowEndpoints.length > 0) {
      recommendations.push(`Slow endpoints detected: ${slowEndpoints.map(ep => ep.endpoint).join(', ')}. Consider optimization.`);
    }

    // Analyze memory usage
    const systemHealth = PerformanceAnalytics.getSystemHealth();
    if (systemHealth.memory.heapUsed > 400) {
      recommendations.push('High memory usage detected. Consider implementing memory optimization strategies.');
    }

    return {
      score: this.calculatePerformanceScore(stats),
      recommendations,
      criticalIssues: this.identifyCriticalIssues(stats, systemHealth)
    };
  }

  private static calculatePerformanceScore(stats: any): number {
    let score = 100;

    // Deduct points for high response time
    if (stats.overview.avgResponseTime > 500) score -= 20;
    if (stats.overview.avgResponseTime > 1000) score -= 20;
    if (stats.overview.avgResponseTime > 2000) score -= 20;

    // Deduct points for high error rate
    if (stats.overview.errorRate > 1) score -= 10;
    if (stats.overview.errorRate > 5) score -= 20;
    if (stats.overview.errorRate > 10) score -= 30;

    // Deduct points for low cache hit rate
    if (stats.overview.cacheHitRate < 50) score -= 15;
    if (stats.overview.cacheHitRate < 30) score -= 25;

    // Deduct points for slow queries
    if (stats.overview.slowQueries > stats.overview.totalRequests * 0.1) score -= 15;

    return Math.max(0, score);
  }

  private static identifyCriticalIssues(stats: any, systemHealth: any): string[] {
    const issues: string[] = [];

    if (stats.overview.avgResponseTime > 5000) {
      issues.push('CRITICAL: Average response time exceeds 5 seconds');
    }

    if (stats.overview.errorRate > 20) {
      issues.push('CRITICAL: Error rate exceeds 20%');
    }

    if (systemHealth.memory.heapUsed > 800) {
      issues.push('CRITICAL: Memory usage exceeds 800MB');
    }

    if (stats.overview.slowQueries > stats.overview.totalRequests * 0.5) {
      issues.push('CRITICAL: More than 50% of queries are slow');
    }

    return issues;
  }
}

export default {
  PerformanceAnalytics,
  performanceMonitoring,
  queryCounter,
  PerformanceOptimizer
};