import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface TransactionData {
  id: string;
  userId: string;
  serverId?: string;
  productId?: string;
  amount: number;
  currency: string;
  type: 'purchase' | 'withdrawal' | 'subscription' | 'refund';
  metadata?: Record<string, any>;
}

export interface EncryptedTransaction {
  encryptedData: string;
  iv: string;
  authTag: string;
  hash: string;
  timestamp: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  riskScore: number;
  requiresAdditionalAuth: boolean;
}

/**
 * Enhanced Transaction Security Service
 * Provides encryption, validation, and fraud detection for transactions
 */
export class TransactionSecurityService {
  private static instance: TransactionSecurityService;
  private readonly encryptionKey: Buffer;
  private readonly hashSecret: string;
  private readonly saltRounds = 12;

  // Risk scoring thresholds
  private readonly LOW_RISK_THRESHOLD = 30;
  private readonly MEDIUM_RISK_THRESHOLD = 70;
  private readonly HIGH_RISK_THRESHOLD = 90;

  // Rate limiting for fraud detection
  private readonly transactionAttempts = new Map<string, { count: number; timestamp: number }>();
  private readonly MAX_ATTEMPTS_PER_HOUR = 10;
  private readonly MAX_ATTEMPTS_PER_DAY = 50;

  constructor() {
    // Initialize encryption key from environment or generate one
    const keyString = process.env.TRANSACTION_ENCRYPTION_KEY;
    if (!keyString) {
      logger.warn('TRANSACTION_ENCRYPTION_KEY not set, generating temporary key');
      this.encryptionKey = crypto.randomBytes(32);
    } else {
      this.encryptionKey = Buffer.from(keyString, 'hex');
    }

    this.hashSecret = process.env.TRANSACTION_HASH_SECRET || crypto.randomBytes(64).toString('hex');
    
    if (!process.env.TRANSACTION_ENCRYPTION_KEY || !process.env.TRANSACTION_HASH_SECRET) {
      logger.error('Transaction security keys not properly configured in environment');
    }
  }

  public static getInstance(): TransactionSecurityService {
    if (!TransactionSecurityService.instance) {
      TransactionSecurityService.instance = new TransactionSecurityService();
    }
    return TransactionSecurityService.instance;
  }

