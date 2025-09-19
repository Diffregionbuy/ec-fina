import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../utils/jwt';
import { logger } from '../utils/logger';
import { AppError } from './centralizedErrorHandler';
import crypto from 'crypto';

export interface BotServiceRequest extends Request {
  botService?: {
    type: string;
    permissions: string[];
    authenticated: boolean;
    serviceId: string;
  };
}

export interface BotServiceTokenPayload {
  service: string;
  serviceId: string;
  permissions: string[];
  type: 'bot_service';
  iat?: number;
  exp?: number;
}

export class BotServiceAuth {
  private validBotTokens = new Map<string, {
    name: string;
    permissions: string[];
    active: boolean;
    lastUsed?: number;
  }>();

  private serviceTokenCache = new Map<string, {
    payload: BotServiceTokenPayload;
    expiresAt: number;
  }>();

  constructor() {
    // Initialize valid bot service tokens
    this.initializeBotTokens();
  }

  private initializeBotTokens() {
    // Discord Bot Service Token
    const discordBotToken = process.env.DISCORD_BOT_SERVICE_TOKEN;
    if (discordBotToken) {
      this.validBotTokens.set(discordBotToken, {
        name: 'discord_bot',
        permissions: [
          'read_templates',
          'read_products',
          'read_categories',
          'create_payments',
          'webhook_access',
          'read_bot_config',
          'minecraft_integration',
          'update_order_status',
          'read_orders',
          'admin_access'
        ],
        active: true
      });
    }

    // Payment Service Token (for webhook processing)
    const paymentServiceToken = process.env.PAYMENT_SERVICE_TOKEN;
    if (paymentServiceToken) {
      this.validBotTokens.set(paymentServiceToken, {
        name: 'payment_service',
        permissions: [
          'webhook_access',
          'update_order_status',
          'read_orders',
          'create_transactions'
        ],
        active: true
      });
    }

    logger.info('Bot service tokens initialized', {
      tokenCount: this.validBotTokens.size,
      services: Array.from(this.validBotTokens.values()).map(t => t.name)
    });
  }

