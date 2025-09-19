import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: Record<string, any>;
  search?: string;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Optimized Database Service
 * Provides high-performance database operations with caching and query optimization
 */
export class OptimizedDatabaseService {
  private static instance: OptimizedDatabaseService;
  private queryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): OptimizedDatabaseService {
    if (!OptimizedDatabaseService.instance) {
      OptimizedDatabaseService.instance = new OptimizedDatabaseService();
    }
    return OptimizedDatabaseService.instance;
  }

  /**
   * Get cached query result or execute query
   */
  private async getCachedQuery<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl: number = this.DEFAULT_CACHE_TTL
  ): Promise<T> {
    const cached = this.queryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      logger.debug('Cache hit for query', { cacheKey });
      return cached.data;
    }

    const result = await queryFn();
    this.queryCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
      ttl
    });

    logger.debug('Cache miss, executed query', { cacheKey });
    return result;
  }

  /**
   * Clear cache for specific keys or all cache
   */
  public clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.queryCache.keys()) {
        if (key.includes(pattern)) {
          this.queryCache.delete(key);
        }
      }
    } else {
      this.queryCache.clear();
    }
  }

  /**
   * Optimized product queries with advanced filtering and caching
   */
  public async getProducts(
    serverId: string,
    options: QueryOptions = {}
  ): Promise<PaginationResult<any>> {
    const {
      limit = 20,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc',
      filters = {},
      search
    } = options;

    const page = Math.floor(offset / limit) + 1;
    const cacheKey = `products:${serverId}:${JSON.stringify(options)}`;

    return this.getCachedQuery(cacheKey, async () => {
      try {
        // Build optimized query with covering index
        let query = supabase
          .from('products')
          .select(`
            id,
            name,
            description,
            price,
            currency,
            image_url,
            minecraft_commands,
            stock_quantity,
            is_active,
            created_at,
            updated_at,
            category:categories!left(
              id,
              name,
              image_url
            )
          `)
          .eq('server_id', serverId);

        // Apply filters efficiently
        if (filters.category_id) {
          query = query.eq('category_id', filters.category_id);
        }

        if (filters.is_active !== undefined) {
          query = query.eq('is_active', filters.is_active);
        }

        if (filters.min_price) {
          query = query.gte('price', filters.min_price);
        }

        if (filters.max_price) {
          query = query.lte('price', filters.max_price);
        }

        if (filters.in_stock) {
          query = query.or('stock_quantity.is.null,stock_quantity.gt.0');
        }

        // Full-text search using GIN index
        if (search) {
          query = query.textSearch('name,description', search, {
            type: 'websearch',
            config: 'english'
          });
        }

        // Apply ordering and pagination
        query = query
          .order(orderBy, { ascending: orderDirection === 'asc' })
          .range(offset, offset + limit - 1);

        const { data: products, error: productsError } = await query;

        if (productsError) {
          throw new AppError('Failed to fetch products', 500, 'DATABASE_ERROR', {
            originalError: productsError
          });
        }

        // Get total count with same filters (using separate optimized query)
        let countQuery = supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('server_id', serverId);

        // Apply same filters for count
        if (filters.category_id) {
          countQuery = countQuery.eq('category_id', filters.category_id);
        }
        if (filters.is_active !== undefined) {
          countQuery = countQuery.eq('is_active', filters.is_active);
        }
        if (filters.min_price) {
          countQuery = countQuery.gte('price', filters.min_price);
        }
        if (filters.max_price) {
          countQuery = countQuery.lte('price', filters.max_price);
        }
        if (filters.in_stock) {
          countQuery = countQuery.or('stock_quantity.is.null,stock_quantity.gt.0');
        }
        if (search) {
          countQuery = countQuery.textSearch('name,description', search, {
            type: 'websearch',
            config: 'english'
          });
        }

        const { count, error: countError } = await countQuery;

        if (countError) {
          throw new AppError('Failed to count products', 500, 'DATABASE_ERROR', {
            originalError: countError
          });
        }

        const total = count || 0;
        const totalPages = Math.ceil(total / limit);

        return {
          data: products || [],
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: offset + limit < total,
            hasPrev: page > 1
          }
        };
      } catch (error) {
        logger.error('Optimized products query failed', { serverId, options, error });
        throw error;
      }
    }, 2 * 60 * 1000); // 2 minute cache for products
  }

  /**
   * Optimized server queries with relationship data
   */
  public async getServerWithStats(serverId: string, userId: string): Promise<any> {
    const cacheKey = `server:${serverId}:${userId}:stats`;

    return this.getCachedQuery(cacheKey, async () => {
      try {
        // Single optimized query with all related data
        const { data: server, error: serverError } = await supabase
          .from('servers')
          .select(`
            id,
            discord_server_id,
            name,
            icon,
            bot_invited,
            bot_config,
            created_at,
            updated_at,
            owner:users!servers_owner_id_fkey(
              id,
              discord_id,
              username,
              avatar
            )
          `)
          .eq('discord_server_id', serverId)
          .eq('owner_id', userId)
          .single();

        if (serverError) {
          throw new AppError('Server not found', 404, 'SERVER_NOT_FOUND', {
            serverId,
            userId
          });
        }

        // Get aggregated stats in parallel
        const [productsStats, ordersStats, transactionsStats] = await Promise.all([
          // Products stats
          supabase
            .from('products')
            .select('id, is_active, price, currency', { count: 'exact' })
            .eq('server_id', server.id),

          // Orders stats (last 30 days)
          supabase
            .from('orders')
            .select('total_amount, currency, status', { count: 'exact' })
            .eq('server_id', server.id)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

          // Transactions stats (last 30 days)
          supabase
            .from('transactions')
            .select('amount, currency, type, status', { count: 'exact' })
            .eq('server_id', server.id)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        ]);

        // Calculate stats
        const activeProducts = productsStats.data?.filter(p => p.is_active).length || 0;
        const totalProducts = productsStats.count || 0;
        
        const completedOrders = ordersStats.data?.filter(o => o.status === 'completed').length || 0;
        const totalRevenue = ordersStats.data
          ?.filter(o => o.status === 'completed')
          .reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

        const completedTransactions = transactionsStats.data?.filter(t => t.status === 'completed').length || 0;

        return {
          ...server,
          stats: {
            products: {
              total: totalProducts,
              active: activeProducts,
              inactive: totalProducts - activeProducts
            },
            orders: {
              total: ordersStats.count || 0,
              completed: completedOrders,
              pending: (ordersStats.data?.filter(o => o.status === 'pending').length || 0)
            },
            revenue: {
              total: totalRevenue,
              currency: 'USD' // Default currency
            },
            transactions: {
              total: transactionsStats.count || 0,
              completed: completedTransactions,
              failed: (transactionsStats.data?.filter(t => t.status === 'failed').length || 0)
            }
          }
        };
      } catch (error) {
        logger.error('Optimized server stats query failed', { serverId, userId, error });
        throw error;
      }
    }, 5 * 60 * 1000); // 5 minute cache for server stats
  }

  /**
   * Optimized user servers query with configuration data
   */
  public async getUserServers(userId: string): Promise<any[]> {
    const cacheKey = `user:${userId}:servers`;

    return this.getCachedQuery(cacheKey, async () => {
      try {
        const { data: servers, error } = await supabase
          .from('servers')
          .select(`
            id,
            discord_server_id,
            name,
            icon,
            bot_invited,
            bot_config,
            created_at,
            updated_at,
            products_count:products(count),
            active_products_count:products!inner(count)
          `)
          .eq('owner_id', userId)
          .eq('products.is_active', true)
          .order('updated_at', { ascending: false });

        if (error) {
          throw new AppError('Failed to fetch user servers', 500, 'DATABASE_ERROR', {
            originalError: error,
            userId
          });
        }

        return servers || [];
      } catch (error) {
        logger.error('Optimized user servers query failed', { userId, error });
        throw error;
      }
    }, 3 * 60 * 1000); // 3 minute cache for user servers
  }

  /**
   * Optimized transaction history with filtering
   */
  public async getTransactionHistory(
    userId: string,
    serverId?: string,
    options: QueryOptions = {}
  ): Promise<PaginationResult<any>> {
    const {
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc',
      filters = {}
    } = options;

    const page = Math.floor(offset / limit) + 1;
    const cacheKey = `transactions:${userId}:${serverId || 'all'}:${JSON.stringify(options)}`;

    return this.getCachedQuery(cacheKey, async () => {
      try {
        let query = supabase
          .from('transactions')
          .select(`
            id,
            type,
            amount,
            currency,
            status,
            created_at,
            updated_at,
            metadata,
            product:products(
              id,
              name,
              image_url
            ),
            server:servers(
              id,
              discord_server_id,
              name,
              icon
            )
          `)
          .eq('user_id', userId);

        if (serverId) {
          query = query.eq('server_id', serverId);
        }

        // Apply filters
        if (filters.type) {
          query = query.eq('type', filters.type);
        }
        if (filters.status) {
          query = query.eq('status', filters.status);
        }
        if (filters.date_from) {
          query = query.gte('created_at', filters.date_from);
        }
        if (filters.date_to) {
          query = query.lte('created_at', filters.date_to);
        }

        // Apply ordering and pagination
        query = query
          .order(orderBy, { ascending: orderDirection === 'asc' })
          .range(offset, offset + limit - 1);

        const { data: transactions, error: transactionsError } = await query;

        if (transactionsError) {
          throw new AppError('Failed to fetch transactions', 500, 'DATABASE_ERROR', {
            originalError: transactionsError
          });
        }

        // Get total count
        let countQuery = supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (serverId) {
          countQuery = countQuery.eq('server_id', serverId);
        }

        // Apply same filters for count
        if (filters.type) {
          countQuery = countQuery.eq('type', filters.type);
        }
        if (filters.status) {
          countQuery = countQuery.eq('status', filters.status);
        }
        if (filters.date_from) {
          countQuery = countQuery.gte('created_at', filters.date_from);
        }
        if (filters.date_to) {
          countQuery = countQuery.lte('created_at', filters.date_to);
        }

        const { count, error: countError } = await countQuery;

        if (countError) {
          throw new AppError('Failed to count transactions', 500, 'DATABASE_ERROR', {
            originalError: countError
          });
        }

        const total = count || 0;
        const totalPages = Math.ceil(total / limit);

        return {
          data: transactions || [],
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: offset + limit < total,
            hasPrev: page > 1
          }
        };
      } catch (error) {
        logger.error('Optimized transactions query failed', { userId, serverId, options, error });
        throw error;
      }
    }, 1 * 60 * 1000); // 1 minute cache for transactions
  }

  /**
   * Batch operations for better performance
   */
  public async batchUpdateProducts(
    serverId: string,
    updates: Array<{ id: string; data: any }>
  ): Promise<void> {
    try {
      // Clear cache for this server's products
      this.clearCache(`products:${serverId}`);

      // Execute batch update
      const updatePromises = updates.map(({ id, data }) =>
        supabase
          .from('products')
          .update({
            ...data,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .eq('server_id', serverId)
      );

      const results = await Promise.all(updatePromises);

      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw new AppError('Batch update failed', 500, 'BATCH_UPDATE_ERROR', {
          errors: errors.map(e => e.error)
        });
      }

      logger.info('Batch product update completed', {
        serverId,
        updateCount: updates.length
      });
    } catch (error) {
      logger.error('Batch product update failed', { serverId, updates, error });
      throw error;
    }
  }

  /**
   * Database health check and optimization
   */
  public async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: any;
  }> {
    try {
      const startTime = Date.now();

      // Test basic connectivity
      const { data, error } = await supabase
        .from('users')
        .select('count')
        .limit(1);

      if (error) {
        return {
          status: 'unhealthy',
          metrics: { error: error.message }
        };
      }

      const responseTime = Date.now() - startTime;

      // Get cache statistics
      const cacheStats = {
        size: this.queryCache.size,
        hitRate: 0 // Would need to track hits/misses for accurate rate
      };

      const metrics = {
        responseTime,
        cacheStats,
        timestamp: new Date().toISOString()
      };

      const status = responseTime < 100 ? 'healthy' : 
                    responseTime < 500 ? 'degraded' : 'unhealthy';

      return { status, metrics };
    } catch (error) {
      logger.error('Database health check failed', { error });
      return {
        status: 'unhealthy',
        metrics: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }
}

export const optimizedDb = OptimizedDatabaseService.getInstance();