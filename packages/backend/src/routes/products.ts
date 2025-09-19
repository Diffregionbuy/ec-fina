import { Router, Response } from 'express';
import { supabase } from '../config/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { SubscriptionService } from '../services/SubscriptionService';
import Joi from 'joi';

const router = Router();

// Enhanced validation schemas with detailed error messages
const productCreateSchema = Joi.object({
  server_id: Joi.string().required().messages({
    'any.required': 'Server ID is required',
    'string.empty': 'Server ID cannot be empty'
  }),
  category_id: Joi.string().uuid().optional().allow(null).messages({
    'string.guid': 'Category ID must be a valid UUID'
  }),
  name: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Product name is required',
    'string.empty': 'Product name cannot be empty',
    'string.min': 'Product name must be at least 1 character',
    'string.max': 'Product name cannot exceed 100 characters'
  }),
  description: Joi.string().max(2000).optional().allow('').messages({
    'string.max': 'Description cannot exceed 2000 characters'
  }),
  price: Joi.number().positive().precision(2).required().messages({
    'any.required': 'Price is required',
    'number.positive': 'Price must be greater than 0',
    'number.precision': 'Price can have at most 2 decimal places'
  }),
  currency: Joi.string().valid('USD', 'EUR', 'GBP', 'BTC', 'ETH').default('USD').messages({
    'any.only': 'Currency must be one of: USD, EUR, GBP, BTC, ETH'
  }),
  image_url: Joi.string().uri().max(500).optional().allow('').messages({
    'string.uri': 'Image URL must be a valid URL',
    'string.max': 'Image URL cannot exceed 500 characters'
  }),
  minecraft_commands: Joi.array().items(
    Joi.string().max(500).messages({
      'string.max': 'Each command cannot exceed 500 characters'
    })
  ).optional().default([]).messages({
    'array.base': 'Minecraft commands must be an array'
  }),
  stock_quantity: Joi.number().integer().min(0).optional().allow(null).messages({
    'number.integer': 'Stock quantity must be a whole number',
    'number.min': 'Stock quantity cannot be negative'
  }),
  is_active: Joi.boolean().default(true)
});

const productUpdateSchema = Joi.object({
  category_id: Joi.string().uuid().optional().allow(null).messages({
    'string.guid': 'Category ID must be a valid UUID'
  }),
  name: Joi.string().min(1).max(100).optional().messages({
    'string.empty': 'Product name cannot be empty',
    'string.min': 'Product name must be at least 1 character',
    'string.max': 'Product name cannot exceed 100 characters'
  }),
  description: Joi.string().max(2000).optional().allow('').messages({
    'string.max': 'Description cannot exceed 2000 characters'
  }),
  price: Joi.number().positive().precision(2).optional().messages({
    'number.positive': 'Price must be greater than 0',
    'number.precision': 'Price can have at most 2 decimal places'
  }),
  currency: Joi.string().valid('USD', 'EUR', 'GBP', 'BTC', 'ETH').optional().messages({
    'any.only': 'Currency must be one of: USD, EUR, GBP, BTC, ETH'
  }),
  image_url: Joi.string().uri().max(500).optional().allow('').messages({
    'string.uri': 'Image URL must be a valid URL',
    'string.max': 'Image URL cannot exceed 500 characters'
  }),
  minecraft_commands: Joi.array().items(
    Joi.string().max(500).messages({
      'string.max': 'Each command cannot exceed 500 characters'
    })
  ).optional().messages({
    'array.base': 'Minecraft commands must be an array'
  }),
  stock_quantity: Joi.number().integer().min(0).optional().allow(null).messages({
    'number.integer': 'Stock quantity must be a whole number',
    'number.min': 'Stock quantity cannot be negative'
  }),
  is_active: Joi.boolean().optional()
});

