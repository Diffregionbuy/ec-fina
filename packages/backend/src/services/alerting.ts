import { logger } from '../utils/logger';
import { apmService } from './apm';
import { monitoringService } from './monitoring';
import { cacheService } from './cache';
import { discordApiMetrics } from './resilience/DiscordApiMetrics';

interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cooldown: number; // Minimum time between alerts in milliseconds
  enabled: boolean;
}

interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, any>;
  enabled: boolean;
}

class AlertingService {
  
  private readonly MAX_ALERTS = process.env.DISABLE_ALERTING === 'true' ? 10 : 100;
  private readonly MAX_ALERT_RULES = process.env.DISABLE_ALERTING === 'true' ? 5 : 50;

  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private notificationChannels: NotificationChannel[] = [];
  private lastAlertTimes: Map<string, number> = new Map();
  private alertingInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Only initialize if alerting is not disabled
    if (process.env.DISABLE_ALERTING !== 'true') {
      this.initializeDefaultRules();
      this.startAlerting();
    }
  }

  // Initialize default alert rules
  private initializeDefaultRules(): void {
    this.alertRules = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: (metrics) => metrics.requests?.errorRate > 0.05, // 5% error rate
        severity: 'high',
        cooldown: 5 * 60 * 1000, // 5 minutes
        enabled: true,
      },
      {
        id: 'slow_response_time',
        name: 'Slow Response Time',
        condition: (metrics) => metrics.requests?.p95ResponseTime > 2000, // 2 seconds
        severity: 'medium',
        cooldown: 10 * 60 * 1000, // 10 minutes
        enabled: true,
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        condition: (metrics) => metrics.system?.memory?.heapUsagePercent > 90,
        severity: 'high',
        cooldown: 5 * 60 * 1000, // 5 minutes
        enabled: true,
      },
      {
        id: 'database_connection_failure',
        name: 'Database Connection Failure',
        condition: (metrics) => metrics.health?.checks?.database?.status === 'unhealthy',
        severity: 'critical',
        cooldown: 1 * 60 * 1000, // 1 minute
        enabled: true,
      },
      {
        id: 'redis_connection_failure',
        name: 'Redis Connection Failure',
        condition: (metrics) => metrics.health?.checks?.redis?.status === 'unhealthy',
        severity: 'high',
        cooldown: 2 * 60 * 1000, // 2 minutes
        enabled: true,
      },
      {
        id: 'low_cache_hit_rate',
        name: 'Low Cache Hit Rate',
        condition: (metrics) => {
          const { hits, misses } = metrics.cache || {};
          if (!hits && !misses) return false;
          const hitRate = hits / (hits + misses);
          return hitRate < 0.5; // Less than 50% hit rate
        },
        severity: 'medium',
        cooldown: 15 * 60 * 1000, // 15 minutes
        enabled: true,
      },
      {
        id: 'high_request_volume',
        name: 'High Request Volume',
        condition: (metrics) => metrics.requests?.throughput > 1000, // More than 1000 requests per hour
        severity: 'medium',
        cooldown: 30 * 60 * 1000, // 30 minutes
        enabled: true,
      },
      {
        id: 'payment_processing_errors',
        name: 'Payment Processing Errors',
        condition: (metrics) => {
          // Check for payment-related errors in recent requests
          const paymentErrors = metrics.requests?.topPaths?.['/api/payments'] || 0;
          return paymentErrors > 5; // More than 5 payment errors
        },
        severity: 'critical',
        cooldown: 2 * 60 * 1000, // 2 minutes
        enabled: true,
      },
      {
        id: 'discord_api_unhealthy',
        name: 'Discord API Unhealthy',
        condition: (metrics) => metrics.discordApi?.status === 'unhealthy',
        severity: 'critical',
        cooldown: 1 * 60 * 1000, // 1 minute
        enabled: true,
      },
      {
        id: 'discord_api_degraded',
        name: 'Discord API Degraded',
        condition: (metrics) => metrics.discordApi?.status === 'degraded',
        severity: 'high',
        cooldown: 5 * 60 * 1000, // 5 minutes
        enabled: true,
      },
      {
        id: 'discord_api_high_error_rate',
        name: 'Discord API High Error Rate',
        condition: (metrics) => metrics.discordApi?.errorRate > 0.1, // 10%
        severity: 'high',
        cooldown: 5 * 60 * 1000, // 5 minutes
        enabled: true,
      },
      {
        id: 'discord_api_consecutive_failures',
        name: 'Discord API Consecutive Failures',
        condition: (metrics) => metrics.discordApi?.consecutiveFailures >= 5,
        severity: 'critical',
        cooldown: 2 * 60 * 1000, // 2 minutes
        enabled: true,
      },
    ];

    logger.info(`Initialized ${this.alertRules.length} alert rules`);
  }

  // Add notification channel
  addNotificationChannel(channel: NotificationChannel): void {
    this.notificationChannels.push(channel);
    logger.info(`Added notification channel: ${channel.type}`);
  }

  // Create an alert
  createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): Alert {
    // Skip if alerting is disabled
    if (process.env.DISABLE_ALERTING === 'true') {
      return {} as Alert;
    }

    const alert: Alert = {
      id: this.generateAlertId(),
      type,
      severity,
      title,
      message,
      timestamp: Date.now(),
      resolved: false,
      metadata,
    };

    this.alerts.push(alert);
    
    // Enforce array limits
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS);
    }

    this.sendNotifications(alert);

    logger.warn('Alert created', {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
    });

    return alert;
  }

  // Resolve an alert
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = Date.now();

    logger.info('Alert resolved', {
      id: alert.id,
      title: alert.title,
      duration: alert.resolvedAt - alert.timestamp,
    });

    return true;
  }

  // Get active alerts
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  // Get all alerts
  getAllAlerts(limit: number = 100): Alert[] {
    return this.alerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Check alert rules
  private async checkAlertRules(): Promise<void> {
    try {
      // Gather metrics from various services
      const performanceMetrics = apmService.getPerformanceSummary();
      const healthMetrics = await monitoringService.performHealthCheck();
      const cacheMetrics = cacheService.getStats();
      const discordApiHealth = discordApiMetrics.getHealthStatus();

      const allMetrics = {
        requests: performanceMetrics.requests,
        system: performanceMetrics.system,
        cache: cacheMetrics,
        health: healthMetrics,
        discordApi: discordApiHealth,
      };

      // Check each rule
      for (const rule of this.alertRules) {
        if (!rule.enabled) continue;

        try {
          const shouldAlert = rule.condition(allMetrics);
          
          if (shouldAlert) {
            const lastAlertTime = this.lastAlertTimes.get(rule.id) || 0;
            const now = Date.now();
            
            // Check cooldown period
            if (now - lastAlertTime < rule.cooldown) {
              continue;
            }

            // Create alert
            this.createAlert(
              'warning',
              rule.severity,
              rule.name,
              this.generateAlertMessage(rule, allMetrics),
              { ruleId: rule.id, metrics: allMetrics }
            );

            this.lastAlertTimes.set(rule.id, now);
          }
        } catch (error) {
          logger.error(`Error checking alert rule ${rule.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error checking alert rules:', error);
    }
  }

  // Generate alert message based on rule and metrics
  private generateAlertMessage(rule: AlertRule, metrics: any): string {
    switch (rule.id) {
      case 'high_error_rate':
        return `Error rate is ${(metrics.requests.errorRate * 100).toFixed(2)}% (threshold: 5%)`;
      
      case 'slow_response_time':
        return `95th percentile response time is ${metrics.requests.p95ResponseTime.toFixed(0)}ms (threshold: 2000ms)`;
      
      case 'high_memory_usage':
        return `Memory usage is ${metrics.system.memory.heapUsagePercent.toFixed(1)}% (threshold: 85%)`;
      
      case 'database_connection_failure':
        return `Database health check failed: ${metrics.health.checks.database.error || 'Unknown error'}`;
      
      case 'redis_connection_failure':
        return `Redis health check failed: ${metrics.health.checks.redis.error || 'Unknown error'}`;
      
      case 'low_cache_hit_rate':
        const hitRate = metrics.cache.hits / (metrics.cache.hits + metrics.cache.misses);
        return `Cache hit rate is ${(hitRate * 100).toFixed(1)}% (threshold: 50%)`;
      
      case 'high_request_volume':
        return `Request volume is ${metrics.requests.throughput.toFixed(0)} requests/hour (threshold: 1000)`;
      
      case 'payment_processing_errors':
        return `Payment processing errors detected: ${metrics.requests.topPaths['/api/payments']} errors`;
      
      case 'discord_api_unhealthy':
        return `Discord API is unhealthy: ${metrics.discordApi.details || 'Unknown issue'}`;
      
      case 'discord_api_degraded':
        return `Discord API is degraded: ${metrics.discordApi.details || 'Performance issues detected'}`;
      
      case 'discord_api_high_error_rate':
        return `Discord API error rate is ${(metrics.discordApi.errorRate * 100).toFixed(1)}% (threshold: 10%)`;
      
      case 'discord_api_consecutive_failures':
        return `Discord API has ${metrics.discordApi.consecutiveFailures} consecutive failures`;
      
      default:
        return `Alert condition met for rule: ${rule.name}`;
    }
  }

  // Send notifications for an alert
  private async sendNotifications(alert: Alert): Promise<void> {
    const enabledChannels = this.notificationChannels.filter(c => c.enabled);
    
    for (const channel of enabledChannels) {
      try {
        await this.sendNotification(channel, alert);
      } catch (error) {
        logger.error(`Failed to send notification via ${channel.type}:`, error);
      }
    }
  }

  // Send notification to a specific channel
  private async sendNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    switch (channel.type) {
      case 'slack':
        await this.sendSlackNotification(channel.config, alert);
        break;
      
      case 'webhook':
        await this.sendWebhookNotification(channel.config, alert);
        break;
      
      case 'email':
        await this.sendEmailNotification(channel.config, alert);
        break;
      
      default:
        logger.warn(`Unsupported notification channel type: ${channel.type}`);
    }
  }

  // Send Slack notification
  private async sendSlackNotification(config: any, alert: Alert): Promise<void> {
    if (!config.webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const color = this.getSlackColor(alert.severity);
    const payload = {
      text: `🚨 ${alert.title}`,
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Type',
              value: alert.type.toUpperCase(),
              short: true,
            },
            {
              title: 'Message',
              value: alert.message,
              short: false,
            },
            {
              title: 'Timestamp',
              value: new Date(alert.timestamp).toISOString(),
              short: true,
            },
          ],
        },
      ],
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  }

  // Send webhook notification
  private async sendWebhookNotification(config: any, alert: Alert): Promise<void> {
    if (!config.url) {
      throw new Error('Webhook URL not configured');
    }

    const payload = {
      alert,
      timestamp: Date.now(),
      service: 'ecbot-api',
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook notification failed: ${response.statusText}`);
    }
  }

  // Send email notification (placeholder - implement with your email service)
  private async sendEmailNotification(config: any, alert: Alert): Promise<void> {
    logger.info('Email notification would be sent', { alert, config });
    // Implement email sending logic here
  }

  // Get Slack color based on severity
  private getSlackColor(severity: Alert['severity']): string {
    switch (severity) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return '#ffaa00';
      case 'low':
        return 'good';
      default:
        return '#cccccc';
    }
  }

  // Generate unique alert ID
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Start alerting system
  private startAlerting(): void {
    // Skip if alerting is disabled
    if (process.env.DISABLE_ALERTING === 'true') {
      logger.info('Alerting system disabled');
      return;
    }

    // Check alert rules less frequently in dev mode
    const interval = process.env.DISABLE_ALERTING === 'true' ? 
      5 * 60 * 1000 : // 5 minutes for dev
      60 * 1000; // 1 minute for production

    this.alertingInterval = setInterval(() => {
      this.checkAlertRules();
    }, interval);

    logger.info(`Alerting system started (interval: ${interval}ms)`);
  }

  // Stop alerting system
  stopAlerting(): void {
    if (this.alertingInterval) {
      clearInterval(this.alertingInterval);
      this.alertingInterval = null;
      logger.info('Alerting system stopped');
    }
  }

  // Get alerting statistics
  getStats(): {
    totalAlerts: number;
    activeAlerts: number;
    resolvedAlerts: number;
    alertsByType: Record<string, number>;
    alertsBySeverity: Record<string, number>;
  } {
    const activeAlerts = this.alerts.filter(a => !a.resolved);
    const resolvedAlerts = this.alerts.filter(a => a.resolved);

    const alertsByType = this.alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsBySeverity = this.alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalAlerts: this.alerts.length,
      activeAlerts: activeAlerts.length,
      resolvedAlerts: resolvedAlerts.length,
      alertsByType,
      alertsBySeverity,
    };
  }

  // Health check
  healthCheck(): { status: string; rulesCount: number; channelsCount: number } {
    return {
      status: 'healthy',
      rulesCount: this.alertRules.length,
      channelsCount: this.notificationChannels.length,
    };
  }
}

export const alertingService = new AlertingService();