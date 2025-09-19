import { Router, Request, Response } from 'express';
import { PerformanceAnalytics, PerformanceOptimizer } from '../middleware/performanceMonitoring';
import { CacheStats, CacheHealthCheck } from '../middleware/apiCaching';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse } from './optimized/api-consolidation';

const router = Router();

// Admin authentication middleware (you may want to implement role-based access)
const adminAuth = (req: AuthenticatedRequest, res: Response, next: any) => {
  // For now, just check if user is authenticated
  // In production, you'd check for admin role
  if (!req.user) {
    return res.status(401).json(
      ApiResponse.error('UNAUTHORIZED', 'Authentication required')
    );
  }
  next();
};

/**
 * GET /api/monitoring/performance - Get performance statistics
 */
router.get('/performance', authMiddleware.authenticate, adminAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = PerformanceAnalytics.getStats();
    const systemHealth = PerformanceAnalytics.getSystemHealth();
    const optimization = PerformanceOptimizer.analyzePerformance();

    res.json(ApiResponse.success({
      performance: stats,
      systemHealth,
      optimization,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Performance monitoring error:', error);
    res.status(500).json(
      ApiResponse.error('MONITORING_ERROR', 'Failed to retrieve performance data')
    );
  }
});

/**
 * GET /api/monitoring/performance/metrics - Get detailed metrics with filtering
 */
router.get('/performance/metrics', authMiddleware.authenticate, adminAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      startTime,
      endTime,
      endpoint,
      method,
      statusCode,
      userId,
      limit = '1000'
    } = req.query;

    const filters: any = {};
    if (startTime) filters.startTime = parseInt(startTime as string);
    if (endTime) filters.endTime = parseInt(endTime as string);
    if (endpoint) filters.endpoint = endpoint as string;
    if (method) filters.method = method as string;
    if (statusCode) filters.statusCode = parseInt(statusCode as string);
    if (userId) filters.userId = userId as string;

    let metrics = PerformanceAnalytics.getMetrics(filters);
    
    // Apply limit
    const limitNum = parseInt(limit as string);
    if (limitNum > 0) {
      metrics = metrics.slice(-limitNum); // Get most recent metrics
    }

    res.json(ApiResponse.success({
      metrics,
      totalCount: metrics.length,
      filters
    }));
  } catch (error) {
    console.error('Metrics retrieval error:', error);
    res.status(500).json(
      ApiResponse.error('METRICS_ERROR', 'Failed to retrieve metrics')
    );
  }
});

/**
 * GET /api/monitoring/cache - Get cache statistics and health
 */
router.get('/cache', authMiddleware.authenticate, adminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cacheStats = CacheStats.getStats();
    const cacheHealth = await CacheHealthCheck.checkHealth();

    res.json(ApiResponse.success({
      cache: {
        stats: cacheStats,
        health: cacheHealth
      },
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Cache monitoring error:', error);
    res.status(500).json(
      ApiResponse.error('CACHE_MONITORING_ERROR', 'Failed to retrieve cache data')
    );
  }
});

/**
 * GET /api/monitoring/dashboard - Get comprehensive dashboard data
 */
router.get('/dashboard', authMiddleware.authenticate, adminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      performanceStats,
      systemHealth,
      optimization,
      cacheStats,
      cacheHealth
    ] = await Promise.all([
      PerformanceAnalytics.getStats(),
      PerformanceAnalytics.getSystemHealth(),
      PerformanceOptimizer.analyzePerformance(),
      CacheStats.getStats(),
      CacheHealthCheck.checkHealth()
    ]);

    // Get recent metrics for trends
    const recentMetrics = PerformanceAnalytics.getMetrics({
      startTime: Date.now() - 3600000 // Last hour
    });

    // Calculate trends
    const trends = calculateTrends(recentMetrics);

    res.json(ApiResponse.success({
      dashboard: {
        performance: performanceStats,
        systemHealth,
        optimization,
        cache: {
          stats: cacheStats,
          health: cacheHealth
        },
        trends,
        alerts: getActiveAlerts(performanceStats, systemHealth, optimization)
      },
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json(
      ApiResponse.error('DASHBOARD_ERROR', 'Failed to retrieve dashboard data')
    );
  }
});

/**
 * GET /api/monitoring/export - Export performance data
 */
router.get('/export', authMiddleware.authenticate, adminAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { format = 'json' } = req.query;
    const exportData = PerformanceAnalytics.exportMetrics(format as 'json' | 'csv');

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="performance-metrics-${Date.now()}.csv"`);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="performance-metrics-${Date.now()}.json"`);
    }

    res.send(exportData);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json(
      ApiResponse.error('EXPORT_ERROR', 'Failed to export data')
    );
  }
});

/**
 * POST /api/monitoring/reset - Reset performance statistics (admin only)
 */
router.post('/reset', authMiddleware.authenticate, adminAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    PerformanceAnalytics.reset();
    CacheStats.reset();

    res.json(ApiResponse.success(
      { resetTime: new Date().toISOString() },
      'Performance statistics reset successfully'
    ));
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json(
      ApiResponse.error('RESET_ERROR', 'Failed to reset statistics')
    );
  }
});

/**
 * GET /api/monitoring/alerts - Get active performance alerts
 */
