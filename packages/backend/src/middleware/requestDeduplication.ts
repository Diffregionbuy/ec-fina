import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

class RequestDeduplicator {
  private pendingRequests = new Map<string, PendingRequest>();
  private readonly maxAge = 30 * 1000; // 30 seconds

  async deduplicate<T>(
    key: string,
    operation: () => Promise<T>,
    ttl: number = this.maxAge
  ): Promise<T> {
    // Clean up old requests
    this.cleanup();

    const existing = this.pendingRequests.get(key);
    
    if (existing && (Date.now() - existing.timestamp) < ttl) {
      logger.debug('Request deduplicated', { key });
      return existing.promise as Promise<T>;
    }

    // Create new request
    const promise = operation();
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now()
    });

    // Clean up after completion
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });

    return promise;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.maxAge) {
        this.pendingRequests.delete(key);
      }
    }
  }

  clear(): void {
    this.pendingRequests.clear();
  }

  getStats() {
    return {
      pendingRequests: this.pendingRequests.size
    };
  }
}

const requestDeduplicator = new RequestDeduplicator();

export const createDeduplicationMiddleware = (keyGenerator: (req: Request) => string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    
    try {
      await requestDeduplicator.deduplicate(key, async () => {
        return new Promise<void>((resolve, reject) => {
          const originalJson = res.json.bind(res);
          const originalStatus = res.status.bind(res);
          
          let completed = false;
          
          res.json = function(data: any) {
            if (!completed) {
              completed = true;
              resolve();
            }
            return originalJson(data);
          };
          
          res.status = function(code: number) {
            if (code >= 400 && !completed) {
              completed = true;
              reject(new Error(`HTTP ${code}`));
            }
            return originalStatus(code);
          };
          
          next();
        });
      });
    } catch (error) {
      logger.error('Request deduplication error', { key, error });
      next(error);
    }
  };
};

export { requestDeduplicator };