import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from './auth';

/**
 * Centralized Error Types
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error for consistent input validation
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication Error for auth-related issues
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: any) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Authorization Error for permission issues
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: any) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

/**
 * Not Found Error for missing resources
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', details?: any) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
  }
}

/**
 * Conflict Error for duplicate resources
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * Rate Limit Error
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 429, 'RATE_LIMIT_ERROR', details);
  }
}

/**
 * Database Error for database-related issues
 */
export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed', details?: any) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * External API Error for third-party service failures
 */
export class ExternalAPIError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super(`${service} API error: ${message}`, 502, 'EXTERNAL_API_ERROR', details);
  }
}

/**
 * Standardized Error Response Format
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
    stack?: string;
  };
}

/**
 * Error Classification Helper
 */
class ErrorClassifier {
  static classifyError(error: any): { statusCode: number; code: string; message: string; details?: any } {
    // Handle known AppError instances
    if (error instanceof AppError) {
      return {
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
        details: error.details
      };
    }

    // Handle Joi validation errors
    if (error.name === 'ValidationError' && error.details) {
      return {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        details: error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }))
      };
    }

    // Handle Supabase/PostgreSQL errors
    if (error.code?.startsWith('PGRST')) {
      const statusCode = error.code === 'PGRST116' ? 404 : 500;
      return {
        statusCode,
        code: 'DATABASE_ERROR',
        message: statusCode === 404 ? 'Resource not found' : 'Database operation failed',
        details: { postgrestCode: error.code, hint: error.hint }
      };
    }

    // Handle PostgreSQL constraint violations
    if (error.code === '23505') { // Unique violation
      return {
        statusCode: 409,
        code: 'DUPLICATE_RESOURCE',
        message: 'Resource already exists',
        details: { constraint: error.constraint, table: error.table }
      };
    }

    if (error.code === '23503') { // Foreign key violation
      return {
        statusCode: 400,
        code: 'INVALID_REFERENCE',
        message: 'Referenced resource does not exist',
        details: { constraint: error.constraint, table: error.table }
      };
    }

    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
      return {
        statusCode: 401,
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token'
      };
    }

    if (error.name === 'TokenExpiredError') {
      return {
        statusCode: 401,
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired'
      };
    }

    // Handle fetch/network errors
    if (error.name === 'FetchError' || error.code === 'ECONNREFUSED') {
      return {
        statusCode: 502,
        code: 'EXTERNAL_SERVICE_ERROR',
        message: 'External service unavailable',
        details: { service: error.hostname || 'unknown' }
      };
    }

    // Handle timeout errors
    if (error.name === 'AbortError' || error.code === 'ETIMEDOUT') {
      return {
        statusCode: 504,
        code: 'TIMEOUT_ERROR',
        message: 'Request timeout'
      };
    }

    // Handle syntax errors (should not happen in production)
    if (error instanceof SyntaxError) {
      return {
        statusCode: 400,
        code: 'SYNTAX_ERROR',
        message: 'Invalid request format'
      };
    }

    // Default to internal server error
    return {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    };
  }
}

/**
 * Request ID Generator for error tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Centralized Error Handler Middleware
 */
export const centralizedErrorHandler = (
  error: any,
  req: Request | AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const requestId = generateRequestId();
  const { statusCode, code, message, details } = ErrorClassifier.classifyError(error);

  // Enhanced logging with context
  const logContext = {
    requestId,
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode,
      stack: error.stack
    },
    request: {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: (req as AuthenticatedRequest).user?.id,
      body: req.method !== 'GET' ? req.body : undefined,
      query: req.query
    },
    timestamp: new Date().toISOString()
  };

  // Log based on severity
  if (statusCode >= 500) {
    logger.error('Server Error:', logContext);
  } else if (statusCode >= 400) {
    logger.warn('Client Error:', logContext);
  } else {
    logger.info('Request Error:', logContext);
  }

  // Prepare error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details: process.env.NODE_ENV === 'development' ? details : undefined,
      timestamp: new Date().toISOString(),
      requestId,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  };

  // Send response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async Error Handler Wrapper
 * Wraps async route handlers to catch and forward errors
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not Found Handler
 * Handles 404 errors for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError('Route', {
    method: req.method,
    path: req.path,
    availableRoutes: [] // Could be populated with actual available routes
  });
  next(error);
};

/**
 * Error Recovery Helper
 * Provides fallback responses for critical errors
 */
export class ErrorRecovery {
  static async withFallback<T>(
    operation: () => Promise<T>,
    fallback: T,
    errorMessage: string = 'Operation failed'
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`Fallback used for: ${errorMessage}`, { error: error.message });
      return fallback;
    }
  }

  static async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        logger.warn(`Operation failed, retrying (${attempt}/${maxRetries})`, {
          error: error.message,
          attempt,
          nextRetryIn: delay
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
    
    throw lastError;
  }
}

/**
 * Health Check Error Handler
 * Special handler for health check endpoints
 */
export const healthCheckErrorHandler = (error: any): { status: string; error?: string } => {
  if (error instanceof AppError) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
  
  return {
    status: 'unhealthy',
    error: 'Health check failed'
  };
};

export {
  AppError as default,
  ErrorClassifier,
  generateRequestId
};