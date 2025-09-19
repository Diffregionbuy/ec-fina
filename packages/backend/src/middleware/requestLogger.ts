import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Log request details
  const requestData = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString(),
  };

  // Skip logging for health checks and static assets
  if (!req.url.includes('/health') && !req.url.includes('/favicon')) {
    logger.info('Incoming request:', requestData);
  }

  // Override res.end to log response details
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    
    const responseData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      timestamp: new Date().toISOString(),
    };

    // Log response based on status code
    if (res.statusCode >= 400) {
      logger.warn('Request completed with error:', responseData);
    } else if (!req.url.includes('/health') && !req.url.includes('/favicon')) {
      logger.info('Request completed:', responseData);
    }

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};