router.get('/alerts', authMiddleware.authenticate, adminAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const performanceStats = PerformanceAnalytics.getStats();
    const systemHealth = PerformanceAnalytics.getSystemHealth();
    const optimization = PerformanceOptimizer.analyzePerformance();

    const alerts = getActiveAlerts(performanceStats, systemHealth, optimization);

    res.json(ApiResponse.success({
      alerts,
      alertCount: alerts.length,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Alerts error:', error);
    res.status(500).json(
      ApiResponse.error('ALERTS_ERROR', 'Failed to retrieve alerts')
    );
  }
});

/**
 * GET /api/monitoring/health - Simple health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const systemHealth = PerformanceAnalytics.getSystemHealth();
    const isHealthy = systemHealth.memory.heapUsed < 500 && // < 500MB
                     systemHealth.system.loadAverage[0] < 2.0; // Load average < 2.0

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: systemHealth.system.uptime,
      memory: systemHealth.memory,
      load: systemHealth.system.loadAverage[0]
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Helper functions
function calculateTrends(metrics: any[]) {
  if (metrics.length < 2) {
    return {
      responseTime: { trend: 'stable', change: 0 },
      errorRate: { trend: 'stable', change: 0 },
      throughput: { trend: 'stable', change: 0 }
    };
  }

  const halfPoint = Math.floor(metrics.length / 2);
  const firstHalf = metrics.slice(0, halfPoint);
  const secondHalf = metrics.slice(halfPoint);

  // Response time trend
  const firstHalfAvgTime = firstHalf.reduce((sum, m) => sum + m.responseTime, 0) / firstHalf.length;
  const secondHalfAvgTime = secondHalf.reduce((sum, m) => sum + m.responseTime, 0) / secondHalf.length;
  const responseTimeChange = ((secondHalfAvgTime - firstHalfAvgTime) / firstHalfAvgTime) * 100;

  // Error rate trend
  const firstHalfErrors = firstHalf.filter(m => m.statusCode >= 400).length / firstHalf.length;
  const secondHalfErrors = secondHalf.filter(m => m.statusCode >= 400).length / secondHalf.length;
  const errorRateChange = ((secondHalfErrors - firstHalfErrors) / (firstHalfErrors || 0.01)) * 100;

  // Throughput trend (requests per minute)
  const firstHalfDuration = (firstHalf[firstHalf.length - 1]?.timestamp - firstHalf[0]?.timestamp) / 60000;
  const secondHalfDuration = (secondHalf[secondHalf.length - 1]?.timestamp - secondHalf[0]?.timestamp) / 60000;
  const firstHalfThroughput = firstHalf.length / (firstHalfDuration || 1);
  const secondHalfThroughput = secondHalf.length / (secondHalfDuration || 1);
  const throughputChange = ((secondHalfThroughput - firstHalfThroughput) / (firstHalfThroughput || 1)) * 100;

  return {
    responseTime: {
      trend: responseTimeChange > 5 ? 'increasing' : responseTimeChange < -5 ? 'decreasing' : 'stable',
      change: Math.round(responseTimeChange * 100) / 100
    },
    errorRate: {
      trend: errorRateChange > 10 ? 'increasing' : errorRateChange < -10 ? 'decreasing' : 'stable',
      change: Math.round(errorRateChange * 100) / 100
    },
    throughput: {
      trend: throughputChange > 10 ? 'increasing' : throughputChange < -10 ? 'decreasing' : 'stable',
      change: Math.round(throughputChange * 100) / 100
    }
  };
}

function getActiveAlerts(performanceStats: any, systemHealth: any, optimization: any) {
  const alerts = [];

  // Performance alerts
  if (performanceStats.overview.avgResponseTime > 2000) {
    alerts.push({
      type: 'warning',
      category: 'performance',
      message: `High average response time: ${performanceStats.overview.avgResponseTime}ms`,
      severity: performanceStats.overview.avgResponseTime > 5000 ? 'critical' : 'warning',
      timestamp: new Date().toISOString()
    });
  }

  if (performanceStats.overview.errorRate > 5) {
    alerts.push({
      type: 'error',
      category: 'reliability',
      message: `High error rate: ${performanceStats.overview.errorRate}%`,
      severity: performanceStats.overview.errorRate > 20 ? 'critical' : 'warning',
      timestamp: new Date().toISOString()
    });
  }

  if (performanceStats.overview.cacheHitRate < 50) {
    alerts.push({
      type: 'warning',
      category: 'performance',
      message: `Low cache hit rate: ${performanceStats.overview.cacheHitRate}%`,
      severity: 'warning',
      timestamp: new Date().toISOString()
    });
  }

  // System health alerts
  if (systemHealth.memory.heapUsed > 400) {
    alerts.push({
      type: 'warning',
      category: 'system',
      message: `High memory usage: ${systemHealth.memory.heapUsed}MB`,
      severity: systemHealth.memory.heapUsed > 700 ? 'critical' : 'warning',
      timestamp: new Date().toISOString()
    });
  }

  if (systemHealth.system.loadAverage[0] > 2.0) {
    alerts.push({
      type: 'warning',
      category: 'system',
      message: `High system load: ${systemHealth.system.loadAverage[0].toFixed(2)}`,
      severity: systemHealth.system.loadAverage[0] > 4.0 ? 'critical' : 'warning',
      timestamp: new Date().toISOString()
    });
  }

  // Optimization alerts
  if (optimization.score < 70) {
    alerts.push({
      type: 'info',
      category: 'optimization',
      message: `Performance score below threshold: ${optimization.score}/100`,
      severity: optimization.score < 50 ? 'warning' : 'info',
      timestamp: new Date().toISOString()
    });
  }

  // Critical issues
  optimization.criticalIssues.forEach((issue: string) => {
    alerts.push({
      type: 'error',
      category: 'critical',
      message: issue,
      severity: 'critical',
      timestamp: new Date().toISOString()
    });
  });

  return alerts.sort((a, b) => {
    const severityOrder = { critical: 3, warning: 2, info: 1 };
    return (severityOrder[b.severity as keyof typeof severityOrder] || 0) - 
           (severityOrder[a.severity as keyof typeof severityOrder] || 0);
  });
}

export default router;