  /**
   * Middleware to authenticate bot service requests
   */
  authenticateBotService = async (req: BotServiceRequest, res: Response, next: NextFunction) => {
    try {
      const botToken = req.headers['x-bot-token'] as string;
      
      if (!botToken) {
        logger.warn('Missing bot service token', {
          url: req.url,
          method: req.method,
          ip: req.ip,
          userAgent: req.headers['user-agent']?.substring(0, 50)
        });
        throw new AppError('Bot service token is required', 401, 'MISSING_BOT_TOKEN');
      }

      const serviceConfig = this.validBotTokens.get(botToken);
      
      if (!serviceConfig || !serviceConfig.active) {
        logger.warn('Invalid bot service token', {
          tokenLength: botToken.length,
          url: req.url,
          method: req.method,
          ip: req.ip
        });
        throw new AppError('Invalid bot service token', 401, 'INVALID_BOT_TOKEN');
      }

      // Update last used timestamp
      serviceConfig.lastUsed = Date.now();

      // Create bot service context
      req.botService = {
        type: 'bot_service',
        permissions: serviceConfig.permissions,
        authenticated: true,
        serviceId: serviceConfig.name
      };

      logger.debug('Bot service authenticated', {
        service: serviceConfig.name,
        permissions: serviceConfig.permissions,
        url: req.url,
        method: req.method
      });

      next();
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      logger.error('Bot service authentication error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        url: req.url,
        method: req.method
      });
      return next(new AppError('Bot service authentication failed', 500, 'BOT_AUTH_ERROR'));
    }
  };

  /**
   * Generate JWT token for bot service operations
   */
  generateBotServiceJWT = async (req: BotServiceRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.botService) {
        throw new AppError('Bot service authentication required', 401, 'UNAUTHENTICATED');
      }

      const { service, permissions } = req.body;
      
      // Validate requested service matches authenticated service
      if (service && service !== req.botService.serviceId) {
        throw new AppError('Service mismatch', 403, 'SERVICE_MISMATCH');
      }

      // Validate requested permissions are subset of service permissions
      if (permissions && Array.isArray(permissions)) {
        const unauthorizedPermissions = permissions.filter(
          (perm: string) => !req.botService!.permissions.includes(perm)
        );
        
        if (unauthorizedPermissions.length > 0) {
          throw new AppError(
            `Unauthorized permissions: ${unauthorizedPermissions.join(', ')}`,
            403,
            'INSUFFICIENT_PERMISSIONS'
          );
        }
      }

      // Generate service ID for this token
      const serviceId = crypto.randomBytes(16).toString('hex');
      
      const tokenPayload: BotServiceTokenPayload = {
        service: req.botService.serviceId,
        serviceId,
        permissions: permissions || req.botService.permissions,
        type: 'bot_service'
      };

      const token = jwtService.generateBotServiceToken(tokenPayload, '1h');
      const expiresIn = 3600; // 1 hour

      // Cache the token payload
      this.serviceTokenCache.set(token, {
        payload: tokenPayload,
        expiresAt: Date.now() + (expiresIn * 1000)
      });

      logger.info('Bot service JWT generated', {
        service: req.botService.serviceId,
        serviceId,
        permissions: tokenPayload.permissions,
        expiresIn
      });

      res.json({
        success: true,
        data: {
          token,
          expiresIn,
          service: req.botService.serviceId,
          permissions: tokenPayload.permissions
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      logger.error('Bot service JWT generation error:', error);
      return next(new AppError('Failed to generate service token', 500, 'TOKEN_GENERATION_ERROR'));
    }
  };

  /**
   * Middleware to authenticate JWT tokens from bot services
   */
  authenticateServiceJWT = async (req: BotServiceRequest, res: Response, next: NextFunction) => {
    try {
      const token = jwtService.extractTokenFromHeader(req.headers.authorization);
      
      if (!token) {
        throw new AppError('Service JWT token is required', 401, 'MISSING_SERVICE_TOKEN');
      }

      // Check cache first
      const cached = this.serviceTokenCache.get(token);
      if (cached && Date.now() < cached.expiresAt) {
        req.botService = {
          type: 'bot_service',
          permissions: cached.payload.permissions,
          authenticated: true,
          serviceId: cached.payload.service
        };
        
        logger.debug('Service JWT cache hit', {
          service: cached.payload.service,
          serviceId: cached.payload.serviceId
        });
        
        return next();
      }

      // Verify JWT token
      const payload = jwtService.verifyToken(token) as BotServiceTokenPayload;
      
      // Validate token is for bot service
      if (payload.type !== 'bot_service') {
        throw new AppError('Invalid service token type', 401, 'INVALID_TOKEN_TYPE');
      }

      // Validate service still exists and is active
      const serviceExists = Array.from(this.validBotTokens.values())
        .some(config => config.name === payload.service && config.active);
      
      if (!serviceExists) {
        throw new AppError('Service no longer active', 401, 'SERVICE_INACTIVE');
      }

      req.botService = {
        type: 'bot_service',
        permissions: payload.permissions,
        authenticated: true,
        serviceId: payload.service
      };

      // Update cache
      this.serviceTokenCache.set(token, {
        payload,
        expiresAt: (payload.exp || 0) * 1000
      });

      logger.debug('Service JWT authenticated', {
        service: payload.service,
        serviceId: payload.serviceId,
        permissions: payload.permissions
      });

      next();
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      
      logger.warn('Service JWT verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url: req.url,
        method: req.method
      });
      
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          return next(new AppError('Service token has expired', 401, 'TOKEN_EXPIRED'));
        } else if (error.message.includes('invalid')) {
          return next(new AppError('Invalid service token', 401, 'INVALID_TOKEN'));
        }
      }
      
      return next(new AppError('Service token verification failed', 401, 'TOKEN_VERIFICATION_FAILED'));
    }
  };

  /**
   * Middleware to require specific bot service permissions
   */
  requireBotPermissions = (requiredPermissions: string[]) => {
    return async (req: BotServiceRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.botService) {
          throw new AppError('Bot service authentication required', 401, 'UNAUTHENTICATED');
        }

        const hasAllPermissions = requiredPermissions.every(permission =>
          req.botService!.permissions.includes(permission)
        );

        if (!hasAllPermissions) {
          const missingPermissions = requiredPermissions.filter(
            permission => !req.botService!.permissions.includes(permission)
          );
          
          logger.warn('Insufficient bot service permissions', {
            service: req.botService.serviceId,
            required: requiredPermissions,
            missing: missingPermissions,
            available: req.botService.permissions
          });

          throw new AppError(
            `Insufficient permissions. Missing: ${missingPermissions.join(', ')}`,
            403,
            'INSUFFICIENT_PERMISSIONS'
          );
        }

        logger.debug('Bot service permissions validated', {
          service: req.botService.serviceId,
          permissions: requiredPermissions
        });

        next();
      } catch (error) {
        if (error instanceof AppError) {
          return next(error);
        }
        logger.error('Bot permission check error:', error);
        return next(new AppError('Permission check failed', 500, 'PERMISSION_CHECK_ERROR'));
      }
    };
  };

  /**
   * Get bot service statistics
   */
  getStats() {
    return {
      registeredServices: this.validBotTokens.size,
      activeTokens: this.serviceTokenCache.size,
      services: Array.from(this.validBotTokens.entries()).map(([token, config]) => ({
        name: config.name,
        permissions: config.permissions,
        active: config.active,
        lastUsed: config.lastUsed ? new Date(config.lastUsed).toISOString() : null
      }))
    };
  }

  /**
   * Cleanup expired tokens from cache
   */
  cleanupExpiredTokens() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [token, cached] of this.serviceTokenCache.entries()) {
      if (now >= cached.expiresAt) {
        this.serviceTokenCache.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired service tokens', { count: cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * Revoke a specific service token
   */
  revokeServiceToken(token: string): boolean {
    const existed = this.serviceTokenCache.has(token);
    this.serviceTokenCache.delete(token);
    
    if (existed) {
      logger.info('Service token revoked', { tokenLength: token.length });
    }
    
    return existed;
  }

  /**
   * Deactivate a bot service
   */
  deactivateService(serviceName: string): boolean {
    for (const [token, config] of this.validBotTokens.entries()) {
      if (config.name === serviceName) {
        config.active = false;
        logger.warn('Bot service deactivated', { service: serviceName });
        return true;
      }
    }
    return false;
  }
}

// Export singleton instance
export const botServiceAuth = new BotServiceAuth();

// Export commonly used middleware functions
export const authenticateBotService = botServiceAuth.authenticateBotService;
export const authenticateServiceJWT = botServiceAuth.authenticateServiceJWT;
export const requireBotPermissions = botServiceAuth.requireBotPermissions;
export const generateBotServiceJWT = botServiceAuth.generateBotServiceJWT;

// Set up periodic cleanup of expired tokens
setInterval(() => {
  botServiceAuth.cleanupExpiredTokens();
}, 5 * 60 * 1000); // Every 5 minutes