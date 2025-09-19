import { Request, Response, NextFunction } from 'express';
import winston from 'winston';

// Create a production-optimized logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Request deduplication cache
const requestCache = new Map<string, { count: number; lastSeen: number }>();
const CACHE_CLEANUP_INTERVAL = 60000; // 1 minute
const DUPLICATE_THRESHOLD = 2; // Only log after 2+ duplicates

// Clean up cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCache.entries()) {
    if (now - value.lastSeen > CACHE_CLEANUP_INTERVAL) {
      requestCache.delete(key);
    }
  }
}, CACHE_CLEANUP_INTERVAL);

interface OptimizedRequest extends Request {
  startTime?: number;
  requestId?: string;
}

// Ultra-minimal request logger for production
export const productionLogger = (req: OptimizedRequest, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  req.startTime = startTime;
  req.requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;

  // Create request signature for deduplication
  const requestKey = `${req.method}:${req.path}:${req.ip}`;
  const now = Date.now();
  
  // Check for duplicates
  const cached = requestCache.get(requestKey);
  if (cached && (now - cached.lastSeen) < 5000) { // 5 second window
    cached.count++;
    cached.lastSeen = now;
    
    // Only log if it's getting excessive (5+ requests in 5 seconds)
    if (cached.count >= 5 && cached.count % 5 === 0) {
      logger.warn(`Excessive requests detected`, {
        service: 'ecbot-api',
        method: req.method,
        path: req.path,
        duplicateCount: cached.count,
        timeWindow: '5s'
      });
    }
    
    // Skip logging for duplicates
    return next();
  } else {
    requestCache.set(requestKey, { count: 1, lastSeen: now });
  }

  // Response handler
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // ULTRA RESTRICTIVE LOGGING - Only log what's absolutely necessary
    const shouldLog = (
      statusCode >= 400 || // Errors and client errors
      duration > 2000 || // Slow requests (2s+)
      (req.path.includes('/auth/login') && statusCode === 200) || // Successful logins only
      (statusCode >= 500) // Server errors
    );

    if (shouldLog) {
      const logLevel = statusCode >= 500 ? 'error' : 
                     statusCode >= 400 ? 'warn' : 'info';
      
      logger[logLevel](`Request ${statusCode >= 400 ? 'failed' : 'completed'}`, {
        service: 'ecbot-api',
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode,
        duration: `${duration}ms`,
        ...(statusCode >= 400 && { userAgent: req.get('User-Agent')?.substring(0, 50) }),
        ...(req.user && { userId: (req.user as any).id })
      });
    }

    return originalSend.call(this, data);
  };

  next();
};

// Minimal auth logger - only log failures and first success per session
export const minimalAuthLogger = (message: string, data: any = {}) => {
  const env = process.env.NODE_ENV || 'development';
  
  // In production, only log auth failures and warnings
  if (env === 'production') {
    if (message.includes('failed') || message.includes('error') || message.includes('unauthorized')) {
      logger.warn(message, { service: 'ecbot-api', ...data });
    }
    return;
  }
  
  // In development, be more selective
  if (message.includes('JWT token generated') || message.includes('User logged in')) {
    // Only log once per minute per user to avoid spam
    const userKey = `auth_${data.userId || 'unknown'}`;
    const cached = requestCache.get(userKey);
    const now = Date.now();
    
    if (!cached || (now - cached.lastSeen) > 60000) { // 1 minute
      requestCache.set(userKey, { count: 1, lastSeen: now });
      logger.info(message, { service: 'ecbot-api', ...data });
    }
    return;
  }
  
  // Log other auth events normally in development
  if (env === 'development') {
    logger.debug(message, { service: 'ecbot-api', ...data });
  }
};

export default productionLogger;