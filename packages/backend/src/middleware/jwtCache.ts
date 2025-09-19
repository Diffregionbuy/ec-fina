import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { logger } from '../utils/logger';

interface JWTCacheEntry {
  user: any;
  timestamp: number;
  expiresAt: number;
}

class JWTCache {
  private cache = new Map<string, JWTCacheEntry>();
  private readonly maxSize = 500;
  private readonly bufferTime = 5 * 60 * 1000; // 5 minutes buffer before actual expiry

  set(token: string, user: any, expiresAt: number): void {
    // Clean up if cache is getting too large
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    this.cache.set(token, {
      user,
      timestamp: Date.now(),
      expiresAt
    });
  }

  get(token: string): any | null {
    const entry = this.cache.get(token);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    
    // Check if token is expired (with buffer)
    if (now >= (entry.expiresAt - this.bufferTime)) {
      this.cache.delete(token);
      return null;
    }

    return entry.user;
  }

  delete(token: string): void {
    this.cache.delete(token);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [token, entry] of this.cache.entries()) {
      if (now >= (entry.expiresAt - this.bufferTime)) {
        keysToDelete.push(token);
      }
    }

    keysToDelete.forEach(token => this.cache.delete(token));
    
    // If still too large, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, Math.floor(this.maxSize * 0.2));
      toRemove.forEach(([token]) => this.cache.delete(token));
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

const jwtCache = new JWTCache();

export const jwtCacheMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);
  const cachedUser = jwtCache.get(token);

  if (cachedUser) {
    req.user = cachedUser;
    logger.debug('JWT cache hit', { userId: cachedUser.id });
    return next();
  }

  // Store original authenticate method result
  const originalNext = next;
  let authCompleted = false;

  const wrappedNext = (error?: any) => {
    if (!authCompleted && !error && req.user) {
      // Cache the authenticated user
      const expiresAt = req.user.discordExpiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days default
      jwtCache.set(token, req.user, expiresAt);
      logger.debug('JWT cached', { userId: req.user.id });
    }
    authCompleted = true;
    originalNext(error);
  };

  // Replace next function
  Object.defineProperty(req, 'next', { value: wrappedNext });
  next();
};

export { jwtCache };