import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * Consolidated API Response Helper
 * Standardizes all API responses across the application
 */
export class ApiResponse {
  static success(data: any, message?: string, meta?: any) {
    return {
      success: true,
      data,
      message,
      meta,
      timestamp: new Date().toISOString(),
    };
  }

  static error(code: string, message: string, details?: any, statusCode: number = 400) {
    return {
      success: false,
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    };
  }

  static paginated(data: any[], pagination: PaginationMeta, message?: string) {
    return {
      success: true,
      data: {
        items: data,
        pagination,
      },
      message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Standardized Pagination Interface
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Consolidated Validation Schemas
 * Reusable validation patterns across different routes
 */
export const CommonSchemas = {
  serverId: {
    type: 'string',
    required: true,
    pattern: /^\d+$/,
    message: 'Server ID must be a valid Discord server ID'
  },
  
  pagination: {
    page: {
      type: 'number',
      min: 1,
      default: 1,
      transform: (val: any) => parseInt(val) || 1
    },
    limit: {
      type: 'number',
      min: 1,
      max: 100,
      default: 20,
      transform: (val: any) => Math.min(parseInt(val) || 20, 100)
    }
  },

  imageUrl: {
    type: 'string',
    format: 'uri',
    maxLength: 500,
    pattern: /^https:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i,
    message: 'Image URL must be HTTPS and point to a valid image file'
  },

  currency: {
    type: 'string',
    enum: ['USD', 'EUR', 'GBP', 'BTC', 'ETH'],
    default: 'USD'
  }
};

/**
 * Consolidated Server Access Validation
 * Reusable middleware for server ownership verification
 */
export const validateServerAccess = async (
  serverId: string, 
  userId: string, 
  supabase: any
): Promise<{ server: any; error?: any }> => {
  try {
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('id, owner_id, discord_server_id, name')
      .eq('discord_server_id', serverId)
      .single();

    if (serverError) {
      if (serverError.code === 'PGRST116') {
        return { 
          server: null, 
          error: ApiResponse.error('SERVER_NOT_FOUND', 'Server not found', null, 404) 
        };
      }
      throw serverError;
    }

    if (server.owner_id !== userId) {
      return { 
        server: null, 
        error: ApiResponse.error('INSUFFICIENT_PERMISSIONS', 'You must be the owner of this server', null, 403) 
      };
    }

    return { server };
  } catch (error) {
    logger.error('Server access validation failed:', error);
    return { 
      server: null, 
      error: ApiResponse.error('SERVER_ACCESS_ERROR', 'Failed to validate server access', null, 500) 
    };
  }
};

/**
 * Consolidated Image Validation
 * Enhanced image URL validation with security checks
 */
export const validateImageUrl = async (url: string): Promise<{ valid: boolean; error?: string }> => {
  if (!url || url.trim() === '') {
    return { valid: true }; // Empty URL is valid (optional field)
  }

  try {
    const urlObj = new URL(url);
    
    // Security check - only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return { valid: false, error: 'Image URL must use HTTPS for security' };
    }

    // Check for supported domains (optional whitelist)
    const allowedDomains = process.env.ALLOWED_IMAGE_DOMAINS?.split(',') || [];
    if (allowedDomains.length > 0 && !allowedDomains.some(domain => urlObj.hostname.includes(domain))) {
      // For now, just log but don't block
      logger.warn('Image URL from non-whitelisted domain:', { url, hostname: urlObj.hostname });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'EcBot/1.0 (Image Validator)',
        'Accept': 'image/*'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { valid: false, error: `Image URL returned ${response.status} ${response.statusText}` };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      return { valid: false, error: 'URL does not point to an image file' };
    }

    // Check file size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return { valid: false, error: 'Image file is too large (max 10MB)' };
    }

    // Check for supported formats
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedTypes.includes(contentType.toLowerCase())) {
      return { valid: false, error: 'Unsupported image format. Please use JPEG, PNG, GIF, or WebP' };
    }

    return { valid: true };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { valid: false, error: 'Image URL validation timed out' };
    }
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
      return { valid: false, error: 'Invalid URL format' };
    }
    return { 
      valid: false, 
      error: 'Unable to access image URL. Please check the URL is correct and publicly accessible.' 
    };
  }
};

/**
 * Consolidated Error Handler
 * Standardized error handling across all routes
 */
export const handleApiError = (error: any, operation: string, req: AuthenticatedRequest) => {
  logger.error(`Error in ${operation}:`, {
    error: error.message,
    stack: error.stack,
    userId: req.user?.id,
    operation,
    timestamp: new Date().toISOString()
  });

  if (error instanceof AppError) {
    throw error;
  }

  // Database errors
  if (error.code?.startsWith('PGRST')) {
    throw new AppError(`Database error in ${operation}`, 500, 'DATABASE_ERROR');
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    throw new AppError(error.message, 400, 'VALIDATION_ERROR');
  }

  // Generic error
  throw new AppError(`An unexpected error occurred in ${operation}`, 500, 'INTERNAL_ERROR');
};

/**
 * Consolidated Cache Helper
 * Standardized caching across API endpoints
 */
export class ApiCache {
  private static cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  static set(key: string, data: any, ttlMs: number = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  static get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  static clear(pattern?: string) {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const [key] of this.cache) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  static getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      memoryUsage: JSON.stringify(Array.from(this.cache.entries())).length
    };
  }
}

export default router;