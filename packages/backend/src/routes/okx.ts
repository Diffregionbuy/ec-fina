import express from 'express';
import axios from 'axios';
import { getOptimizedOKXService } from '../services/optimizedOkx';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/centralizedErrorHandler';
import { authenticateToken } from '../middleware/enhancedAuth';
import CacheService from '../services/cacheService';
import { redis } from '../middleware/apiCaching';

const router = express.Router();

// Environment variables
const API_KEY = process.env.OKX_API_KEY;
const SECRET_KEY = process.env.OKX_SECRET_KEY;
const PASSPHRASE = process.env.OKX_PASSPHRASE;

// Fallback currency data
const getFallbackCurrencies = () => [
  {
    ccy: 'BTC',
    name: 'Bitcoin',
    chain: 'BTC',
    canDep: true,
    canWd: true,
    canInternal: true,
    minWd: '0.001',
    maxWd: '500',
    minFee: '0.0005',
    maxFee: '0.004'
  },
  {
    ccy: 'ETH',
    name: 'Ethereum',
    chain: 'ETH',
    canDep: true,
    canWd: true,
    canInternal: true,
    minWd: '0.01',
    maxWd: '1000',
    minFee: '0.005',
    maxFee: '0.02'
  },
  {
    ccy: 'USDT',
    name: 'Tether',
    chain: 'ETH',
    canDep: true,
    canWd: true,
    canInternal: true,
    minWd: '10',
    maxWd: '50000',
    minFee: '1',
    maxFee: '5'
  }
];

