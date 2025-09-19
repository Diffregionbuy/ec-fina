import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from './logger';

export interface JWTPayload {
  userId: string;
  discordId: string;
  username: string;
  avatar: string | null;
  email: string | null;
  discordAccessToken: string;
  discordRefreshToken: string;
  discordExpiresAt: number;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

// OPTIMIZED JWT TOKEN CACHE - Prevents excessive token generation
class OptimizedJWTTokenCache {
  private tokenCache = new Map<string, {
    token: string;
    payload: JWTPayload;
    expiresAt: number;
    createdAt: number;
  }>();

  private readonly MAX_CACHE_SIZE = 500;
  private readonly TOKEN_REUSE_WINDOW = 30 * 60 * 1000; // 30 minutes - reuse tokens within this window
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired tokens every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Get or create a JWT token for the user
   * CRITICAL: This prevents token spam by reusing valid tokens
   */
  getOrCreateToken(userKey: string, payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
    const now = Date.now();
    const cached = this.tokenCache.get(userKey);

    // Check if we have a valid cached token that can be reused
    if (cached && now < cached.expiresAt - (5 * 60 * 1000)) { // 5 minute buffer
      // Check if the token is still fresh enough to reuse (within reuse window)
      if (now - cached.createdAt < this.TOKEN_REUSE_WINDOW) {
        logger.debug('JWT token reused from cache', { 
          userId: payload.userId,
          tokenAge: Math.round((now - cached.createdAt) / 1000) + 's',
          expiresIn: Math.round((cached.expiresAt - now) / 1000) + 's'
        });
        return cached.token;
      }
    }

    // Generate new token only if necessary
    const newToken = this.generateNewToken(payload);
    const tokenPayload = jwt.decode(newToken) as JWTPayload;
    
    // Cache the new token
    if (this.tokenCache.size >= this.MAX_CACHE_SIZE) {
      this.cleanup();
    }

    this.tokenCache.set(userKey, {
      token: newToken,
      payload: tokenPayload,
      expiresAt: tokenPayload.exp! * 1000,
      createdAt: now
    });

    logger.info('JWT token generated', {
      userId: payload.userId,
      discordId: payload.discordId,
      expiresIn: '7d'
    });

    return newToken;
  }

  private generateNewToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    return jwt.sign(payload, jwtSecret, {
      expiresIn: '7d',
      issuer: 'ecbot-api',
      audience: 'ecbot-frontend',
    });
  }

  /**
   * Invalidate cached token for a user
   */
  invalidateUser(userKey: string): void {
    this.tokenCache.delete(userKey);
    logger.debug('JWT token cache invalidated', { userKey });
  }

  /**
   * Cleanup expired tokens
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.tokenCache.entries()) {
      if (now >= cached.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.tokenCache.delete(key));

    // If still too large, remove oldest entries
    if (this.tokenCache.size >= this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.tokenCache.entries());
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
      
      const toRemove = entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.2));
      toRemove.forEach(([key]) => this.tokenCache.delete(key));
    }

    if (keysToDelete.length > 0) {
      logger.debug('JWT token cache cleanup', { 
        removedTokens: keysToDelete.length,
        remainingTokens: this.tokenCache.size 
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.tokenCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      tokens: Array.from(this.tokenCache.entries()).map(([key, cached]) => ({
        userKey: key,
        age: Date.now() - cached.createdAt,
        expiresIn: cached.expiresAt - Date.now(),
        userId: cached.payload.userId
      }))
    };
  }

  /**
   * Clear all cached tokens
   */
  clear(): void {
    this.tokenCache.clear();
    logger.info('JWT token cache cleared');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

export class OptimizedJWTService {
  private readonly jwtSecret: string;
  private tokenCache: OptimizedJWTTokenCache;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET!;
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    this.tokenCache = new OptimizedJWTTokenCache();
  }

  /**
   * OPTIMIZED: Generate or reuse JWT token - Prevents token spam
   */
  generateToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
    // Create a unique key for this user's token cache
    const userKey = this.createUserKey(payload.userId, payload.discordId);
    
    return this.tokenCache.getOrCreateToken(userKey, payload);
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'ecbot-api',
        audience: 'ecbot-frontend',
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Validate token payload structure
   */
  validateTokenPayload(payload: any): payload is JWTPayload {
    return (
      payload &&
      typeof payload.userId === 'string' &&
      typeof payload.discordId === 'string' &&
      typeof payload.username === 'string' &&
      typeof payload.discordAccessToken === 'string' &&
      typeof payload.discordRefreshToken === 'string' &&
      typeof payload.discordExpiresAt === 'number'
    );
  }

  /**
   * Create a unique cache key for the user
   */
  private createUserKey(userId: string, discordId: string): string {
    return crypto.createHash('sha256')
      .update(`${userId}_${discordId}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Invalidate cached tokens for a user (e.g., on logout)
   */
  invalidateUserTokens(userId: string, discordId: string): void {
    const userKey = this.createUserKey(userId, discordId);
    this.tokenCache.invalidateUser(userKey);
  }

  /**
   * Get token cache statistics
   */
  getTokenCacheStats() {
    return this.tokenCache.getStats();
  }

  /**
   * Clear all cached tokens
   */
  clearTokenCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.tokenCache.destroy();
  }
}

// Export singleton instance
export const optimizedJwtService = new OptimizedJWTService();

// Export for backward compatibility
export const jwtService = optimizedJwtService;