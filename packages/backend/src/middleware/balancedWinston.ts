import winston from 'winston';

// BALANCED WINSTON SOLUTION - Eliminates spam but keeps essential logs
const originalWinstonLog = winston.Logger.prototype.log;

// Track auth spam to prevent it (but allow some)
const authSpamTracker = new Map<string, number>();
const businessLogTracker = { lastLog: 0 };

// Override Winston logger methods with balanced filtering
winston.Logger.prototype.log = function(level: any, message: any, meta?: any) {
  // Convert arguments to string for analysis
  const logMessage = typeof message === 'string' ? message : JSON.stringify(message);
  const metaStr = meta ? JSON.stringify(meta) : '';
  const fullMessage = `${logMessage} ${metaStr}`;
  
  // BALANCED FILTERING - Keep essential, block spam
  const shouldLog = (
    // Always log errors and critical warnings
    level === 'error' ||
    (level === 'warn' && !fullMessage.includes('Rate limit reached')) ||
    
    // Keep essential startup and system info
    fullMessage.includes('Server running') ||
    fullMessage.includes('Emergency GC enabled') ||
    
    // Keep first auth success per session (limit to once per 5 minutes per user)
    (fullMessage.includes('JWT token generated') && shouldLogAuth(fullMessage)) ||
    
    // Keep important business events (but limit frequency to once per minute)
    (fullMessage.includes('Products retrieved successfully') && shouldLogBusiness()) ||
    (fullMessage.includes('Server stats retrieved') && shouldLogBusiness()) ||
    
    // Keep critical Discord events (errors and warnings only)
    (fullMessage.includes('Discord API response') && level === 'warn') ||
    (fullMessage.includes('Rate limit reached') && level === 'warn') ||
    
    // Keep performance issues
    fullMessage.includes('slow') ||
    fullMessage.includes('timeout') ||
    fullMessage.includes('failed') ||
    fullMessage.includes('error') ||
    
    // Keep user activity summary (once per session)
    (fullMessage.includes('Fetched Discord servers successfully') && shouldLogBusiness())
  );
  
  if (shouldLog) {
    // Fix JSON formatting issues by ensuring proper serialization
    if (meta && typeof meta === 'object') {
      try {
        // Ensure meta object is properly serializable
        const cleanMeta = JSON.parse(JSON.stringify(meta));
        return originalWinstonLog.call(this, level, message, cleanMeta);
      } catch (error) {
        // If JSON serialization fails, log without meta
        return originalWinstonLog.call(this, level, message);
      }
    }
    return originalWinstonLog.call(this, level, message, meta);
  }
  
  return this; // Block spam only
};

// Helper to determine if auth should be logged (once per 5 minutes per user)
function shouldLogAuth(message: string): boolean {
  const userId = extractUserId(message);
  if (!userId) return false;
  
  const now = Date.now();
  const lastLog = authSpamTracker.get(userId);
  
  if (!lastLog || (now - lastLog) > 300000) { // 5 minutes
    authSpamTracker.set(userId, now);
    return true;
  }
  return false;
}

// Helper to limit business event logging (once per minute)
function shouldLogBusiness(): boolean {
  const now = Date.now();
  if (now - businessLogTracker.lastLog > 60000) { // 1 minute
    businessLogTracker.lastLog = now;
    return true;
  }
  return false;
}

// Helper function to extract user ID
function extractUserId(message: string): string | null {
  const match = message.match(/"userId":"([^"]+)"/);
  return match ? match[1] : null;
}

// Override all Winston methods to use the balanced log function
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

    console.log('🎯 Balanced Winston Override activated - Eliminates spam keeps essential logs');

export default winston;