import { logger } from './logger';

export class MemoryManager {
  private static instance: MemoryManager;
  private cleanupInterval?: NodeJS.Timeout;
  private lastGC = 0;

  private constructor() {
    // Only start monitoring if not disabled
    if (process.env.DISABLE_MONITORING !== 'true') {
      this.startMonitoring();
    }
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  private startMonitoring(): void {
    // Monitor memory every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.checkAndCleanup();
    }, 30000);

    // Also monitor on process warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        logger.warn('Memory warning detected', { warning: warning.message });
        this.forceCleanup();
      }
    });
  }

  private checkAndCleanup(): void {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // Force GC if memory usage is high and it's been a while since last GC
    const now = Date.now();
    const timeSinceLastGC = now - this.lastGC;

    // Adjusted threshold for 512MB memory limit - allow higher usage before cleanup
    if (heapUsagePercent > 85 && timeSinceLastGC > 30000) {
      this.forceCleanup();
    }

    // Log memory stats periodically (only in debug mode)
    if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
      logger.debug('Memory usage', {
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        usage: `${heapUsagePercent.toFixed(1)}%`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
      });
    }
  }

  forceCleanup(): void {
    const before = process.memoryUsage();
    
    try {
      // Clear any global caches or cleanup
      if (global.gc) {
        global.gc();
        this.lastGC = Date.now();
        
        const after = process.memoryUsage();
        const freedMB = Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024);
        
        if (freedMB > 0) {
          logger.info('Memory cleanup completed', {
            freedMemory: `${freedMB}MB`,
            beforeHeap: `${Math.round(before.heapUsed / 1024 / 1024)}MB`,
            afterHeap: `${Math.round(after.heapUsed / 1024 / 1024)}MB`
          });
        }
      }
    } catch (error: any) {
      logger.error('Memory cleanup failed', { error: error?.message || 'Unknown error' });
    }
  }

  getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      external: Math.round(memUsage.external / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      lastGC: this.lastGC
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

// Initialize memory manager
export const memoryManager = MemoryManager.getInstance();