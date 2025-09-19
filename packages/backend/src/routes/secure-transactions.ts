import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { 
  validateTransaction, 
  decryptTransaction, 
  logTransactionSecurity,
  sanitizeTransactionResponse,
  TransactionSecurityRequest 
} from '../middleware/transactionSecurity';
import { transactionSecurity } from '../services/transactionSecurity';
import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas for secure transactions
const transactionSchema = Joi.object({
  server_id: Joi.string().uuid().optional(),
  product_id: Joi.string().uuid().optional(),
  amount: Joi.number().positive().precision(8).required(),
  currency: Joi.string().valid(
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD',
    'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'ADA',
    'DOT', 'LINK', 'LTC', 'BCH', 'XRP', 'DOGE'
  ).required(),
  type: Joi.string().valid('purchase', 'withdrawal', 'subscription', 'refund').required(),
  metadata: Joi.object().optional(),
  verification_level: Joi.string().valid('basic', 'verified', 'premium').optional(),
  additional_auth_token: Joi.string().optional()
});

const withdrawalSchema = Joi.object({
  amount: Joi.number().positive().precision(8).required(),
  currency: Joi.string().required(),
  destination_address: Joi.string().required(),
  destination_tag: Joi.string().optional(),
  two_factor_code: Joi.string().length(6).optional(),
  withdrawal_password: Joi.string().min(8).optional()
});

/**
 * POST /api/secure-transactions/purchase
 * Process a secure purchase transaction
 */
router.post('/purchase',
  authMiddleware.authenticate,
  validateTransaction,
  logTransactionSecurity,
  sanitizeTransactionResponse,
  async (req: TransactionSecurityRequest, res: Response) => {
    try {
      const { error: validationError, value: validatedData } = transactionSchema.validate(req.body);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationError.details[0].message,
            timestamp: new Date().toISOString()
          }
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('User ID not found', 401, 'UNAUTHORIZED');
      }

      // Process the purchase transaction
      const { data: existingTransaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', validatedData.id || req.body.id)
        .single();

      if (existingTransaction) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_TRANSACTION',
            message: 'Transaction already exists',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Create transaction record
      const transactionData = {
        id: req.body.decryptedTransaction?.id || transactionSecurity.generateSecureTransactionId(),
        user_id: userId,
        server_id: validatedData.server_id,
        product_id: validatedData.product_id,
        amount: validatedData.amount,
        currency: validatedData.currency,
        type: validatedData.type,
        status: 'pending',
        metadata: validatedData.metadata || {},
        risk_score: req.transactionValidation?.riskScore || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: transaction, error: insertError } = await supabase
        .from('transactions')
        .insert([transactionData])
        .select()
        .single();

      if (insertError) {
        logger.error('Failed to create transaction', {
          error: insertError,
          transactionData
        });
        throw new AppError('Failed to create transaction', 500, 'TRANSACTION_CREATE_ERROR');
      }

      logger.info('Secure purchase transaction created', {
        transactionId: transaction.id,
        userId,
        amount: validatedData.amount,
        currency: validatedData.currency,
        riskScore: req.transactionValidation?.riskScore
      });

      res.status(201).json({
        success: true,
        data: {
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            currency: transaction.currency,
            type: transaction.type,
            status: transaction.status,
            created_at: transaction.created_at
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Secure purchase transaction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id
      });

      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to process purchase transaction', 500, 'PURCHASE_ERROR');
    }
  }
);

/**
 * POST /api/secure-transactions/withdrawal
 * Process a secure withdrawal transaction
 */
