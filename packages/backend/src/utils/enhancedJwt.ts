import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { securityConfig } from '../config/security';
import { logger } from './logger';

export interface EnhancedTokenPayload {
  userId: string;
  discordId: string;
  username: string;
  avatar: string | null;
  email: string | null;
  discordAccessToken: string;
  discordRefreshToken: string;
  discordExpiresAt: number;
  sessionId: string;
  fingerprint?: string;
  roles?: string[];
  permissions?: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface TokenGenerationOptions {
  userId: string;
  discordId: string;
  username: string;
  avatar: string | null;
  email: string | null;
  discordAccessToken: string;
  discordRefreshToken: string;
  discordExpiresAt: number;
  sessionId: string;
  fingerprint?: string;
  roles?: string[];
  permissions?: string[];
}

export class EnhancedJwtService {
  private readonly config = securityConfig.jwt;
  private readonly encryptionKey: Buffer;

  constructor() {
    // Generate or derive encryption key from JWT secret
    this.encryptionKey = crypto.scryptSync(this.config.secret, 'salt', 32);
  }

  /**
   * Generate enhanced JWT token with encryption for sensitive data
   */
  generateToken(options: TokenGenerationOptions): string {
    try {
      // Encrypt sensitive Discord tokens
      const encryptedAccessToken = this.encryptSensitiveData(options.discordAccessToken);
      const encryptedRefreshToken = this.encryptSensitiveData(options.discordRefreshToken);

      const payload: Omit<EnhancedTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
        userId: options.userId,
        discordId: options.discordId,
        username: options.username,
        avatar: options.avatar,
        email: options.email,
        discordAccessToken: encryptedAccessToken,
        discordRefreshToken: encryptedRefreshToken,
        discordExpiresAt: options.discordExpiresAt,
        sessionId: options.sessionId,
        fingerprint: options.fingerprint,
        roles: options.roles || [],
        permissions: options.permissions || []
      };

      const token = jwt.sign(payload, this.config.secret, {
        expiresIn: this.config.expiresIn,
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithm: this.config.algorithm as jwt.Algorithm
      });

      logger.debug('JWT token generated', {
        userId: options.userId,
        sessionId: options.sessionId,
        expiresIn: this.config.expiresIn
      });

      return token;
    } catch (error) {
      logger.error('JWT token generation failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: options.userId
      });
      throw new Error('Failed to generate authentication token');
    }
  }

  /**
   * Verify and decode JWT token with decryption
   */
  verifyToken(token: string): EnhancedTokenPayload {
    try {
      const decoded = jwt.verify(token, this.config.secret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm as jwt.Algorithm]
      }) as EnhancedTokenPayload;

      // Decrypt sensitive Discord tokens
      decoded.discordAccessToken = this.decryptSensitiveData(decoded.discordAccessToken);
      decoded.discordRefreshToken = this.decryptSensitiveData(decoded.discordRefreshToken);

      logger.debug('JWT token verified successfully', {
        userId: decoded.userId,
        sessionId: decoded.sessionId,
        tokenAge: decoded.iat ? Date.now() - decoded.iat * 1000 : 'unknown'
      });

      return decoded;
    } catch (error) {
      logger.warn('JWT token verification failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenLength: token?.length || 0
      });

      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('TOKEN_EXPIRED');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('INVALID_TOKEN');
      } else if (error instanceof jwt.NotBeforeError) {
        throw new Error('TOKEN_NOT_ACTIVE');
      }

      throw new Error('TOKEN_VERIFICATION_FAILED');
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Validate token payload structure
   */
  validateTokenPayload(payload: any): payload is EnhancedTokenPayload {
    return (
      payload &&
      typeof payload.userId === 'string' &&
      typeof payload.discordId === 'string' &&
      typeof payload.username === 'string' &&
      typeof payload.discordAccessToken === 'string' &&
      typeof payload.discordRefreshToken === 'string' &&
      typeof payload.discordExpiresAt === 'number' &&
      typeof payload.sessionId === 'string' &&
      Array.isArray(payload.roles) &&
      Array.isArray(payload.permissions)
    );
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): number | null {
    try {
      const decoded = jwt.decode(token) as any;
      return decoded?.exp ? decoded.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token);
    return expiration ? Date.now() >= expiration : true;
  }

  /**
   * Get token payload without verification (for debugging)
   */
  decodeTokenUnsafe(token: string): any {
    try {
      return jwt.decode(token);
    } catch {
      return null;
    }
  }

  /**
   * Generate token hash for blacklisting
   */
  generateTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Encrypt sensitive data
   */
  private encryptSensitiveData(data: string): string {
    try {
      const iv = crypto.randomBytes(securityConfig.encryption.ivLength);
      const cipher = crypto.createCipher(securityConfig.encryption.algorithm, this.encryptionKey);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error('Data encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  private decryptSensitiveData(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipher(securityConfig.encryption.algorithm, this.encryptionKey);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Data decryption failed:', error);
      throw new Error('Failed to decrypt sensitive data');
    }
  }

  /**
   * Refresh token if needed
   */
  shouldRefreshToken(payload: EnhancedTokenPayload): boolean {
    if (!payload.exp) return false;
    
    const expirationTime = payload.exp * 1000;
    const refreshThreshold = securityConfig.session.rotationThreshold;
    
    return (expirationTime - Date.now()) < refreshThreshold;
  }

  /**
   * Create token refresh payload
   */
  createRefreshPayload(currentPayload: EnhancedTokenPayload, newSessionId?: string): TokenGenerationOptions {
    return {
      userId: currentPayload.userId,
      discordId: currentPayload.discordId,
      username: currentPayload.username,
      avatar: currentPayload.avatar,
      email: currentPayload.email,
      discordAccessToken: currentPayload.discordAccessToken,
      discordRefreshToken: currentPayload.discordRefreshToken,
      discordExpiresAt: currentPayload.discordExpiresAt,
      sessionId: newSessionId || currentPayload.sessionId,
      fingerprint: currentPayload.fingerprint,
      roles: currentPayload.roles,
      permissions: currentPayload.permissions
    };
  }

  /**
   * Get token statistics
   */
  getTokenStats(token: string): {
    isValid: boolean;
    isExpired: boolean;
    timeToExpiry: number | null;
    payload: any;
  } {
    const payload = this.decodeTokenUnsafe(token);
    const expiration = this.getTokenExpiration(token);
    
    return {
      isValid: !!payload,
      isExpired: this.isTokenExpired(token),
      timeToExpiry: expiration ? expiration - Date.now() : null,
      payload: payload ? {
        userId: payload.userId,
        sessionId: payload.sessionId,
        iat: payload.iat,
        exp: payload.exp
      } : null
    };
  }
}

// Export singleton instance
export const enhancedJwtService = new EnhancedJwtService();

// Export for backward compatibility
export const jwtService = enhancedJwtService;