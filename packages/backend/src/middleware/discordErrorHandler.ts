import { logger } from '../services/monitoring';

interface DiscordErrorContext {
  serverId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
}

export class DiscordErrorHandler {
  private static knownIssues = new Set<string>();
  private static errorCounts = new Map<string, number>();
  private static lastErrorTime = new Map<string, number>();

  static handleDiscordError(error: any, context: DiscordErrorContext = {}) {
    const { serverId, userId, endpoint, method } = context;
    const errorKey = `${serverId || 'unknown'}_${error.status || error.code}`;
    const now = Date.now();
    
    // Rate limit error logging for known issues
    const lastError = this.lastErrorTime.get(errorKey) || 0;
    const timeSinceLastError = now - lastError;
    
    // Only log the same error once per 5 minutes
    if (timeSinceLastError < 5 * 60 * 1000 && this.knownIssues.has(errorKey)) {
      return this.getSilentResponse(error, context);
    }

    this.lastErrorTime.set(errorKey, now);
    this.knownIssues.add(errorKey);

    // Handle specific Discord API errors gracefully
    switch (error.status) {
      case 404:
        return this.handle404Error(error, context);
      case 403:
        return this.handle403Error(error, context);
      case 429:
        return this.handle429Error(error, context);
      case 401:
        return this.handle401Error(error, context);
      default:
        return this.handleGenericError(error, context);
    }
  }

  private static handle404Error(error: any, context: DiscordErrorContext) {
    const { serverId, endpoint } = context;
    
    if (endpoint?.includes('/guilds/')) {
      // Server not found or bot not in server
      logger.debug(`Bot not in server ${serverId} or server doesn't exist`, {
        service: 'ecbot-api',
        serverId,
        action: 'discord_server_not_found'
      });
      
      return {
        success: false,
        error: 'SERVER_NOT_ACCESSIBLE',
        message: 'Bot is not in this server or server does not exist',
        shouldRetry: false,
        userFriendly: true
      };
    }

    return {
      success: false,
      error: 'RESOURCE_NOT_FOUND',
      message: 'Discord resource not found',
      shouldRetry: false
    };
  }

  private static handle403Error(error: any, context: DiscordErrorContext) {
    const { serverId } = context;
    
    logger.debug(`Bot lacks permissions for server ${serverId}`, {
      service: 'ecbot-api',
      serverId,
      action: 'discord_permission_denied'
    });

    return {
      success: false,
      error: 'INSUFFICIENT_PERMISSIONS',
      message: 'Bot lacks required permissions for this server',
      shouldRetry: false,
      userFriendly: true
    };
  }

  private static handle429Error(error: any, context: DiscordErrorContext) {
    const resetAfter = error.rateLimit?.resetAfter || 1;
    
    // Only log rate limits if they're excessive (>5 seconds)
    if (resetAfter > 5) {
      logger.warn(`Discord rate limit exceeded`, {
        service: 'ecbot-api',
        resetAfter,
        bucket: error.rateLimit?.bucket,
        action: 'discord_rate_limit_exceeded'
      });
    }

    return {
      success: false,
      error: 'RATE_LIMITED',
      message: 'Discord API rate limit reached',
      shouldRetry: true,
      retryAfter: resetAfter * 1000
    };
  }

  private static handle401Error(error: any, context: DiscordErrorContext) {
    logger.error(`Discord authentication failed`, {
      service: 'ecbot-api',
      action: 'discord_auth_failed',
      context
    });

    return {
      success: false,
      error: 'AUTHENTICATION_FAILED',
      message: 'Discord authentication failed',
      shouldRetry: false
    };
  }

  private static handleGenericError(error: any, context: DiscordErrorContext) {
    logger.error(`Discord API error`, {
      service: 'ecbot-api',
      error: error.message,
      status: error.status,
      context,
      action: 'discord_generic_error'
    });

    return {
      success: false,
      error: 'DISCORD_API_ERROR',
      message: error.message || 'Discord API error occurred',
      shouldRetry: error.status >= 500
    };
  }

  private static getSilentResponse(error: any, context: DiscordErrorContext) {
    // Return appropriate response without logging
    switch (error.status) {
      case 404:
        return {
          success: false,
          error: 'SERVER_NOT_ACCESSIBLE',
          message: 'Bot is not in this server',
          shouldRetry: false,
          userFriendly: true
        };
      case 403:
        return {
          success: false,
          error: 'INSUFFICIENT_PERMISSIONS',
          message: 'Bot lacks required permissions',
          shouldRetry: false,
          userFriendly: true
        };
      default:
        return {
          success: false,
          error: 'DISCORD_API_ERROR',
          message: 'Discord API temporarily unavailable',
          shouldRetry: false
        };
    }
  }

  static isUserFriendlyError(errorCode: string): boolean {
    return ['SERVER_NOT_ACCESSIBLE', 'INSUFFICIENT_PERMISSIONS'].includes(errorCode);
  }

  static getErrorCounts() {
    return Object.fromEntries(this.errorCounts);
  }

  static clearErrorCounts() {
    this.errorCounts.clear();
    this.knownIssues.clear();
    this.lastErrorTime.clear();
  }
}