import { Request, Response, NextFunction } from 'express';
import { transactionSecurity, TransactionData, ValidationResult } from '../services/transactionSecurity';
import { logger } from '../utils/logger';
import { AppError } from './errorHandler';
import { AuthenticatedRequest } from './auth';

export interface TransactionSecurityRequest extends AuthenticatedRequest {
  transactionValidation?: ValidationResult;
  encryptedTransaction?: any;
}

/**
 * Middleware to validate and secure transaction requests
 */
export const validateTransaction = async (
  req: TransactionSecurityRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { body } = req;
    
    // Extract transaction data from request
    const transactionData: TransactionData = {
      id: body.id || transactionSecurity.generateSecureTransactionId(),
      userId: req.user?.id || '',
      serverId: body.server_id,
      productId: body.product_id,
      amount: parseFloat(body.amount) || 0,
      currency: body.currency || 'USD',
      type: body.type || 'purchase',
      metadata: body.metadata || {}
    };

    // Get user context for validation
    const userContext = {
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      previousTransactions: body.previous_transactions || [],
      accountAge: body.account_age,
      verificationLevel: body.verification_level || 'basic'
    };

    // Validate transaction
    const validation = await transactionSecurity.validateTransaction(transactionData, userContext);
    
    // Attach validation result to request
    req.transactionValidation = validation;

    // Log validation result
    logger.info('Transaction validation completed', {
      transactionId: transactionData.id,
      userId: transactionData.userId,
      isValid: validation.isValid,
      riskScore: validation.riskScore,
      errorsCount: validation.errors.length,
      requiresAdditionalAuth: validation.requiresAdditionalAuth
    });

    // Block high-risk transactions
    if (validation.riskScore >= 90) {
      logger.warn('High-risk transaction blocked', {
        transactionId: transactionData.id,
        userId: transactionData.userId,
        riskScore: validation.riskScore,
        errors: validation.errors
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'HIGH_RISK_TRANSACTION',
          message: 'Transaction blocked due to high risk score',
          riskScore: validation.riskScore,
          requiresManualReview: true,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Require additional authentication for medium-risk transactions
    if (validation.requiresAdditionalAuth && !req.headers['x-additional-auth']) {
      logger.info('Additional authentication required', {
        transactionId: transactionData.id,
        userId: transactionData.userId,
        riskScore: validation.riskScore
      });

      return res.status(202).json({
        success: false,
        error: {
          code: 'ADDITIONAL_AUTH_REQUIRED',
          message: 'Additional authentication required for this transaction',
          riskScore: validation.riskScore,
          authMethods: ['sms', 'email', 'totp'],
          timestamp: new Date().toISOString()
        }
      });
    }

    // Block invalid transactions
    if (!validation.isValid) {
      logger.warn('Invalid transaction blocked', {
        transactionId: transactionData.id,
        userId: transactionData.userId,
        errors: validation.errors
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TRANSACTION',
          message: 'Transaction validation failed',
          details: validation.errors,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Encrypt transaction data for secure processing
    const encryptedTransaction = transactionSecurity.encryptTransaction(transactionData);
    req.encryptedTransaction = encryptedTransaction;

    next();
  } catch (error) {
    logger.error('Transaction security middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSACTION_SECURITY_ERROR',
        message: 'Transaction security validation failed',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Middleware to decrypt transaction data
 */
export const decryptTransaction = (
  req: TransactionSecurityRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.encryptedTransaction) {
      throw new AppError('No encrypted transaction data found', 400, 'MISSING_ENCRYPTED_DATA');
    }

    const decryptedTransaction = transactionSecurity.decryptTransaction(req.encryptedTransaction);
    req.body.decryptedTransaction = decryptedTransaction;

    logger.info('Transaction decrypted successfully', {
      transactionId: decryptedTransaction.id,
      userId: decryptedTransaction.userId
    });

    next();
  } catch (error) {
    logger.error('Transaction decryption failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'DECRYPTION_ERROR',
        message: 'Failed to decrypt transaction data',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Middleware to log transaction security events
 */
export const logTransactionSecurity = (
  req: TransactionSecurityRequest,
  res: Response,
  next: NextFunction
): void => {
  const originalSend = res.send;

  res.send = function(data: any) {
    // Log transaction completion
    if (req.transactionValidation) {
      logger.info('Transaction security event', {
        transactionId: req.body.id,
        userId: req.user?.id,
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        riskScore: req.transactionValidation.riskScore,
        success: res.statusCode < 400,
        timestamp: new Date().toISOString()
      });
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Rate limiting specifically for transaction endpoints
 */
export const transactionRateLimit = (
  req: TransactionSecurityRequest,
  res: Response,
  next: NextFunction
): void => {
  const userId = req.user?.id;
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required for transactions',
        timestamp: new Date().toISOString()
      }
    });
  }

  // The rate limiting is handled within the transaction validation
  // This middleware serves as an additional checkpoint
  logger.info('Transaction rate limit check', {
    userId,
    ipAddress,
    path: req.path,
    timestamp: new Date().toISOString()
  });

  next();
};

/**
 * Cleanup middleware to remove sensitive data from responses
 */
export const sanitizeTransactionResponse = (
  req: TransactionSecurityRequest,
  res: Response,
  next: NextFunction
): void => {
  const originalJson = res.json;

  res.json = function(data: any) {
    // Remove sensitive fields from response
    if (data && typeof data === 'object') {
      delete data.encryptedData;
      delete data.iv;
      delete data.authTag;
      delete data.hash;
      
      // Remove sensitive metadata
      if (data.metadata) {
        delete data.metadata.internalId;
        delete data.metadata.debugInfo;
      }
    }

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Schedule cleanup of rate limit data
 */
setInterval(() => {
  transactionSecurity.cleanupRateLimitData();
}, 60 * 60 * 1000); // Run every hour