router.post('/withdrawal',
  authMiddleware.authenticate,
  validateTransaction,
  logTransactionSecurity,
  sanitizeTransactionResponse,
  async (req: TransactionSecurityRequest, res: Response) => {
    try {
      const { error: validationError, value: validatedData } = withdrawalSchema.validate(req.body);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationError.details[0].message,
            timestamp: new Date().toISOString()
          }
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('User ID not found', 401, 'UNAUTHORIZED');
      }

      // Additional security checks for withdrawals
      if (!validatedData.two_factor_code && !validatedData.withdrawal_password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'ADDITIONAL_AUTH_REQUIRED',
            message: 'Two-factor authentication or withdrawal password required',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check user balance
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .eq('currency', validatedData.currency)
        .single();

      if (!wallet || wallet.balance < validatedData.amount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient balance for withdrawal',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Create withdrawal transaction
      const transactionData = {
        id: transactionSecurity.generateSecureTransactionId(),
        user_id: userId,
        amount: validatedData.amount,
        currency: validatedData.currency,
        type: 'withdrawal',
        status: 'pending',
        metadata: {
          destination_address: await transactionSecurity.hashSensitiveData(validatedData.destination_address),
          destination_tag: validatedData.destination_tag,
          requires_manual_review: req.transactionValidation?.riskScore && req.transactionValidation.riskScore > 50
        },
        risk_score: req.transactionValidation?.riskScore || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: transaction, error: insertError } = await supabase
        .from('transactions')
        .insert([transactionData])
        .select()
        .single();

      if (insertError) {
        logger.error('Failed to create withdrawal transaction', {
          error: insertError,
          userId
        });
        throw new AppError('Failed to create withdrawal transaction', 500, 'WITHDRAWAL_CREATE_ERROR');
      }

      logger.info('Secure withdrawal transaction created', {
        transactionId: transaction.id,
        userId,
        amount: validatedData.amount,
        currency: validatedData.currency,
        riskScore: req.transactionValidation?.riskScore
      });

      res.status(201).json({
        success: true,
        data: {
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            currency: transaction.currency,
            type: transaction.type,
            status: transaction.status,
            estimated_processing_time: '2-24 hours',
            created_at: transaction.created_at
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Secure withdrawal transaction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id
      });

      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to process withdrawal transaction', 500, 'WITHDRAWAL_ERROR');
    }
  }
);

/**
 * GET /api/secure-transactions/history
 * Get user's transaction history with security filtering
 */
router.get('/history',
  authMiddleware.authenticate,
  logTransactionSecurity,
  sanitizeTransactionResponse,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('User ID not found', 401, 'UNAUTHORIZED');
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
          id,
          amount,
          currency,
          type,
          status,
          created_at,
          updated_at,
          metadata
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Failed to fetch transaction history', {
          error,
          userId
        });
        throw new AppError('Failed to fetch transaction history', 500, 'HISTORY_FETCH_ERROR');
      }

      // Remove sensitive data from metadata
      const sanitizedTransactions = transactions?.map(transaction => ({
        ...transaction,
        metadata: {
          ...transaction.metadata,
          destination_address: undefined,
          internal_id: undefined,
          debug_info: undefined
        }
      })) || [];

      logger.info('Transaction history retrieved', {
        userId,
        count: sanitizedTransactions.length,
        page,
        limit
      });

      res.json({
        success: true,
        data: {
          transactions: sanitizedTransactions,
          pagination: {
            page,
            limit,
            total: sanitizedTransactions.length
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Transaction history fetch failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id
      });

      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to fetch transaction history', 500, 'HISTORY_ERROR');
    }
  }
);

/**
 * POST /api/secure-transactions/verify
 * Verify transaction integrity and status
 */
router.post('/verify',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { transaction_id } = req.body;
      
      if (!transaction_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_TRANSACTION_ID',
            message: 'Transaction ID is required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('User ID not found', 401, 'UNAUTHORIZED');
      }

      const { data: transaction, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transaction_id)
        .eq('user_id', userId)
        .single();

      if (error || !transaction) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Verify transaction integrity
      const isValid = await this.verifyTransactionIntegrity(transaction);

      logger.info('Transaction verification completed', {
        transactionId: transaction_id,
        userId,
        isValid,
        status: transaction.status
      });

      res.json({
        success: true,
        data: {
          transaction: {
            id: transaction.id,
            status: transaction.status,
            amount: transaction.amount,
            currency: transaction.currency,
            type: transaction.type,
            created_at: transaction.created_at,
            updated_at: transaction.updated_at
          },
          verification: {
            is_valid: isValid,
            verified_at: new Date().toISOString()
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Transaction verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id
      });

      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to verify transaction', 500, 'VERIFICATION_ERROR');
    }
  }
);

/**
 * Helper method to verify transaction integrity
 */
async function verifyTransactionIntegrity(transaction: any): Promise<boolean> {
  try {
    // Basic integrity checks
    if (!transaction.id || !transaction.user_id || !transaction.amount) {
      return false;
    }

    // Check if transaction amounts are reasonable
    if (transaction.amount <= 0 || transaction.amount > 1000000) {
      return false;
    }

    // Check transaction status validity
    const validStatuses = ['pending', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(transaction.status)) {
      return false;
    }

    // Additional integrity checks can be added here
    return true;
  } catch (error) {
    logger.error('Transaction integrity verification failed', { error });
    return false;
  }
}

export default router;
