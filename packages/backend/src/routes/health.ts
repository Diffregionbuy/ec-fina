import express from 'express';
import { getOptimizedOKXService } from '../services/optimizedOkx';
import { redis } from '../middleware/apiCaching';
import { logger } from '../utils/logger';

const router = express.Router();

// Comprehensive health check endpoint
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  const healthStatus: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {},
    responseTime: 0
  };

  try {
    // Check Redis connection
    try {
      const redisPing = await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000))
      ]);
      
      healthStatus.services.redis = {
        status: redisPing === 'PONG' ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - startTime,
        message: redisPing === 'PONG' ? 'Connected' : 'Ping failed'
      };
    } catch (redisError) {
      healthStatus.services.redis = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: redisError instanceof Error ? redisError.message : 'Redis connection failed'
      };
      healthStatus.status = 'degraded';
    }

    // Check OKX service
    try {
      const okxService = getOptimizedOKXService();
      const okxHealth = await Promise.race([
        okxService.healthCheck(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('OKX health check timeout')), 5000))
      ]);
      
      healthStatus.services.okx = {
        status: okxHealth.status,
        metrics: okxHealth.metrics,
        circuitBreaker: okxHealth.circuitBreaker,
        cache: okxHealth.cache,
        rateLimiter: okxHealth.rateLimiter
      };

      if (okxHealth.status !== 'healthy') {
        healthStatus.status = 'degraded';
      }
    } catch (okxError) {
      healthStatus.services.okx = {
        status: 'unhealthy',
        error: okxError instanceof Error ? okxError.message : 'OKX service check failed'
      };
      healthStatus.status = 'degraded';
    }

    // Check environment variables
    const requiredEnvVars = ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    healthStatus.services.environment = {
      status: missingEnvVars.length === 0 ? 'healthy' : 'unhealthy',
      missingVariables: missingEnvVars,
      redisHost: process.env.REDIS_HOST || 'localhost',
      redisPort: process.env.REDIS_PORT || '6379',
      okxSandbox: process.env.OKX_SANDBOX === 'true'
    };

    if (missingEnvVars.length > 0) {
      healthStatus.status = 'unhealthy';
    }

    healthStatus.responseTime = Date.now() - startTime;

    // Set appropriate HTTP status code
    const httpStatus = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(healthStatus);

  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
      responseTime: Date.now() - startTime
    });
  }
});

// Quick liveness probe
router.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness probe
router.get('/ready', async (req, res) => {
  try {
    // Quick checks for readiness
    const checks = await Promise.allSettled([
      // Redis check with short timeout
      Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
      ]),
      // Environment check
      Promise.resolve(process.env.OKX_API_KEY ? 'ok' : 'missing')
    ]);

    const redisReady = checks[0].status === 'fulfilled';
    const envReady = checks[1].status === 'fulfilled' && 
                     (checks[1] as PromiseFulfilledResult<string>).value === 'ok';

    if (redisReady && envReady) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ 
        status: 'not ready',
        redis: redisReady,
        environment: envReady
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'not ready',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;