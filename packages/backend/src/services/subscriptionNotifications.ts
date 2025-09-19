import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface NotificationData {
  userId: string;
  serverId: string;
  subscriptionId: string;
  type: 'renewal_success' | 'renewal_failed' | 'expiring_soon' | 'cancelled' | 'expired';
  data: Record<string, any>;
}

export interface NotificationTemplate {
  subject: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}

export class SubscriptionNotificationService {
  /**
   * Send notification for subscription events
   */
  static async sendNotification(notification: NotificationData): Promise<void> {
    try {
      const template = this.getNotificationTemplate(notification.type, notification.data);
      
      // Get user information
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('discord_id, username, email')
        .eq('id', notification.userId)
        .single();

      if (userError || !user) {
        logger.warn(`User not found for notification: ${notification.userId}`);
        return;
      }

      // Get server information
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .select('discord_server_id, name')
        .eq('id', notification.serverId)
        .single();

      if (serverError || !server) {
        logger.warn(`Server not found for notification: ${notification.serverId}`);
        return;
      }

      // Store notification in database for tracking
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({
          user_id: notification.userId,
          server_id: notification.serverId,
          type: notification.type,
          subject: template.subject,
          message: template.message,
          data: {
            ...notification.data,
            server_name: server.name,
            discord_server_id: server.discord_server_id
          },
          status: 'pending',
          created_at: new Date().toISOString()
        });

      if (insertError) {
        logger.error('Failed to store notification:', insertError);
      }

      // In a real implementation, you would send the notification via:
      // 1. Discord DM to the user
      // 2. Email (if available)
      // 3. In-app notification
      // 4. Webhook to external services

      logger.info('Subscription notification sent', {
        userId: notification.userId,
        serverId: notification.serverId,
        type: notification.type,
        subject: template.subject
      });

      // Simulate notification delivery
      await this.simulateNotificationDelivery(user, server, template, notification.type);

    } catch (error) {
      logger.error('Error sending subscription notification:', error);
      throw new AppError('Failed to send notification', 500, 'NOTIFICATION_ERROR');
    }
  }

  /**
   * Get notification template based on type
   */
  private static getNotificationTemplate(type: NotificationData['type'], data: Record<string, any>): NotificationTemplate {
    switch (type) {
      case 'renewal_success':
        return {
          subject: 'Subscription Renewed Successfully',
          message: `Your ${data.planName} subscription has been renewed successfully. Your next billing date is ${new Date(data.nextBillingDate).toLocaleDateString()}.`,
          actionUrl: '/dashboard/subscription',
          actionText: 'View Subscription'
        };

      case 'renewal_failed':
        return {
          subject: 'Subscription Renewal Failed',
          message: `We couldn't renew your ${data.planName} subscription. Please update your payment method to continue using premium features.`,
          actionUrl: '/dashboard/subscription',
          actionText: 'Update Payment Method'
        };

      case 'expiring_soon':
        return {
          subject: 'Subscription Expiring Soon',
          message: `Your ${data.planName} subscription will expire on ${new Date(data.expirationDate).toLocaleDateString()}. Renew now to continue enjoying premium features.`,
          actionUrl: '/dashboard/subscription',
          actionText: 'Renew Subscription'
        };

      case 'cancelled':
        return {
          subject: 'Subscription Cancelled',
          message: data.cancelAtPeriodEnd 
            ? `Your ${data.planName} subscription has been cancelled and will end on ${new Date(data.periodEnd).toLocaleDateString()}. You can reactivate it anytime before then.`
            : `Your ${data.planName} subscription has been cancelled immediately. You can subscribe again anytime.`,
          actionUrl: '/dashboard/subscription',
          actionText: 'Reactivate Subscription'
        };

      case 'expired':
        return {
          subject: 'Subscription Expired',
          message: `Your ${data.planName} subscription has expired. Subscribe again to regain access to premium features.`,
          actionUrl: '/dashboard/subscription',
          actionText: 'Renew Subscription'
        };

      default:
        return {
          subject: 'Subscription Update',
          message: 'Your subscription status has been updated.',
          actionUrl: '/dashboard/subscription',
          actionText: 'View Subscription'
        };
    }
  }

