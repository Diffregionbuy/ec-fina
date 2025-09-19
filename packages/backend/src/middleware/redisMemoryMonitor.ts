import { redis } from './apiCaching';
import { logger } from '../utils/logger';

export interface RedisMemoryStats {
  usedMemory: number;
  usedMemoryHuman: string;
  maxMemory: number;
  maxMemoryHuman: string;
  usagePercentage: number;
  keyCount: number;
  expiredKeys: number;
  evictedKeys: number;
  hitRate: number;
  missRate: number;
}

export class RedisMemoryMonitor {
  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static alertThresholds = {
    warning: 70, // 70% usage
    critical: 85, // 85% usage
    emergency: 95 // 95% usage
  };

  static async getMemoryStats(): Promise<RedisMemoryStats> {
    try {
      const info = await redis.info('memory');
      const stats = await redis.info('stats');
      const keyCount = await redis.dbsize();

      // Parse memory info
      const memoryLines = info.split('\r\n');
      const statsLines = stats.split('\r\n');
      
      const parseValue = (lines: string[], key: string): string => {
        const line = lines.find(l => l.startsWith(`${key}:`));
        return line ? line.split(':')[1] : '0';
      };

      const usedMemory = parseInt(parseValue(memoryLines, 'used_memory'));
      const maxMemory = parseInt(parseValue(memoryLines, 'maxmemory')) || 30 * 1024 * 1024; // Default 30MB
      
      const keyspaceHits = parseInt(parseValue(statsLines, 'keyspace_hits'));
      const keyspaceMisses = parseInt(parseValue(statsLines, 'keyspace_misses'));
      const totalRequests = keyspaceHits + keyspaceMisses;
      
      return {
        usedMemory,
        usedMemoryHuman: this.formatBytes(usedMemory),
        maxMemory,
        maxMemoryHuman: this.formatBytes(maxMemory),
        usagePercentage: Math.round((usedMemory / maxMemory) * 100),
        keyCount,
        expiredKeys: parseInt(parseValue(statsLines, 'expired_keys')),
        evictedKeys: parseInt(parseValue(statsLines, 'evicted_keys')),
        hitRate: totalRequests > 0 ? Math.round((keyspaceHits / totalRequests) * 100) : 0,
        missRate: totalRequests > 0 ? Math.round((keyspaceMisses / totalRequests) * 100) : 0
      };
    } catch (error) {
      logger.error('Failed to get Redis memory stats:', error);
      throw error;
    }
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static async checkMemoryHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'emergency';
    stats: RedisMemoryStats;
    recommendations: string[];
  }> {
    const stats = await this.getMemoryStats();
    const usage = stats.usagePercentage;
    
    let status: 'healthy' | 'warning' | 'critical' | 'emergency' = 'healthy';
    const recommendations: string[] = [];

    if (usage >= this.alertThresholds.emergency) {
      status = 'emergency';
      recommendations.push(
        'EMERGENCY: Redis memory usage critical! Consider upgrading plan immediately.',
        'Clear non-essential cache data',
        'Reduce cache TTL values',
        'Implement aggressive cache eviction'
      );
    } else if (usage >= this.alertThresholds.critical) {
      status = 'critical';
      recommendations.push(
        'Critical memory usage detected',
        'Consider upgrading Redis plan',
        'Optimize cache key patterns',
        'Reduce cache sizes for large responses'
      );
    } else if (usage >= this.alertThresholds.warning) {
      status = 'warning';
      recommendations.push(
        'Memory usage approaching limits',
        'Monitor cache hit rates',
        'Consider implementing cache compression',
        'Review cache TTL settings'
      );
    } else {
      recommendations.push(
        'Memory usage is healthy',
        'Current cache strategy is working well'
      );
    }

    // Additional recommendations based on stats
    if (stats.hitRate < 70) {
      recommendations.push('Low cache hit rate - review caching strategy');
    }
    
    if (stats.evictedKeys > 100) {
      recommendations.push('High key eviction rate - consider increasing memory or reducing cache size');
    }

    return { status, stats, recommendations };
  }