// Enhanced image validation with better error handling and security
const validateImageUrl = async (url: string): Promise<{ valid: boolean; error?: string }> => {
  if (!url || url.trim() === '') {
    return { valid: true }; // Empty URL is valid (optional field)
  }

  try {
    // Basic URL validation
    const urlObj = new URL(url);

    // Security check - only allow HTTPS for external URLs
    if (urlObj.protocol !== 'https:' && !urlObj.hostname.includes('localhost')) {
      return {
        valid: false,
        error: 'Image URL must use HTTPS for security'
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'EcBot/1.0 (Image Validator)',
        'Accept': 'image/*'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        valid: false,
        error: `Image URL returned ${response.status} ${response.statusText}`
      };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      return {
        valid: false,
        error: 'URL does not point to an image file'
      };
    }

    // Check file size if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
      return {
        valid: false,
        error: 'Image file is too large (max 10MB)'
      };
    }

    // Check for supported image formats
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedTypes.includes(contentType.toLowerCase())) {
      return {
        valid: false,
        error: 'Unsupported image format. Please use JPEG, PNG, GIF, or WebP'
      };
    }

    return { valid: true };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { valid: false, error: 'Image URL validation timed out' };
    }
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
      return { valid: false, error: 'Invalid URL format' };
    }
    return {
      valid: false,
      error: 'Unable to access image URL. Please check the URL is correct and publicly accessible.'
    };
  }
};

/**
 * GET /api/products
 * List products for a server with filtering and pagination
 */
