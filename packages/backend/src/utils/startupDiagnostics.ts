import { logger } from './logger';
import { getOptimizedOKXService } from '../services/optimizedOkx';
import { redis } from '../middleware/apiCaching';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

export class StartupDiagnostics {
  private static readonly REQUIRED_ENV_VARS = [
    'OKX_API_KEY',
    'OKX_SECRET_KEY', 
    'OKX_PASSPHRASE'
  ];

  private static readonly OPTIONAL_ENV_VARS = [
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'OKX_SANDBOX'
  ];

  static async runDiagnostics(): Promise<{
    success: boolean;
    issues: string[];
    warnings: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    logger.info('🔍 Running startup diagnostics...');

    // Check environment variables
    this.checkEnvironmentVariables(issues, warnings, recommendations);

    // Check Redis connection
    await this.checkRedisConnection(issues, warnings, recommendations);

    // Check OKX service
    await this.checkOKXService(issues, warnings, recommendations);

    // Check system time
    this.checkSystemTime(warnings, recommendations);

    const success = issues.length === 0;

    logger.info('📊 Startup diagnostics completed', {
      success,
      issuesCount: issues.length,
      warningsCount: warnings.length,
      recommendationsCount: recommendations.length
    });

    if (issues.length > 0) {
      logger.error('❌ Critical issues found:', issues);
    }

    if (warnings.length > 0) {
      logger.warn('⚠️ Warnings found:', warnings);
    }

    if (recommendations.length > 0) {
      logger.info('💡 Recommendations:', recommendations);
    }

    return {
      success,
      issues,
      warnings,
      recommendations
    };
  }

  private static checkEnvironmentVariables(
    issues: string[],
    warnings: string[],
    recommendations: string[]
  ): void {
    // Check required environment variables
    for (const envVar of this.REQUIRED_ENV_VARS) {
      if (!process.env[envVar]) {
        issues.push(`Missing required environment variable: ${envVar}`);
      } else if (process.env[envVar]!.length < 8) {
        warnings.push(`Environment variable ${envVar} seems too short`);
      }
    }

    // Check optional environment variables
    for (const envVar of this.OPTIONAL_ENV_VARS) {
      if (!process.env[envVar]) {
        recommendations.push(`Consider setting ${envVar} for better configuration`);
      }
    }

    // Validate Redis configuration
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    if (redisHost === 'localhost' && process.env.NODE_ENV === 'production') {
      warnings.push('Using localhost for Redis in production environment');
    }

    if (isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
      issues.push(`Invalid Redis port: ${process.env.REDIS_PORT}`);
    }

    // Check OKX configuration
    if (process.env.OKX_SANDBOX !== 'true' && process.env.NODE_ENV !== 'production') {
      recommendations.push('Consider using OKX sandbox mode for development');
    }
  }

