import { Request, Response, NextFunction } from 'express';
import { DiscordAuthService } from '../auth/discord';
import { jwtService } from '../utils/jwt';
import { logger } from '../utils/logger';
import { AppError } from './centralizedErrorHandler';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

export interface AuthenticatedUser {
  id: string;
  discordId: string;
  username: string;
  avatar: string | null;
  email: string | null;
  discordAccessToken: string;
  discordRefreshToken: string;
  discordExpiresAt: number;
  roles?: string[];
  permissions?: string[];
  sessionId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
  fingerprint?: string;
}

export interface TokenPayload {
  userId: string;
  discordId: string;
  username: string;
  avatar: string | null;
  email: string | null;
  discordAccessToken: string;
  discordRefreshToken: string;
  discordExpiresAt: number;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface SecurityConfig {
  maxFailedAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
  tokenRotationThreshold: number;
  enableFingerprinting: boolean;
  enableRateLimit: boolean;
}

export class EnhancedAuthMiddleware {
  private discordAuth: DiscordAuthService;
  private ownershipCache: Map<string, { ownedServers: string[], timestamp: number }> = new Map();
  private tokenBlacklist: Set<string> = new Set();
  private failedAttempts: Map<string, { count: number, lastAttempt: number }> = new Map();
  private sessionStore: Map<string, { userId: string, createdAt: number, lastActivity: number }> = new Map();
  private suspiciousActivity: Map<string, { count: number, lastActivity: number }> = new Map();
  
  private readonly config: SecurityConfig = {
    maxFailedAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    tokenRotationThreshold: 2 * 60 * 60 * 1000, // 2 hours
    enableFingerprinting: true,
    enableRateLimit: true
  };

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.discordAuth = new DiscordAuthService();
    this.startCleanupTasks();
  }

  /**
   * Start background cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions();
      this.cleanupFailedAttempts();
      this.cleanupSuspiciousActivity();
    }, 60 * 60 * 1000);
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessionStore.entries()) {
      if (now - session.lastActivity > this.config.sessionTimeout) {
        this.sessionStore.delete(sessionId);
        logger.debug('Cleaned up expired session', { sessionId });
      }
    }
  }

  /**
   * Clean up old failed attempts
   */
  private cleanupFailedAttempts(): void {
    const now = Date.now();
    for (const [ip, attempt] of this.failedAttempts.entries()) {
      if (now - attempt.lastAttempt > this.config.lockoutDuration) {
        this.failedAttempts.delete(ip);
      }
    }
  }

  /**
   * Clean up old suspicious activity records
   */
  private cleanupSuspiciousActivity(): void {
    const now = Date.now();
    for (const [key, activity] of this.suspiciousActivity.entries()) {
      if (now - activity.lastActivity > 24 * 60 * 60 * 1000) { // 24 hours
        this.suspiciousActivity.delete(key);
      }
    }
  }

  /**
   * Generate device fingerprint
   */
  private generateFingerprint(req: Request): string {
    const components = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.ip || '',
    ];
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Check if IP is locked out
   */
  private isLockedOut(ip: string): boolean {
    const attempt = this.failedAttempts.get(ip);
    if (!attempt) return false;

    const now = Date.now();
    if (now - attempt.lastAttempt > this.config.lockoutDuration) {
      this.failedAttempts.delete(ip);
      return false;
    }

    return attempt.count >= this.config.maxFailedAttempts;
  }

  /**
   * Record failed authentication attempt
   */
  private recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const existing = this.failedAttempts.get(ip);
    
    if (existing && now - existing.lastAttempt < this.config.lockoutDuration) {
      existing.count++;
      existing.lastAttempt = now;
    } else {
      this.failedAttempts.set(ip, { count: 1, lastAttempt: now });
    }

