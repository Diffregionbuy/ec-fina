import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export class SubscriptionService {
  /**
   * Create a default free subscription for a new server
   */
  static async createDefaultSubscription(userId: string, serverId: string): Promise<void> {
    try {
      // Get the free plan
      const { data: freePlan, error: planError } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('name', 'free')
        .eq('is_active', true)
        .single();

      if (planError || !freePlan) {
        logger.error('Failed to find free subscription plan:', planError);
        return;
      }

      // Check if subscription already exists for this server
      const { data: existingSubscription, error: existingError } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('server_id', serverId)
        .single();

      if (existingError && existingError.code !== 'PGRST116') {
        logger.error('Error checking existing subscription:', existingError);
        return;
      }

      if (existingSubscription) {
        logger.info('Subscription already exists for server', { serverId });
        return;
      }

      // Create subscription for 1 year (free plan)
      const now = new Date();
      const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      const { data: subscription, error: subscriptionError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          server_id: serverId,
          plan_id: freePlan.id,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: oneYearFromNow.toISOString(),
          cancel_at_period_end: false,
          metadata: {
            created_by: 'auto_provision',
            plan_name: 'free'
          }
        })
        .select()
        .single();

      if (subscriptionError) {
        logger.error('Failed to create subscription:', subscriptionError);
        return;
      }

      logger.info('Created default subscription', {
        userId,
        serverId,
        subscriptionId: subscription.id,
        planId: freePlan.id
      });

      // Create initial usage records for the current period
      await this.createInitialUsageRecords(subscription.id, now, oneYearFromNow);

    } catch (error) {
      logger.error('Error creating default subscription:', error);
    }
  }

  /**
   * Create initial usage records for a subscription
   */
  private static async createInitialUsageRecords(
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    try {
      const usageRecords = [
        {
          subscription_id: subscriptionId,
          feature_key: 'products_created',
          usage_count: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString()
        },
        {
          subscription_id: subscriptionId,
          feature_key: 'categories_created',
          usage_count: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString()
        },
        {
          subscription_id: subscriptionId,
          feature_key: 'transactions_processed',
          usage_count: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString()
        },
        {
          subscription_id: subscriptionId,
          feature_key: 'storage_used_mb',
          usage_count: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString()
        }
      ];

      const { error: usageError } = await supabase
        .from('subscription_usage')
        .insert(usageRecords);

      if (usageError) {
        logger.error('Failed to create initial usage records:', usageError);
      } else {
        logger.info('Created initial usage records', {
          subscriptionId,
          recordCount: usageRecords.length
        });
      }

    } catch (error) {
      logger.error('Error creating initial usage records:', error);
    }
  }

  /**
   * Get subscription details for a server
   */
  static async getServerSubscription(serverId: string) {
    try {
      const { data: subscription, error } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans (
            name,
            display_name,
            features,
            limits
          )
        `)
        .eq('server_id', serverId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Error fetching server subscription:', error);
        return null;
      }

      return subscription;
    } catch (error) {
      logger.error('Error getting server subscription:', error);
      return null;
    }
  }

  /**
   * Check if a server can perform an action based on subscription limits
   */
  static async checkLimit(serverId: string, featureKey: string, currentUsage: number): Promise<boolean> {
    try {
      const subscription = await this.getServerSubscription(serverId);
      
      if (!subscription || !subscription.subscription_plans) {
        return false; // No subscription or plan found
      }

      const limits = subscription.subscription_plans.limits as any;
      const limit = limits[featureKey];

      // -1 means unlimited
      if (limit === -1) {
        return true;
      }

      // Check if current usage is within limit
      return currentUsage < limit;

    } catch (error) {
      logger.error('Error checking subscription limit:', error);
      return false;
    }
  }
}