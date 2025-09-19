import { Router, Response } from 'express';
import { supabase } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import Joi from 'joi';
import { 
  ApiResponse, 
  validateServerAccess, 
  validateImageUrl, 
  handleApiError,
  ApiCache,
  PaginationMeta 
} from './api-consolidation';
import { apiCache, CacheConfigs } from '../../middleware/apiCaching';
import { validateProductCreate, validateProductUpdate, validatePagination } from '../../middleware/inputValidation';
import CacheService, { CacheEventEmitter } from '../../services/cacheService';

const router = Router();

// Optimized validation schemas using consolidated patterns
const productSchemas = {
  create: Joi.object({
    server_id: Joi.string().required().messages({
      'any.required': 'Server ID is required',
      'string.empty': 'Server ID cannot be empty'
    }),
    category_id: Joi.string().uuid().optional().allow(null),
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(2000).optional().allow(''),
    price: Joi.number().positive().precision(2).required(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'BTC', 'ETH').default('USD'),
    image_url: Joi.string().uri().max(500).optional().allow(''),
    minecraft_commands: Joi.array().items(Joi.string().max(500)).optional().default([]),
    stock_quantity: Joi.number().integer().min(0).optional().allow(null),
    is_active: Joi.boolean().default(true)
  }),

  update: Joi.object({
    category_id: Joi.string().uuid().optional().allow(null),
    name: Joi.string().min(1).max(100).optional(),
    description: Joi.string().max(2000).optional().allow(''),
    price: Joi.number().positive().precision(2).optional(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'BTC', 'ETH').optional(),
    image_url: Joi.string().uri().max(500).optional().allow(''),
    minecraft_commands: Joi.array().items(Joi.string().max(500)).optional(),
    stock_quantity: Joi.number().integer().min(0).optional().allow(null),
    is_active: Joi.boolean().optional()
  }),

  query: Joi.object({
    server_id: Joi.string().required(),
    category_id: Joi.string().uuid().optional(),
    search: Joi.string().max(100).optional(),
    is_active: Joi.string().valid('true', 'false').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort_by: Joi.string().valid('name', 'price', 'created_at', 'updated_at').default('created_at'),
    sort_order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

/**
 * GET /api/products - Optimized product listing with enhanced filtering
 */
router.get('/', authMiddleware.authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate query parameters
    const { error: queryError, value: queryParams } = productSchemas.query.validate(req.query);
    if (queryError) {
      return res.status(400).json(
        ApiResponse.error('VALIDATION_ERROR', queryError.details[0].message)
      );
    }

    const { server_id, category_id, search, is_active, page, limit, sort_by, sort_order } = queryParams;

    // Check cache first
    const cacheKey = `products:${server_id}:${JSON.stringify(queryParams)}`;
    const cached = ApiCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // Validate server access
    const { server, error: serverError } = await validateServerAccess(server_id, req.user!.id, supabase);
    if (serverError) {
      return res.status(serverError.statusCode).json(serverError);
    }

    // Build optimized query with single database call
    let query = supabase
      .from('products')
      .select(`
        id, name, description, price, currency, image_url,
        minecraft_commands, stock_quantity, is_active,
        created_at, updated_at,
        category:categories(id, name, image_url)
      `)
      .eq('server_id', server.id);

    // Apply filters
    if (category_id) query = query.eq('category_id', category_id);
    if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

    // Apply sorting and pagination
    const offset = (page - 1) * limit;
    query = query
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    const [{ data: products, error: productsError }, { count, error: countError }] = await Promise.all([
      query,
      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('server_id', server.id)
        .then(result => {
          let countQuery = supabase.from('products').select('*', { count: 'exact', head: true }).eq('server_id', server.id);
          if (category_id) countQuery = countQuery.eq('category_id', category_id);
          if (search) countQuery = countQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
          if (is_active !== undefined) countQuery = countQuery.eq('is_active', is_active === 'true');
          return countQuery;
        })
    ]);

    if (productsError || countError) {
      throw productsError || countError;
    }

    // Transform data
    const transformedProducts = products.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      image_url: product.image_url,
      minecraft_commands: product.minecraft_commands || [],
      stock_quantity: product.stock_quantity,
      is_active: product.is_active,
      category_id: product.category?.id || null,
      created_at: product.created_at,
      updated_at: product.updated_at
    }));

    const pagination: PaginationMeta = {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      hasNext: offset + limit < (count || 0),
      hasPrev: page > 1
    };

    const response = ApiResponse.paginated(transformedProducts, pagination);
    
    // Cache for 5 minutes
    ApiCache.set(cacheKey, response, 5 * 60 * 1000);

    logger.info('Products retrieved successfully', {
      serverId: server_id,
      userId: req.user?.id,
      productCount: products.length,
      filters: { category_id, search, is_active },
      pagination
    });

    res.json(response);
  } catch (error) {
    handleApiError(error, 'products.list', req);
  }
});

