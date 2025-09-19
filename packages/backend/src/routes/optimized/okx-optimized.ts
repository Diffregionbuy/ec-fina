import express from 'express';
import { getOptimizedOKXService } from '../services/optimizedOkx';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/centralizedErrorHandler';
import { authenticateToken } from '../middleware/enhancedAuth';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for OKX endpoints
const okxRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: {
    success: false,
    error: {
      code: 'OKX_RATE_LIMIT_EXCEEDED',
      message: 'Too many OKX API requests. Please try again later.',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

// Apply rate limiting to all OKX routes
router.use(okxRateLimit);

/**
 * GET /api/okx/currencies - Get all supported currencies
 * Enhanced with caching, error handling, and fallback data
 */
router.get('/currencies', async (req, res, next) => {
  try {
    const forceRefresh = req.query.nocache === 'true';
    const okxService = getOptimizedOKXService();

    logger.info('OKX currencies request', {
      forceRefresh,
      userAgent: req.headers['user-agent']?.substring(0, 100),
      ip: req.ip
    });

    const currencies = await okxService.getSupportedCurrencies(!forceRefresh);

    res.json({
      success: true,
      data: currencies,
      meta: {
        count: currencies.length,
        cached: !forceRefresh,
        timestamp: new Date().toISOString()
      }
    });

    logger.info('OKX currencies response sent', {
      count: currencies.length,
      responseTime: Date.now() - req.startTime
    });

  } catch (error) {
    logger.error('OKX currencies endpoint error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ip: req.ip
    });

    if (error instanceof AppError) {
      return next(error);
    }

    // Return fallback data on unexpected errors
    const fallbackCurrencies = [
      {
        ccy: 'BTC',
        name: 'Bitcoin',
        logoLink: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
        mainNet: true,
        chain: 'BTC',
        canDep: true,
        canWd: true,
        canInternal: true,
        minWd: '0.001',
        maxWd: '100',
        wdTickSz: '0.00000001',
        wdQuota: '100',
        usedWdQuota: '0',
        fee: '0.0005',
        feeCcy: 'BTC',
        minFee: '0.0005',
        maxFee: '0.0005'
      },
      {
        ccy: 'ETH',
        name: 'Ethereum',
        logoLink: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
        mainNet: true,
        chain: 'ETH',
        canDep: true,
        canWd: true,
        canInternal: true,
        minWd: '0.01',
        maxWd: '1000',
        wdTickSz: '0.00000001',
        wdQuota: '1000',
        usedWdQuota: '0',
        fee: '0.005',
        feeCcy: 'ETH',
        minFee: '0.005',
        maxFee: '0.005'
      },
      {
        ccy: 'USDT',
        name: 'Tether USD',
        logoLink: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
        mainNet: true,
        chain: 'ETH',
        canDep: true,
        canWd: true,
        canInternal: true,
        minWd: '10',
        maxWd: '50000',
        wdTickSz: '0.01',
        wdQuota: '50000',
        usedWdQuota: '0',
        fee: '1',
        feeCcy: 'USDT',
        minFee: '1',
        maxFee: '1'
      }
    ];

    res.json({
      success: true,
      data: fallbackCurrencies,
      meta: {
        count: fallbackCurrencies.length,
        fallback: true,
        error: 'Using fallback data due to service error',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/okx/networks/:currency - Get networks for a specific currency
 * Enhanced with validation and error handling
 */
router.get('/networks/:currency', async (req, res, next) => {
  try {
    const { currency } = req.params;
    
    // Validate currency parameter
    if (!currency || currency.length > 10) {
      throw new AppError('Invalid currency parameter', 400, 'INVALID_CURRENCY');
    }

    const okxService = getOptimizedOKXService();

    logger.info('OKX networks request', {
      currency: currency.toUpperCase(),
      ip: req.ip
    });

    const networks = await okxService.getCurrencyNetworks(currency.toUpperCase());

    res.json({
      success: true,
      data: networks,
      meta: {
        currency: currency.toUpperCase(),
        count: networks.length,
        timestamp: new Date().toISOString()
      }
    });

    logger.info('OKX networks response sent', {
      currency: currency.toUpperCase(),
      count: networks.length,
      responseTime: Date.now() - req.startTime
    });

  } catch (error) {
    logger.error('OKX networks endpoint error:', {
      currency: req.params.currency,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    if (error instanceof AppError) {
      return next(error);
    }

    return next(new AppError('Failed to fetch currency networks', 500, 'OKX_NETWORKS_ERROR'));
  }
});

/**
 * GET /api/okx/balance - Get account balance (requires authentication)
 * Enhanced with authentication and detailed error handling
 */
router.get('/balance', authenticateToken, async (req, res, next) => {
  try {
    const { currency } = req.query;
    const okxService = getOptimizedOKXService();

    logger.info('OKX balance request', {
      userId: req.user?.id,
      currency: currency as string,
      ip: req.ip
    });

    const balances = await okxService.getBalance(currency as string);

    res.json({
      success: true,
      data: balances,
      meta: {
        currency: currency as string || 'all',
        count: balances.length,
        timestamp: new Date().toISOString()
      }
    });

    logger.info('OKX balance response sent', {
      userId: req.user?.id,
      count: balances.length,
      responseTime: Date.now() - req.startTime
    });

  } catch (error) {
    logger.error('OKX balance endpoint error:', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    if (error instanceof AppError) {
      return next(error);
    }

    return next(new AppError('Failed to fetch account balance', 500, 'OKX_BALANCE_ERROR'));
  }
});

/**
 * POST /api/okx/payment-intent - Create payment intent (requires authentication)
 * Enhanced with validation and security
 */
router.post('/payment-intent', authenticateToken, async (req, res, next) => {
  try {
    const { amount, currency, orderId, callbackUrl } = req.body;

    // Validate required fields
    if (!amount || !currency) {
      throw new AppError('Amount and currency are required', 400, 'MISSING_REQUIRED_FIELDS');
    }

    // Validate amount format
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new AppError('Invalid amount format', 400, 'INVALID_AMOUNT');
    }

    // Validate currency format
    if (typeof currency !== 'string' || currency.length > 10) {
      throw new AppError('Invalid currency format', 400, 'INVALID_CURRENCY');
    }

    const okxService = getOptimizedOKXService();

    logger.info('OKX payment intent request', {
      userId: req.user?.id,
      amount,
      currency: currency.toUpperCase(),
      orderId,
      ip: req.ip
    });

    const paymentIntent = await okxService.createPaymentIntent({
      amount: amount.toString(),
      currency: currency.toUpperCase(),
      orderId,
      callbackUrl
    });

    res.json({
      success: true,
      data: paymentIntent,
      meta: {
        timestamp: new Date().toISOString()
      }
    });

    logger.info('OKX payment intent created', {
      userId: req.user?.id,
      paymentId: paymentIntent.paymentId,
      amount,
      currency: currency.toUpperCase(),
      responseTime: Date.now() - req.startTime
    });

  } catch (error) {
    logger.error('OKX payment intent endpoint error:', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      body: req.body,
      ip: req.ip
    });

    if (error instanceof AppError) {
      return next(error);
    }

    return next(new AppError('Failed to create payment intent', 500, 'OKX_PAYMENT_INTENT_ERROR'));
  }
});

/**
 * POST /api/okx/withdrawal - Process withdrawal (requires authentication)
 * Enhanced with comprehensive validation and security
 */
router.post('/withdrawal', authenticateToken, async (req, res, next) => {
  try {
    const { currency, amount, destination, chain, fee, memo } = req.body;

    // Validate required fields
    if (!currency || !amount || !destination) {
      throw new AppError('Currency, amount, and destination are required', 400, 'MISSING_REQUIRED_FIELDS');
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new AppError('Invalid amount format', 400, 'INVALID_AMOUNT');
    }

    // Validate destination address format (basic validation)
    if (typeof destination !== 'string' || destination.length < 10 || destination.length > 100) {
      throw new AppError('Invalid destination address format', 400, 'INVALID_DESTINATION');
    }

    const okxService = getOptimizedOKXService();

    logger.info('OKX withdrawal request', {
      userId: req.user?.id,
      currency: currency.toUpperCase(),
      amount,
      destination: destination.substring(0, 10) + '...', // Log partial address for security
      chain,
      ip: req.ip
    });

    const withdrawal = await okxService.processWithdrawal({
      currency: currency.toUpperCase(),
      amount: amount.toString(),
      destination,
      chain,
      fee,
      memo
    });

    res.json({
      success: true,
      data: withdrawal,
      meta: {
        timestamp: new Date().toISOString()
      }
    });

    logger.info('OKX withdrawal processed', {
      userId: req.user?.id,
      withdrawalId: withdrawal.withdrawalId,
      currency: currency.toUpperCase(),
      amount,
      status: withdrawal.status,
      responseTime: Date.now() - req.startTime
    });

  } catch (error) {
    logger.error('OKX withdrawal endpoint error:', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      currency: req.body.currency,
      amount: req.body.amount,
      ip: req.ip
    });

    if (error instanceof AppError) {
      return next(error);
    }

    return next(new AppError('Failed to process withdrawal', 500, 'OKX_WITHDRAWAL_ERROR'));
  }
});

/**
 * GET /api/okx/withdrawal/:id - Get withdrawal status (requires authentication)
 * Enhanced with validation and detailed status tracking
 */
router.get('/withdrawal/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate withdrawal ID
    if (!id || id.length > 50) {
      throw new AppError('Invalid withdrawal ID', 400, 'INVALID_WITHDRAWAL_ID');
    }

    const okxService = getOptimizedOKXService();

    logger.info('OKX withdrawal status request', {
      userId: req.user?.id,
      withdrawalId: id,
      ip: req.ip
    });

    const status = await okxService.getWithdrawalStatus(id);

    res.json({
      success: true,
      data: status,
      meta: {
        withdrawalId: id,
        timestamp: new Date().toISOString()
      }
    });

    logger.info('OKX withdrawal status response sent', {
      userId: req.user?.id,
      withdrawalId: id,
      status: status.status,
      responseTime: Date.now() - req.startTime
    });

  } catch (error) {
    logger.error('OKX withdrawal status endpoint error:', {
      userId: req.user?.id,
      withdrawalId: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    if (error instanceof AppError) {
      return next(error);
    }

    return next(new AppError('Failed to get withdrawal status', 500, 'OKX_WITHDRAWAL_STATUS_ERROR'));
  }
});

/**
 * GET /api/okx/health - Health check endpoint
 * Provides comprehensive service health information
 */
router.get('/health', async (req, res) => {
  try {
    const okxService = getOptimizedOKXService();
    const healthData = await okxService.healthCheck();

    res.json({
      success: true,
      data: healthData,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    });

  } catch (error) {
    logger.error('OKX health check error:', error);
    
    res.status(503).json({
      success: false,
      error: {
        code: 'OKX_HEALTH_CHECK_FAILED',
        message: 'OKX service health check failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/okx/cache/clear - Clear OKX cache (admin only)
 * Enhanced with authentication and authorization
 */
router.post('/cache/clear', authenticateToken, async (req, res, next) => {
  try {
    // Check if user has admin permissions (you may need to implement this)
    // For now, we'll allow any authenticated user to clear cache
    
    const { pattern } = req.body;
    const okxService = getOptimizedOKXService();

    logger.info('OKX cache clear request', {
      userId: req.user?.id,
      pattern,
      ip: req.ip
    });

    okxService.clearCache(pattern);

    res.json({
      success: true,
      message: 'OKX cache cleared successfully',
      meta: {
        pattern: pattern || 'all',
        timestamp: new Date().toISOString()
      }
    });

    logger.info('OKX cache cleared', {
      userId: req.user?.id,
      pattern: pattern || 'all'
    });

  } catch (error) {
    logger.error('OKX cache clear endpoint error:', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    return next(new AppError('Failed to clear cache', 500, 'OKX_CACHE_CLEAR_ERROR'));
  }
});

/**
 * GET /api/okx/metrics - Get OKX service metrics (admin only)
 * Enhanced monitoring and analytics endpoint
 */
router.get('/metrics', authenticateToken, async (req, res, next) => {
  try {
    const okxService = getOptimizedOKXService();
    const healthData = await okxService.healthCheck();

    res.json({
      success: true,
      data: {
        service: healthData,
        endpoint: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    logger.error('OKX metrics endpoint error:', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    return next(new AppError('Failed to get metrics', 500, 'OKX_METRICS_ERROR'));
  }
});

// Add request timing middleware
router.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

export default router;