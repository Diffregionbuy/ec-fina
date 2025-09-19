import express, { Request, Response } from 'express';
import Joi from 'joi';
import { authenticateToken } from '../middleware/auth';
import { getOKXService, OKXWebhookPayload } from '../services/okx';
import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { processPaymentDistribution } from './wallet';

const router = express.Router();

// Validation schemas
const createPaymentSchema = Joi.object({
  amount: Joi.string().required(),
  currency: Joi.string().valid('USDT', 'BTC', 'ETH').default('USDT'),
  orderId: Joi.string().required(),
  description: Joi.string().optional(),
  metadata: Joi.object().optional(),
});

const webhookSchema = Joi.object({
  eventType: Joi.string().required(),
  data: Joi.object({
    orderId: Joi.string().required(),
    amount: Joi.string().required(),
    currency: Joi.string().required(),
    status: Joi.string().required(),
    timestamp: Joi.string().required(),
    metadata: Joi.object().optional(),
  }).required(),
  signature: Joi.string().required(),
  timestamp: Joi.string().required(),
});

/**
 * POST /api/payments/create
 * Create a new payment intent
 */
router.post('/create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { error, value } = createPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { amount, currency, orderId, description, metadata } = value;
    const userId = (req as any).user.id;

    // Verify the order exists and belongs to the user
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, servers!inner(owner_id)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if user owns the server or is the customer
    if (order.servers.owner_id !== userId && order.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to create payment for this order',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if order is already paid
    if (order.status === 'paid' || order.status === 'delivered') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ORDER_ALREADY_PAID',
          message: 'Order is already paid',
          timestamp: new Date().toISOString(),
        },
      });
    }

    const okxService = getOKXService();
    
    // Create payment intent with OKX
    const paymentIntent = await okxService.createPaymentIntent({
      amount,
      currency,
      orderId,
      description,
      metadata: {
        ...metadata,
        userId,
        serverId: order.server_id,
      },
    });

    // Store transaction in database
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        server_id: order.server_id,
        type: 'purchase',
        amount: parseFloat(amount),
        currency,
        status: 'pending',
        okx_transaction_id: paymentIntent.id,
        metadata: {
          orderId,
          paymentIntentId: paymentIntent.id,
          ...metadata,
        },
      })
      .select()
      .single();

    if (transactionError) {
      logger.error('Failed to store transaction:', transactionError);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to store transaction',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Update order with payment transaction
    await supabase
      .from('orders')
      .update({
        payment_transaction_id: transaction.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    logger.info('Payment intent created successfully:', {
      paymentIntentId: paymentIntent.id,
      orderId,
      amount,
      currency,
      userId,
    });

    res.json({
      success: true,
      data: {
        paymentIntent,
        transactionId: transaction.id,
      },
    });
  } catch (error) {
    logger.error('Failed to create payment intent:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_CREATION_FAILED',
        message: 'Failed to create payment intent',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * POST /api/payments/:orderId/check
 * Manually check payment status for an order
 */
router.post('/:orderId/check', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = (req as any).user.id;

    // Import TatumService
    const { tatumService } = await import('../services/tatumService');

    // Verify user has access to this order
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .select('*, servers!inner(owner_id)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check authorization (user is order creator or server owner)
    if (order.user_id !== userId && order.servers.owner_id !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to check this order',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Perform manual payment check
    const paymentStatus = await tatumService.checkOrderPaymentStatus(orderId);

    res.json({
      success: true,
      data: {
        orderId,
        status: paymentStatus.status,
        expectedAmount: paymentStatus.expectedAmount,
        receivedAmount: paymentStatus.receivedAmount,
        address: paymentStatus.address,
        transactionHash: paymentStatus.transactionHash,
        checkedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error('Manual payment check failed:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_CHECK_FAILED',
        message: error.message || 'Failed to check payment status',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * GET /api/payments/:paymentId/status
 * Get payment status
 */
router.get('/:paymentId/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const userId = (req as any).user.id;

    // Get transaction from database
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('*, servers!inner(owner_id)')
      .eq('okx_transaction_id', paymentId)
      .single();

    if (transactionError || !transaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check authorization
    if (transaction.user_id !== userId && transaction.servers.owner_id !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to view this payment',
          timestamp: new Date().toISOString(),
        },
      });
    }

    const okxService = getOKXService();
    
    // Get latest status from OKX
    const paymentStatus = await okxService.getPaymentStatus(paymentId);

    if (paymentStatus && paymentStatus.status !== transaction.status) {
      // Update transaction status in database
      await supabase
        .from('transactions')
        .update({
          status: paymentStatus.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);

      // If payment completed, update order status
      if (paymentStatus.status === 'completed') {
        await supabase
          .from('orders')
          .update({
            status: 'paid',
            updated_at: new Date().toISOString(),
          })
          .eq('payment_transaction_id', transaction.id);
      }
    }

    res.json({
      success: true,
      data: {
        paymentId,
        status: paymentStatus?.status || transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        createdAt: transaction.created_at,
        updatedAt: transaction.updated_at,
      },
    });
  } catch (error) {
    logger.error('Failed to get payment status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_STATUS_ERROR',
        message: 'Failed to get payment status',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * POST /api/payments/webhook
 * Handle OKX webhook notifications
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['okx-signature'] as string;
    const timestamp = req.headers['okx-timestamp'] as string;

    if (!signature || !timestamp) {
      logger.warn('Webhook missing signature or timestamp headers');
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_HEADERS',
          message: 'Missing required webhook headers',
          timestamp: new Date().toISOString(),
        },
      });
    }

    const okxService = getOKXService();
    
    // Verify webhook signature
    const isValidSignature = okxService.verifyWebhookSignature(rawBody, signature, timestamp);
    
    if (!isValidSignature) {
      logger.warn('Invalid webhook signature received');
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Invalid webhook signature',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate webhook payload
    const { error, value } = webhookSchema.validate(req.body);
    if (error) {
      logger.warn('Invalid webhook payload:', error.details[0].message);
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: error.details[0].message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const webhookPayload: OKXWebhookPayload = value;
    const { eventType, data } = webhookPayload;

    logger.info('Processing webhook:', { eventType, orderId: data.orderId, status: data.status });

    // Find transaction by OKX transaction ID
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .eq('okx_transaction_id', data.orderId)
      .single();

    if (transactionError || !transaction) {
      logger.warn('Transaction not found for webhook:', data.orderId);
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Process different event types
    switch (eventType) {
      case 'deposit.completed':
        await handleDepositCompleted(transaction, data);
        break;
      case 'deposit.failed':
        await handleDepositFailed(transaction, data);
        break;
      case 'withdrawal.completed':
        await handleWithdrawalCompleted(transaction, data);
        break;
      case 'withdrawal.failed':
        await handleWithdrawalFailed(transaction, data);
        break;
      default:
        logger.warn('Unknown webhook event type:', eventType);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    logger.error('Webhook processing failed:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_PROCESSING_FAILED',
        message: 'Failed to process webhook',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * Handle deposit completed webhook
 */
async function handleDepositCompleted(transaction: any, data: any) {
  try {
    // Update transaction status
    await supabase
      .from('transactions')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    // Update order status to paid
    if (transaction.metadata?.orderId) {
      await supabase
        .from('orders')
        .update({
          status: 'paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.metadata.orderId);

      // Get order details to find the server owner (seller)
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*, servers!inner(owner_id)')
        .eq('id', transaction.metadata.orderId)
        .single();

      if (orderError || !order) {
        logger.error('Failed to get order for payment distribution:', orderError);
        throw new Error('Order not found for payment distribution');
      }

      // Process automatic payment distribution with commission
      await processPaymentDistribution(
        transaction.id,
        parseFloat(transaction.amount),
        order.servers.owner_id,
        transaction.currency
      );
    }

    logger.info('Deposit completed successfully:', {
      transactionId: transaction.id,
      amount: transaction.amount,
      orderId: transaction.metadata?.orderId,
    });
  } catch (error) {
    logger.error('Failed to handle deposit completed:', error);
    throw error;
  }
}

/**
 * Handle deposit failed webhook
 */
async function handleDepositFailed(transaction: any, data: any) {
  try {
    // Update transaction status
    await supabase
      .from('transactions')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    // Update order status to failed
    if (transaction.metadata?.orderId) {
      await supabase
        .from('orders')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.metadata.orderId);
    }

    logger.info('Deposit failed:', {
      transactionId: transaction.id,
      orderId: transaction.metadata?.orderId,
    });
  } catch (error) {
    logger.error('Failed to handle deposit failed:', error);
    throw error;
  }
}

/**
 * Handle withdrawal completed webhook
 */
async function handleWithdrawalCompleted(transaction: any, data: any) {
  try {
    // Update transaction status
    await supabase
      .from('transactions')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    logger.info('Withdrawal completed successfully:', {
      transactionId: transaction.id,
      amount: transaction.amount,
    });
  } catch (error) {
    logger.error('Failed to handle withdrawal completed:', error);
    throw error;
  }
}

/**
 * Handle withdrawal failed webhook
 */
async function handleWithdrawalFailed(transaction: any, data: any) {
  try {
    // Update transaction status
    await supabase
      .from('transactions')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    // Refund the amount to user's wallet balance
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', transaction.user_id)
      .single();

    if (wallet) {
      const newBalance = parseFloat(wallet.balance) + parseFloat(transaction.amount);

      await supabase
        .from('wallets')
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.id);
    }

    logger.info('Withdrawal failed, amount refunded:', {
      transactionId: transaction.id,
      amount: transaction.amount,
    });
  } catch (error) {
    logger.error('Failed to handle withdrawal failed:', error);
    throw error;
  }
}

export default router;