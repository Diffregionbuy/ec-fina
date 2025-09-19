import jwt, { SignOptions } from 'jsonwebtoken';
import { logger } from './logger';

export interface JWTPayload {
  userId: string;
  discordId: string;
  username: string;
  avatar: string | null;
  email: string | null;
  discordAccessToken: string;
  discordRefreshToken: string;
  discordExpiresAt: number;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface JWTOptions extends SignOptions {
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  subject?: string;
}

export class JWTService {
  private readonly secret: string;
  private readonly defaultOptions: JWTOptions;

  constructor() {
    this.secret = process.env.JWT_SECRET || '';
    if (!this.secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    this.defaultOptions = {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'ecbot-api',
      audience: 'ecbot-frontend',
    };
  }

  /**
   * Generate a JWT token
   */
  generateToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>, options?: JWTOptions): string {
    try {
      const tokenOptions = { ...this.defaultOptions, ...options };
      
      const token = jwt.sign(payload, this.secret, tokenOptions);
      
      logger.info('JWT token generated', {
        userId: payload.userId,
        expiresIn: tokenOptions.expiresIn,
      });
      
      return token;
    } catch (error) {
      logger.error('JWT token generation failed:', error);
      throw new Error('Failed to generate JWT token');
    }
  }

  /**
   * Generate a JWT token for bot services
   */
  generateBotServiceToken(payload: any, expiresIn: string = '1h'): string {
    try {
      const tokenOptions = {
        expiresIn,
        issuer: 'ecbot-api',
        audience: 'ecbot-bot-service',
      };
      
      const token = jwt.sign(payload, this.secret, tokenOptions);
      
      logger.info('Bot service JWT token generated', {
        service: payload.service,
        serviceId: payload.serviceId,
        expiresIn: tokenOptions.expiresIn,
      });
      
      return token;
    } catch (error) {
      logger.error('Bot service JWT token generation failed:', error);
      throw new Error('Failed to generate bot service JWT token');
    }
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string, options?: Partial<JWTOptions>): JWTPayload {
    try {
      const verifyOptions = {
        issuer: options?.issuer || this.defaultOptions.issuer,
        audience: options?.audience || this.defaultOptions.audience,
      };

      const decoded = jwt.verify(token, this.secret, verifyOptions) as JWTPayload;
      
      logger.debug('JWT token verified', {
        userId: decoded.userId,
        exp: decoded.exp,
      });
      
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('JWT token expired', { error: error.message });
        throw new Error('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid JWT token', { error: error.message });
        throw new Error('Invalid token');
      } else {
        logger.error('JWT token verification failed:', error);
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Decode a JWT token without verification (for debugging)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      logger.error('JWT token decode failed:', error);
      return null;
    }
  }

  /**
   * Check if a token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) {
        return true;
      }
      
      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) {
        return null;
      }
      
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh a token (generate new token with updated payload)
   */
  refreshToken(oldToken: string, updates: Partial<JWTPayload>): string {
    try {
      const decoded = this.verifyToken(oldToken);
      const newPayload = { ...decoded, ...updates };
      
      // Remove JWT specific fields before generating new token
      const { iat, exp, iss, aud, ...payload } = newPayload;
      
      return this.generateToken(payload);
    } catch (error) {
      logger.error('JWT token refresh failed:', error);
      throw new Error('Failed to refresh token');
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Generate a short-lived access token
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
    return this.generateToken(payload, { expiresIn: '15m' });
  }

  /**
   * Generate a long-lived refresh token
   */
  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
    return this.generateToken(payload, { expiresIn: '30d' });
  }

  /**
   * Validate token structure and required fields
   */
  validateTokenPayload(payload: any): payload is JWTPayload {
    const requiredFields = ['userId', 'discordId', 'username'];
    
    return requiredFields.every(field => 
      payload && typeof payload[field] === 'string' && payload[field].length > 0
    );
  }
}

// Export singleton instance
export const jwtService = new JWTService();