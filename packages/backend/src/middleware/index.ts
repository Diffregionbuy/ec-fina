/**
 * Centralized Middleware Export
 * Provides easy access to all optimized middleware components
 */

// Error Handling
export {
  centralizedErrorHandler,
  asyncHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalAPIError,
  ErrorRecovery,
  healthCheckErrorHandler
} from './centralizedErrorHandler';

// Authentication & Authorization
export { authMiddleware, AuthenticatedRequest } from './auth';
export { 
  botServiceAuth, 
  authenticateBotService, 
  authenticateServiceJWT, 
  requireBotPermissions, 
  generateBotServiceJWT,
  BotServiceRequest 
} from './botAuth';

// Rate Limiting
export { rateLimiter } from './rateLimiter';

// Request Logging
export { requestLogger } from './requestLogger';

// Discord-specific middleware
export { discordRateLimit } from './discordRateLimit';
export { discordErrorHandler } from './discordErrorHandler';

// Caching
export { authCaching } from './authCaching';

// Security
export { requestDeduplication } from './requestDeduplication';
export { sessionIsolation } from './sessionIsolation';

/**
 * Middleware Stack Builder
 * Helps create consistent middleware stacks across routes
 */
export class MiddlewareStack {
  private middlewares: any[] = [];

  // Add authentication
  withAuth() {
    this.middlewares.push(authMiddleware.authenticate);
    return this;
  }

  // Add rate limiting
  withRateLimit(options?: any) {
    this.middlewares.push(rateLimiter(options));
    return this;
  }

  // Add Discord-specific rate limiting
  withDiscordRateLimit() {
    this.middlewares.push(discordRateLimit);
    return this;
  }

  // Add request logging
  withLogging() {
    this.middlewares.push(requestLogger);
    return this;
  }

  // Add caching
  withCaching() {
    this.middlewares.push(authCaching);
    return this;
  }

  // Add request deduplication
  withDeduplication() {
    this.middlewares.push(requestDeduplication);
    return this;
  }

  // Add session isolation
  withSessionIsolation() {
    this.middlewares.push(sessionIsolation);
    return this;
  }

  // Build the middleware array
  build() {
    return this.middlewares;
  }

  // Static method for common stacks
  static authenticated() {
    return new MiddlewareStack()
      .withAuth()
      .withRateLimit()
      .withLogging()
      .build();
  }

  static public() {
    return new MiddlewareStack()
      .withRateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
      .withLogging()
      .build();
  }

  static discord() {
    return new MiddlewareStack()
      .withAuth()
      .withDiscordRateLimit()
      .withCaching()
      .withLogging()
      .build();
  }

  static admin() {
    return new MiddlewareStack()
      .withAuth()
      .withRateLimit({ windowMs: 5 * 60 * 1000, max: 50 })
      .withSessionIsolation()
      .withLogging()
      .build();
  }
}

/**
 * Common Middleware Configurations
 */
export const MiddlewareConfig = {
  // Standard rate limits
  rateLimits: {
    strict: { windowMs: 15 * 60 * 1000, max: 50 },
    moderate: { windowMs: 15 * 60 * 1000, max: 100 },
    lenient: { windowMs: 15 * 60 * 1000, max: 200 },
    discord: { windowMs: 60 * 1000, max: 30 } // Discord API specific
  },

  // Cache configurations
  cache: {
    short: 5 * 60 * 1000,    // 5 minutes
    medium: 30 * 60 * 1000,  // 30 minutes
    long: 60 * 60 * 1000,    // 1 hour
    extended: 24 * 60 * 60 * 1000 // 24 hours
  },

  // Security headers
  security: {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://api.discord.com", "https://www.okx.com"]
        }
      }
    }
  }
};