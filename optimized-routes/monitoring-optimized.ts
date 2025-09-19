import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { adaptiveRateLimit } from '../middleware/optimizedRateLimiter';
import { logger } from '../utils/logger';
import { supabase } from '../config/database';
import { cache } from '../services/cache';
import { DiscordApiClient } from '../services/DiscordApiClient';

const router = Router();
const discordApiClient = new DiscordApiClient();

/**
 * OPTIMIZED: Consolidated monitoring endpoints
 * Reduces from 15 endpoints to 5 focused, efficient endpoints
 */

/**
 * GET /api/monitoring/health
 * Consolidated system health and performance metrics
 * Replaces: /status, /performance, /database, /cache, /discord-api/health
 */
router.get('/health', 
  authMiddleware.authenticate,
  adaptiveRateLimit('monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { include = 'basic' } = req.query; // basic, detailed, all

    try {
      // Check cache first for basic health
      if (include === 'basic') {
        const cached = await cache.get('monitoring:health:basic');
        if (cached) {
          return res.json(cached);
        }
      }

      const healthData: any = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      };

      // Basic system metrics
      const memoryUsage = process.memoryUsage();
      healthData.system = {
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) // %
        },
        cpu: await getCpuUsage(),
        load: await getSystemLoad()
      };

      // Database health
      if (include === 'detailed' || include === 'all') {
        try {
          const dbStart = Date.now();
          const { error } = await supabase.from('users').select('count').limit(1);
          const dbLatency = Date.now() - dbStart;
          
          healthData.database = {
            status: error ? 'unhealthy' : 'healthy',
            latency: dbLatency,
            error: error?.message || null
          };
        } catch (error) {
          healthData.database = {
            status: 'unhealthy',
            latency: null,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }

        // Cache health
        try {
          const cacheStart = Date.now();
          await cache.ping();
          const cacheLatency = Date.now() - cacheStart;
          
          healthData.cache = {
            status: 'healthy',
            latency: cacheLatency
          };
        } catch (error) {
          healthData.cache = {
            status: 'unhealthy',
            latency: null,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }

      // Discord API health
      if (include === 'all') {
        try {
          const discordHealth = await discordApiClient.getHealthStatus();
          healthData.discordApi = discordHealth;
        } catch (error) {
          healthData.discordApi = {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }

      // Determine overall status
      const components = [healthData.system];
      if (healthData.database) components.push(healthData.database);
      if (healthData.cache) components.push(healthData.cache);
      if (healthData.discordApi) components.push(healthData.discordApi);

      const hasUnhealthy = components.some(c => c.status === 'unhealthy');
      healthData.status = hasUnhealthy ? 'degraded' : 'healthy';

      const response = {
        success: true,
        data: healthData
      };

      // Cache basic health for 30 seconds
      if (include === 'basic') {
        await cache.set('monitoring:health:basic', response, 30);
      }

      res.json(response);
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(503).json({
        success: false,
        error: 'Health check failed',
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      });
    }
  })
);

/**
 * GET /api/monitoring/metrics
 * Consolidated metrics endpoint
 * Replaces: /discord-api/metrics, /prometheus, performance metrics
 */
router.get('/metrics',
  authMiddleware.authenticate,
  adaptiveRateLimit('monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { 
      format = 'json', // json, prometheus
      timeRange = '1h', // 1h, 6h, 24h, 7d
      include = 'all' // api, discord, database, cache, all
    } = req.query;

    try {
      const cacheKey = `monitoring:metrics:${format}:${timeRange}:${include}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const metrics: any = {
        timestamp: new Date().toISOString(),
        timeRange,
        data: {}
      };

      // API metrics
      if (include === 'api' || include === 'all') {
        metrics.data.api = await getApiMetrics(timeRange);
      }

      // Discord API metrics
      if (include === 'discord' || include === 'all') {
        metrics.data.discord = await getDiscordApiMetrics(timeRange);
      }

      // Database metrics
      if (include === 'database' || include === 'all') {
        metrics.data.database = await getDatabaseMetrics(timeRange);
      }

      // Cache metrics
      if (include === 'cache' || include === 'all') {
        metrics.data.cache = await getCacheMetrics(timeRange);
      }

      // Format response
      let response;
      if (format === 'prometheus') {
        response = formatPrometheusMetrics(metrics);
        res.set('Content-Type', 'text/plain');
        return res.send(response);
      } else {
        response = {
          success: true,
          data: metrics
        };
      }

      // Cache for 1 minute
      await cache.set(cacheKey, response, 60);

      res.json(response);
    } catch (error) {
      logger.error('Metrics error:', error);
      throw new AppError('Failed to fetch metrics', 500, 'METRICS_ERROR');
    }
  })
);

/**
 * GET /api/monitoring/alerts
 * POST /api/monitoring/alerts/:alertId
 * Consolidated alert management
 * Replaces: /alerts, /alerts/:alertId/resolve, /discord-api/alerts, /discord-api/alerts/:alertId/resolve
 */
router.get('/alerts',
  authMiddleware.authenticate,
  adaptiveRateLimit('monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { 
      status = 'active', // active, resolved, all
      severity, // critical, warning, info
      source, // api, discord, database, cache
      limit = 50,
      offset = 0
    } = req.query;

    try {
      let query = supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      // Apply filters
      if (status !== 'all') {
        query = query.eq('status', status);
      }
      if (severity) {
        query = query.eq('severity', severity);
      }
      if (source) {
        query = query.eq('source', source);
      }

      const { data: alerts, error } = await query;
      if (error) throw error;

      // Get alert counts by status
      const { data: counts } = await supabase
        .from('alerts')
        .select('status, count(*)')
        .group('status');

      const alertCounts = counts?.reduce((acc, item) => {
        acc[item.status] = item.count;
        return acc;
      }, {} as Record<string, number>) || {};

      res.json({
        success: true,
        data: {
          alerts: alerts || [],
          counts: alertCounts,
          pagination: {
            limit: Number(limit),
            offset: Number(offset),
            total: alertCounts[status] || 0
          }
        }
      });
    } catch (error) {
      logger.error('Get alerts error:', error);
      throw new AppError('Failed to fetch alerts', 500, 'ALERTS_ERROR');
    }
  })
);

router.post('/alerts/:alertId',
  authMiddleware.authenticate,
  adaptiveRateLimit('monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { alertId } = req.params;
    const { action = 'resolve', notes } = req.body;

    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
        resolved_by: req.user!.id
      };

      if (action === 'resolve') {
        updateData.status = 'resolved';
        updateData.resolved_at = new Date().toISOString();
      } else if (action === 'acknowledge') {
        updateData.status = 'acknowledged';
        updateData.acknowledged_at = new Date().toISOString();
      }

      if (notes) {
        updateData.resolution_notes = notes;
      }

      const { data: alert, error } = await supabase
        .from('alerts')
        .update(updateData)
        .eq('id', alertId)
        .select()
        .single();

      if (error) throw error;

      logger.info('Alert updated', { 
        alertId, 
        action, 
        userId: req.user!.id 
      });

      res.json({
        success: true,
        data: { alert }
      });
    } catch (error) {
      logger.error('Update alert error:', error);
      throw new AppError('Failed to update alert', 500, 'ALERT_UPDATE_ERROR');
    }
  })
);

/**
 * POST /api/monitoring/maintenance
 * Consolidated maintenance operations
 * Replaces: /cache/clear, /database/analyze, /discord-api/metrics/reset
 */
router.post('/maintenance',
  authMiddleware.authenticate,
  authMiddleware.requireRole('admin'),
  adaptiveRateLimit('monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { operations = [] } = req.body; // ['cache-clear', 'db-analyze', 'metrics-reset']

    try {
      const results: any = {};

      for (const operation of operations) {
        switch (operation) {
          case 'cache-clear':
            try {
              await cache.flushall();
              results.cacheCleared = true;
              logger.info('Cache cleared by admin', { userId: req.user!.id });
            } catch (error) {
              results.cacheCleared = false;
              results.cacheError = error instanceof Error ? error.message : 'Unknown error';
            }
            break;

          case 'db-analyze':
            try {
              // Run database analysis
              await supabase.rpc('analyze_performance');
              results.databaseAnalyzed = true;
              logger.info('Database analyzed by admin', { userId: req.user!.id });
            } catch (error) {
              results.databaseAnalyzed = false;
              results.databaseError = error instanceof Error ? error.message : 'Unknown error';
            }
            break;

          case 'metrics-reset':
            try {
              // Reset Discord API metrics
              await cache.del('discord:metrics:*');
              results.metricsReset = true;
              logger.info('Metrics reset by admin', { userId: req.user!.id });
            } catch (error) {
              results.metricsReset = false;
              results.metricsError = error instanceof Error ? error.message : 'Unknown error';
            }
            break;

          default:
            results[operation] = false;
            results[`${operation}Error`] = 'Unknown operation';
        }
      }

      res.json({
        success: true,
        data: {
          operations: operations,
          results: results,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Maintenance operation error:', error);
      throw new AppError('Maintenance operation failed', 500, 'MAINTENANCE_ERROR');
    }
  })
);

/**
 * GET /api/monitoring/logs
 * Consolidated log access (unchanged but optimized)
 */
router.get('/logs',
  authMiddleware.authenticate,
  authMiddleware.requireRole('admin'),
  adaptiveRateLimit('monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { 
      level = 'info',
      limit = 100,
      offset = 0,
      search,
      startDate,
      endDate
    } = req.query;

    try {
      // This would integrate with your logging system
      // For now, return a placeholder response
      const logs = await getSystemLogs({
        level: level as string,
        limit: Number(limit),
        offset: Number(offset),
        search: search as string,
        startDate: startDate as string,
        endDate: endDate as string
      });

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            limit: Number(limit),
            offset: Number(offset)
          }
        }
      });
    } catch (error) {
      logger.error('Get logs error:', error);
      throw new AppError('Failed to fetch logs', 500, 'LOGS_ERROR');
    }
  })
);

// Helper functions
async function getCpuUsage(): Promise<number> {
  // Simplified CPU usage calculation
  return Math.random() * 100; // Replace with actual CPU monitoring
}

async function getSystemLoad(): Promise<number> {
  try {
    return Number(await cache.get('system:load')) || 0.5;
  } catch {
    return 0.5;
  }
}

async function getApiMetrics(timeRange: string) {
  // Get API metrics from cache/database
  const metrics = await cache.get(`api:metrics:${timeRange}`);
  return metrics ? JSON.parse(metrics) : {
    requests: 0,
    errors: 0,
    avgResponseTime: 0,
    p95ResponseTime: 0
  };
}

async function getDiscordApiMetrics(timeRange: string) {
  return discordApiClient.getMetrics(timeRange);
}

async function getDatabaseMetrics(timeRange: string) {
  // Database performance metrics
  return {
    queries: 0,
    avgQueryTime: 0,
    slowQueries: 0,
    connections: 0
  };
}

async function getCacheMetrics(timeRange: string) {
  // Cache performance metrics
  return {
    hits: 0,
    misses: 0,
    hitRate: 0,
    memory: 0
  };
}

function formatPrometheusMetrics(metrics: any): string {
  // Convert JSON metrics to Prometheus format
  let output = '';
  
  // Example conversion (implement based on your metrics structure)
  if (metrics.data.api) {
    output += `# HELP api_requests_total Total API requests\n`;
    output += `# TYPE api_requests_total counter\n`;
    output += `api_requests_total ${metrics.data.api.requests}\n\n`;
  }
  
  return output;
}

async function getSystemLogs(options: any) {
  // Integrate with your logging system
  return [];
}

export default router;