  private static async checkRedisConnection(
    issues: string[],
    warnings: string[],
    recommendations: string[]
  ): Promise<void> {
    try {
      logger.info('🔗 Testing Redis connection...');
      
      const startTime = Date.now();
      const pong = await Promise.race([
        redis.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ]);
      const responseTime = Date.now() - startTime;

      if (pong === 'PONG') {
        logger.info('✅ Redis connection successful', { responseTime });
        
        if (responseTime > 1000) {
          warnings.push(`Redis response time is slow: ${responseTime}ms`);
        }

        // Test basic operations
        try {
          await redis.set('health-check', 'ok', 'EX', 10);
          const value = await redis.get('health-check');
          if (value !== 'ok') {
            warnings.push('Redis set/get operations not working correctly');
          }
          await redis.del('health-check');
        } catch (opError) {
          warnings.push('Redis basic operations failed');
        }

      } else {
        issues.push('Redis ping returned unexpected response');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      issues.push(`Redis connection failed: ${errorMessage}`);
      
      if (errorMessage.includes('ECONNREFUSED')) {
        recommendations.push('Start Redis server: redis-server or docker run -p 6379:6379 redis');
      } else if (errorMessage.includes('timeout')) {
        recommendations.push('Check Redis server performance and network connectivity');
      }
    }
  }

  private static async checkOKXService(
    issues: string[],
    warnings: string[],
    recommendations: string[]
  ): Promise<void> {
    try {
      logger.info('🏦 Testing OKX service...');
      
      if (!process.env.OKX_API_KEY || !process.env.OKX_SECRET_KEY || !process.env.OKX_PASSPHRASE) {
        issues.push('OKX credentials not configured');
        return;
      }

      const okxService = getOptimizedOKXService();
      const healthCheck = await Promise.race([
        okxService.healthCheck(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('OKX health check timeout')), 10000)
        )
      ]);

      logger.info('✅ OKX service health check completed', {
        status: healthCheck.status,
        circuitBreakerState: healthCheck.details?.circuitBreaker?.state || 'unknown'
      });

      if (healthCheck.status === 'unhealthy') {
        issues.push('OKX service is unhealthy');
      }

      if (healthCheck.details?.circuitBreaker?.state === 'open') {
        warnings.push('OKX circuit breaker is open - service may be experiencing issues');
        recommendations.push('Wait for circuit breaker to reset or check OKX API status');
      }

      if (healthCheck.details?.metrics?.failedRequests > 0) {
        const metrics = healthCheck.details.metrics;
        const failureRate = (metrics.failedRequests / metrics.totalRequests) * 100;
        if (failureRate > 10) {
          warnings.push(`High OKX API failure rate: ${failureRate.toFixed(1)}%`);
        }
      }

      // Test a simple API call
      try {
        logger.info('🧪 Testing OKX API call...');
        // Clear cache first to ensure fresh test
        okxService.clearCache();
        const currencies = await Promise.race([
          okxService.getSupportedCurrencies(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('OKX API call timeout')), 15000)
          )
        ]);

        if (Array.isArray(currencies) && currencies.length > 0) {
          logger.info('✅ OKX API test call successful', { currencyCount: currencies.length });
        } else {
          warnings.push('OKX API returned empty or invalid currency list');
        }
      } catch (apiError) {
        const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error';
        warnings.push(`OKX API test call failed: ${errorMessage}`);
        
        if (errorMessage.includes('timestamp') || errorMessage.includes('expired')) {
          recommendations.push('Check system time synchronization (NTP)');
        } else if (errorMessage.includes('signature')) {
          recommendations.push('Verify OKX API credentials are correct');
        } else if (errorMessage.includes('timeout')) {
          recommendations.push('Check network connectivity to OKX servers');
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      issues.push(`OKX service initialization failed: ${errorMessage}`);
    }
  }

  private static checkSystemTime(
    warnings: string[],
    recommendations: string[]
  ): void {
    try {
      // Check if system time seems reasonable (not too far from expected)
      const now = new Date();
      const currentYear = now.getFullYear();
      
      if (currentYear < 2024 || currentYear > 2030) {
        warnings.push(`System time seems incorrect: ${now.toISOString()}`);
        recommendations.push('Synchronize system time with NTP server');
      }

      // Check timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      logger.info('🕐 System time check', {
        currentTime: now.toISOString(),
        timezone,
        timestamp: now.getTime()
      });

    } catch (error) {
      warnings.push('Could not verify system time');
    }
  }

  static async fixCommonIssues(): Promise<{
    fixed: string[];
    failed: string[];
  }> {
    const fixed: string[] = [];
    const failed: string[] = [];

    logger.info('🔧 Attempting to fix common issues...');

    // Try to clear Redis cache if connection works
    try {
      await redis.ping();
      await redis.flushdb();
      fixed.push('Cleared Redis cache');
    } catch (error) {
      failed.push('Could not clear Redis cache');
    }

    // Reset OKX service metrics and circuit breaker
    try {
      const okxService = getOptimizedOKXService();
      okxService.resetMetrics();
      okxService.clearCache();
      fixed.push('Reset OKX service metrics and cache');
    } catch (error) {
      failed.push('Could not reset OKX service');
    }

    logger.info('🔧 Auto-fix completed', { fixed, failed });

    return { fixed, failed };
  }
}

// Export a simple function for easy use
export async function runStartupDiagnostics() {
  return await StartupDiagnostics.runDiagnostics();
}

export async function fixCommonIssues() {
  return await StartupDiagnostics.fixCommonIssues();
}