import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { SubscriptionService } from './subscription';

export interface RenewalResult {
  subscriptionId: string;
  success: boolean;
  error?: string;
  newPeriodEnd: string;
}

export class SubscriptionRenewalService {
  /**
   * Process all subscriptions that need renewal
   */
  static async processRenewals(): Promise<RenewalResult[]> {
    try {
      logger.info('Starting subscription renewal processing');

      // Find subscriptions that expire in the next 24 hours and are not cancelled
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: subscriptionsToRenew, error } = await supabase
        .from('user_subscriptions')
        .select(`
          id,
          user_id,
          server_id,
          plan_id,
          current_period_end,
          cancel_at_period_end,
          plan:subscription_plans(*)
        `)
        .eq('status', 'active')
        .eq('cancel_at_period_end', false)
        .lt('current_period_end', tomorrow.toISOString());

      if (error) {
        throw error;
      }

      if (!subscriptionsToRenew || subscriptionsToRenew.length === 0) {
        logger.info('No subscriptions found for renewal');
        return [];
      }

      logger.info(`Found ${subscriptionsToRenew.length} subscriptions for renewal`);

      const results: RenewalResult[] = [];

      // Process each subscription renewal
      for (const subscription of subscriptionsToRenew) {
        try {
          const result = await this.renewSubscription(subscription);
          results.push(result);
        } catch (error) {
          logger.error(`Failed to renew subscription ${subscription.id}:`, error);
          results.push({
            subscriptionId: subscription.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            newPeriodEnd: subscription.current_period_end
          });
        }
      }

      logger.info(`Renewal processing complete. Success: ${results.filter(r => r.success).length}, Failed: ${results.filter(r => !r.success).length}`);

      return results;
    } catch (error) {
      logger.error('Error processing subscription renewals:', error);
      throw new AppError('Failed to process subscription renewals', 500, 'RENEWAL_PROCESSING_ERROR');
    }
  }

  /**
   * Renew a specific subscription
   */
  private static async renewSubscription(subscription: any): Promise<RenewalResult> {
    try {
      // Calculate new period dates
      const currentPeriodEnd = new Date(subscription.current_period_end);
      const newPeriodStart = new Date(currentPeriodEnd);
      const newPeriodEnd = new Date(currentPeriodEnd);

      if (subscription.plan.billing_interval === 'monthly') {
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
      } else if (subscription.plan.billing_interval === 'yearly') {
        newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
      }

      // For free plans, just extend the period without payment
      if (subscription.plan.price === '0.00' || subscription.plan.name === 'free') {
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            current_period_start: newPeriodStart.toISOString(),
            current_period_end: newPeriodEnd.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.id);

        if (updateError) {
          throw updateError;
        }

        logger.info(`Free subscription renewed successfully`, {
          subscriptionId: subscription.id,
          newPeriodEnd: newPeriodEnd.toISOString()
        });

        return {
          subscriptionId: subscription.id,
          success: true,
          newPeriodEnd: newPeriodEnd.toISOString()
        };
      }

      // For paid plans, we would typically:
      // 1. Create a payment intent with the payment processor (OKX)
      // 2. Process the payment
      // 3. Update the subscription if payment succeeds
      // 4. Handle payment failures appropriately

      // For now, we'll simulate successful payment processing
      // In a real implementation, this would integrate with the OKX payment service
      
      logger.info(`Processing payment for subscription renewal`, {
        subscriptionId: subscription.id,
        planId: subscription.plan_id,
        amount: subscription.plan.price,
        currency: subscription.plan.currency
      });

      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update subscription with new period
      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update({
          current_period_start: newPeriodStart.toISOString(),
          current_period_end: newPeriodEnd.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id);

      if (updateError) {
        throw updateError;
      }

      // Create a transaction record for the renewal
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: subscription.user_id,
          server_id: subscription.server_id,
          type: 'subscription',
          amount: parseFloat(subscription.plan.price),
          currency: subscription.plan.currency,
          status: 'completed',
          metadata: {
            subscription_id: subscription.id,
            plan_id: subscription.plan_id,
            renewal: true,
            period_start: newPeriodStart.toISOString(),
            period_end: newPeriodEnd.toISOString()
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (transactionError) {
        logger.warn('Failed to create transaction record for renewal:', transactionError);
        // Don't fail the renewal for transaction record issues
      }

      logger.info(`Subscription renewed successfully`, {
        subscriptionId: subscription.id,
        newPeriodEnd: newPeriodEnd.toISOString(),
        amount: subscription.plan.price,
        currency: subscription.plan.currency
      });

      return {
        subscriptionId: subscription.id,
        success: true,
        newPeriodEnd: newPeriodEnd.toISOString()
      };

    } catch (error) {
      logger.error(`Failed to renew subscription ${subscription.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle failed renewals by updating subscription status
   */
  static async handleFailedRenewal(subscriptionId: string, reason: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          status: 'expired',
          metadata: {
            renewal_failed: true,
            failure_reason: reason,
            failed_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', subscriptionId);

      if (error) {
        throw error;
      }

      logger.info(`Subscription marked as expired due to failed renewal`, {
        subscriptionId,
        reason
      });
    } catch (error) {
      logger.error(`Failed to handle failed renewal for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Get renewal statistics
   */
  static async getRenewalStats(days: number = 30): Promise<{
    totalRenewals: number;
    successfulRenewals: number;
    failedRenewals: number;
    revenue: number;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: renewalTransactions, error } = await supabase
        .from('transactions')
        .select('amount, status, metadata')
        .eq('type', 'subscription')
        .gte('created_at', startDate.toISOString())
        .contains('metadata', { renewal: true });

      if (error) {
        throw error;
      }

      const stats = {
        totalRenewals: renewalTransactions?.length || 0,
        successfulRenewals: renewalTransactions?.filter(t => t.status === 'completed').length || 0,
        failedRenewals: renewalTransactions?.filter(t => t.status === 'failed').length || 0,
        revenue: renewalTransactions?.filter(t => t.status === 'completed')
          .reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0
      };

      return stats;
    } catch (error) {
      logger.error('Error getting renewal statistics:', error);
      throw new AppError('Failed to get renewal statistics', 500, 'RENEWAL_STATS_ERROR');
    }
  }
}