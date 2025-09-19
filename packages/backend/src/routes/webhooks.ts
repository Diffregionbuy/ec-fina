import { Router } from 'express';
import { logger } from '../utils/logger';
import { tatumService } from '../services/tatumService';
import { supabase } from '../config/database';
import crypto from 'crypto';

const router = Router();

/**
 * Tatum payment webhook handler
 * POST /api/webhooks/tatum
 */
router.post('/tatum', async (req, res) => {
  try {
    const webhookData = req.body;
    
    logger.info('Received Tatum webhook', {
      type: webhookData.type,
      address: webhookData.address,
      amount: webhookData.amount,
      txId: webhookData.txId
    });

    // Log webhook to payment_orders table
    let orderId = webhookData.orderId || webhookData.reference || (typeof req.query.orderId === 'string' ? req.query.orderId : undefined);
    // If no orderId provided, try to resolve by address for pending orders
  if (!orderId && webhookData?.address) {
    try {
      const { data: candidates } = await supabase
        .from('payment_orders')
        .select('id')
        .eq('crypto_info->>address', webhookData.address)
        .eq('status', 'pending')
        .limit(1);
      if (Array.isArray(candidates) && candidates.length > 0) {
        orderId = candidates[0].id;
      }
    } catch {}
  }

  if (orderId) {
      await supabase
        .from('payment_orders')
        .update({
          webhook_type: 'tatum_payment',
          payload: webhookData,
          webhook_status: 'received',
          webhook_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
    }

    // Process the payment webhook
    await tatumService.processPaymentWebhook(webhookData);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to process Tatum webhook:', error);
    
    // Log webhook error to payment_orders
    const orderId = req.body?.orderId || req.body?.reference;
    if (orderId) {
      await supabase
        .from('payment_orders')
        .update({
          webhook_type: 'tatum_payment',
          payload: req.body,
          webhook_status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_PROCESSING_ERROR',
        message: 'Failed to process webhook',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * Manual payment confirmation (for testing/admin)
 * POST /api/webhooks/manual-confirm
 */
router.post('/manual-confirm', async (req, res) => {
  try {
    const { orderId, transactionHash, amount } = req.body;

    if (!orderId || !transactionHash || !amount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'orderId, transactionHash, and amount are required'
        }
      });
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found'
        }
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ORDER_NOT_PENDING',
          message: 'Order is not in pending status'
        }
      });
    }

    // Manually confirm payment
    const { error: updateError } = await supabase
      .from('payment_orders')
      .update({
        status: 'paid',
        received_amount: parseFloat(amount),
        transaction_hash: transactionHash,
        confirmed_at: new Date().toISOString(),
        webhook_status: 'manual_confirmed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) {
      logger.error('Failed to manually confirm payment:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update order status'
        }
      });
    }

    logger.info('Payment manually confirmed', {
      orderId,
      transactionHash,
      amount
    });

    res.json({
      success: true,
      data: {
        orderId,
        status: 'paid',
        transactionHash,
        amount: parseFloat(amount)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to manually confirm payment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MANUAL_CONFIRMATION_ERROR',
        message: 'Failed to manually confirm payment'
      }
    });
  }
});

/**
 * Webhook health check
 * GET /api/webhooks/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      webhooks: {
        tatum: 'active',
        manual: 'active'
      }
    }
  });
});

/**
 * Get webhook logs (for debugging)
 * GET /api/webhooks/logs
 */
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0, type, status } = req.query;

    let query = supabase
      .from('payment_orders')
      .select('id, order_number, webhook_type, webhook_status, payload, error_message, webhook_created_at, processed_at, updated_at')
      .not('webhook_type', 'is', null)
      .order('webhook_created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (type) {
      query = query.eq('webhook_type', type);
    }

    if (status) {
      query = query.eq('webhook_status', status);
    }

    const { data: logs, error } = await query;

    if (error) {
      logger.error('Failed to fetch webhook logs:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LOGS_FETCH_ERROR',
          message: 'Failed to fetch webhook logs'
        }
      });
    }

    res.json({
      success: true,
      data: {
        logs: logs || [],
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: logs?.length || 0
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get webhook logs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGS_ERROR',
        message: 'Failed to retrieve webhook logs'
      }
    });
  }
});

export default router;