/**
 * POST /api/products - Optimized product creation
 */
router.post('/', authMiddleware.authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const { error: validationError, value: validatedData } = productSchemas.create.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (validationError) {
      const errors = validationError.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json(
        ApiResponse.error('VALIDATION_ERROR', 'Invalid input data', errors)
      );
    }

    // Validate server access
    const { server, error: serverError } = await validateServerAccess(validatedData.server_id, req.user!.id, supabase);
    if (serverError) {
      return res.status(serverError.statusCode).json(serverError);
    }

    // Parallel validation checks
    const [
      existingProductCheck,
      categoryCheck,
      imageValidation,
      productCountCheck
    ] = await Promise.all([
      // Check for duplicate names
      supabase
        .from('products')
        .select('id, name')
        .eq('server_id', server.id)
        .ilike('name', validatedData.name.trim())
        .single(),
      
      // Validate category if provided
      validatedData.category_id ? 
        supabase
          .from('categories')
          .select('id, name')
          .eq('id', validatedData.category_id)
          .eq('server_id', server.id)
          .single() : 
        Promise.resolve({ data: null, error: null }),
      
      // Validate image URL if provided
      validatedData.image_url ? validateImageUrl(validatedData.image_url) : Promise.resolve({ valid: true }),
      
      // Check product limit
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('server_id', server.id)
    ]);

    // Handle validation results
    if (existingProductCheck.data) {
      return res.status(409).json(
        ApiResponse.error('PRODUCT_EXISTS', `A product named "${existingProductCheck.data.name}" already exists`, { existingProductId: existingProductCheck.data.id }, 409)
      );
    }

    if (validatedData.category_id && categoryCheck.error?.code === 'PGRST116') {
      return res.status(400).json(
        ApiResponse.error('INVALID_CATEGORY', 'Selected category does not exist or does not belong to this server')
      );
    }

    if (!imageValidation.valid) {
      return res.status(400).json(
        ApiResponse.error('INVALID_IMAGE_URL', imageValidation.error || 'Invalid image URL')
      );
    }

    const productLimit = 1000;
    if ((productCountCheck.count || 0) >= productLimit) {
      return res.status(403).json(
        ApiResponse.error('PRODUCT_LIMIT_REACHED', `Product limit reached (${productLimit} products maximum)`, { currentCount: productCountCheck.count, limit: productLimit }, 403)
      );
    }

    // Validate minecraft commands
    const validatedCommands = [];
    if (validatedData.minecraft_commands?.length > 0) {
      for (const command of validatedData.minecraft_commands) {
        const trimmedCommand = command.trim();
        if (trimmedCommand) {
          if (!trimmedCommand.startsWith('/')) {
            return res.status(400).json(
              ApiResponse.error('INVALID_COMMAND_FORMAT', `Command "${trimmedCommand}" must start with /`)
            );
          }
          validatedCommands.push(trimmedCommand);
        }
      }
    }

    // Create product
    const { data: newProduct, error: createError } = await supabase
      .from('products')
      .insert({
        server_id: server.id,
        category_id: validatedData.category_id || null,
        name: validatedData.name.trim(),
        description: validatedData.description?.trim() || null,
        price: validatedData.price,
        currency: validatedData.currency,
        image_url: validatedData.image_url?.trim() || null,
        minecraft_commands: validatedCommands,
        stock_quantity: validatedData.stock_quantity,
        is_active: validatedData.is_active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        id, name, description, price, currency, image_url,
        minecraft_commands, stock_quantity, is_active,
        created_at, updated_at,
        category:categories(id, name, image_url)
      `)
      .single();

    if (createError) {
      throw createError;
    }

    // Clear related cache and emit cache invalidation event
    await CacheService.invalidateProductCache(newProduct.id, req.user?.id);
    CacheEventEmitter.emit('product:created', {
      productId: newProduct.id,
      userId: req.user?.id,
      serverId: validatedData.server_id
    });

    logger.info('Product created successfully', {
      serverId: validatedData.server_id,
      userId: req.user?.id,
      productId: newProduct.id,
      productName: newProduct.name
    });

    res.status(201).json(
      ApiResponse.success({
        product: {
          id: newProduct.id,
          name: newProduct.name,
          description: newProduct.description,
          price: newProduct.price,
          currency: newProduct.currency,
          image_url: newProduct.image_url,
          minecraft_commands: newProduct.minecraft_commands || [],
          stock_quantity: newProduct.stock_quantity,
          is_active: newProduct.is_active,
          category_id: newProduct.category?.id || null,
          created_at: newProduct.created_at,
          updated_at: newProduct.updated_at
        }
      }, `Product "${newProduct.name}" created successfully`)
    );

  } catch (error) {
    handleApiError(error, 'products.create', req);
  }
});

// Additional optimized routes would follow the same pattern...
// PUT /:productId, DELETE /:productId, GET /:productId

export default router;