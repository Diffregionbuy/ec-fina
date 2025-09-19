import { Router, Response } from 'express';
import { supabase } from '../config/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas
const progressUpdateSchema = Joi.object({
  current_step: Joi.string().valid('welcome', 'invite', 'template', 'config', 'complete').required(),
  completed_steps: Joi.array().items(Joi.string().valid('welcome', 'invite', 'template', 'config', 'complete')).optional(),
  selected_template_id: Joi.string().uuid().optional(),
  progress_data: Joi.object().optional(),
  is_completed: Joi.boolean().optional()
});

const setupTemplateSchema = Joi.object({
  template_id: Joi.string().uuid().required(),
  custom_config: Joi.object().optional()
});

/**
 * GET /api/onboarding/templates
 * Get available setup templates
 */
router.get('/templates', 
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { category } = req.query;

      let query = supabase
        .from('setup_templates')
        .select(`
          id,
          name,
          category,
          description,
          preview_image,
          bot_config,
          default_categories,
          default_products,
          created_at
        `)
        .eq('is_active', true)
        .order('name');

      // Filter by category if provided
      if (category && typeof category === 'string') {
        query = query.eq('category', category);
      }

      const { data: templates, error } = await query;

      if (error) {
        throw error;
      }

      logger.info('Setup templates retrieved', { 
        userId: req.user?.id,
        category,
        count: templates?.length || 0
      });

      res.json({
        success: true,
        data: {
          templates: templates?.map(template => ({
            id: template.id,
            name: template.name,
            category: template.category,
            description: template.description,
            previewImage: template.preview_image,
            botConfig: template.bot_config,
            defaultCategories: template.default_categories,
            defaultProducts: template.default_products,
            createdAt: template.created_at
          })) || []
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving setup templates:', error);
      throw new AppError('Failed to retrieve setup templates', 500, 'TEMPLATES_RETRIEVAL_ERROR');
    }
  }
);

/**
 * POST /api/onboarding/progress
 * Save or update user onboarding progress
 */
router.post('/progress',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { server_id, ...progressData } = req.body;

      if (!server_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SERVER_ID',
            message: 'Server ID is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Validate request body
      const { error: validationError, value: validatedData } = progressUpdateSchema.validate(progressData);
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

      // Check if progress record exists
      const { data: existingProgress, error: fetchError } = await supabase
        .from('onboarding_progress')
        .select('id, completed_steps, progress_data')
        .eq('user_id', req.user!.id)
        .eq('server_id', server_id)
        .single();

      let result;
      const now = new Date().toISOString();

      if (existingProgress) {
        // Update existing progress
        const updatedData = {
          current_step: validatedData.current_step,
          completed_steps: validatedData.completed_steps || existingProgress.completed_steps,
          selected_template_id: validatedData.selected_template_id,
          progress_data: {
            ...existingProgress.progress_data,
            ...validatedData.progress_data
          },
          is_completed: validatedData.is_completed || false,
          updated_at: now
        };

        const { data: updatedProgress, error: updateError } = await supabase
          .from('onboarding_progress')
          .update(updatedData)
          .eq('id', existingProgress.id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        result = updatedProgress;
      } else {
        // Create new progress record
        const newProgressData = {
          user_id: req.user!.id,
          server_id,
          current_step: validatedData.current_step,
          completed_steps: validatedData.completed_steps || [],
          selected_template_id: validatedData.selected_template_id,
          progress_data: validatedData.progress_data || {},
          is_completed: validatedData.is_completed || false,
          created_at: now,
          updated_at: now
        };

        const { data: newProgress, error: createError } = await supabase
          .from('onboarding_progress')
          .insert(newProgressData)
          .select()
          .single();

        if (createError) {
          throw createError;
        }

        result = newProgress;
      }

      logger.info('Onboarding progress saved', { 
        userId: req.user?.id,
        serverId: server_id,
        currentStep: validatedData.current_step,
        isCompleted: validatedData.is_completed
      });

      res.json({
        success: true,
        data: {
          progress: {
            id: result.id,
            userId: result.user_id,
            serverId: result.server_id,
            currentStep: result.current_step,
            completedSteps: result.completed_steps,
            selectedTemplateId: result.selected_template_id,
            progressData: result.progress_data,
            isCompleted: result.is_completed,
            createdAt: result.created_at,
            updatedAt: result.updated_at
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error saving onboarding progress:', error);
      throw new AppError('Failed to save onboarding progress', 500, 'PROGRESS_SAVE_ERROR');
    }
  }
);

/**
 * GET /api/onboarding/status
 * Get current onboarding status for user and server
 */
router.get('/status',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { server_id } = req.query;

      if (!server_id || typeof server_id !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SERVER_ID',
            message: 'Server ID is required as query parameter',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Get onboarding progress
      const { data: progress, error } = await supabase
        .from('onboarding_progress')
        .select(`
          id,
          current_step,
          completed_steps,
          selected_template_id,
          progress_data,
          is_completed,
          created_at,
          updated_at,
          template:setup_templates(
            id,
            name,
            category,
            description,
            preview_image
          )
        `)
        .eq('user_id', req.user!.id)
        .eq('server_id', server_id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // If no progress found, return default initial state
      if (!progress) {
        logger.info('No onboarding progress found, returning initial state', { 
          userId: req.user?.id,
          serverId: server_id
        });

        return res.json({
          success: true,
          data: {
            progress: {
              currentStep: 'welcome',
              completedSteps: [],
              selectedTemplateId: null,
              progressData: {},
              isCompleted: false,
              template: null
            }
          },
          timestamp: new Date().toISOString(),
        });
      }

      logger.info('Onboarding status retrieved', { 
        userId: req.user?.id,
        serverId: server_id,
        currentStep: progress.current_step,
        isCompleted: progress.is_completed
      });

      res.json({
        success: true,
        data: {
          progress: {
            id: progress.id,
            currentStep: progress.current_step,
            completedSteps: progress.completed_steps,
            selectedTemplateId: progress.selected_template_id,
            progressData: progress.progress_data,
            isCompleted: progress.is_completed,
            createdAt: progress.created_at,
            updatedAt: progress.updated_at,
            template: progress.template ? {
              id: progress.template.id,
              name: progress.template.name,
              category: progress.template.category,
              description: progress.template.description,
              previewImage: progress.template.preview_image
            } : null
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving onboarding status:', error);
      throw new AppError('Failed to retrieve onboarding status', 500, 'STATUS_RETRIEVAL_ERROR');
    }
  }
);

export default router;