  static startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        const health = await this.checkMemoryHealth();
        
        if (health.status !== 'healthy') {
          logger.warn('Redis memory alert', {
            status: health.status,
            usage: health.stats.usagePercentage,
            usedMemory: health.stats.usedMemoryHuman,
            maxMemory: health.stats.maxMemoryHuman,
            recommendations: health.recommendations
          });
        }

        // Log stats every 5 minutes for healthy status
        if (health.status === 'healthy') {
          logger.info('Redis memory status', {
            usage: health.stats.usagePercentage,
            hitRate: health.stats.hitRate,
            keyCount: health.stats.keyCount
          });
        }
      } catch (error) {
        logger.error('Redis monitoring error:', error);
      }
    }, intervalMs);

    logger.info('Redis memory monitoring started', { intervalMs });
  }

  static stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Redis memory monitoring stopped');
    }
  }

  // Optimize cache for free tier
  static async optimizeForFreeTier(): Promise<void> {
    try {
      const stats = await this.getMemoryStats();
      
      if (stats.usagePercentage > 80) {
        logger.info('Optimizing Redis for free tier usage');
        
        // 1. Clear expired keys
        await redis.eval(`
          local keys = redis.call('keys', '*')
          local expired = 0
          for i=1,#keys do
            if redis.call('ttl', keys[i]) == -1 then
              redis.call('del', keys[i])
              expired = expired + 1
            end
          end
          return expired
        `, 0);

        // 2. Reduce TTL for large cache entries
        const keys = await redis.keys('*');
        for (const key of keys) {
          const size = await redis.memory('usage', key);
          if (size && size > 100 * 1024) { // 100KB+
            const ttl = await redis.ttl(key);
            if (ttl > 300) { // If TTL > 5 minutes
              await redis.expire(key, 300); // Reduce to 5 minutes
            }
          }
        }

        logger.info('Redis optimization completed');
      }
    } catch (error) {
      logger.error('Redis optimization failed:', error);
    }
  }

  // Get cache efficiency report
  static async getCacheEfficiencyReport(): Promise<{
    totalKeys: number;
    largeKeys: Array<{ key: string; size: number; sizeHuman: string }>;
    expiringSoon: Array<{ key: string; ttl: number }>;
    neverExpire: string[];
    recommendations: string[];
  }> {
    try {
      const keys = await redis.keys('*');
      const largeKeys: Array<{ key: string; size: number; sizeHuman: string }> = [];
      const expiringSoon: Array<{ key: string; ttl: number }> = [];
      const neverExpire: string[] = [];

      for (const key of keys.slice(0, 100)) { // Limit to first 100 keys
        const [size, ttl] = await Promise.all([
          redis.memory('usage', key),
          redis.ttl(key)
        ]);

        if (size && size > 50 * 1024) { // 50KB+
          largeKeys.push({
            key,
            size,
            sizeHuman: this.formatBytes(size)
          });
        }

        if (ttl > 0 && ttl < 60) { // Expiring in < 1 minute
          expiringSoon.push({ key, ttl });
        }

        if (ttl === -1) { // Never expires
          neverExpire.push(key);
        }
      }

      const recommendations: string[] = [];
      
      if (largeKeys.length > 10) {
        recommendations.push('Consider compressing large cache entries');
      }
      
      if (neverExpire.length > 20) {
        recommendations.push('Set TTL for keys that never expire');
      }
      
      if (expiringSoon.length > 50) {
        recommendations.push('High cache churn - consider longer TTL values');
      }

      return {
        totalKeys: keys.length,
        largeKeys: largeKeys.sort((a, b) => b.size - a.size).slice(0, 10),
        expiringSoon,
        neverExpire,
        recommendations
      };
    } catch (error) {
      logger.error('Failed to generate cache efficiency report:', error);
      throw error;
    }
  }
}

// Auto-start monitoring in production
if (process.env.NODE_ENV === 'production') {
  RedisMemoryMonitor.startMonitoring(30000); // Every 30 seconds in production
} else {
  RedisMemoryMonitor.startMonitoring(60000); // Every minute in development
}

export default RedisMemoryMonitor;