  /**
   * Encrypt transaction data with AES-256-GCM
   */
  public encryptTransaction(transaction: TransactionData): EncryptedTransaction {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
      cipher.setAAD(Buffer.from(transaction.id));

      const transactionJson = JSON.stringify(transaction);
      let encrypted = cipher.update(transactionJson, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();
      const hash = this.generateTransactionHash(transaction);

      const result: EncryptedTransaction = {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        hash,
        timestamp: Date.now()
      };

      logger.info('Transaction encrypted successfully', {
        transactionId: transaction.id,
        userId: transaction.userId,
        type: transaction.type
      });

      return result;
    } catch (error) {
      logger.error('Transaction encryption failed', {
        transactionId: transaction.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError('Failed to encrypt transaction', 500, 'ENCRYPTION_ERROR');
    }
  }

  /**
   * Decrypt transaction data
   */
  public decryptTransaction(encryptedTransaction: EncryptedTransaction): TransactionData {
    try {
      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      const iv = Buffer.from(encryptedTransaction.iv, 'hex');
      const authTag = Buffer.from(encryptedTransaction.authTag, 'hex');

      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedTransaction.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const transaction: TransactionData = JSON.parse(decrypted);

      // Verify hash integrity
      const expectedHash = this.generateTransactionHash(transaction);
      if (expectedHash !== encryptedTransaction.hash) {
        throw new AppError('Transaction hash verification failed', 400, 'HASH_VERIFICATION_ERROR');
      }

      logger.info('Transaction decrypted successfully', {
        transactionId: transaction.id,
        userId: transaction.userId
      });

      return transaction;
    } catch (error) {
      logger.error('Transaction decryption failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError('Failed to decrypt transaction', 500, 'DECRYPTION_ERROR');
    }
  }

  /**
   * Generate secure hash for transaction integrity
   */
  private generateTransactionHash(transaction: TransactionData): string {
    const hashData = `${transaction.id}:${transaction.userId}:${transaction.amount}:${transaction.currency}:${transaction.type}:${this.hashSecret}`;
    return crypto.createHash('sha256').update(hashData).digest('hex');
  }

  /**
   * Comprehensive transaction validation with fraud detection
   */
  public async validateTransaction(
    transaction: TransactionData,
    userContext: {
      ipAddress: string;
      userAgent: string;
      previousTransactions?: TransactionData[];
      accountAge?: number;
      verificationLevel?: 'basic' | 'verified' | 'premium';
    }
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    let riskScore = 0;

    try {
      // Basic validation
      if (!transaction.id || !transaction.userId) {
        errors.push('Missing required transaction identifiers');
        riskScore += 20;
      }

      if (!transaction.amount || transaction.amount <= 0) {
        errors.push('Invalid transaction amount');
        riskScore += 15;
      }

      if (!['purchase', 'withdrawal', 'subscription', 'refund'].includes(transaction.type)) {
        errors.push('Invalid transaction type');
        riskScore += 10;
      }

      // Currency validation
      if (!this.isValidCurrency(transaction.currency)) {
        errors.push('Unsupported currency');
        riskScore += 10;
      }

      // Amount limits based on transaction type
      const amountRisk = this.validateTransactionAmount(transaction);
      riskScore += amountRisk.riskScore;
      errors.push(...amountRisk.errors);

      // Rate limiting check
      const rateLimitRisk = this.checkRateLimit(transaction.userId, userContext.ipAddress);
      riskScore += rateLimitRisk.riskScore;
      errors.push(...rateLimitRisk.errors);

      // Behavioral analysis
      if (userContext.previousTransactions) {
        const behaviorRisk = this.analyzeBehaviorPattern(transaction, userContext.previousTransactions);
        riskScore += behaviorRisk.riskScore;
        errors.push(...behaviorRisk.errors);
      }

      // Account verification level check
      const verificationRisk = this.checkVerificationLevel(transaction, userContext.verificationLevel);
      riskScore += verificationRisk.riskScore;
      errors.push(...verificationRisk.errors);

      // Geographic and device analysis
      const deviceRisk = this.analyzeDeviceRisk(userContext);
      riskScore += deviceRisk.riskScore;
      errors.push(...deviceRisk.errors);

      // Time-based analysis
      const timeRisk = this.analyzeTimePattern(transaction);
      riskScore += timeRisk.riskScore;
      errors.push(...timeRisk.errors);

      const requiresAdditionalAuth = riskScore >= this.MEDIUM_RISK_THRESHOLD;

      logger.info('Transaction validation completed', {
        transactionId: transaction.id,
        userId: transaction.userId,
        riskScore,
        errorsCount: errors.length,
        requiresAdditionalAuth
      });

      return {
        isValid: errors.length === 0 && riskScore < this.HIGH_RISK_THRESHOLD,
        errors,
        riskScore,
        requiresAdditionalAuth
      };
    } catch (error) {
      logger.error('Transaction validation failed', {
        transactionId: transaction.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        isValid: false,
        errors: ['Validation system error'],
        riskScore: 100,
        requiresAdditionalAuth: true
      };
    }
  }

  /**
   * Validate transaction amount based on type and limits
   */
  private validateTransactionAmount(transaction: TransactionData): { riskScore: number; errors: string[] } {
    const errors: string[] = [];
    let riskScore = 0;

    const limits = {
      purchase: { max: 10000, suspicious: 1000 },
      withdrawal: { max: 5000, suspicious: 500 },
      subscription: { max: 1000, suspicious: 100 },
      refund: { max: 10000, suspicious: 1000 }
    };

    const limit = limits[transaction.type];
    
    if (transaction.amount > limit.max) {
      errors.push(`Transaction amount exceeds maximum limit for ${transaction.type}`);
      riskScore += 30;
    } else if (transaction.amount > limit.suspicious) {
      riskScore += 15;
    }

    // Check for unusual decimal precision (potential manipulation)
    const decimalPlaces = (transaction.amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 8) {
      errors.push('Unusual decimal precision detected');
      riskScore += 10;
    }

    return { riskScore, errors };
  }

  /**
   * Check rate limiting for fraud prevention
   */
  private checkRateLimit(userId: string, ipAddress: string): { riskScore: number; errors: string[] } {
    const errors: string[] = [];
    let riskScore = 0;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    // Check user rate limit
    const userKey = `user:${userId}`;
    const userAttempts = this.transactionAttempts.get(userKey);
    
    if (userAttempts) {
      if (now - userAttempts.timestamp < oneHour && userAttempts.count >= this.MAX_ATTEMPTS_PER_HOUR) {
        errors.push('Too many transactions per hour');
        riskScore += 40;
      } else if (now - userAttempts.timestamp < oneDay && userAttempts.count >= this.MAX_ATTEMPTS_PER_DAY) {
        errors.push('Too many transactions per day');
        riskScore += 30;
      }
      
      // Update counter
      if (now - userAttempts.timestamp < oneHour) {
        userAttempts.count++;
      } else {
        userAttempts.count = 1;
        userAttempts.timestamp = now;
      }
    } else {
      this.transactionAttempts.set(userKey, { count: 1, timestamp: now });
    }

    // Check IP rate limit
    const ipKey = `ip:${ipAddress}`;
    const ipAttempts = this.transactionAttempts.get(ipKey);
    
    if (ipAttempts && now - ipAttempts.timestamp < oneHour && ipAttempts.count >= this.MAX_ATTEMPTS_PER_HOUR * 2) {
      errors.push('Too many transactions from this IP address');
      riskScore += 25;
    }

    return { riskScore, errors };
  }

  /**
   * Analyze behavioral patterns for anomaly detection
   */
  private analyzeBehaviorPattern(
    transaction: TransactionData,
    previousTransactions: TransactionData[]
  ): { riskScore: number; errors: string[] } {
    const errors: string[] = [];
    let riskScore = 0;

    if (previousTransactions.length === 0) {
      riskScore += 10; // New user risk
      return { riskScore, errors };
    }

    // Check for unusual amount patterns
    const recentTransactions = previousTransactions.slice(-10);
    const avgAmount = recentTransactions.reduce((sum, t) => sum + t.amount, 0) / recentTransactions.length;
    
    if (transaction.amount > avgAmount * 5) {
      errors.push('Transaction amount significantly higher than usual');
      riskScore += 20;
    }

    // Check for rapid successive transactions
    const lastTransaction = previousTransactions[previousTransactions.length - 1];
    if (lastTransaction && Date.now() - new Date(lastTransaction.id).getTime() < 60000) { // Less than 1 minute
      errors.push('Rapid successive transactions detected');
      riskScore += 15;
    }

    // Check for unusual currency changes
    const recentCurrencies = recentTransactions.map(t => t.currency);
    if (!recentCurrencies.includes(transaction.currency) && recentCurrencies.length > 0) {
      riskScore += 10;
    }

    return { riskScore, errors };
  }

  /**
   * Check verification level requirements
   */
  private checkVerificationLevel(
    transaction: TransactionData,
    verificationLevel?: 'basic' | 'verified' | 'premium'
  ): { riskScore: number; errors: string[] } {
    const errors: string[] = [];
    let riskScore = 0;

    if (!verificationLevel) {
      errors.push('User verification level not available');
      riskScore += 20;
      return { riskScore, errors };
    }

    // High-value transactions require higher verification
    if (transaction.amount > 1000 && verificationLevel === 'basic') {
      errors.push('High-value transaction requires verified account');
      riskScore += 25;
    }

    if (transaction.amount > 5000 && verificationLevel !== 'premium') {
      errors.push('Very high-value transaction requires premium verification');
      riskScore += 30;
    }

    // Withdrawal restrictions
    if (transaction.type === 'withdrawal' && verificationLevel === 'basic') {
      errors.push('Withdrawals require verified account');
      riskScore += 20;
    }

    return { riskScore, errors };
  }

  /**
   * Analyze device and geographic risk factors
   */
  private analyzeDeviceRisk(userContext: {
    ipAddress: string;
    userAgent: string;
  }): { riskScore: number; errors: string[] } {
    const errors: string[] = [];
    let riskScore = 0;

    // Check for suspicious user agents
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /automated/i
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(userContext.userAgent))) {
      errors.push('Suspicious user agent detected');
      riskScore += 25;
    }

    // Check for missing or unusual user agent
    if (!userContext.userAgent || userContext.userAgent.length < 10) {
      errors.push('Missing or invalid user agent');
      riskScore += 15;
    }

    // Basic IP validation
    if (!this.isValidIP(userContext.ipAddress)) {
      errors.push('Invalid IP address');
      riskScore += 20;
    }

    return { riskScore, errors };
  }

  /**
   * Analyze time-based patterns
   */
  private analyzeTimePattern(transaction: TransactionData): { riskScore: number; errors: string[] } {
    const errors: string[] = [];
    let riskScore = 0;

    const now = new Date();
    const hour = now.getHours();

    // Unusual hours (2 AM - 6 AM) increase risk slightly
    if (hour >= 2 && hour <= 6) {
      riskScore += 5;
    }

    // Weekend transactions for business accounts might be suspicious
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    if (isWeekend && transaction.type === 'subscription') {
      riskScore += 3;
    }

    return { riskScore, errors };
  }

  /**
   * Validate currency code
   */
  private isValidCurrency(currency: string): boolean {
    const supportedCurrencies = [
      'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD',
      'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'ADA',
      'DOT', 'LINK', 'LTC', 'BCH', 'XRP', 'DOGE'
    ];
    return supportedCurrencies.includes(currency.toUpperCase());
  }

  /**
   * Basic IP address validation
   */
  private isValidIP(ip: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Generate secure transaction ID
   */
  public generateSecureTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.randomBytes(16).toString('hex');
    return `txn_${timestamp}_${randomBytes}`;
  }

  /**
   * Hash sensitive data for storage
   */
  public async hashSensitiveData(data: string): Promise<string> {
    try {
      return await bcrypt.hash(data, this.saltRounds);
    } catch (error) {
      logger.error('Failed to hash sensitive data', { error });
      throw new AppError('Failed to hash sensitive data', 500, 'HASH_ERROR');
    }
  }

  /**
   * Verify hashed data
   */
  public async verifySensitiveData(data: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(data, hash);
    } catch (error) {
      logger.error('Failed to verify sensitive data', { error });
      return false;
    }
  }

  /**
   * Clean up old rate limit entries
   */
  public cleanupRateLimitData(): void {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    for (const [key, data] of this.transactionAttempts.entries()) {
      if (now - data.timestamp > oneDay) {
        this.transactionAttempts.delete(key);
      }
    }

    logger.info('Rate limit data cleanup completed', {
      remainingEntries: this.transactionAttempts.size
    });
  }
}

export const transactionSecurity = TransactionSecurityService.getInstance();