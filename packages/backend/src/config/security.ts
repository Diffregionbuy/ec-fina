export interface SecurityConfig {
  // Authentication settings
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: string;
    audience: string;
    algorithm: string;
  };
  
  // Session management
  session: {
    timeout: number; // milliseconds
    rotationThreshold: number; // milliseconds
    maxConcurrentSessions: number;
  };
  
  // Rate limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    enableDistributedLimiting: boolean;
  };
  
  // Security features
  security: {
    maxFailedAttempts: number;
    lockoutDuration: number; // milliseconds
    enableFingerprinting: boolean;
    enableSuspiciousActivityDetection: boolean;
    tokenBlacklistTTL: number; // milliseconds
  };
  
  // Discord API settings
  discord: {
    tokenRefreshBuffer: number; // milliseconds before expiry to refresh
    apiTimeout: number;
    maxRetries: number;
    cacheTimeout: number;
  };
  
  // Encryption settings
  encryption: {
    algorithm: string;
    keyLength: number;
    ivLength: number;
  };
}

export const getSecurityConfig = (): SecurityConfig => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    jwt: {
      secret: process.env.JWT_SECRET || 'fallback-secret-key',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'ecbot-api',
      audience: 'ecbot-frontend',
      algorithm: 'HS256'
    },
    
    session: {
      timeout: isProduction ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000, // 24h prod, 7d dev
      rotationThreshold: 2 * 60 * 60 * 1000, // 2 hours
      maxConcurrentSessions: isProduction ? 3 : 10
    },
    
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: isProduction ? 100 : 1000,
      skipSuccessfulRequests: false,
      enableDistributedLimiting: isProduction
    },
    
    security: {
      maxFailedAttempts: isProduction ? 5 : 10,
      lockoutDuration: isProduction ? 15 * 60 * 1000 : 5 * 60 * 1000, // 15m prod, 5m dev
      enableFingerprinting: isProduction,
      enableSuspiciousActivityDetection: isProduction,
      tokenBlacklistTTL: 7 * 24 * 60 * 60 * 1000 // 7 days
    },
    
    discord: {
      tokenRefreshBuffer: 60 * 1000, // 1 minute before expiry
      apiTimeout: 10000, // 10 seconds
      maxRetries: 3,
      cacheTimeout: 5 * 60 * 1000 // 5 minutes
    },
    
    encryption: {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16
    }
  };
};

export const securityConfig = getSecurityConfig();