  /**
   * Simulate notification delivery (replace with real implementation)
   */
  private static async simulateNotificationDelivery(
    user: any, 
    server: any, 
    template: NotificationTemplate, 
    type: string
  ): Promise<void> {
    // In a real implementation, this would:
    // 1. Send Discord DM using Discord API
    // 2. Send email using email service (SendGrid, AWS SES, etc.)
    // 3. Send push notification
    // 4. Call webhook endpoints

    logger.info('Notification delivered', {
      method: 'simulation',
      recipient: user.username,
      server: server.name,
      type,
      subject: template.subject
    });

    // Simulate delivery delay
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /**
   * Send expiration warnings for subscriptions expiring soon
   */
  static async sendExpirationWarnings(): Promise<void> {
    try {
      // Find subscriptions expiring in 3 days
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + 3);

      const { data: expiringSubscriptions, error } = await supabase
        .from('user_subscriptions')
        .select(`
          id,
          user_id,
          server_id,
          current_period_end,
          cancel_at_period_end,
          plan:subscription_plans(name, display_name)
        `)
        .eq('status', 'active')
        .eq('cancel_at_period_end', true)
        .lt('current_period_end', warningDate.toISOString())
        .gt('current_period_end', new Date().toISOString());

      if (error) {
        throw error;
      }

      if (!expiringSubscriptions || expiringSubscriptions.length === 0) {
        logger.info('No subscriptions found expiring soon');
        return;
      }

      logger.info(`Found ${expiringSubscriptions.length} subscriptions expiring soon`);

      // Send warning notifications
      for (const subscription of expiringSubscriptions) {
        try {
          await this.sendNotification({
            userId: subscription.user_id,
            serverId: subscription.server_id,
            subscriptionId: subscription.id,
            type: 'expiring_soon',
            data: {
              planName: subscription.plan.display_name,
              expirationDate: subscription.current_period_end
            }
          });
        } catch (error) {
          logger.error(`Failed to send expiration warning for subscription ${subscription.id}:`, error);
        }
      }

      logger.info(`Sent ${expiringSubscriptions.length} expiration warning notifications`);
    } catch (error) {
      logger.error('Error sending expiration warnings:', error);
      throw new AppError('Failed to send expiration warnings', 500, 'EXPIRATION_WARNING_ERROR');
    }
  }

  /**
   * Send renewal success notifications
   */
  static async sendRenewalSuccessNotifications(renewalResults: Array<{ subscriptionId: string; success: boolean; newPeriodEnd: string }>): Promise<void> {
    try {
      const successfulRenewals = renewalResults.filter(r => r.success);

      for (const renewal of successfulRenewals) {
        try {
          // Get subscription details
          const { data: subscription, error } = await supabase
            .from('user_subscriptions')
            .select(`
              user_id,
              server_id,
              plan:subscription_plans(name, display_name)
            `)
            .eq('id', renewal.subscriptionId)
            .single();

          if (error || !subscription) {
            logger.warn(`Subscription not found for renewal notification: ${renewal.subscriptionId}`);
            continue;
          }

          await this.sendNotification({
            userId: subscription.user_id,
            serverId: subscription.server_id,
            subscriptionId: renewal.subscriptionId,
            type: 'renewal_success',
            data: {
              planName: subscription.plan.display_name,
              nextBillingDate: renewal.newPeriodEnd
            }
          });
        } catch (error) {
          logger.error(`Failed to send renewal success notification for subscription ${renewal.subscriptionId}:`, error);
        }
      }

      logger.info(`Sent ${successfulRenewals.length} renewal success notifications`);
    } catch (error) {
      logger.error('Error sending renewal success notifications:', error);
    }
  }

  /**
   * Send renewal failure notifications
   */
  static async sendRenewalFailureNotifications(renewalResults: Array<{ subscriptionId: string; success: boolean; error?: string }>): Promise<void> {
    try {
      const failedRenewals = renewalResults.filter(r => !r.success);

      for (const renewal of failedRenewals) {
        try {
          // Get subscription details
          const { data: subscription, error } = await supabase
            .from('user_subscriptions')
            .select(`
              user_id,
              server_id,
              plan:subscription_plans(name, display_name)
            `)
            .eq('id', renewal.subscriptionId)
            .single();

          if (error || !subscription) {
            logger.warn(`Subscription not found for renewal failure notification: ${renewal.subscriptionId}`);
            continue;
          }

          await this.sendNotification({
            userId: subscription.user_id,
            serverId: subscription.server_id,
            subscriptionId: renewal.subscriptionId,
            type: 'renewal_failed',
            data: {
              planName: subscription.plan.display_name,
              error: renewal.error
            }
          });
        } catch (error) {
          logger.error(`Failed to send renewal failure notification for subscription ${renewal.subscriptionId}:`, error);
        }
      }

      logger.info(`Sent ${failedRenewals.length} renewal failure notifications`);
    } catch (error) {
      logger.error('Error sending renewal failure notifications:', error);
    }
  }

  /**
   * Get notification history for a user
   */
  static async getNotificationHistory(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return notifications || [];
    } catch (error) {
      logger.error('Error getting notification history:', error);
      throw new AppError('Failed to get notification history', 500, 'NOTIFICATION_HISTORY_ERROR');
    }
  }
}