import { logger } from '../utils/logger';
import { SubscriptionService } from './subscription';
import { SubscriptionRenewalService } from './subscriptionRenewal';
import { SubscriptionNotificationService } from './subscriptionNotifications';

export class SubscriptionSchedulerService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the subscription scheduler
   */
  static start(): void {
    if (this.isRunning) {
      logger.warn('Subscription scheduler is already running');
      return;
    }

    logger.info('Starting subscription scheduler');
    this.isRunning = true;

    // Run immediately on start
    this.runScheduledTasks();

    // Schedule to run every hour
    this.intervalId = setInterval(() => {
      this.runScheduledTasks();
    }, 60 * 60 * 1000); // 1 hour

    logger.info('Subscription scheduler started successfully');
  }

  /**
   * Stop the subscription scheduler
   */
  static stop(): void {
    if (!this.isRunning) {
      logger.warn('Subscription scheduler is not running');
      return;
    }

    logger.info('Stopping subscription scheduler');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('Subscription scheduler stopped successfully');
  }

  /**
   * Run all scheduled tasks
   */
  private static async runScheduledTasks(): Promise<void> {
    try {
      logger.info('Running scheduled subscription tasks');

      // Run tasks in parallel for better performance
      await Promise.allSettled([
        this.processExpiredSubscriptions(),
        this.processRenewals(),
        this.sendExpirationWarnings()
      ]);

      logger.info('Scheduled subscription tasks completed');
    } catch (error) {
      logger.error('Error running scheduled subscription tasks:', error);
    }
  }

  /**
   * Process expired subscriptions
   */
  private static async processExpiredSubscriptions(): Promise<void> {
    try {
      logger.info('Processing expired subscriptions');
      await SubscriptionService.processExpiredSubscriptions();
      logger.info('Expired subscriptions processed successfully');
    } catch (error) {
      logger.error('Error processing expired subscriptions:', error);
    }
  }

  /**
   * Process subscription renewals
   */
  private static async processRenewals(): Promise<void> {
    try {
      logger.info('Processing subscription renewals');
      const renewalResults = await SubscriptionRenewalService.processRenewals();
      
      if (renewalResults.length > 0) {
        // Send notifications for renewal results
        await Promise.allSettled([
          SubscriptionNotificationService.sendRenewalSuccessNotifications(renewalResults),
          SubscriptionNotificationService.sendRenewalFailureNotifications(renewalResults)
        ]);
      }

      logger.info('Subscription renewals processed successfully');
    } catch (error) {
      logger.error('Error processing subscription renewals:', error);
    }
  }

  /**
   * Send expiration warnings
   */
  private static async sendExpirationWarnings(): Promise<void> {
    try {
      logger.info('Sending expiration warnings');
      await SubscriptionNotificationService.sendExpirationWarnings();
      logger.info('Expiration warnings sent successfully');
    } catch (error) {
      logger.error('Error sending expiration warnings:', error);
    }
  }

  /**
   * Run tasks manually (for testing or admin purposes)
   */
  static async runManually(): Promise<{
    expiredSubscriptions: boolean;
    renewals: any[];
    expirationWarnings: boolean;
  }> {
    try {
      logger.info('Running subscription tasks manually');

      const results = {
        expiredSubscriptions: false,
        renewals: [] as any[],
        expirationWarnings: false
      };

      // Process expired subscriptions
      try {
        await SubscriptionService.processExpiredSubscriptions();
        results.expiredSubscriptions = true;
      } catch (error) {
        logger.error('Manual expired subscriptions processing failed:', error);
      }

      // Process renewals
      try {
        results.renewals = await SubscriptionRenewalService.processRenewals();
        
        if (results.renewals.length > 0) {
          await Promise.allSettled([
            SubscriptionNotificationService.sendRenewalSuccessNotifications(results.renewals),
            SubscriptionNotificationService.sendRenewalFailureNotifications(results.renewals)
          ]);
        }
      } catch (error) {
        logger.error('Manual renewal processing failed:', error);
      }

      // Send expiration warnings
      try {
        await SubscriptionNotificationService.sendExpirationWarnings();
        results.expirationWarnings = true;
      } catch (error) {
        logger.error('Manual expiration warnings failed:', error);
      }

      logger.info('Manual subscription tasks completed', results);
      return results;
    } catch (error) {
      logger.error('Error running subscription tasks manually:', error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  static getStatus(): {
    isRunning: boolean;
    nextRun?: Date;
  } {
    return {
      isRunning: this.isRunning,
      nextRun: this.isRunning ? new Date(Date.now() + 60 * 60 * 1000) : undefined
    };
  }
}