import express from 'express';
import RedisMemoryMonitor from '../middleware/redisMemoryMonitor';
import { authenticateToken } from '../middleware/enhancedAuth';
import { logger } from '../utils/logger';

const router = express.Router();

// Get Redis memory statistics
router.get('/memory/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await RedisMemoryMonitor.getMemoryStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get Redis memory stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve memory statistics'
    });
  }
});

// Get Redis health check
router.get('/health', authenticateToken, async (req, res) => {
  try {
    const health = await RedisMemoryMonitor.checkMemoryHealth();
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Failed to check Redis health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Redis health'
    });
  }
});

// Get cache efficiency report
router.get('/efficiency', authenticateToken, async (req, res) => {
  try {
    const report = await RedisMemoryMonitor.getCacheEfficiencyReport();
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Failed to generate efficiency report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate efficiency report'
    });
  }
});

// Optimize Redis for free tier
router.post('/optimize', authenticateToken, async (req, res) => {
  try {
    await RedisMemoryMonitor.optimizeForFreeTier();
    res.json({
      success: true,
      message: 'Redis optimization completed'
    });
  } catch (error) {
    logger.error('Failed to optimize Redis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize Redis'
    });
  }
});

// Get Redis usage dashboard data
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const [stats, health, efficiency] = await Promise.all([
      RedisMemoryMonitor.getMemoryStats(),
      RedisMemoryMonitor.checkMemoryHealth(),
      RedisMemoryMonitor.getCacheEfficiencyReport()
    ]);

    res.json({
      success: true,
      data: {
        memory: stats,
        health: health.status,
        recommendations: health.recommendations,
        efficiency: {
          totalKeys: efficiency.totalKeys,
          largeKeysCount: efficiency.largeKeys.length,
          neverExpireCount: efficiency.neverExpire.length
        },
        alerts: {
          highMemoryUsage: stats.usagePercentage > 70,
          lowHitRate: stats.hitRate < 70,
          highEvictionRate: stats.evictedKeys > 100
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard data'
    });
  }
});

export default router;