import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import DOMPurify from 'isomorphic-dompurify';
import { rateLimit } from 'express-rate-limit';
import { ApiResponse } from '../types/api';

// Enhanced validation schemas
export const validationSchemas = {
  // User input schemas
  productCreate: Joi.object({
    name: Joi.string()
      .trim()
      .min(1)
      .max(100)
      .pattern(/^[a-zA-Z0-9\s\-_.,!?()]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Product name contains invalid characters',
        'string.min': 'Product name must be at least 1 character',
        'string.max': 'Product name cannot exceed 100 characters'
      }),
    description: Joi.string()
      .trim()
      .max(2000)
      .allow('')
      .optional(),
    price: Joi.number()
      .positive()
      .precision(2)
      .max(999999.99)
      .required()
      .messages({
        'number.positive': 'Price must be positive',
        'number.precision': 'Price can have at most 2 decimal places',
        'number.max': 'Price cannot exceed $999,999.99'
      }),
    currency: Joi.string()
      .valid('USD', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT', 'USDC')
      .required(),
    image_url: Joi.string()
      .uri({ scheme: ['https'] })
      .max(500)
      .allow('')
      .optional()
      .messages({
        'string.uri': 'Image URL must be a valid HTTPS URL',
        'string.max': 'Image URL cannot exceed 500 characters'
      }),
    category_id: Joi.string()
      .uuid()
      .allow('')
      .optional(),
    stock_quantity: Joi.number()
      .integer()
      .min(0)
      .max(999999)
      .allow(null)
      .optional(),
    is_active: Joi.boolean()
      .default(true),
    minecraft_commands: Joi.array()
      .items(
        Joi.string()
          .trim()
          .min(2)
          .max(500)
          .pattern(/^\/[a-zA-Z0-9\s\-_.,!?(){}[\]]+$/)
          .messages({
            'string.pattern.base': 'Minecraft commands must start with / and contain valid characters'
          })
      )
      .max(20)
      .default([])
      .messages({
        'array.max': 'Cannot have more than 20 commands'
      })
  }),

  productUpdate: Joi.object({
    name: Joi.string()
      .trim()
      .min(1)
      .max(100)
      .pattern(/^[a-zA-Z0-9\s\-_.,!?()]+$/)
      .optional(),
    description: Joi.string()
      .trim()
      .max(2000)
      .allow('')
      .optional(),
    price: Joi.number()
      .positive()
      .precision(2)
      .max(999999.99)
      .optional(),
    currency: Joi.string()
      .valid('USD', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT', 'USDC')
      .optional(),
    image_url: Joi.string()
      .uri({ scheme: ['https'] })
      .max(500)
      .allow('')
      .optional(),
    category_id: Joi.string()
      .uuid()
      .allow('')
      .optional(),
    stock_quantity: Joi.number()
      .integer()
      .min(0)
      .max(999999)
      .allow(null)
      .optional(),
    is_active: Joi.boolean()
      .optional(),
    minecraft_commands: Joi.array()
      .items(
        Joi.string()
          .trim()
          .min(2)
          .max(500)
          .pattern(/^\/[a-zA-Z0-9\s\-_.,!?(){}[\]]+$/)
      )
      .max(20)
      .optional()
  }),

  categoryCreate: Joi.object({
    name: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .pattern(/^[a-zA-Z0-9\s\-_.,!?()]+$/)
      .required(),
    description: Joi.string()
      .trim()
      .max(500)
      .allow('')
      .optional(),
    emoji: Joi.string()
      .trim()
      .max(10)
      .pattern(/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u)
      .allow('')
      .optional(),
    image_url: Joi.string()
      .uri({ scheme: ['https'] })
      .max(500)
      .allow('')
      .optional(),
    is_active: Joi.boolean()
      .default(true)
  }),

  botConfigUpdate: Joi.object({
    vouch_channel_id: Joi.string()
      .pattern(/^\d{17,19}$/)
      .allow(null)
      .optional()
      .messages({
        'string.pattern.base': 'Invalid Discord channel ID format'
      }),
    templates: Joi.object()
      .pattern(
        Joi.string(),
        Joi.object({
          id: Joi.string().required(),
          name: Joi.string().max(100).required(),
          title: Joi.string().max(256).required(),
          description: Joi.string().max(4000).required(),
          color: Joi.string()
            .pattern(/^#[0-9A-Fa-f]{6}$/)
            .required()
            .messages({
              'string.pattern.base': 'Color must be a valid hex color code'
            }),
          thumbnail_url: Joi.string()
            .uri({ scheme: ['https'] })
            .max(500)
            .allow('')
            .optional(),
          footer_text: Joi.string().max(2048).allow('').optional(),
          footer_icon_url: Joi.string()
            .uri({ scheme: ['https'] })
            .max(500)
            .allow('')
            .optional(),
          banner_url: Joi.string()
            .uri({ scheme: ['https'] })
            .max(500)
            .allow('')
            .optional(),
          fields: Joi.array()
            .items(
              Joi.object({
                name: Joi.string().max(256).required(),
                value: Joi.string().max(1024).required(),
                inline: Joi.boolean().default(false)
              })
            )
            .max(25)
            .default([])
        })
      )
      .optional(),
    vouch_footer_message: Joi.string()
      .max(500)
      .allow('')
      .optional(),
    confirmation_note: Joi.string()
      .max(1000)
      .allow('')
      .optional()
  }),

  walletWithdrawal: Joi.object({
    currency: Joi.string()
      .valid('BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'XRP', 'ADA', 'SOL', 'DOT', 'MATIC')
      .required(),
    amount: Joi.string()
      .pattern(/^\d+(\.\d{1,8})?$/)
      .required()
      .messages({
        'string.pattern.base': 'Amount must be a valid number with up to 8 decimal places'
      }),
    destination: Joi.string()
      .trim()
      .min(10)
      .max(100)
      .pattern(/^[a-zA-Z0-9]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Destination address contains invalid characters'
      }),
    chain: Joi.string()
      .valid('BTC', 'ETH', 'BSC', 'MATIC', 'AVAX', 'FTM', 'ARBITRUM', 'OPTIMISM', 'TRX', 'SOL')
      .optional(),
    fee: Joi.string()
      .pattern(/^\d+(\.\d{1,8})?$/)
      .optional(),
    memo: Joi.string()
      .trim()
      .max(100)
      .pattern(/^[a-zA-Z0-9\s\-_]*$/)
      .allow('')
      .optional()
  }),

  // Query parameter schemas
  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .max(1000)
      .default(1),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20),
    sort: Joi.string()
      .valid('created_at', 'updated_at', 'name', 'price')
      .default('created_at'),
    order: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
  }),

  // ID validation
  uuid: Joi.string()
    .uuid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'Invalid UUID format'
    }),

  discordId: Joi.string()
    .pattern(/^\d{17,19}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid Discord ID format'
    })
};

