import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  description: string;
  price: number;
  currency: string;
  billingInterval: 'monthly' | 'yearly';
  features: Record<string, any>;
  limits: Record<string, any>;
  isActive: boolean;
  sortOrder: number;
}

export interface UserSubscription {
  id: string;
  userId: string;
  serverId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'expired' | 'suspended';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: string;
  trialStart?: string;
  trialEnd?: string;
  paymentTransactionId?: string;
  metadata: Record<string, any>;
  plan?: SubscriptionPlan;
}

export interface SubscriptionUsage {
  featureKey: string;
  usageCount: number;
  limit: number;
  isUnlimited: boolean;
}

export class SubscriptionService {
  /**
   * Get all available subscription plans
   */
  static async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      const { data: plans, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        throw error;
      }

      return plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        displayName: plan.display_name,
        description: plan.description,
        price: parseFloat(plan.price),
        currency: plan.currency,
        billingInterval: plan.billing_interval,
        features: plan.features,
        limits: plan.limits,
        isActive: plan.is_active,
        sortOrder: plan.sort_order
      }));
    } catch (error) {
      logger.error('Error fetching subscription plans:', error);
      throw new AppError('Failed to fetch subscription plans', 500, 'PLANS_FETCH_ERROR');
    }
  }

  /**
   * Get subscription plan by ID
   */
  static async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
    try {
      const { data: plan, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return {
        id: plan.id,
        name: plan.name,
        displayName: plan.display_name,
        description: plan.description,
        price: parseFloat(plan.price),
        currency: plan.currency,
        billingInterval: plan.billing_interval,
        features: plan.features,
        limits: plan.limits,
        isActive: plan.is_active,
        sortOrder: plan.sort_order
      };
    } catch (error) {
      logger.error('Error fetching subscription plan:', error);
      throw new AppError('Failed to fetch subscription plan', 500, 'PLAN_FETCH_ERROR');
    }
  }

  /**
   * Get user's subscription for a server
   */
  static async getUserSubscription(userId: string, serverId: string): Promise<UserSubscription | null> {
    try {
      const { data: subscription, error } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq('user_id', userId)
        .eq('server_id', serverId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return {
        id: subscription.id,
        userId: subscription.user_id,
        serverId: subscription.server_id,
        planId: subscription.plan_id,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelledAt: subscription.cancelled_at,
        trialStart: subscription.trial_start,
        trialEnd: subscription.trial_end,
        paymentTransactionId: subscription.payment_transaction_id,
        metadata: subscription.metadata,
        plan: subscription.plan ? {
          id: subscription.plan.id,
          name: subscription.plan.name,
          displayName: subscription.plan.display_name,
          description: subscription.plan.description,
          price: parseFloat(subscription.plan.price),
          currency: subscription.plan.currency,
          billingInterval: subscription.plan.billing_interval,
          features: subscription.plan.features,
          limits: subscription.plan.limits,
          isActive: subscription.plan.is_active,
          sortOrder: subscription.plan.sort_order
        } : undefined
      };
    } catch (error) {
      logger.error('Error fetching user subscription:', error);
      throw new AppError('Failed to fetch user subscription', 500, 'SUBSCRIPTION_FETCH_ERROR');
    }
  }

  /**
   * Create a new subscription
   */
  static async createSubscription(
    userId: string,
    serverId: string,
    planId: string,
    paymentTransactionId?: string
  ): Promise<UserSubscription> {
    try {
      // Get the plan details
      const plan = await this.getPlanById(planId);
      if (!plan) {
        throw new AppError('Subscription plan not found', 404, 'PLAN_NOT_FOUND');
      }

      // Check if user already has a subscription for this server
      const existingSubscription = await this.getUserSubscription(userId, serverId);
      if (existingSubscription && existingSubscription.status === 'active') {
        throw new AppError('User already has an active subscription for this server', 409, 'SUBSCRIPTION_EXISTS');
      }

      // Calculate period dates
      const now = new Date();
      const periodEnd = new Date(now);
      if (plan.billingInterval === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Create the subscription
      const { data: newSubscription, error } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          server_id: serverId,
          plan_id: planId,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          payment_transaction_id: paymentTransactionId,
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        })
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .single();

      if (error) {
        throw error;
      }

      logger.info('Subscription created successfully', {
        userId,
        serverId,
        planId,
        subscriptionId: newSubscription.id
      });

      return {
        id: newSubscription.id,
        userId: newSubscription.user_id,
        serverId: newSubscription.server_id,
        planId: newSubscription.plan_id,
        status: newSubscription.status,
        currentPeriodStart: newSubscription.current_period_start,
        currentPeriodEnd: newSubscription.current_period_end,
        cancelAtPeriodEnd: newSubscription.cancel_at_period_end,
        cancelledAt: newSubscription.cancelled_at,
        trialStart: newSubscription.trial_start,
        trialEnd: newSubscription.trial_end,
        paymentTransactionId: newSubscription.payment_transaction_id,
        metadata: newSubscription.metadata,
        plan: {
          id: newSubscription.plan.id,
          name: newSubscription.plan.name,
          displayName: newSubscription.plan.display_name,
          description: newSubscription.plan.description,
          price: parseFloat(newSubscription.plan.price),
          currency: newSubscription.plan.currency,
          billingInterval: newSubscription.plan.billing_interval,
          features: newSubscription.plan.features,
          limits: newSubscription.plan.limits,
          isActive: newSubscription.plan.is_active,
          sortOrder: newSubscription.plan.sort_order
        }
      };
    } catch (error) {
      logger.error('Error creating subscription:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to create subscription', 500, 'SUBSCRIPTION_CREATION_ERROR');
    }
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(
    userId: string,
    serverId: string,
    cancelAtPeriodEnd: boolean = true
  ): Promise<UserSubscription> {
    try {
      const subscription = await this.getUserSubscription(userId, serverId);
      if (!subscription) {
        throw new AppError('Subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
      }

      if (subscription.status !== 'active') {
        throw new AppError('Subscription is not active', 400, 'SUBSCRIPTION_NOT_ACTIVE');
      }

      const updateData: any = {
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString()
      };

      if (!cancelAtPeriodEnd) {
        updateData.status = 'cancelled';
        updateData.cancelled_at = new Date().toISOString();
      } else {
        updateData.cancelled_at = new Date().toISOString();
      }

      const { data: updatedSubscription, error } = await supabase
        .from('user_subscriptions')
        .update(updateData)
        .eq('id', subscription.id)
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .single();

      if (error) {
        throw error;
      }

      logger.info('Subscription cancelled successfully', {
        userId,
        serverId,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd
      });

      return {
        id: updatedSubscription.id,
        userId: updatedSubscription.user_id,
        serverId: updatedSubscription.server_id,
        planId: updatedSubscription.plan_id,
        status: updatedSubscription.status,
        currentPeriodStart: updatedSubscription.current_period_start,
        currentPeriodEnd: updatedSubscription.current_period_end,
        cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
        cancelledAt: updatedSubscription.cancelled_at,
        trialStart: updatedSubscription.trial_start,
        trialEnd: updatedSubscription.trial_end,
        paymentTransactionId: updatedSubscription.payment_transaction_id,
        metadata: updatedSubscription.metadata,
        plan: {
          id: updatedSubscription.plan.id,
          name: updatedSubscription.plan.name,
          displayName: updatedSubscription.plan.display_name,
          description: updatedSubscription.plan.description,
          price: parseFloat(updatedSubscription.plan.price),
          currency: updatedSubscription.plan.currency,
          billingInterval: updatedSubscription.plan.billing_interval,
          features: updatedSubscription.plan.features,
          limits: updatedSubscription.plan.limits,
          isActive: updatedSubscription.plan.is_active,
          sortOrder: updatedSubscription.plan.sort_order
        }
      };
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to cancel subscription', 500, 'SUBSCRIPTION_CANCELLATION_ERROR');
    }
  }

  /**
   * Check if user has access to a feature
   */
  static async hasFeatureAccess(userId: string, serverId: string, featureKey: string): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId, serverId);
      
      // If no subscription, check if it's a free feature
      if (!subscription) {
        const freePlan = await this.getPlanByName('free');
        return freePlan?.features[featureKey] === true;
      }

      // Check if subscription is active
      if (subscription.status !== 'active') {
        const freePlan = await this.getPlanByName('free');
        return freePlan?.features[featureKey] === true;
      }

      // Check if subscription has expired
      const now = new Date();
      const periodEnd = new Date(subscription.currentPeriodEnd);
      if (now > periodEnd) {
        const freePlan = await this.getPlanByName('free');
        return freePlan?.features[featureKey] === true;
      }

      return subscription.plan?.features[featureKey] === true;
    } catch (error) {
      logger.error('Error checking feature access:', error);
      return false;
    }
  }

  /**
   * Get usage for a feature
   */
  static async getFeatureUsage(userId: string, serverId: string, featureKey: string): Promise<SubscriptionUsage> {
    try {
      const subscription = await this.getUserSubscription(userId, serverId);
      
      let limit = 0;
      let isUnlimited = false;

      if (subscription && subscription.status === 'active') {
        const featureLimit = subscription.plan?.limits[featureKey];
        if (featureLimit === -1) {
          isUnlimited = true;
        } else {
          limit = featureLimit || 0;
        }
      } else {
        // Use free plan limits
        const freePlan = await this.getPlanByName('free');
        const featureLimit = freePlan?.limits[featureKey];
        if (featureLimit === -1) {
          isUnlimited = true;
        } else {
          limit = featureLimit || 0;
        }
      }

      // Get current usage
      const { data: usage, error } = await supabase
        .from('subscription_usage')
        .select('usage_count')
        .eq('subscription_id', subscription?.id || '')
        .eq('feature_key', featureKey)
        .gte('period_end', new Date().toISOString())
        .single();

      const usageCount = usage?.usage_count || 0;

      return {
        featureKey,
        usageCount,
        limit,
        isUnlimited
      };
    } catch (error) {
      logger.error('Error getting feature usage:', error);
      return {
        featureKey,
        usageCount: 0,
        limit: 0,
        isUnlimited: false
      };
    }
  }

  /**
   * Process expired subscriptions
   */
  static async processExpiredSubscriptions(): Promise<void> {
    try {
      const now = new Date();
      
      // Find expired subscriptions
      const { data: expiredSubscriptions, error } = await supabase
        .from('user_subscriptions')
        .select('id, user_id, server_id')
        .eq('status', 'active')
        .lt('current_period_end', now.toISOString());

      if (error) {
        throw error;
      }

      if (expiredSubscriptions && expiredSubscriptions.length > 0) {
        // Update expired subscriptions
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'expired',
            updated_at: now.toISOString()
          })
          .in('id', expiredSubscriptions.map(sub => sub.id));

        if (updateError) {
          throw updateError;
        }

        logger.info('Processed expired subscriptions', {
          count: expiredSubscriptions.length,
          subscriptionIds: expiredSubscriptions.map(sub => sub.id)
        });
      }
    } catch (error) {
      logger.error('Error processing expired subscriptions:', error);
      throw new AppError('Failed to process expired subscriptions', 500, 'SUBSCRIPTION_EXPIRY_ERROR');
    }
  }

  /**
   * Get plan by name (helper method)
   */
  private static async getPlanByName(name: string): Promise<SubscriptionPlan | null> {
    try {
      const { data: plan, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('name', name)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return {
        id: plan.id,
        name: plan.name,
        displayName: plan.display_name,
        description: plan.description,
        price: parseFloat(plan.price),
        currency: plan.currency,
        billingInterval: plan.billing_interval,
        features: plan.features,
        limits: plan.limits,
        isActive: plan.is_active,
        sortOrder: plan.sort_order
      };
    } catch (error) {
      logger.error('Error fetching plan by name:', error);
      return null;
    }
  }
}