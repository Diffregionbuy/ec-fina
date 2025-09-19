import { Request, Response, NextFunction } from 'express';

// NUCLEAR LOGGING SOLUTION - Eliminates 99% of log bloat
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Track auth requests to prevent spam
const authTracker = new Map<string, number>();
const AUTH_COOLDOWN = 60000; // 1 minute

// Override console methods to filter bloat
console.log = (...args: any[]) => {
  const message = args.join(' ');
  
  // Block all debug statements with fire emojis
  if (message.includes('🔥')) return;
  
  // Block JWT spam
  if (message.includes('JWT token generated') || 
      message.includes('User logged in via NextAuth')) {
    const userId = extractUserId(message);
    if (userId) {
      const now = Date.now();
      const lastLog = authTracker.get(userId);
      if (lastLog && (now - lastLog) < AUTH_COOLDOWN) {
        return; // Skip this log
      }
      authTracker.set(userId, now);
    }
  }
  
  // Block Discord API spam
  if (message.includes('Discord API request') ||
      message.includes('Discord API response') ||
      message.includes('getDiscordGuilds completed') ||
      message.includes('Bot verified in server') ||
      message.includes('Bot status checked')) {
    return;
  }
  
  // Block service spam
  if (message.includes('Products retrieved successfully') ||
      message.includes('Server stats retrieved') ||
      message.includes('Categories retrieved successfully')) {
    return;
  }
  
  // Allow only critical logs
  originalConsoleLog(...args);
};

console.info = (...args: any[]) => {
  const message = args.join(' ');
  
  // Block all info spam except errors
  if (message.includes('[info]') && 
      !message.includes('Server running') &&
      !message.includes('error') &&
      !message.includes('failed')) {
    return;
  }
  
  originalConsoleInfo(...args);
};

console.warn = (...args: any[]) => {
  const message = args.join(' ');
  
  // Only show rate limit warnings, not excessive request warnings
  if (message.includes('Excessive requests detected')) {
    return;
  }
  
  originalConsoleWarn(...args);
};

// Keep error logging intact
console.error = originalConsoleError;

function extractUserId(message: string): string | null {
  const match = message.match(/"userId":"([^"]+)"/);
  return match ? match[1] : null;
}

// Nuclear HTTP request logger - only logs failures
export const nuclearLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Override res.send to capture response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // ONLY log failures and slow requests
    if (statusCode >= 400 || duration > 3000) {
      originalConsoleError(`[${statusCode >= 500 ? 'ERROR' : 'WARN'}] ${req.method} ${req.originalUrl} - ${statusCode} (${duration}ms)`);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Silence winston logger if it exists
try {
  const winston = require('winston');
  winston.configure({
    level: 'error',
    silent: process.env.NODE_ENV === 'production',
    transports: []
  });
} catch (e) {
  // Winston not available, ignore
}

export default nuclearLogger;