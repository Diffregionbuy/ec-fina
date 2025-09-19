import { Router, Response } from 'express';
import { supabase } from '../config/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { SubscriptionService } from '../services/subscription';
import { SubscriptionRenewalService } from '../services/subscriptionRenewal';
import { SubscriptionNotificationService } from '../services/subscriptionNotifications';
import { SubscriptionSchedulerService } from '../services/subscriptionScheduler';
import Joi from 'joi';

const router = Router();

// Validation schemas
const subscribeSchema = Joi.object({
  server_id: Joi.string().required(),
  plan_id: Joi.string().uuid().required(),
  payment_transaction_id: Joi.string().uuid().optional()
});

const cancelSubscriptionSchema = Joi.object({
  server_id: Joi.string().required(),
  cancel_at_period_end: Joi.boolean().default(true)
});

/**
 * GET /api/subscriptions/plans
 * Get all available subscription plans
 */
router.get('/plans', async (req, res: Response) => {
  try {
    const plans = await SubscriptionService.getPlans();

    logger.info('Subscription plans retrieved successfully', {
      planCount: plans.length
    });

    res.json({
      success: true,
      data: {
        plans: plans.map(plan => ({
          id: plan.id,
          name: plan.name,
          displayName: plan.displayName,
          description: plan.description,
          price: plan.price,
          currency: plan.currency,
          billingInterval: plan.billingInterval,
          features: plan.features,
          limits: plan.limits,
          isActive: plan.isActive
        }))
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error retrieving subscription plans:', error);
    throw new AppError('Failed to retrieve subscription plans', 500, 'PLANS_RETRIEVAL_ERROR');
  }
});

/**
 * GET /api/subscriptions/current
 * Get current subscription for a server
 */
router.get('/current',
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

      const subscription = await SubscriptionService.getUserSubscription(req.user.id, server.id);

      // If no subscription, return free plan info
      if (!subscription) {
        const plans = await SubscriptionService.getPlans();
        const freePlan = plans.find(plan => plan.name === 'free');
        
        return res.json({
          success: true,
          data: {
            subscription: null,
            currentPlan: freePlan ? {
              id: freePlan.id,
              name: freePlan.name,
              displayName: freePlan.displayName,
              description: freePlan.description,
              price: freePlan.price,
              currency: freePlan.currency,
              billingInterval: freePlan.billingInterval,
              features: freePlan.features,
              limits: freePlan.limits
            } : null,
            isActive: false,
            isTrial: false
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Check if subscription is in trial
      const now = new Date();
      const isTrial = subscription.trialEnd ? new Date(subscription.trialEnd) > now : false;

      logger.info('Current subscription retrieved successfully', {
        userId: req.user.id,
        serverId,
        subscriptionId: subscription.id,
        status: subscription.status
      });

      res.json({
        success: true,
        data: {
          subscription: {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            cancelledAt: subscription.cancelledAt,
            trialStart: subscription.trialStart,
            trialEnd: subscription.trialEnd
          },
          currentPlan: subscription.plan ? {
            id: subscription.plan.id,
            name: subscription.plan.name,
            displayName: subscription.plan.displayName,
            description: subscription.plan.description,
            price: subscription.plan.price,
            currency: subscription.plan.currency,
            billingInterval: subscription.plan.billingInterval,
            features: subscription.plan.features,
            limits: subscription.plan.limits
          } : null,
          isActive: subscription.status === 'active',
          isTrial
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving current subscription:', error);
      throw new AppError('Failed to retrieve current subscription', 500, 'SUBSCRIPTION_RETRIEVAL_ERROR');
    }
  }
);

/**
 * POST /api/subscriptions/subscribe
 * Create a new subscription
 */
router.post('/subscribe',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Validate request body
      const { error: validationError, value: validatedData } = subscribeSchema.validate(req.body);
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
        .eq('discord_server_id', validatedData.server_id)
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

      // Verify the plan exists
      const plan = await SubscriptionService.getPlanById(validatedData.plan_id);
      if (!plan) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PLAN_NOT_FOUND',
            message: 'Subscription plan not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Create the subscription
      const subscription = await SubscriptionService.createSubscription(
        req.user.id,
        server.id,
        validatedData.plan_id,
        validatedData.payment_transaction_id
      );

      logger.info('Subscription created successfully', {
        userId: req.user.id,
        serverId: validatedData.server_id,
        planId: validatedData.plan_id,
        subscriptionId: subscription.id
      });

      res.status(201).json({
        success: true,
        data: {
          subscription: {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            plan: subscription.plan ? {
              id: subscription.plan.id,
              name: subscription.plan.name,
              displayName: subscription.plan.displayName,
              description: subscription.plan.description,
              price: subscription.plan.price,
              currency: subscription.plan.currency,
              billingInterval: subscription.plan.billingInterval,
              features: subscription.plan.features,
              limits: subscription.plan.limits
            } : null
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error creating subscription:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to create subscription', 500, 'SUBSCRIPTION_CREATION_ERROR');
    }
  }
);

/**
 * PUT /api/subscriptions/cancel
 * Cancel a subscription
 */
router.put('/cancel',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Validate request body
      const { error: validationError, value: validatedData } = cancelSubscriptionSchema.validate(req.body);
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
        .eq('discord_server_id', validatedData.server_id)
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

      // Cancel the subscription
      const subscription = await SubscriptionService.cancelSubscription(
        req.user.id,
        server.id,
        validatedData.cancel_at_period_end
      );

      logger.info('Subscription cancelled successfully', {
        userId: req.user.id,
        serverId: validatedData.server_id,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd: validatedData.cancel_at_period_end
      });

      res.json({
        success: true,
        data: {
          subscription: {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            cancelledAt: subscription.cancelledAt,
            plan: subscription.plan ? {
              id: subscription.plan.id,
              name: subscription.plan.name,
              displayName: subscription.plan.displayName,
              description: subscription.plan.description,
              price: subscription.plan.price,
              currency: subscription.plan.currency,
              billingInterval: subscription.plan.billingInterval,
              features: subscription.plan.features,
              limits: subscription.plan.limits
            } : null
          },
          message: validatedData.cancel_at_period_end 
            ? 'Subscription will be cancelled at the end of the current billing period'
            : 'Subscription has been cancelled immediately'
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to cancel subscription', 500, 'SUBSCRIPTION_CANCELLATION_ERROR');
    }
  }
);

/**
 * GET /api/subscriptions/usage
 * Get feature usage for current subscription
 */
router.get('/usage',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serverId = req.query.server_id as string;
      const featureKey = req.query.feature_key as string;

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

      if (featureKey) {
        // Get usage for specific feature
        const usage = await SubscriptionService.getFeatureUsage(req.user.id, server.id, featureKey);
        
        res.json({
          success: true,
          data: {
            usage: {
              featureKey: usage.featureKey,
              usageCount: usage.usageCount,
              limit: usage.limit,
              isUnlimited: usage.isUnlimited,
              remainingUsage: usage.isUnlimited ? -1 : Math.max(0, usage.limit - usage.usageCount)
            }
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        // Get usage for all features
        const subscription = await SubscriptionService.getUserSubscription(req.user.id, server.id);
        const plan = subscription?.plan || (await SubscriptionService.getPlans()).find(p => p.name === 'free');
        
        if (!plan) {
          throw new AppError('No plan found', 404, 'PLAN_NOT_FOUND');
        }

        const usagePromises = Object.keys(plan.limits).map(async (featureKey) => {
          const usage = await SubscriptionService.getFeatureUsage(req.user.id, server.id, featureKey);
          return {
            featureKey: usage.featureKey,
            usageCount: usage.usageCount,
            limit: usage.limit,
            isUnlimited: usage.isUnlimited,
            remainingUsage: usage.isUnlimited ? -1 : Math.max(0, usage.limit - usage.usageCount)
          };
        });

        const allUsage = await Promise.all(usagePromises);

        res.json({
          success: true,
          data: {
            usage: allUsage
          },
          timestamp: new Date().toISOString(),
        });
      }

      logger.info('Feature usage retrieved successfully', {
        userId: req.user.id,
        serverId,
        featureKey
      });
    } catch (error) {
      logger.error('Error retrieving feature usage:', error);
      throw new AppError('Failed to retrieve feature usage', 500, 'USAGE_RETRIEVAL_ERROR');
    }
  }
);

/**
 * GET /api/subscriptions/features/:featureKey/check
 * Check if user has access to a specific feature
 */
router.get('/features/:featureKey/check',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { featureKey } = req.params;
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

      const hasAccess = await SubscriptionService.hasFeatureAccess(req.user.id, server.id, featureKey);

      logger.info('Feature access checked successfully', {
        userId: req.user.id,
        serverId,
        featureKey,
        hasAccess
      });

      res.json({
        success: true,
        data: {
          featureKey,
          hasAccess,
          message: hasAccess ? 'Feature access granted' : 'Feature access denied'
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error checking feature access:', error);
      throw new AppError('Failed to check feature access', 500, 'FEATURE_ACCESS_CHECK_ERROR');
    }
  }
);

/**
 * GET /api/subscriptions/renewal-stats
 * Get subscription renewal statistics
 */
router.get('/renewal-stats',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      
      const stats = await SubscriptionRenewalService.getRenewalStats(days);

      logger.info('Renewal statistics retrieved successfully', {
        userId: req.user?.id,
        days,
        stats
      });

      res.json({
        success: true,
        data: {
          period: `${days} days`,
          ...stats
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving renewal statistics:', error);
      throw new AppError('Failed to retrieve renewal statistics', 500, 'RENEWAL_STATS_ERROR');
    }
  }
);

/**
 * POST /api/subscriptions/process-renewals
 * Manually trigger subscription renewal processing (admin only)
 */
router.post('/process-renewals',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // In a real implementation, you'd check for admin permissions here
      // For now, we'll allow any authenticated user to trigger this for testing
      
      const results = await SubscriptionSchedulerService.runManually();

      logger.info('Manual subscription processing completed', {
        userId: req.user?.id,
        results
      });

      res.json({
        success: true,
        data: {
          message: 'Subscription processing completed',
          results
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error processing subscriptions manually:', error);
      throw new AppError('Failed to process subscriptions', 500, 'MANUAL_PROCESSING_ERROR');
    }
  }
);

/**
 * GET /api/subscriptions/notifications
 * Get notification history for the authenticated user
 */
router.get('/notifications',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      const notifications = await SubscriptionNotificationService.getNotificationHistory(
        req.user!.id,
        limit
      );

      logger.info('Notification history retrieved successfully', {
        userId: req.user?.id,
        count: notifications.length
      });

      res.json({
        success: true,
        data: {
          notifications: notifications.map(notification => ({
            id: notification.id,
            type: notification.type,
            subject: notification.subject,
            message: notification.message,
            status: notification.status,
            createdAt: notification.created_at,
            readAt: notification.read_at,
            data: notification.data
          }))
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving notification history:', error);
      throw new AppError('Failed to retrieve notification history', 500, 'NOTIFICATION_HISTORY_ERROR');
    }
  }
);

/**
 * GET /api/subscriptions/scheduler/status
 * Get subscription scheduler status
 */
router.get('/scheduler/status',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = SubscriptionSchedulerService.getStatus();

      res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting scheduler status:', error);
      throw new AppError('Failed to get scheduler status', 500, 'SCHEDULER_STATUS_ERROR');
    }
  }
);

/**
 * POST /api/subscriptions/reactivate
 * Reactivate a cancelled subscription
 */
router.post('/reactivate',
  authMiddleware.authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { error: validationError, value } = Joi.object({
        server_id: Joi.string().required()
      }).validate(req.body);

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

      const { server_id } = value;

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

      const subscription = await SubscriptionService.getUserSubscription(req.user.id, server.id);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_NOT_FOUND',
            message: 'No subscription found for this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (subscription.status !== 'active' || !subscription.cancelAtPeriodEnd) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_NOT_CANCELLED',
            message: 'Subscription is not cancelled or not set to cancel at period end',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Reactivate the subscription by removing the cancel_at_period_end flag
      const { data: updatedSubscription, error: updateError } = await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // Send reactivation notification
      await SubscriptionNotificationService.sendReactivationNotification(
        req.user.id,
        subscription.id
      );

      logger.info('Subscription reactivated successfully', {
        userId: req.user.id,
        serverId: server.id,
        subscriptionId: subscription.id
      });

      res.json({
        success: true,
        data: {
          subscription: updatedSubscription
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error reactivating subscription:', error);
      throw new AppError('Failed to reactivate subscription', 500, 'SUBSCRIPTION_REACTIVATION_ERROR');
    }
  }
);

export default router;