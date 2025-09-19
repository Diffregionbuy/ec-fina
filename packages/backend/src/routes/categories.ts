import { Router, Response } from 'express';
import { supabase } from '../config/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas
const categoryCreateSchema = Joi.object({
  server_id: Joi.string().required(),
  name: Joi.string().min(1).max(50).required(),
  description: Joi.string().max(500).optional(),
  image_url: Joi.string().uri().max(500).optional().allow(null),
  sort_order: Joi.number().integer().min(0).optional()
});

const categoryUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(50).optional(),
  description: Joi.string().max(500).optional(),
  image_url: Joi.string().uri().max(500).optional().allow(null),
  sort_order: Joi.number().integer().min(0).optional()
});

/**
 * GET /api/categories
 * List server categories with sorting and organization features
 */
router.get('/',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serverId = req.query.server_id as string;
      
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

      // Get categories for the server, ordered by sort_order and name
      const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select(`
          id,
          name,
          description,
          image_url,
          sort_order,
          created_at,
          products:products(count)
        `)
        .eq('server_id', server.id)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (categoriesError) {
        throw categoriesError;
      }

      // Transform the data to include product count
      const transformedCategories = categories.map(category => ({
        id: category.id,
        name: category.name,
        description: category.description,
        image_url: category.image_url || null,
        sort_order: category.sort_order,
        product_count: Array.isArray(category.products) ? category.products.length : 0,
        created_at: category.created_at
      }));

      logger.info('Categories retrieved successfully', {
        serverId,
        userId: req.user?.id,
        categoryCount: categories.length
      });

      res.json({
        success: true,
        data: {
          categories: transformedCategories,
          total: categories.length
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving categories:', error);
      throw new AppError('Failed to retrieve categories', 500, 'CATEGORIES_RETRIEVAL_ERROR');
    }
  }
);

/**
 * POST /api/categories
 * Create a new category for a server
 */
router.post('/',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serverId = req.body.server_id;
      
      if (!serverId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SERVER_ID',
            message: 'Server ID is required in request body',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Validate request body
      const { error: validationError, value: validatedData } = categoryCreateSchema.validate(req.body);
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

      // Check if category name already exists for this server
      const { data: existingCategory, error: existingError } = await supabase
        .from('categories')
        .select('id')
        .eq('server_id', server.id)
        .eq('name', validatedData.name)
        .single();

      if (existingError && existingError.code !== 'PGRST116') {
        throw existingError;
      }

      if (existingCategory) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CATEGORY_EXISTS',
            message: 'A category with this name already exists for this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // If no sort_order provided, set it to the highest + 1
      let sortOrder = validatedData.sort_order;
      if (sortOrder === undefined) {
        const { data: maxSortOrder } = await supabase
          .from('categories')
          .select('sort_order')
          .eq('server_id', server.id)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single();

        sortOrder = (maxSortOrder?.sort_order || 0) + 1;
      }

      // Create the category
      const { data: newCategory, error: createError } = await supabase
        .from('categories')
        .insert({
          server_id: server.id,
          name: validatedData.name,
          description: validatedData.description,
          image_url: validatedData.image_url,
          sort_order: sortOrder,
          created_at: new Date().toISOString()
        })
        .select(`
          id,
          name,
          description,
          image_url,
          sort_order,
          created_at
        `)
        .single();

      if (createError) {
        throw createError;
      }

      logger.info('Category created successfully', {
        serverId,
        userId: req.user?.id,
        categoryId: newCategory.id,
        categoryName: newCategory.name
      });

      res.status(201).json({
        success: true,
        data: {
          category: {
            id: newCategory.id,
            name: newCategory.name,
            description: newCategory.description,
            image_url: newCategory.image_url,
            sort_order: newCategory.sort_order,
            product_count: 0,
            created_at: newCategory.created_at
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error creating category:', error);
      throw new AppError('Failed to create category', 500, 'CATEGORY_CREATION_ERROR');
    }
  }
);

/**
 * PUT /api/categories/:categoryId
 * Update an existing category
 */
router.put('/:categoryId',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { categoryId } = req.params;

      // Validate request body
      const { error: validationError, value: validatedData } = categoryUpdateSchema.validate(req.body);
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

      // Get the category and verify ownership
      const { data: category, error: categoryError } = await supabase
        .from('categories')
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
        .eq('id', categoryId)
        .single();

      if (categoryError) {
        if (categoryError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'CATEGORY_NOT_FOUND',
              message: 'Category not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw categoryError;
      }

      // Check if user owns the server
      if (category.servers.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You must be the owner of this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Check if new name conflicts with existing categories (if name is being changed)
      if (validatedData.name && validatedData.name !== category.name) {
        const { data: existingCategory, error: existingError } = await supabase
          .from('categories')
          .select('id')
          .eq('server_id', category.server_id)
          .eq('name', validatedData.name)
          .neq('id', categoryId)
          .single();

        if (existingError && existingError.code !== 'PGRST116') {
          throw existingError;
        }

        if (existingCategory) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'CATEGORY_EXISTS',
              message: 'A category with this name already exists for this server',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Update the category
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (validatedData.name !== undefined) updateData.name = validatedData.name;
      if (validatedData.description !== undefined) updateData.description = validatedData.description;
      if (validatedData.image_url !== undefined) updateData.image_url = validatedData.image_url;
      if (validatedData.sort_order !== undefined) updateData.sort_order = validatedData.sort_order;

      const { data: updatedCategory, error: updateError } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', categoryId)
        .select(`
          id,
          name,
          description,
          image_url,
          sort_order,
          created_at,
          products:products(count)
        `)
        .single();

      if (updateError) {
        throw updateError;
      }

      logger.info('Category updated successfully', {
        categoryId,
        userId: req.user?.id,
        updatedFields: Object.keys(updateData)
      });

      res.json({
        success: true,
        data: {
          category: {
            id: updatedCategory.id,
            name: updatedCategory.name,
            description: updatedCategory.description,
            image_url: updatedCategory.image_url,
            sort_order: updatedCategory.sort_order,
            product_count: Array.isArray(updatedCategory.products) ? updatedCategory.products.length : 0,
            created_at: updatedCategory.created_at
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error updating category:', error);
      throw new AppError('Failed to update category', 500, 'CATEGORY_UPDATE_ERROR');
    }
  }
);

/**
 * DELETE /api/categories/:categoryId
 * Delete a category with validation
 */
router.delete('/:categoryId',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { categoryId } = req.params;

      // Get the category and verify ownership
      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .select(`
          id,
          name,
          server_id,
          servers!inner(
            id,
            owner_id,
            discord_server_id
          ),
          products:products(count)
        `)
        .eq('id', categoryId)
        .single();

      if (categoryError) {
        if (categoryError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'CATEGORY_NOT_FOUND',
              message: 'Category not found',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw categoryError;
      }

      // Check if user owns the server
      if (category.servers.owner_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You must be the owner of this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Get products in this category for logging
      const product_count = Array.isArray(category.products) ? category.products.length : 0;
      
      // First, delete all products in this category (cascade deletion)
      if (product_count > 0) {
        const { error: deleteProductsError } = await supabase
          .from('products')
          .delete()
          .eq('category_id', categoryId);

        if (deleteProductsError) {
          throw deleteProductsError;
        }

        logger.info('Products deleted during category cascade deletion', {
          categoryId,
          categoryName: category.name,
          deletedProductCount: product_count,
          userId: req.user?.id
        });
      }

      // Delete the category
      const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);

      if (deleteError) {
        throw deleteError;
      }

      logger.info('Category deleted successfully', {
        categoryId,
        categoryName: category.name,
        userId: req.user?.id,
        serverId: category.servers.discord_server_id,
        deletedProductCount: product_count
      });

      res.json({
        success: true,
        data: {
          message: product_count > 0 
            ? `Category deleted successfully along with ${product_count} product${product_count === 1 ? '' : 's'}`
            : 'Category deleted successfully',
          deletedCategory: {
            id: category.id,
            name: category.name
          },
          deletedProductCount: product_count
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error deleting category:', error);
      throw new AppError('Failed to delete category', 500, 'CATEGORY_DELETION_ERROR');
    }
  }
);

export default router;