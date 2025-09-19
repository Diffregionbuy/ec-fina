import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { optimizedDb, QueryOptions } from '../../services/optimizedDatabase';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas
const queryOptionsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  page: Joi.number().integer().min(1),
  orderBy: Joi.string().valid('created_at', 'updated_at', 'name', 'price').default('created_at'),
  orderDirection: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().max(100).optional(),
  category_id: Joi.string().uuid().optional(),
  is_active: Joi.boolean().optional(),
  min_price: Joi.number().min(0).optional(),
  max_price: Joi.number().min(0).optional(),
  in_stock: Joi.boolean().optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  type: Joi.string().valid('purchase', 'withdrawal', 'subscription', 'refund').optional(),
  status: Joi.string().valid('pending', 'completed', 'failed', 'cancelled').optional()
});

/**
 * GET /api/optimized/products/:serverId
 * Get products with advanced filtering, search, and caching
 */
router.get('/products/:serverId',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      
      // Validate query parameters
      const { error: validationError, value: validatedQuery } = queryOptionsSchema.validate(req.query);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationError.details[0].message,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Convert page to offset if provided
      if (validatedQuery.page) {
        validatedQuery.offset = (validatedQuery.page - 1) * validatedQuery.limit;
      }

      // Build filters object
      const filters: Record<string, any> = {};
      if (validatedQuery.category_id) filters.category_id = validatedQuery.category_id;
      if (validatedQuery.is_active !== undefined) filters.is_active = validatedQuery.is_active;
      if (validatedQuery.min_price) filters.min_price = validatedQuery.min_price;
      if (validatedQuery.max_price) filters.max_price = validatedQuery.max_price;
      if (validatedQuery.in_stock) filters.in_stock = validatedQuery.in_stock;

      const options: QueryOptions = {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        orderBy: validatedQuery.orderBy,
        orderDirection: validatedQuery.orderDirection,
        filters,
        search: validatedQuery.search
      };

      const result = await optimizedDb.getProducts(serverId, options);

      logger.info('Optimized products query executed', {
        serverId,
        userId: req.user?.id,
        options,
        resultCount: result.data.length,
        total: result.pagination.total
      });

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Optimized products query failed:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to fetch products', 500, 'PRODUCTS_QUERY_ERROR');
    }
  }
);

/**
 * GET /api/optimized/server/:serverId/stats
 * Get server with comprehensive stats using optimized queries
 */
router.get('/server/:serverId/stats',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('User ID not found', 401, 'UNAUTHORIZED');
      }

      const serverWithStats = await optimizedDb.getServerWithStats(serverId, userId);

      logger.info('Optimized server stats query executed', {
        serverId,
        userId,
        statsIncluded: Object.keys(serverWithStats.stats || {})
      });

      res.json({
        success: true,
        data: { server: serverWithStats },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Optimized server stats query failed:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to fetch server stats', 500, 'SERVER_STATS_ERROR');
    }
  }
);

/**
 * GET /api/optimized/user/servers
 * Get user servers with optimized queries and caching
 */
router.get('/user/servers',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('User ID not found', 401, 'UNAUTHORIZED');
      }

      const servers = await optimizedDb.getUserServers(userId);

      logger.info('Optimized user servers query executed', {
        userId,
        serverCount: servers.length
      });

      res.json({
        success: true,
        data: { servers },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Optimized user servers query failed:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to fetch user servers', 500, 'USER_SERVERS_ERROR');
    }
  }
);

/**
 * GET /api/optimized/transactions/:userId
 * Get transaction history with advanced filtering and caching
 */
router.get('/transactions/:userId',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const serverId = req.query.server_id as string;

      // Ensure user can only access their own transactions
      if (userId !== req.user?.id) {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      // Validate query parameters
      const { error: validationError, value: validatedQuery } = queryOptionsSchema.validate(req.query);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationError.details[0].message,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Convert page to offset if provided
      if (validatedQuery.page) {
        validatedQuery.offset = (validatedQuery.page - 1) * validatedQuery.limit;
      }

      // Build filters object
      const filters: Record<string, any> = {};
      if (validatedQuery.type) filters.type = validatedQuery.type;
      if (validatedQuery.status) filters.status = validatedQuery.status;
      if (validatedQuery.date_from) filters.date_from = validatedQuery.date_from;
      if (validatedQuery.date_to) filters.date_to = validatedQuery.date_to;

      const options: QueryOptions = {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        orderBy: validatedQuery.orderBy,
        orderDirection: validatedQuery.orderDirection,
        filters
      };

      const result = await optimizedDb.getTransactionHistory(userId, serverId, options);

      logger.info('Optimized transactions query executed', {
        userId,
        serverId,
        options,
        resultCount: result.data.length,
        total: result.pagination.total
      });

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Optimized transactions query failed:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to fetch transactions', 500, 'TRANSACTIONS_QUERY_ERROR');
    }
  }
);

/**
 * POST /api/optimized/products/:serverId/batch-update
 * Batch update products for better performance
 */
router.post('/products/:serverId/batch-update',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const { updates } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_UPDATES',
            message: 'Updates must be a non-empty array',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Validate each update
      const updateSchema = Joi.object({
        id: Joi.string().uuid().required(),
        data: Joi.object().min(1).required()
      });

      for (const update of updates) {
        const { error } = updateSchema.validate(update);
        if (error) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_UPDATE_FORMAT',
              message: error.details[0].message,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      await optimizedDb.batchUpdateProducts(serverId, updates);

      logger.info('Batch product update completed', {
        serverId,
        userId: req.user?.id,
        updateCount: updates.length
      });

      res.json({
        success: true,
        data: {
          message: `Successfully updated ${updates.length} products`,
          updatedCount: updates.length
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Batch product update failed:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to batch update products', 500, 'BATCH_UPDATE_ERROR');
    }
  }
);

/**
 * POST /api/optimized/cache/clear
 * Clear cache for specific patterns or all cache
 */
router.post('/cache/clear',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { pattern } = req.body;

      optimizedDb.clearCache(pattern);

      logger.info('Cache cleared', {
        userId: req.user?.id,
        pattern: pattern || 'all'
      });

      res.json({
        success: true,
        data: {
          message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared'
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Cache clear failed:', error);
      throw new AppError('Failed to clear cache', 500, 'CACHE_CLEAR_ERROR');
    }
  }
);

/**
 * GET /api/optimized/health
 * Database health check and performance metrics
 */
router.get('/health',
  async (req, res: Response) => {
    try {
      const healthCheck = await optimizedDb.performHealthCheck();

      res.json({
        success: true,
        data: healthCheck,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Database health check failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Database health check failed',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

export default router;