router.get('/',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serverId = req.query.server_id as string;
      const categoryId = req.query.category_id as string;
      const search = req.query.search as string;
      const isActive = req.query.is_active as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      if (!serverId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SERVER_ID',
            message: 'Server ID is required as query parameter',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Verify user has access to this server
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .select('id, owner_id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverError) {
        if (serverError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SERVER_NOT_FOUND',
              message: 'Server not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw serverError;
      }

      // Check if user owns the server
      if (server.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You must be the owner of this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Build query
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
          category:categories(
            id,
            name,
            image_url
          )
        `)
        .eq('server_id', server.id);

      // Apply filters
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive === 'true');
      }

      // Apply pagination and ordering
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: products, error: productsError } = await query;

      if (productsError) {
        throw productsError;
      }

      // Get total count for pagination
      let countQuery = supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('server_id', server.id);

      if (categoryId) {
        countQuery = countQuery.eq('category_id', categoryId);
      }

      if (search) {
        countQuery = countQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      if (isActive !== undefined) {
        countQuery = countQuery.eq('is_active', isActive === 'true');
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        throw countError;
      }

      // Transform the data to match frontend types (snake_case)
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

      logger.info('Products retrieved successfully', {
        serverId,
        userId: req.user?.id,
        productCount: products.length,
        filters: { categoryId, search, isActive },
        pagination: { page, limit }
      });

      res.json({
        success: true,
        data: {
          products: transformedProducts,
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
            hasNext: offset + limit < (count || 0),
            hasPrev: page > 1
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving products:', error);
      throw new AppError('Failed to retrieve products', 500, 'PRODUCTS_RETRIEVAL_ERROR');
    }
  }
);

/**
 * POST /api/products
 * Create a new product with enhanced validation and error handling
 */
router.post('/',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Step 1: Validate request body with detailed error messages
      const { error: validationError, value: validatedData } = productCreateSchema.validate(req.body, {
        abortEarly: false, // Return all validation errors
        stripUnknown: true // Remove unknown fields
      });

      if (validationError) {
        const errors = validationError.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Step 2: Verify server exists and user has access
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .select('id, owner_id, name')
        .eq('discord_server_id', validatedData.server_id)
        .single();

      if (serverError) {
        if (serverError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SERVER_NOT_FOUND',
              message: 'Server not found or you do not have access to it',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw serverError;
      }

      // Step 3: Check server ownership
      if (server.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Only the server owner can create products',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Step 4: Check subscription limits for products
      const { count: existingProductsCount, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('server_id', server.id);

      if (countError) {
        throw countError;
      }

      const currentProductCount = existingProductsCount || 0;

      // Check if server can create more products based on subscription
      const canCreateProduct = await SubscriptionService.checkLimit(server.id, 'max_products', currentProductCount);

      if (!canCreateProduct) {
        // Get subscription details for better error message
        const subscription = await SubscriptionService.getServerSubscription(server.id);
        const planName = subscription?.subscription_plans?.display_name || 'Current';
        const limit = subscription?.subscription_plans?.limits?.max_products || 0;

        return res.status(403).json({
          success: false,
          error: {
            code: 'PRODUCT_LIMIT_REACHED',
            message: `${planName} plan product limit reached (${limit === -1 ? 'unlimited' : limit} products maximum)`,
            details: {
              currentCount: currentProductCount,
              limit: limit === -1 ? 'unlimited' : limit,
              planName
            },
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Step 5: Validate category if provided
      if (validatedData.category_id) {
        const { data: category, error: categoryError } = await supabase
          .from('categories')
          .select('id, name')
          .eq('id', validatedData.category_id)
          .eq('server_id', server.id)
          .single();

        if (categoryError) {
          if (categoryError.code === 'PGRST116') {
            return res.status(400).json({
              success: false,
              error: {
                code: 'INVALID_CATEGORY',
                message: 'Selected category does not exist or does not belong to this server',
                timestamp: new Date().toISOString(),
              },
            });
          }
          throw categoryError;
        }
      }

      // Step 6: Enhanced image URL validation
      if (validatedData.image_url && validatedData.image_url.trim() !== '') {
        const imageValidation = await validateImageUrl(validatedData.image_url);
        if (!imageValidation.valid) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_IMAGE_URL',
              message: imageValidation.error || 'Invalid image URL',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Step 7: Check for duplicate product names (case-insensitive)
      const { data: existingProduct, error: existingError } = await supabase
        .from('products')
        .select('id, name')
        .eq('server_id', server.id)
        .ilike('name', validatedData.name.trim())
        .single();

      if (existingError && existingError.code !== 'PGRST116') {
        throw existingError;
      }

      if (existingProduct) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'PRODUCT_EXISTS',
            message: `A product named "${existingProduct.name}" already exists for this server`,
            details: { existingProductId: existingProduct.id },
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Step 8: Validate minecraft commands format
      const validatedCommands = [];
      if (validatedData.minecraft_commands && validatedData.minecraft_commands.length > 0) {
        for (const command of validatedData.minecraft_commands) {
          const trimmedCommand = command.trim();
          if (trimmedCommand) {
            // Basic command validation - should start with /
            if (!trimmedCommand.startsWith('/')) {
              return res.status(400).json({
                success: false,
                error: {
                  code: 'INVALID_COMMAND_FORMAT',
                  message: `Command "${trimmedCommand}" must start with /`,
                  timestamp: new Date().toISOString(),
                },
              });
            }
            validatedCommands.push(trimmedCommand);
          }
        }
      }

      // Step 9: Create the product with transaction safety
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
          category:categories(
            id,
            name,
            image_url
          )
        `)
        .single();

      if (createError) {
        logger.error('Database error creating product:', createError);
        throw new AppError('Failed to create product in database', 500, 'DATABASE_ERROR');
      }

      // Step 10: Log success and return response
      logger.info('Product created successfully', {
        serverId: validatedData.server_id,
        serverName: server.name,
        userId: req.user?.id,
        productId: newProduct.id,
        productName: newProduct.name,
        price: newProduct.price,
        currency: newProduct.currency,
        hasImage: !!newProduct.image_url,
        commandCount: newProduct.minecraft_commands?.length || 0
      });

      res.status(201).json({
        success: true,
        data: {
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
        },
        message: `Product "${newProduct.name}" created successfully`,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Error creating product:', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        requestBody: req.body
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('An unexpected error occurred while creating the product', 500, 'PRODUCT_CREATION_ERROR');
    }
  }
);/**
 
* PUT /api/products/:productId
 * Update an existing product
 */
router.put('/:productId',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { productId } = req.params;

      // Validate request body
      const { error: validationError, value: validatedData } = productUpdateSchema.validate(req.body);
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

      // Get the product and verify ownership
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
          id,
          server_id,
          name,
          servers!inner(
            id,
            owner_id,
            discord_server_id
          )
        `)
        .eq('id', productId)
        .single();

      if (productError) {
        if (productError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'PRODUCT_NOT_FOUND',
              message: 'Product not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw productError;
      }

      // Check if user owns the server
      if (product.servers.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You must be the owner of this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Validate category exists if provided
      if (validatedData.category_id) {
        const { data: category, error: categoryError } = await supabase
          .from('categories')
          .select('id')
          .eq('id', validatedData.category_id)
          .eq('server_id', product.server_id)
          .single();

        if (categoryError) {
          if (categoryError.code === 'PGRST116') {
            return res.status(400).json({
              success: false,
              error: {
                code: 'INVALID_CATEGORY',
                message: 'Category not found or does not belong to this server',
                timestamp: new Date().toISOString(),
              },
            });
          }
          throw categoryError;
        }
      }

      // Validate image URL if provided
      if (validatedData.image_url) {
        const isValidImage = await validateImageUrl(validatedData.image_url);
        if (!isValidImage) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_IMAGE_URL',
              message: 'Image URL is not accessible or not a valid image',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Check if new name conflicts with existing products (if name is being changed)
      if (validatedData.name && validatedData.name !== product.name) {
        const { data: existingProduct, error: existingError } = await supabase
          .from('products')
          .select('id')
          .eq('server_id', product.server_id)
          .eq('name', validatedData.name)
          .neq('id', productId)
          .single();

        if (existingError && existingError.code !== 'PGRST116') {
          throw existingError;
        }

        if (existingProduct) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'PRODUCT_EXISTS',
              message: 'A product with this name already exists for this server',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Update the product
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (validatedData.category_id !== undefined) updateData.category_id = validatedData.category_id;
      if (validatedData.name !== undefined) updateData.name = validatedData.name;
      if (validatedData.description !== undefined) updateData.description = validatedData.description;
      if (validatedData.price !== undefined) updateData.price = validatedData.price;
      if (validatedData.currency !== undefined) updateData.currency = validatedData.currency;
      if (validatedData.image_url !== undefined) updateData.image_url = validatedData.image_url;
      if (validatedData.minecraft_commands !== undefined) updateData.minecraft_commands = validatedData.minecraft_commands;
      if (validatedData.stock_quantity !== undefined) updateData.stock_quantity = validatedData.stock_quantity;
      if (validatedData.is_active !== undefined) updateData.is_active = validatedData.is_active;

      const { data: updatedProduct, error: updateError } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', productId)
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
          category:categories(
            id,
            name,
            image_url
          )
        `)
        .single();

      if (updateError) {
        throw updateError;
      }

      logger.info('Product updated successfully', {
        productId,
        userId: req.user?.id,
        updatedFields: Object.keys(updateData)
      });

      res.json({
        success: true,
        data: {
          product: {
            id: updatedProduct.id,
            name: updatedProduct.name,
            description: updatedProduct.description,
            price: updatedProduct.price,
            currency: updatedProduct.currency,
            image_url: updatedProduct.image_url,
            minecraft_commands: updatedProduct.minecraft_commands || [],
            stock_quantity: updatedProduct.stock_quantity,
            is_active: updatedProduct.is_active,
            category_id: updatedProduct.category?.id || null,
            created_at: updatedProduct.created_at,
            updated_at: updatedProduct.updated_at
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error updating product:', error);
      throw new AppError('Failed to update product', 500, 'PRODUCT_UPDATE_ERROR');
    }
  }
);

/**
 * DELETE /api/products/:productId
 * Delete a product with dependency checks
 */
router.delete('/:productId',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { productId } = req.params;

      // Get the product and verify ownership
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
          id,
          name,
          server_id,
          servers!inner(
            id,
            owner_id,
            discord_server_id
          )
        `)
        .eq('id', productId)
        .single();

      if (productError) {
        if (productError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'PRODUCT_NOT_FOUND',
              message: 'Product not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw productError;
      }

      // Check if user owns the server
      if (product.servers.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You must be the owner of this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Check for dependencies - orders that reference this product
      const { data: orderItems, error: orderItemsError } = await supabase
        .from('order_items')
        .select('id, order_id')
        .eq('product_id', productId)
        .limit(1);

      if (orderItemsError) {
        throw orderItemsError;
      }

      if (orderItems && orderItems.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'PRODUCT_HAS_ORDERS',
            message: 'Cannot delete product that has been ordered. Consider deactivating it instead.',
            details: { hasOrders: true },
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Delete the product
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (deleteError) {
        throw deleteError;
      }

      logger.info('Product deleted successfully', {
        productId,
        productName: product.name,
        userId: req.user?.id,
        serverId: product.servers.discord_server_id
      });

      res.json({
        success: true,
        data: {
          message: 'Product deleted successfully',
          deletedProduct: {
            id: product.id,
            name: product.name
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error deleting product:', error);
      throw new AppError('Failed to delete product', 500, 'PRODUCT_DELETION_ERROR');
    }
  }
);

/**
 * GET /api/products/:productId
 * Get a single product by ID
 */
router.get('/:productId',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { productId } = req.params;

      // Get the product and verify ownership
      const { data: product, error: productError } = await supabase
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
          category:categories(
            id,
            name,
            image_url
          ),
          servers!inner(
            id,
            owner_id,
            discord_server_id
          )
        `)
        .eq('id', productId)
        .single();

      if (productError) {
        if (productError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'PRODUCT_NOT_FOUND',
              message: 'Product not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw productError;
      }

      // Check if user owns the server
      if (product.servers.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You must be the owner of this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      logger.info('Product retrieved successfully', {
        productId,
        userId: req.user?.id,
        serverId: product.servers.discord_server_id
      });

      res.json({
        success: true,
        data: {
          product: {
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
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving product:', error);
      throw new AppError('Failed to retrieve product', 500, 'PRODUCT_RETRIEVAL_ERROR');
    }
  }
);

/**
 * POST /api/products/:productId/preview
 * Preview product image and validate URL
 */
router.post('/:productId/preview',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { productId } = req.params;
      const { image_url } = req.body;

      if (!image_url) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_IMAGE_URL',
            message: 'Image URL is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Validate URL format
      const urlSchema = Joi.string().uri().required();
      const { error: urlError } = urlSchema.validate(image_url);
      if (urlError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_URL_FORMAT',
            message: 'Invalid URL format',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Verify product exists and user has access
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
          id,
          servers!inner(
            owner_id
          )
        `)
        .eq('id', productId)
        .single();

      if (productError) {
        if (productError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'PRODUCT_NOT_FOUND',
              message: 'Product not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw productError;
      }

      if (product.servers.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You must be the owner of this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Validate image URL
      const isValidImage = await validateImageUrl(image_url);

      logger.info('Image URL preview requested', {
        productId,
        userId: req.user?.id,
        imageUrl: image_url,
        isValid: isValidImage
      });

      res.json({
        success: true,
        data: {
          image_url: image_url,
          is_valid: isValidImage,
          message: isValidImage ? 'Image URL is valid and accessible' : 'Image URL is not accessible or not a valid image'
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error previewing image:', error);
      throw new AppError('Failed to preview image', 500, 'IMAGE_PREVIEW_ERROR');
    }
  }
);

/**
 * DELETE /api/products/bulk
 * Delete multiple products at once
 */
router.delete('/bulk',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { product_ids, server_id } = req.body;

      if (!Array.isArray(product_ids) || product_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PRODUCT_IDS',
            message: 'product_ids must be a non-empty array',
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (!server_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SERVER_ID',
            message: 'server_id is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Verify user has access to this server
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .select('id, owner_id')
        .eq('discord_server_id', server_id)
        .single();

      if (serverError) {
        if (serverError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SERVER_NOT_FOUND',
              message: 'Server not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw serverError;
      }

      // Check if user owns the server
      if (server.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You must be the owner of this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Get products to verify they exist and belong to the server
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name, server_id')
        .in('id', product_ids)
        .eq('server_id', server.id);

      if (productsError) {
        throw productsError;
      }

      // Check if all requested products exist and belong to the server
      const foundProductIds = products.map(p => p.id);
      const missingProductIds = product_ids.filter(id => !foundProductIds.includes(id));

      if (missingProductIds.length > 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PRODUCTS_NOT_FOUND',
            message: `Some products not found or don't belong to this server`,
            details: { missingProductIds },
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Delete all products in a single query
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .in('id', product_ids)
        .eq('server_id', server.id);

      if (deleteError) {
        throw deleteError;
      }

      logger.info('Products bulk deleted successfully', {
        productIds: product_ids,
        productCount: products.length,
        userId: req.user?.id,
        serverId: server_id
      });

      res.json({
        success: true,
        data: {
          message: `${products.length} product${products.length === 1 ? '' : 's'} deleted successfully`,
          deletedProducts: products.map(p => ({
            id: p.id,
            name: p.name
          })),
          deletedCount: products.length
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error bulk deleting products:', error);
      throw new AppError('Failed to bulk delete products', 500, 'BULK_PRODUCT_DELETION_ERROR');
    }
  }
);

export default router;
