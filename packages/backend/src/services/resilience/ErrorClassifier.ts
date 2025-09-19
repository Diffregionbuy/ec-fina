import { logger } from '../../utils/logger';

export interface ClassifiedError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  statusCode?: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
}

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR',
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export class ErrorClassifier {
  private static readonly RETRYABLE_STATUS_CODES = new Set([
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
    520, // Unknown Error (Cloudflare)
    521, // Web Server Is Down (Cloudflare)
    522, // Connection Timed Out (Cloudflare)
    523, // Origin Is Unreachable (Cloudflare)
    524, // A Timeout Occurred (Cloudflare)
  ]);

  private static readonly RETRYABLE_ERROR_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNABORTED',
    'ENETUNREACH',
    'ENETDOWN',
    'EHOSTUNREACH',
    'EHOSTDOWN',
    'EPIPE',
    'EAI_AGAIN'
  ]);

  /**
   * Classify an error to determine its properties and handling strategy
   */
  static classify(error: any): ClassifiedError {
    // Handle Axios HTTP response errors
    if (error.response) {
      return this.classifyHttpError(error);
    }

    // Handle Axios request errors (network issues)
    if (error.request) {
      return this.classifyNetworkError(error);
    }

    // Handle other errors (timeouts, etc.)
    return this.classifyGenericError(error);
  }

  /**
   * Classify HTTP response errors
   */
  private static classifyHttpError(error: any): ClassifiedError {
    const statusCode = error.response.status;
    const statusText = error.response.statusText || 'Unknown Error';
    const responseData = error.response.data;
    
    // Extract Retry-After header if present
    const retryAfter = error.response.headers && error.response.headers['retry-after'] 
      ? parseInt(error.response.headers['retry-after']) 
      : undefined;

    // Extract Discord-specific error information
    const discordError = this.extractDiscordErrorInfo(responseData);
    
    const baseError = {
      statusCode,
      retryAfter,
      message: discordError.message || `HTTP ${statusCode}: ${statusText}`
    };

    // Classify based on status code ranges
    if (statusCode === 401) {
      return {
        ...baseError,
        code: discordError.code || 'UNAUTHORIZED',
        retryable: false,
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH
      };
    }

    if (statusCode === 403) {
      return {
        ...baseError,
        code: discordError.code || 'FORBIDDEN',
        retryable: false,
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH
      };
    }

    if (statusCode === 429) {
      return {
        ...baseError,
        code: discordError.code || 'RATE_LIMITED',
        retryable: true,
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM
      };
    }

    if (statusCode >= 400 && statusCode < 500) {
      return {
        ...baseError,
        code: discordError.code || `HTTP_${statusCode}`,
        retryable: false,
        category: ErrorCategory.CLIENT_ERROR,
        severity: statusCode === 404 ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM
      };
    }

    if (statusCode >= 500) {
      return {
        ...baseError,
        code: discordError.code || `HTTP_${statusCode}`,
        retryable: this.RETRYABLE_STATUS_CODES.has(statusCode),
        category: ErrorCategory.SERVER_ERROR,
        severity: ErrorSeverity.HIGH
      };
    }

    // Fallback for other status codes
    return {
      ...baseError,
      code: `HTTP_${statusCode}`,
      retryable: this.RETRYABLE_STATUS_CODES.has(statusCode),
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM
    };
  }

  /**
   * Classify network-related errors
   */
  private static classifyNetworkError(error: any): ClassifiedError {
    const errorCode = error.code || 'NETWORK_ERROR';
    const retryable = this.RETRYABLE_ERROR_CODES.has(errorCode);
    
    let category = ErrorCategory.NETWORK;
    let severity = ErrorSeverity.MEDIUM;
    
    // Classify specific network errors
    if (errorCode.includes('TIMEOUT') || errorCode === 'ETIMEDOUT') {
      category = ErrorCategory.TIMEOUT;
      severity = ErrorSeverity.MEDIUM;
    } else if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND') {
      severity = ErrorSeverity.HIGH;
    }

    return {
      code: errorCode,
      message: error.message || `Network error: ${errorCode}`,
      retryable,
      category,
      severity
    };
  }

  /**
   * Classify generic errors
   */
  private static classifyGenericError(error: any): ClassifiedError {
    const message = error.message || 'Unknown error occurred';
    
    // Check for timeout in message
    if (message.toLowerCase().includes('timeout')) {
      return {
        code: 'TIMEOUT',
        message,
        retryable: true,
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM
      };
    }

    // Check for abort in message
    if (message.toLowerCase().includes('abort')) {
      return {
        code: 'ABORTED',
        message,
        retryable: true,
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.LOW
      };
    }

    return {
      code: error.code || 'UNKNOWN_ERROR',
      message,
      retryable: false,
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM
    };
  }

  /**
   * Extract Discord-specific error information from response data
   */
  private static extractDiscordErrorInfo(responseData: any): { code?: string; message?: string } {
    if (!responseData) {
      return {};
    }

    // Discord API error format
    if (responseData.code && responseData.message) {
      return {
        code: `DISCORD_${responseData.code}`,
        message: responseData.message
      };
    }

    // Discord API error with errors array
    if (responseData.errors) {
      const firstError = Object.values(responseData.errors)[0];
      if (firstError && typeof firstError === 'object') {
        const errorObj = firstError as any;
        if (errorObj._errors && errorObj._errors[0]) {
          return {
            code: errorObj._errors[0].code,
            message: errorObj._errors[0].message
          };
        }
      }
    }

    return {};
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(error: any): boolean {
    const classified = this.classify(error);
    return classified.retryable;
  }

  /**
   * Get retry delay from error (if specified by server)
   */
  static getRetryDelay(error: any): number | undefined {
    const classified = this.classify(error);
    return classified.retryAfter;
  }

  /**
   * Log classified error with appropriate level
   */
  static logError(error: any, context: string = 'operation'): ClassifiedError {
    const classified = this.classify(error);
    
    const logData = {
      context,
      code: classified.code,
      category: classified.category,
      severity: classified.severity,
      retryable: classified.retryable,
      statusCode: classified.statusCode,
      retryAfter: classified.retryAfter
    };

    switch (classified.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(`Critical error in ${context}`, { ...logData, message: classified.message });
        break;
      case ErrorSeverity.HIGH:
        logger.error(`High severity error in ${context}`, { ...logData, message: classified.message });
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(`Medium severity error in ${context}`, { ...logData, message: classified.message });
        break;
      case ErrorSeverity.LOW:
        logger.info(`Low severity error in ${context}`, { ...logData, message: classified.message });
        break;
    }

    return classified;
  }
}