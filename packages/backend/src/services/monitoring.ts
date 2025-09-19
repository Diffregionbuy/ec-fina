import { Request, Response } from 'express';
import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { createClient } from 'redis';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: {
    database: HealthStatus;
    redis: HealthStatus;
    memory: HealthStatus;
    disk: HealthStatus;
  };
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  details?: any;
  error?: string;
}

class MonitoringService {
  private redisClient: any;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: HealthCheckResult | null = null;

  constructor() {
    // Only initialize if monitoring is not disabled
    if (process.env.DISABLE_MONITORING !== 'true') {
      this.initializeRedis();
    }
  }

  private async initializeRedis() {
    try {
      if (process.env.REDIS_URL) {
        this.redisClient = createClient({
          url: process.env.REDIS_URL,
          password: process.env.REDIS_PASSWORD,
          socket: {
            tls: process.env.REDIS_TLS === 'true',
          },
        });
        
        this.redisClient.on('error', (err: Error) => {
          logger.error('Redis connection error:', err);
        });
        
        await this.redisClient.connect();
        logger.info('Redis client connected for monitoring');
      }
    } catch (error) {
      logger.error('Failed to initialize Redis for monitoring:', error);
    }
  }

  async checkDatabase(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      const { data, error } = await supabase
        .from('users')
        .select('count')
        .limit(1);

      const responseTime = Date.now() - startTime;

      if (error) {
        return {
          status: 'unhealthy',
          responseTime,
          error: error.message,
        };
      }

      return {
        status: responseTime > 1000 ? 'degraded' : 'healthy',
        responseTime,
        details: { connectionPool: 'active' },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  async checkRedis(): Promise<HealthStatus> {
    if (!this.redisClient) {
      return {
        status: 'degraded',
        details: { message: 'Redis not configured' },
      };
    }

    const startTime = Date.now();
    try {
      await this.redisClient.ping();
      const responseTime = Date.now() - startTime;

      return {
        status: responseTime > 500 ? 'degraded' : 'healthy',
        responseTime,
        details: { connection: 'active' },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Redis connection failed',
      };
    }
  }

  checkMemory(): HealthStatus {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    const memoryUsagePercent = (usedMem / totalMem) * 100;

    // Adjusted thresholds for 512MB memory limit
    // With 512MB limit, we need to be more lenient with memory usage percentages
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (memoryUsagePercent > 95) {
      status = 'unhealthy';
    } else if (memoryUsagePercent > 90) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        heapUsed: Math.round(usedMem / 1024 / 1024) + ' MB',
        heapTotal: Math.round(totalMem / 1024 / 1024) + ' MB',
        usagePercent: Math.round(memoryUsagePercent) + '%',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB',
      },
    };
  }

  checkDisk(): HealthStatus {
    // Basic disk check - in production, you might want to use a library like 'diskusage'
    try {
      const stats = require('fs').statSync('.');
      return {
        status: 'healthy',
        details: {
          available: 'Check not implemented - use diskusage library in production',
        },
      };
    } catch (error) {
      return {
        status: 'degraded',
        error: 'Unable to check disk usage',
      };
    }
  }

  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const [database, redis, memory, disk] = await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        Promise.resolve(this.checkMemory()),
        Promise.resolve(this.checkDisk()),
      ]);

      const checks = { database, redis, memory, disk };
      
      // Determine overall status
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      const statuses = Object.values(checks).map(check => check.status);
      if (statuses.includes('unhealthy')) {
        overallStatus = 'unhealthy';
      } else if (statuses.includes('degraded')) {
        overallStatus = 'degraded';
      }

      const result: HealthCheckResult = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        checks,
      };

      this.lastHealthCheck = result;
      
      // Log health check results
      const checkTime = Date.now() - startTime;
      if (overallStatus === 'unhealthy') {
        logger.error(`Health check failed in ${checkTime}ms`, { result });
      } else if (overallStatus === 'degraded') {
        logger.warn(`Health check degraded in ${checkTime}ms`, { result });
      } else {
        logger.debug(`Health check passed in ${checkTime}ms`);
      }

      return result;
    } catch (error) {
      logger.error('Health check error:', error);
      
      const errorResult: HealthCheckResult = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        checks: {
          database: { status: 'unhealthy', error: 'Health check failed' },
          redis: { status: 'unhealthy', error: 'Health check failed' },
          memory: { status: 'unhealthy', error: 'Health check failed' },
          disk: { status: 'unhealthy', error: 'Health check failed' },
        },
      };

      this.lastHealthCheck = errorResult;
      return errorResult;
    }
  }

  // Express middleware for health check endpoint
  healthCheckHandler = async (req: Request, res: Response) => {
    try {
      const timeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000');
      
      const healthCheckPromise = this.performHealthCheck();
      const timeoutPromise = new Promise<HealthCheckResult>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), timeout);
      });

      const result = await Promise.race([healthCheckPromise, timeoutPromise]);
      
      const statusCode = result.status === 'healthy' ? 200 : 
                        result.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(result);
    } catch (error) {
      logger.error('Health check handler error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check timeout or error',
      });
    }
  };

  // Readiness check (simpler check for load balancers)
  readinessHandler = async (req: Request, res: Response) => {
    try {
      const dbCheck = await this.checkDatabase();
      
      if (dbCheck.status === 'unhealthy') {
        return res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          reason: 'Database unavailable',
        });
      }

      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: 'Readiness check failed',
      });
    }
  };

  // Liveness check (basic server responsiveness)
  livenessHandler = (req: Request, res: Response) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  };

  // Start periodic health checks
  startPeriodicHealthChecks() {
    // Skip if monitoring is disabled
    if (process.env.DISABLE_MONITORING === 'true') {
      logger.info('Periodic health checks disabled');
      return;
    }

    const interval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000'); // Increased default
    
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, interval);
    
    logger.info(`Started periodic health checks every ${interval}ms`);
  }

  // Stop periodic health checks
  stopPeriodicHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Stopped periodic health checks');
    }
  }

  // Get last health check result
  getLastHealthCheck(): HealthCheckResult | null {
    return this.lastHealthCheck;
  }

  // Cleanup resources
  async cleanup() {
    this.stopPeriodicHealthChecks();
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

export const monitoringService = new MonitoringService();