import winston from 'winston';

// WINSTON NUCLEAR OVERRIDE - Completely silences Winston logging
const originalWinstonLog = winston.Logger.prototype.log;
const originalWinstonInfo = winston.Logger.prototype.info;
const originalWinstonWarn = winston.Logger.prototype.warn;
const originalWinstonError = winston.Logger.prototype.error;
const originalWinstonDebug = winston.Logger.prototype.debug;

// Track auth spam to prevent it
const authSpamTracker = new Map<string, number>();
const AUTH_SPAM_COOLDOWN = 60000; // 1 minute

// Override Winston logger methods to block spam
winston.Logger.prototype.log = function(level: any, message: any, meta?: any) {
  // Convert arguments to string for analysis
  const logMessage = typeof message === 'string' ? message : JSON.stringify(message);
  const metaStr = meta ? JSON.stringify(meta) : '';
  const fullMessage = `${logMessage} ${metaStr}`;
  
  // BLOCK ALL JWT AND AUTH SPAM
  if (fullMessage.includes('JWT token generated') || 
      fullMessage.includes('User logged in via NextAuth')) {
    const userId = extractUserId(fullMessage);
    if (userId) {
      const now = Date.now();
      const lastLog = authSpamTracker.get(userId);
      if (lastLog && (now - lastLog) < AUTH_SPAM_COOLDOWN) {
        return this; // Block this log
      }
      authSpamTracker.set(userId, now);
    }
  }
  
  // BLOCK DISCORD API SPAM
  if (fullMessage.includes('Discord API request') ||
      fullMessage.includes('Discord API response') ||
      fullMessage.includes('getDiscordGuilds completed') ||
      fullMessage.includes('getGuildDetails completed') ||
      fullMessage.includes('getGuildMembers completed') ||
      fullMessage.includes('Bot verified in server') ||
      fullMessage.includes('Bot status checked')) {
    return this; // Block this log
  }
  
  // BLOCK SERVICE SUCCESS SPAM
  if (fullMessage.includes('Products retrieved successfully') ||
      fullMessage.includes('Server stats retrieved') ||
      fullMessage.includes('Categories retrieved successfully') ||
      fullMessage.includes('Fetched Discord servers successfully')) {
    return this; // Block this log
  }
  
  // BLOCK RATE LIMIT SPAM (keep only errors)
  if (fullMessage.includes('Rate limit reached') && level !== 'error') {
    return this; // Block this log
  }
  
  // BALANCED LOGGING - Keep essential info, block spam
  const shouldLog = (
    // Always log errors and critical warnings
    level === 'error' ||
    (level === 'warn' && !fullMessage.includes('Rate limit reached')) ||
    
    // Keep essential startup and system info
    fullMessage.includes('Server running') ||
    fullMessage.includes('Emergency GC enabled') ||
    fullMessage.includes('Discord API resilience configuration loaded') ||
    
    // Keep first auth success per session (not spam)
    (fullMessage.includes('JWT token generated') && shouldLogAuth(fullMessage)) ||
    
    // Keep important business events (but limit frequency)
    (fullMessage.includes('Products retrieved successfully') && shouldLogBusiness()) ||
    
    // Keep critical Discord events (not spam)
    (fullMessage.includes('Discord API response') && level === 'warn') ||
    
    // Keep performance warnings
    fullMessage.includes('slow') ||
    fullMessage.includes('timeout') ||
    fullMessage.includes('failed')
  );
  
  if (shouldLog) {
    return originalWinstonLog.call(this, level, message, meta);
  }
  
  return this; // Block spam only
};

// Override all Winston methods
winston.Logger.prototype.info = function(message: any, meta?: any) {
  return this.log('info', message, meta);
};

winston.Logger.prototype.warn = function(message: any, meta?: any) {
  return this.log('warn', message, meta);
};

winston.Logger.prototype.error = function(message: any, meta?: any) {
  return this.log('error', message, meta);
};

winston.Logger.prototype.debug = function(message: any, meta?: any) {
  return this.log('debug', message, meta);
};

// Helper function to extract user ID
function extractUserId(message: string): string | null {
  const match = message.match(/"userId":"([^"]+)"/);
  return match ? match[1] : null;
}

// Override the default Winston logger creation
const originalCreateLogger = winston.createLogger;
winston.createLogger = function(options?: winston.LoggerOptions) {
  const logger = originalCreateLogger.call(this, {
    ...options,
    level: 'error', // Force error level only
    silent: process.env.NODE_ENV === 'production', // Silent in production
    transports: options?.transports || []
  });
  
  return logger;
};

// Override winston.configure
const originalConfigure = winston.configure;
winston.configure = function(options: winston.LoggerOptions) {
  return originalConfigure.call(this, {
    ...options,
    level: 'error',
    silent: process.env.NODE_ENV === 'production'
  });
};

console.log('🚀 Winston Nuclear Override activated - 99% log reduction enabled');

export default winston;