// Input sanitization functions
export class InputSanitizer {
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') return '';
    
    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Sanitize HTML content
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    
    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    return sanitized;
  }

  static sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  }

  static validateAndSanitizeUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      // Only allow HTTPS URLs
      if (urlObj.protocol !== 'https:') {
        return null;
      }
      
      // Block suspicious domains
      const blockedDomains = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '10.',
        '192.168.',
        '172.16.',
        'file://',
        'javascript:',
        'data:'
      ];
      
      const hostname = urlObj.hostname.toLowerCase();
      if (blockedDomains.some(blocked => hostname.includes(blocked))) {
        return null;
      }
      
      return urlObj.toString();
    } catch {
      return null;
    }
  }
}

// Rate limiting for validation endpoints
export const validationRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many validation requests. Please slow down.',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Main validation middleware factory
export function validateInput(schema: Joi.ObjectSchema, target: 'body' | 'query' | 'params' = 'body') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get the data to validate
      const data = req[target];
      
      // Sanitize input first
      const sanitizedData = InputSanitizer.sanitizeObject(data);
      
      // Validate against schema
      const { error, value } = schema.validate(sanitizedData, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });
      
      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
        
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input validation failed',
            details: validationErrors,
            timestamp: new Date().toISOString()
          }
        };
        
        return res.status(400).json(response);
      }
      
      // Replace the original data with validated and sanitized data
      req[target] = value;
      next();
      
    } catch (err) {
      console.error('Validation middleware error:', err);
      
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          timestamp: new Date().toISOString()
        }
      };
      
      res.status(500).json(response);
    }
  };
}

// Specialized validation middlewares
export const validateProductCreate = validateInput(validationSchemas.productCreate);
export const validateProductUpdate = validateInput(validationSchemas.productUpdate);
export const validateCategoryCreate = validateInput(validationSchemas.categoryCreate);
export const validateBotConfigUpdate = validateInput(validationSchemas.botConfigUpdate);
export const validateWalletWithdrawal = validateInput(validationSchemas.walletWithdrawal);
export const validatePagination = validateInput(validationSchemas.pagination, 'query');
export const validateUuid = (paramName: string = 'id') => 
  validateInput(Joi.object({ [paramName]: validationSchemas.uuid }), 'params');
export const validateDiscordId = (paramName: string = 'serverId') => 
  validateInput(Joi.object({ [paramName]: validationSchemas.discordId }), 'params');

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self' https: wss:; " +
    "frame-ancestors 'none';"
  );
  
  // Other security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  next();
}

// Request size limiting
export function requestSizeLimit(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.get('content-length');
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: `Request size exceeds maximum allowed size of ${maxSize}`,
            timestamp: new Date().toISOString()
          }
        };
        
        return res.status(413).json(response);
      }
    }
    
    next();
  };
}

// Helper function to parse size strings
function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return value * units[unit];
}

// Export all validation utilities
export default {
  validationSchemas,
  InputSanitizer,
  validateInput,
  validateProductCreate,
  validateProductUpdate,
  validateCategoryCreate,
  validateBotConfigUpdate,
  validateWalletWithdrawal,
  validatePagination,
  validateUuid,
  validateDiscordId,
  validationRateLimit,
  securityHeaders,
  requestSizeLimit
};