import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { DiscordApiClient } from '../services/DiscordApiClient';

const router = Router();
const discordApiClient = new DiscordApiClient();

/**
 * POST /api/admin/clear-discord-cache
 * Clear all Discord API cache data (admin only)
 */
router.post('/clear-discord-cache', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  // Add admin check here if you have admin roles
  // For now, any authenticated user can clear cache
  // You might want to add: if (!req.user.isAdmin) { throw new AppError('Admin access required', 403, 'FORBIDDEN'); }

  try {
    // Clear all Discord API cache
    discordApiClient.clearCache();
    
    logger.info('Discord API cache cleared by admin', { 
      userId: req.user.id,
      username: req.user.username,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Discord API cache cleared successfully',
      data: {
        clearedAt: new Date().toISOString(),
        clearedBy: req.user.username
      }
    });

  } catch (error) {
    logger.error('Failed to clear Discord API cache:', error);
    throw new AppError('Failed to clear cache', 500, 'CACHE_CLEAR_ERROR');
  }
}));

/**
 * GET /api/admin/cache-stats
 * Get Discord API cache statistics
 */
router.get('/cache-stats', authMiddleware.authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  try {
    const cacheStats = discordApiClient.getCacheStats();
    const metrics = discordApiClient.getMetrics();

    res.json({
      success: true,
      data: {
        cache: cacheStats,
        metrics: metrics,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get cache stats:', error);
    throw new AppError('Failed to get cache stats', 500, 'CACHE_STATS_ERROR');
  }
}));

export default router;