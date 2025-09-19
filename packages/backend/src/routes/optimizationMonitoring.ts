import { Router, Request, Response } from 'express';
import { optimizedAuthMiddleware } from '../middleware/optimizedAuth';
import { optimizedJwtService } from '../utils/optimizedJwt';
import { OptimizedDiscordApiClient } from '../services/OptimizedDiscordApiClient';
import { logger } from '../utils/logger';

const router = Router();

// Global metrics tracking
let globalMetrics = {
  startTime: Date.now(),
  totalRequests: 0,
  authCacheHits: 0,
  authCacheMisses: 0,
  tokenReuseCount: 0,
  tokenGenerationCount: 0,
  discordApiCalls: 0,
  discordApiCacheHits: 0,
  rateLimitHits: 0,
  errorCount: 0,
  memoryUsage: {
    heapUsed: 0,
    heapTotal: 0,
    external: 0,
    rss: 0
  }
};

// Middleware to track requests
const trackRequest = (req: Request, res: Response, next: any) => {
  globalMetrics.totalRequests++;
  next();
};

/**
 * GET /api/optimization-monitoring/stats
 * Get comprehensive optimization statistics
 */
router.get('/stats', trackRequest, async (req: Request, res: Response) => {
  try {
    // Update memory usage
    const memUsage = process.memoryUsage();
    globalMetrics.memoryUsage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024) // MB
    };

    // Get auth middleware stats
    const authStats = optimizedAuthMiddleware.getStats();
    
    // Get JWT service stats
    const jwtStats = optimizedJwtService.getTokenCacheStats();
    
    // Get Discord API client stats
    const discordClient = new OptimizedDiscordApiClient();
    const discordStats = discordClient.getStats();

    // Calculate uptime
    const uptimeMs = Date.now() - globalMetrics.startTime;
    const uptimeHours = Math.round(uptimeMs / (1000 * 60 * 60) * 100) / 100;

    // Calculate rates
    const requestsPerHour = Math.round((globalMetrics.totalRequests / uptimeHours) * 100) / 100;
    const authCacheHitRate = globalMetrics.authCacheHits + globalMetrics.authCacheMisses > 0 
      ? Math.round((globalMetrics.authCacheHits / (globalMetrics.authCacheHits + globalMetrics.authCacheMisses)) * 100)
      : 0;

    const optimizationStats = {
      system: {
        uptime: {
          ms: uptimeMs,
          hours: uptimeHours,
          formatted: `${Math.floor(uptimeHours)}h ${Math.floor((uptimeHours % 1) * 60)}m`
        },
        memory: globalMetrics.memoryUsage,
        performance: {
          totalRequests: globalMetrics.totalRequests,
          requestsPerHour,
          errorRate: globalMetrics.errorCount > 0 
            ? Math.round((globalMetrics.errorCount / globalMetrics.totalRequests) * 100 * 100) / 100
            : 0
        }
      },
      authentication: {
        jwtCache: {
          size: jwtStats.size,
          maxSize: jwtStats.maxSize,
          utilizationRate: Math.round((jwtStats.size / jwtStats.maxSize) * 100),
          tokenReuseCount: globalMetrics.tokenReuseCount,
          tokenGenerationCount: globalMetrics.tokenGenerationCount,
          reuseRatio: globalMetrics.tokenGenerationCount > 0 
            ? Math.round((globalMetrics.tokenReuseCount / globalMetrics.tokenGenerationCount) * 100)
            : 0
        },
        authCache: {
          ...authStats.jwtCache,
          hitRate: authCacheHitRate
        },
        ownershipCache: authStats.ownershipCache
      },
      discordApi: {
        cache: discordStats.cache,
        rateLimits: discordStats.rateLimits,
        metrics: {
          totalCalls: globalMetrics.discordApiCalls,
          cacheHits: globalMetrics.discordApiCacheHits,
          rateLimitHits: globalMetrics.rateLimitHits,
          cacheHitRate: globalMetrics.discordApiCalls > 0 
            ? Math.round((globalMetrics.discordApiCacheHits / globalMetrics.discordApiCalls) * 100)
            : 0
        }
      },
      optimizations: {
        summary: {
          authTokenSpamPrevented: globalMetrics.tokenReuseCount,
          discordApiCallsReduced: globalMetrics.discordApiCacheHits,
          rateLimitHitsPrevented: Math.max(0, globalMetrics.discordApiCalls - globalMetrics.rateLimitHits),
          memoryUsageOptimized: globalMetrics.memoryUsage.heapUsed < 400 // Under 400MB is good
        },
        effectiveness: {
          tokenReuseEffectiveness: globalMetrics.tokenGenerationCount > 0 
            ? `${Math.round((globalMetrics.tokenReuseCount / globalMetrics.tokenGenerationCount) * 100)}%`
            : '0%',
          discordCacheEffectiveness: globalMetrics.discordApiCalls > 0 
            ? `${Math.round((globalMetrics.discordApiCacheHits / globalMetrics.discordApiCalls) * 100)}%`
            : '0%',
          memoryEfficiency: globalMetrics.memoryUsage.heapUsed < 300 ? 'Excellent' 
            : globalMetrics.memoryUsage.heapUsed < 400 ? 'Good' 
            : globalMetrics.memoryUsage.heapUsed < 500 ? 'Fair' 
            : 'Poor'
        }
      }
    };

    res.json({
      success: true,
      data: optimizationStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting optimization stats:', error);
    globalMetrics.errorCount++;
    
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: 'Failed to retrieve optimization statistics',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/optimization-monitoring/health
 * Get optimization health status
 */
router.get('/health', trackRequest, async (req: Request, res: Response) => {
  try {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    // Health checks
    const healthChecks = {
      memoryUsage: {
        status: heapUsedMB < 400 ? 'healthy' : heapUsedMB < 500 ? 'warning' : 'critical',
        value: heapUsedMB,
        threshold: 400,
        message: heapUsedMB < 400 ? 'Memory usage is optimal' 
          : heapUsedMB < 500 ? 'Memory usage is elevated but acceptable'
          : 'Memory usage is critical - optimization needed'
      },
      authOptimization: {
        status: globalMetrics.tokenReuseCount > globalMetrics.tokenGenerationCount * 0.5 ? 'healthy' : 'warning',
        tokenReuseRatio: globalMetrics.tokenGenerationCount > 0 
          ? Math.round((globalMetrics.tokenReuseCount / globalMetrics.tokenGenerationCount) * 100)
          : 0,
        message: globalMetrics.tokenReuseCount > globalMetrics.tokenGenerationCount * 0.5 
          ? 'Token reuse is working effectively'
          : 'Token reuse could be improved'
      },
      discordApiOptimization: {
        status: globalMetrics.rateLimitHits < globalMetrics.discordApiCalls * 0.1 ? 'healthy' : 'warning',
        rateLimitHitRate: globalMetrics.discordApiCalls > 0 
          ? Math.round((globalMetrics.rateLimitHits / globalMetrics.discordApiCalls) * 100)
          : 0,
        message: globalMetrics.rateLimitHits < globalMetrics.discordApiCalls * 0.1 
          ? 'Discord API rate limiting is under control'
          : 'Discord API rate limiting needs attention'
      }
    };

    const overallStatus = Object.values(healthChecks).every(check => check.status === 'healthy') 
      ? 'healthy' 
      : Object.values(healthChecks).some(check => check.status === 'critical')
      ? 'critical'
      : 'warning';

    res.json({
      success: true,
      data: {
        overallStatus,
        checks: healthChecks,
        recommendations: generateRecommendations(healthChecks)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting optimization health:', error);
    globalMetrics.errorCount++;
    
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: 'Failed to retrieve optimization health status',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/optimization-monitoring/clear-caches
 * Clear all optimization caches
 */
router.post('/clear-caches', trackRequest, async (req: Request, res: Response) => {
  try {
    // Clear auth caches
    optimizedAuthMiddleware.clearCaches();
    
    // Clear JWT cache
    optimizedJwtService.clearTokenCache();
    
    // Clear Discord API cache
    const discordClient = new OptimizedDiscordApiClient();
    discordClient.clearCache();

    // Reset metrics
    globalMetrics.authCacheHits = 0;
    globalMetrics.authCacheMisses = 0;
    globalMetrics.tokenReuseCount = 0;
    globalMetrics.tokenGenerationCount = 0;
    globalMetrics.discordApiCalls = 0;
    globalMetrics.discordApiCacheHits = 0;

    logger.info('All optimization caches cleared');

    res.json({
      success: true,
      message: 'All optimization caches cleared successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error clearing caches:', error);
    globalMetrics.errorCount++;
    
    res.status(500).json({
      success: false,
      error: {
        code: 'CACHE_CLEAR_ERROR',
        message: 'Failed to clear optimization caches',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * Generate optimization recommendations based on health checks
 */
function generateRecommendations(healthChecks: any): string[] {
  const recommendations: string[] = [];

  if (healthChecks.memoryUsage.status !== 'healthy') {
    recommendations.push('Consider increasing memory allocation or optimizing memory usage');
  }

  if (healthChecks.authOptimization.status !== 'healthy') {
    recommendations.push('Review JWT token caching configuration to improve token reuse');
  }

  if (healthChecks.discordApiOptimization.status !== 'healthy') {
    recommendations.push('Implement additional Discord API rate limiting measures');
  }

  if (recommendations.length === 0) {
    recommendations.push('All optimizations are working effectively');
  }

  return recommendations;
}

// Export metrics for other modules to update
export const updateMetrics = {
  incrementAuthCacheHit: () => globalMetrics.authCacheHits++,
  incrementAuthCacheMiss: () => globalMetrics.authCacheMisses++,
  incrementTokenReuse: () => globalMetrics.tokenReuseCount++,
  incrementTokenGeneration: () => globalMetrics.tokenGenerationCount++,
  incrementDiscordApiCall: () => globalMetrics.discordApiCalls++,
  incrementDiscordApiCacheHit: () => globalMetrics.discordApiCacheHits++,
  incrementRateLimitHit: () => globalMetrics.rateLimitHits++,
  incrementError: () => globalMetrics.errorCount++
};

export default router;