// Enhanced cache helper functions with Redis connection resilience
const getCache = async (key: string) => {
  try {
    // Check if Redis is available
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.warn('Cache get error (continuing without cache):', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
};

const setCache = async (key: string, data: any, ttl: number) => {
  try {
    await redis.setex(key, Math.floor(ttl / 1000), JSON.stringify(data));
    logger.debug('Cache set successful', { key, ttl });
  } catch (error) {
    logger.warn('Cache set error (continuing without cache):', {
      key,
      ttl,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Don't throw error, just continue without caching
  }
};

// Redis health check helper
const isRedisHealthy = async (): Promise<boolean> => {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    return false;
  }
};


// GET /api/okx/currencies - Get all supported currencies
router.get('/currencies', async (req, res) => {
  logger.info('🎯 OKX /currencies endpoint hit', { 
    query: req.query, 
    hasCredentials: !!(API_KEY && SECRET_KEY && PASSPHRASE),
    credentials: {
      apiKey: API_KEY ? `${API_KEY.substring(0, 8)}...` : 'missing',
      secretKey: SECRET_KEY ? `${SECRET_KEY.substring(0, 8)}...` : 'missing',
      passphrase: PASSPHRASE ? `${PASSPHRASE.substring(0, 4)}...` : 'missing'
    }
  });

  try {
    const cacheKey = 'okx-currencies';
    const forceRefresh = req.query.nocache === 'true';
    
    if (!forceRefresh) {
      const cached = await getCache(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) {
        logger.info('📦 Returning cached OKX currencies', { count: cached.length });
        return res.json({
          success: true,
          data: cached,
          cached: true,
        });
      }
      if (cached && !Array.isArray(cached)) {
        logger.warn('Cached currencies invalid shape, ignoring and refreshing', { type: typeof cached });
      }
    }

    // Check if we have API credentials
    if (!API_KEY || !SECRET_KEY || !PASSPHRASE) {
      logger.warn('❌ OKX API credentials not found, using fallback data');
      const fallbackData = getFallbackCurrencies();
      await setCache(cacheKey, fallbackData, 60 * 60 * 1000);
      
      return res.json({
        success: true,
        data: fallbackData,
        fallback: true,
      });
    }

    try {
      logger.info('🚀 Attempting OKX API call for currencies via signed service...');
      const okxService = getOptimizedOKXService();
      logger.info('📡 OKX service created, calling getSupportedCurrencies...');
      
      // Add timeout wrapper for the API call
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OKX API call timeout')), 15000); // 15 second timeout
      });
      
      const apiCallPromise = okxService.getSupportedCurrencies(true);
      const currencies = await Promise.race([apiCallPromise, timeoutPromise]);

      logger.info('✅ Successfully fetched OKX currencies', {
        count: Array.isArray(currencies) ? currencies.length : 0,
        sample: Array.isArray(currencies) ? currencies.slice(0, 3).map((c: any) => c.ccy) : [],
        type: typeof currencies
      });
      
      // Validate the response
      if (!Array.isArray(currencies) || currencies.length === 0) {
        throw new Error('Invalid or empty currencies response from OKX');
      }
      
      // Cache for 1 hour
      await setCache(cacheKey, currencies, 60 * 60 * 1000);
      
      res.json({
        success: true,
        data: currencies,
        realData: true,
        cached: false,
        timestamp: new Date().toISOString()
      });
    } catch (apiError) {
      logger.error('❌ OKX service call failed, using fallback data:', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        stack: apiError instanceof Error ? apiError.stack?.substring(0, 500) : undefined,
        isTimeout: apiError instanceof Error && apiError.message.includes('timeout')
      });
      
      const fallbackData = getFallbackCurrencies();
      
      // Still try to cache fallback data (with shorter TTL)
      await setCache(cacheKey, fallbackData, 30 * 60 * 1000); // 30 minutes for fallback
      
      return res.json({
        success: true,
        data: fallbackData,
        fallback: true,
        error: apiError instanceof Error ? apiError.message : 'API call failed',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('💥 Failed to fetch OKX currencies:', error);
    
    // Return fallback data on error
    const fallbackData = getFallbackCurrencies();
    res.json({
      success: true,
      data: fallbackData,
      fallback: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/okx/networks/:currency - Get networks for a specific currency
router.get('/networks/:currency', async (req, res) => {
  try {
    const { currency } = req.params;
    const cacheKey = `okx-networks-${currency}`;
    const cached = await getCache(cacheKey);
    
    if (Array.isArray(cached) && cached.length > 0) {
      return res.json({
        success: true,
        data: cached,
        cached: true,
      });
    }
    if (cached && !Array.isArray(cached)) {
      logger.warn('Cached networks invalid shape, ignoring and refreshing', { currency, type: typeof cached });
    }

    // Check if we have API credentials
    if (!API_KEY || !SECRET_KEY || !PASSPHRASE) {
      logger.warn('OKX API credentials not found, using fallback data');
      const fallbackData = getFallbackCurrencies().filter(c => c.ccy === currency.toUpperCase());
      await setCache(cacheKey, fallbackData, 60 * 60 * 1000);
      
      return res.json({
        success: true,
        data: fallbackData,
        fallback: true,
      });
    }

    try {
      const okxService = getOptimizedOKXService();
      const networks = await okxService.getCurrencyNetworks(currency.toUpperCase(), true);
      
      // Cache for 30 minutes
      await setCache(cacheKey, networks, 30 * 60 * 1000);
      
      res.json({
        success: true,
        data: networks,
      });
    } catch (apiError) {
      logger.warn(`OKX service call failed for ${currency}, using fallback data:`, apiError);
      const fallbackData = getFallbackCurrencies().filter(c => c.ccy === currency.toUpperCase());
      await setCache(cacheKey, fallbackData, 60 * 60 * 1000);
      
      return res.json({
        success: true,
        data: fallbackData,
        fallback: true,
        error: apiError instanceof Error ? apiError.message : 'API call failed',
      });
    }
  } catch (error) {
    logger.error(`Failed to fetch networks for ${req.params.currency}:`, error);
    
    // Return fallback data on error
    const fallbackData = getFallbackCurrencies().filter(c => c.ccy === req.params.currency.toUpperCase());
    res.json({
      success: true,
      data: fallbackData,
      fallback: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Clear OKX-related cache keys
 * POST /api/okx/cache/clear
 * body: { pattern?: string }  // defaults to 'okx*'
 */
router.post('/cache/clear', async (req, res) => {
  try {
    const { pattern } = req.body || {};
    const match = pattern || 'okx*';
    const keys = await redis.keys(match);
    let deleted = 0;
    if (keys.length > 0) {
      // @ts-ignore node-redis supports spread del
      await redis.del(...keys);
      deleted = keys.length;
    }
    logger.info('OKX cache cleared via API', { pattern: match, deleted });
    return res.json({ success: true, deleted, pattern: match });
  } catch (error) {
    logger.error('Failed to clear OKX cache', { error });
    return res.status(500).json({ success: false, error: 'Failed to clear cache' });
  }
});

export default router;