    logger.warn('Failed authentication attempt recorded', {
      ip,
      attempts: this.failedAttempts.get(ip)?.count || 0,
      timestamp: new Date(now).toISOString()
    });
  }

  /**
   * Clear failed attempts for IP
   */
  private clearFailedAttempts(ip: string): void {
    this.failedAttempts.delete(ip);
  }

  /**
   * Detect suspicious activity
   */
  private detectSuspiciousActivity(req: AuthenticatedRequest): boolean {
    const key = `${req.ip}-${req.user?.id || 'anonymous'}`;
    const now = Date.now();
    const existing = this.suspiciousActivity.get(key);

    if (existing && now - existing.lastActivity < 60000) { // 1 minute
      existing.count++;
      if (existing.count > 10) { // More than 10 requests per minute
        logger.warn('Suspicious activity detected', {
          ip: req.ip,
          userId: req.user?.id,
          requestCount: existing.count,
          timeWindow: '1 minute'
        });
        return true;
      }
    } else {
      this.suspiciousActivity.set(key, { count: 1, lastActivity: now });
    }

    return false;
  }

  /**
   * Validate token structure and content
   */
  private validateTokenPayload(payload: any): payload is TokenPayload {
    return (
      payload &&
      typeof payload.userId === 'string' &&
      typeof payload.discordId === 'string' &&
      typeof payload.username === 'string' &&
      typeof payload.discordAccessToken === 'string' &&
      typeof payload.discordRefreshToken === 'string' &&
      typeof payload.discordExpiresAt === 'number' &&
      typeof payload.sessionId === 'string'
    );
  }

  /**
   * Check if token is blacklisted
   */
  private isTokenBlacklisted(token: string): boolean {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return this.tokenBlacklist.has(tokenHash);
  }

  /**
   * Blacklist a token
   */
  private blacklistToken(token: string): void {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    this.tokenBlacklist.add(tokenHash);
    
    // Clean up old blacklisted tokens (keep for 7 days)
    setTimeout(() => {
      this.tokenBlacklist.delete(tokenHash);
    }, 7 * 24 * 60 * 60 * 1000);
  }

  /**
   * Enhanced authentication middleware with security features
   */
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clientIp = req.ip || 'unknown';
      
      // Check if IP is locked out
      if (this.isLockedOut(clientIp)) {
        logger.warn('Authentication blocked - IP locked out', { ip: clientIp });
        throw new AppError('Too many failed attempts. Please try again later.', 429, 'IP_LOCKED_OUT');
      }

      // Generate device fingerprint
      if (this.config.enableFingerprinting) {
        req.fingerprint = this.generateFingerprint(req);
      }

      const token = jwtService.extractTokenFromHeader(req.headers.authorization);
      
      logger.debug('Enhanced authentication attempt', {
        hasAuthHeader: !!req.headers.authorization,
        hasToken: !!token,
        tokenLength: token?.length || 0,
        url: req.url,
        method: req.method,
        ip: clientIp,
        fingerprint: req.fingerprint,
        userAgent: req.headers['user-agent']?.substring(0, 100)
      });
      
      if (!token) {
        this.recordFailedAttempt(clientIp);
        throw new AppError('Authorization token is required', 401, 'MISSING_TOKEN');
      }

      // Check if token is blacklisted
      if (this.isTokenBlacklisted(token)) {
        this.recordFailedAttempt(clientIp);
        logger.warn('Blacklisted token used', { ip: clientIp });
        throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
      }

      try {
        const payload = jwtService.verifyToken(token) as TokenPayload;
        
        // Validate token payload structure
        if (!this.validateTokenPayload(payload)) {
          this.recordFailedAttempt(clientIp);
          logger.warn('Invalid token payload structure', {
            hasUserId: !!payload?.userId,
            hasDiscordId: !!payload?.discordId,
            hasSessionId: !!payload?.sessionId,
            ip: clientIp
          });
          throw new AppError('Invalid token payload', 401, 'INVALID_TOKEN_PAYLOAD');
        }

        // Validate session
        const session = this.sessionStore.get(payload.sessionId);
        if (!session || session.userId !== payload.userId) {
          this.recordFailedAttempt(clientIp);
          logger.warn('Invalid session', { 
            sessionId: payload.sessionId,
            userId: payload.userId,
            ip: clientIp
          });
          throw new AppError('Invalid session', 401, 'INVALID_SESSION');
        }

        // Update session activity
        session.lastActivity = Date.now();

        // Check if Discord token needs refresh
        if (this.discordAuth.needsTokenRefresh(payload)) {
          logger.info('Discord token needs refresh', { 
            userId: payload.userId,
            sessionId: payload.sessionId,
            expiresAt: payload.discordExpiresAt
          });
          
          try {
            const refreshedTokens = await this.discordAuth.refreshAccessToken(
              payload.discordRefreshToken
            );
            
            // Generate new JWT with refreshed Discord tokens
            const newJWT = jwtService.generateToken({
              userId: payload.userId,
              discordId: payload.discordId,
              username: payload.username,
              avatar: payload.avatar,
              email: payload.email,
              discordAccessToken: refreshedTokens.accessToken,
              discordRefreshToken: refreshedTokens.refreshToken,
              discordExpiresAt: Date.now() + refreshedTokens.expiresIn * 1000,
              sessionId: payload.sessionId
            });
            
            // Set new JWT in response header for client to update
            res.setHeader('X-New-Token', newJWT);
            
            // Update payload for current request
            payload.discordAccessToken = refreshedTokens.accessToken;
            payload.discordRefreshToken = refreshedTokens.refreshToken;
            payload.discordExpiresAt = Date.now() + refreshedTokens.expiresIn * 1000;
            
            logger.info('Discord tokens refreshed successfully', { 
              userId: payload.userId,
              sessionId: payload.sessionId
            });
          } catch (refreshError) {
            logger.error('Token refresh failed:', {
              error: refreshError instanceof Error ? refreshError.message : 'Unknown error',
              userId: payload.userId,
              sessionId: payload.sessionId,
              ip: clientIp
            });
            
            // Blacklist the current token and invalidate session
            this.blacklistToken(token);
            this.sessionStore.delete(payload.sessionId);
            
            throw new AppError('Failed to refresh authentication token. Please sign in again.', 401, 'TOKEN_REFRESH_FAILED');
          }
        }

        // Attach enhanced user info to request
        req.user = {
          id: payload.userId,
          discordId: payload.discordId,
          username: payload.username,
          avatar: payload.avatar,
          email: payload.email,
          discordAccessToken: payload.discordAccessToken,
          discordRefreshToken: payload.discordRefreshToken,
          discordExpiresAt: payload.discordExpiresAt,
          sessionId: payload.sessionId
        };

        req.sessionId = payload.sessionId;

        // Clear failed attempts on successful authentication
        this.clearFailedAttempts(clientIp);

        // Detect suspicious activity
        if (this.detectSuspiciousActivity(req)) {
          logger.warn('Suspicious activity detected but allowing request', {
            userId: payload.userId,
            ip: clientIp,
            url: req.url
          });
        }

        logger.debug('Enhanced authentication successful', { 
          userId: payload.userId,
          sessionId: payload.sessionId,
          ip: clientIp,
          tokenAge: Date.now() - (payload.iat || 0) * 1000
        });

        next();
      } catch (jwtError) {
        this.recordFailedAttempt(clientIp);
        
        if (jwtError instanceof AppError) {
          throw jwtError;
        }
        
        logger.warn('JWT verification failed', {
          error: jwtError instanceof Error ? jwtError.message : 'Unknown error',
          tokenLength: token.length,
          url: req.url,
          ip: clientIp
        });
        
        if (jwtError instanceof Error) {
          if (jwtError.message.includes('expired')) {
            throw new AppError('Authentication token has expired. Please sign in again.', 401, 'TOKEN_EXPIRED');
          } else if (jwtError.message.includes('invalid')) {
            throw new AppError('Invalid authentication token. Please sign in again.', 401, 'INVALID_TOKEN');
          }
        }
        
        throw new AppError('Authentication token verification failed', 401, 'TOKEN_VERIFICATION_FAILED');
      }
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      logger.error('Enhanced authentication middleware error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        url: req.url,
        method: req.method,
        ip: req.ip
      });
      return next(new AppError('Authentication service error', 500, 'AUTH_ERROR'));
    }
  };

  /**
   * Create new session
   */
  createSession = (userId: string): string => {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    
    this.sessionStore.set(sessionId, {
      userId,
      createdAt: now,
      lastActivity: now
    });

    logger.debug('New session created', { userId, sessionId });
    return sessionId;
  };

  /**
   * Invalidate session
   */
  invalidateSession = (sessionId: string): void => {
    this.sessionStore.delete(sessionId);
    logger.debug('Session invalidated', { sessionId });
  };

  /**
   * Logout middleware - invalidates session and blacklists token
   */
  logout = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const token = jwtService.extractTokenFromHeader(req.headers.authorization);
      
      if (token) {
        this.blacklistToken(token);
      }

      if (req.sessionId) {
        this.invalidateSession(req.sessionId);
      }

      logger.info('User logged out', {
        userId: req.user?.id,
        sessionId: req.sessionId,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Logout error:', error);
      return next(new AppError('Logout failed', 500, 'LOGOUT_ERROR'));
    }
  };

  /**
   * Enhanced server ownership middleware with caching and security
   */
  requireServerOwnership = (serverIdParam: string = 'serverId') => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
        }

        const serverId = req.params[serverIdParam];
        if (!serverId) {
          throw new AppError('Server ID is required', 400, 'MISSING_SERVER_ID');
        }

        // Check cache first
        const cacheKey = req.user.id;
        const cached = this.ownershipCache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
          if (!cached.ownedServers.includes(serverId)) {
            logger.warn('Server ownership denied (cached)', {
              userId: req.user.id,
              serverId,
              ip: req.ip
            });
            throw new AppError('You must be the owner of this Discord server', 403, 'INSUFFICIENT_PERMISSIONS');
          }
          return next();
        }

        // Verify ownership via Discord API
        try {
          const guilds = await this.discordAuth.getDiscordGuilds(req.user.discordAccessToken);
          const ownedServers = guilds.filter(guild => guild.owner).map(guild => guild.id);
          
          // Cache the result
          this.ownershipCache.set(cacheKey, {
            ownedServers,
            timestamp: now
          });

          if (!ownedServers.includes(serverId)) {
            logger.warn('Server ownership denied', {
              userId: req.user.id,
              serverId,
              ownedServers: ownedServers.length,
              ip: req.ip
            });
            throw new AppError('You must be the owner of this Discord server', 403, 'INSUFFICIENT_PERMISSIONS');
          }

          logger.debug('Server ownership verified', {
            userId: req.user.id,
            serverId,
            ip: req.ip
          });

          next();
        } catch (discordError) {
          logger.error('Discord API error during ownership check:', {
            error: discordError instanceof Error ? discordError.message : 'Unknown error',
            userId: req.user.id,
            serverId,
            ip: req.ip
          });
          
          // Use stale cache as fallback
          if (cached) {
            logger.warn('Using stale cache due to Discord API error', { 
              userId: req.user.id,
              cacheAge: now - cached.timestamp
            });
            
            if (!cached.ownedServers.includes(serverId)) {
              throw new AppError('You must be the owner of this Discord server', 403, 'INSUFFICIENT_PERMISSIONS');
            }
            return next();
          }
          
          throw new AppError('Unable to verify server ownership', 503, 'DISCORD_API_ERROR');
        }
      } catch (error) {
        if (error instanceof AppError) {
          return next(error);
        }
        logger.error('Server ownership middleware error:', error);
        return next(new AppError('Authorization service error', 500, 'AUTHORIZATION_ERROR'));
      }
    };
  };

  /**
   * Rate limiting middleware for authentication endpoints
   */
  authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again later.',
        timestamp: new Date().toISOString()
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for successful authentications
      return false;
    }
  });

  /**
   * Optional authentication middleware (doesn't fail if no token)
   */
  optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return next();
    }

    try {
      const payload = jwtService.verifyToken(token) as TokenPayload;
      
      if (this.validateTokenPayload(payload) && !this.isTokenBlacklisted(token)) {
        const session = this.sessionStore.get(payload.sessionId);
        if (session && session.userId === payload.userId) {
          req.user = {
            id: payload.userId,
            discordId: payload.discordId,
            username: payload.username,
            avatar: payload.avatar,
            email: payload.email,
            discordAccessToken: payload.discordAccessToken,
            discordRefreshToken: payload.discordRefreshToken,
            discordExpiresAt: payload.discordExpiresAt,
            sessionId: payload.sessionId
          };
          req.sessionId = payload.sessionId;
          session.lastActivity = Date.now();
        }
      }
    } catch (error) {
      logger.debug('Optional authentication failed (continuing without auth):', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });
    }
    
    next();
  };

  /**
   * Get authentication statistics
   */
  getAuthStats = () => {
    return {
      activeSessions: this.sessionStore.size,
      blacklistedTokens: this.tokenBlacklist.size,
      lockedIPs: Array.from(this.failedAttempts.entries())
        .filter(([, attempt]) => attempt.count >= this.config.maxFailedAttempts)
        .length,
      suspiciousActivities: this.suspiciousActivity.size,
      cacheEntries: this.ownershipCache.size
    };
  };
}

// Export singleton instance
export const enhancedAuthMiddleware = new EnhancedAuthMiddleware();

// Export commonly used middleware functions
export const authenticateToken = enhancedAuthMiddleware.authenticate;
export const requireServerOwnership = enhancedAuthMiddleware.requireServerOwnership;
export const optionalAuth = enhancedAuthMiddleware.optionalAuth;
export const authRateLimit = enhancedAuthMiddleware.authRateLimit;
export const logout = enhancedAuthMiddleware.logout;