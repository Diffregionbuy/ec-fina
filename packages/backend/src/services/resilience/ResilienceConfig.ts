import { logger } from '../../utils/logger';
import { RetryConfig } from './RetryManager';
import { TimeoutConfig } from './TimeoutManager';

export interface DiscordResilienceConfig {
  retry: RetryConfig;
  timeout: TimeoutConfig;
  cache: {
    enabled: boolean;
    ttl: number;
    staleWhileRevalidate: boolean;
    maxSize: number;
  };
  logging: {
    logRequests: boolean;
    logRetries: boolean;
    logCacheHits: boolean;
    logErrors: boolean;
  };
}

export interface ConfigValidationError {
  field: string;
  value: any;
  message: string;
}

export interface ConfigUpdateResult {
  success: boolean;
  errors?: ConfigValidationError[];
  warnings?: string[];
}

export class ResilienceConfigManager {
  private static instance: ResilienceConfigManager;
  private config: DiscordResilienceConfig;

  private constructor() {
    this.config = this.loadDefaultConfig();
    this.loadEnvironmentConfig();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ResilienceConfigManager {
    if (!ResilienceConfigManager.instance) {
      ResilienceConfigManager.instance = new ResilienceConfigManager();
    }
    return ResilienceConfigManager.instance;
  }

  /**
   * Load default configuration
   */
  private loadDefaultConfig(): DiscordResilienceConfig {
    return {
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableErrors: [
          'ECONNRESET',
          'ECONNREFUSED',
          'ENOTFOUND',
          'ETIMEDOUT',
          'ECONNABORTED',
          'ENETUNREACH',
          'ENETDOWN',
          'EHOSTUNREACH',
          'EHOSTDOWN',
          'EPIPE',
          'EAI_AGAIN'
        ]
      },
      timeout: {
        defaultTimeout: 10000,
        connectionTimeout: 5000,
        readTimeout: 15000,
        writeTimeout: 10000
      },
    cache: {
      enabled: true,
      ttl: 900000, // 15 minutes (increased from 5 minutes)
      staleWhileRevalidate: true,
      maxSize: 2000 // Increased cache size
    },
      logging: {
        logRequests: true,
        logRetries: true,
        logCacheHits: false,
        logErrors: true
      }
    };
  }

  /**
   * Load configuration from environment variables
   */
  private loadEnvironmentConfig(): void {
    const envErrors: string[] = [];
    const envWarnings: string[] = [];
    
    try {
      // Retry configuration
      this.parseIntegerEnvVar('DISCORD_API_MAX_RETRIES', (value) => {
        this.config.retry.maxRetries = value;
      }, envErrors);
      
      this.parseIntegerEnvVar('DISCORD_API_BASE_DELAY', (value) => {
        this.config.retry.baseDelay = value;
      }, envErrors);
      
      this.parseIntegerEnvVar('DISCORD_API_MAX_DELAY', (value) => {
        this.config.retry.maxDelay = value;
      }, envErrors);

      // Timeout configuration
      this.parseIntegerEnvVar('DISCORD_API_TIMEOUT', (value) => {
        this.config.timeout.defaultTimeout = value;
      }, envErrors);
      
      this.parseIntegerEnvVar('DISCORD_API_CONNECTION_TIMEOUT', (value) => {
        this.config.timeout.connectionTimeout = value;
      }, envErrors);
      
      this.parseIntegerEnvVar('DISCORD_API_READ_TIMEOUT', (value) => {
        this.config.timeout.readTimeout = value;
      }, envErrors);
      
      this.parseIntegerEnvVar('DISCORD_API_WRITE_TIMEOUT', (value) => {
        this.config.timeout.writeTimeout = value;
      }, envErrors);

      // Cache configuration
      this.parseBooleanEnvVar('DISCORD_API_CACHE_ENABLED', (value) => {
        this.config.cache.enabled = value;
      }, envErrors);
      
      this.parseIntegerEnvVar('DISCORD_API_CACHE_TTL', (value) => {
        this.config.cache.ttl = value;
      }, envErrors);
      
      this.parseBooleanEnvVar('DISCORD_API_STALE_WHILE_REVALIDATE', (value) => {
        this.config.cache.staleWhileRevalidate = value;
      }, envErrors);
      
      this.parseIntegerEnvVar('DISCORD_API_CACHE_MAX_SIZE', (value) => {
        this.config.cache.maxSize = value;
      }, envErrors);

      // Logging configuration
      this.parseBooleanEnvVar('DISCORD_API_LOG_REQUESTS', (value) => {
        this.config.logging.logRequests = value;
      }, envErrors);
      
      this.parseBooleanEnvVar('DISCORD_API_LOG_RETRIES', (value) => {
        this.config.logging.logRetries = value;
      }, envErrors);
      
      this.parseBooleanEnvVar('DISCORD_API_LOG_CACHE_HITS', (value) => {
        this.config.logging.logCacheHits = value;
      }, envErrors);
      
      this.parseBooleanEnvVar('DISCORD_API_LOG_ERRORS', (value) => {
        this.config.logging.logErrors = value;
      }, envErrors);

      // Log parsing errors
      if (envErrors.length > 0) {
        logger.warn('Environment variable parsing errors, using defaults for invalid values', {
          errors: envErrors
        });
      }

      this.validateConfig();
      
      // Temporarily disable this log to prevent JSON formatting issues
      // logger.info('Discord API resilience configuration loaded', {
      //   service: 'ecbot-api',
      //   source: 'environment',
      //   config: this.getSafeConfigForLogging()
      // });
    } catch (error) {
      logger.error('Failed to load environment configuration, using defaults', { 
        error,
        parseErrors: envErrors
      });
    }
  }

  /**
   * Parse integer environment variable with error handling
   */
  private parseIntegerEnvVar(
    envVar: string, 
    setter: (value: number) => void, 
    errors: string[]
  ): void {
    const value = process.env[envVar];
    if (value !== undefined) {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        errors.push(`${envVar}: "${value}" is not a valid integer`);
      } else {
        setter(parsed);
      }
    }
  }

  /**
   * Parse boolean environment variable with error handling
   */
  private parseBooleanEnvVar(
    envVar: string, 
    setter: (value: boolean) => void, 
    errors: string[]
  ): void {
    const value = process.env[envVar];
    if (value !== undefined) {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1') {
        setter(true);
      } else if (lowerValue === 'false' || lowerValue === '0') {
        setter(false);
      } else {
        errors.push(`${envVar}: "${value}" is not a valid boolean (use true/false or 1/0)`);
      }
    }
  }

  /**
   * Validate configuration values
   */
  private validateConfig(): void {
    const validationResult = this.validateConfigValues(this.config);
    if (!validationResult.success) {
      const errorMessages = validationResult.errors!.map(err => `${err.field}: ${err.message}`);
      throw new Error(`Configuration validation failed: ${errorMessages.join(', ')}`);
    }
  }

  /**
   * Validate configuration values and return detailed results
   */
  private validateConfigValues(config: DiscordResilienceConfig): ConfigUpdateResult {
    const errors: ConfigValidationError[] = [];
    const warnings: string[] = [];
    const { retry, timeout, cache } = config;

    // Validate retry configuration
    if (typeof retry.maxRetries !== 'number' || retry.maxRetries < 0 || retry.maxRetries > 10) {
      errors.push({
        field: 'retry.maxRetries',
        value: retry.maxRetries,
        message: 'must be a number between 0 and 10'
      });
    }

    if (typeof retry.baseDelay !== 'number' || retry.baseDelay < 100 || retry.baseDelay > 10000) {
      errors.push({
        field: 'retry.baseDelay',
        value: retry.baseDelay,
        message: 'must be a number between 100ms and 10s'
      });
    }

    if (typeof retry.maxDelay !== 'number' || retry.maxDelay < retry.baseDelay) {
      errors.push({
        field: 'retry.maxDelay',
        value: retry.maxDelay,
        message: 'must be a number greater than or equal to baseDelay'
      });
    }

    if (!Array.isArray(retry.retryableErrors)) {
      errors.push({
        field: 'retry.retryableErrors',
        value: retry.retryableErrors,
        message: 'must be an array of error codes'
      });
    }

    // Validate timeout configuration
    if (typeof timeout.defaultTimeout !== 'number' || timeout.defaultTimeout < 1000 || timeout.defaultTimeout > 300000) {
      errors.push({
        field: 'timeout.defaultTimeout',
        value: timeout.defaultTimeout,
        message: 'must be a number between 1s and 5m'
      });
    }

    if (typeof timeout.connectionTimeout !== 'number' || timeout.connectionTimeout < 1000 || timeout.connectionTimeout > 60000) {
      errors.push({
        field: 'timeout.connectionTimeout',
        value: timeout.connectionTimeout,
        message: 'must be a number between 1s and 1m'
      });
    }

    if (typeof timeout.readTimeout !== 'number' || timeout.readTimeout < 1000 || timeout.readTimeout > 300000) {
      errors.push({
        field: 'timeout.readTimeout',
        value: timeout.readTimeout,
        message: 'must be a number between 1s and 5m'
      });
    }

    if (typeof timeout.writeTimeout !== 'number' || timeout.writeTimeout < 1000 || timeout.writeTimeout > 300000) {
      errors.push({
        field: 'timeout.writeTimeout',
        value: timeout.writeTimeout,
        message: 'must be a number between 1s and 5m'
      });
    }

    // Validate cache configuration
    if (typeof cache.enabled !== 'boolean') {
      errors.push({
        field: 'cache.enabled',
        value: cache.enabled,
        message: 'must be a boolean'
      });
    }

    if (typeof cache.ttl !== 'number' || cache.ttl < 10000 || cache.ttl > 3600000) {
      errors.push({
        field: 'cache.ttl',
        value: cache.ttl,
        message: 'must be a number between 10s and 1h'
      });
    }

    if (typeof cache.staleWhileRevalidate !== 'boolean') {
      errors.push({
        field: 'cache.staleWhileRevalidate',
        value: cache.staleWhileRevalidate,
        message: 'must be a boolean'
      });
    }

    if (typeof cache.maxSize !== 'number' || cache.maxSize < 10 || cache.maxSize > 10000) {
      errors.push({
        field: 'cache.maxSize',
        value: cache.maxSize,
        message: 'must be a number between 10 and 10000'
      });
    }

    // Add warnings for potentially problematic configurations
    if (retry.maxRetries === 0) {
      warnings.push('Retry is disabled (maxRetries = 0), API failures will not be retried');
    }

    if (timeout.defaultTimeout > 30000) {
      warnings.push('Default timeout is very high (>30s), this may cause poor user experience');
    }

    if (cache.ttl < 60000) {
      warnings.push('Cache TTL is very low (<1m), this may cause excessive API calls');
    }

    if (cache.maxSize > 5000) {
      warnings.push('Cache max size is very high (>5000), this may consume significant memory');
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): DiscordResilienceConfig {
    return JSON.parse(JSON.stringify(this.config)); // Deep clone
  }

  /**
   * Get retry configuration
   */
  getRetryConfig(): RetryConfig {
    return { ...this.config.retry };
  }

  /**
   * Get timeout configuration
   */
  getTimeoutConfig(): TimeoutConfig {
    return { ...this.config.timeout };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<DiscordResilienceConfig>): ConfigUpdateResult {
    // Deep merge the updates with existing config
    const newConfig = {
      retry: { ...this.config.retry, ...(updates.retry || {}) },
      timeout: { ...this.config.timeout, ...(updates.timeout || {}) },
      cache: { ...this.config.cache, ...(updates.cache || {}) },
      logging: { ...this.config.logging, ...(updates.logging || {}) }
    };
    
    // Validate the new configuration
    const validationResult = this.validateConfigValues(newConfig);
    
    if (!validationResult.success) {
      logger.error('Configuration update validation failed', {
        updates,
        errors: validationResult.errors
      });
      return validationResult;
    }
    
    // Store old config for rollback
    const oldConfig = this.config;
    
    try {
      this.config = newConfig;
      
      logger.info('Discord API resilience configuration updated', {
        updates,
        newConfig: this.getSafeConfigForLogging(),
        warnings: validationResult.warnings
      });
      
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        logger.warn('Configuration update warnings', {
          warnings: validationResult.warnings
        });
      }
      
      return validationResult;
    } catch (error) {
      // Rollback on unexpected error
      this.config = oldConfig;
      logger.error('Failed to update configuration, rolled back', { error, updates });
      throw error;
    }
  }

  /**
   * Validate configuration without updating
   */
  validateConfigUpdate(updates: Partial<DiscordResilienceConfig>): ConfigUpdateResult {
    const newConfig = {
      retry: { ...this.config.retry, ...(updates.retry || {}) },
      timeout: { ...this.config.timeout, ...(updates.timeout || {}) },
      cache: { ...this.config.cache, ...(updates.cache || {}) },
      logging: { ...this.config.logging, ...(updates.logging || {}) }
    };
    
    return this.validateConfigValues(newConfig);
  }

  /**
   * Reset to default configuration
   */
  resetToDefaults(): void {
    this.config = this.loadDefaultConfig();
    logger.info('Discord API resilience configuration reset to defaults');
  }

  /**
   * Get safe configuration for logging (without sensitive data)
   */
  private getSafeConfigForLogging(): any {
    return {
      retry: {
        maxRetries: this.config.retry.maxRetries,
        baseDelay: this.config.retry.baseDelay,
        maxDelay: this.config.retry.maxDelay,
        retryableErrorsCount: this.config.retry.retryableErrors.length
      },
      timeout: this.config.timeout,
      cache: this.config.cache,
      logging: this.config.logging
    };
  }

  /**
   * Check if feature is enabled
   */
  isRetryEnabled(): boolean {
    return this.config.retry.maxRetries > 0;
  }

  isCacheEnabled(): boolean {
    return this.config.cache.enabled;
  }

  isLoggingEnabled(type: keyof DiscordResilienceConfig['logging']): boolean {
    return this.config.logging[type];
  }

  /**
   * Get configuration summary for monitoring/debugging
   */
  getConfigSummary(): {
    retryEnabled: boolean;
    cacheEnabled: boolean;
    maxRetries: number;
    defaultTimeout: number;
    cacheTtl: number;
    loggingEnabled: boolean;
  } {
    return {
      retryEnabled: this.isRetryEnabled(),
      cacheEnabled: this.isCacheEnabled(),
      maxRetries: this.config.retry.maxRetries,
      defaultTimeout: this.config.timeout.defaultTimeout,
      cacheTtl: this.config.cache.ttl,
      loggingEnabled: Object.values(this.config.logging).some(enabled => enabled)
    };
  }

  /**
   * Export configuration for backup/restore
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON string
   */
  importConfig(configJson: string): ConfigUpdateResult {
    try {
      const importedConfig = JSON.parse(configJson) as DiscordResilienceConfig;
      
      // Validate the imported configuration
      const validationResult = this.validateConfigValues(importedConfig);
      
      if (!validationResult.success) {
        logger.error('Imported configuration validation failed', {
          errors: validationResult.errors
        });
        return validationResult;
      }
      
      // Store old config for rollback
      const oldConfig = this.config;
      
      try {
        this.config = importedConfig;
        
        logger.info('Configuration imported successfully', {
          config: this.getSafeConfigForLogging(),
          warnings: validationResult.warnings
        });
        
        return validationResult;
      } catch (error) {
        // Rollback on unexpected error
        this.config = oldConfig;
        logger.error('Failed to import configuration, rolled back', { error });
        throw error;
      }
    } catch (error) {
      const parseError: ConfigValidationError = {
        field: 'configJson',
        value: configJson,
        message: 'Invalid JSON format'
      };
      
      return {
        success: false,
        errors: [parseError]
      };
    }
  }

  /**
   * Get environment variable names used by this configuration
   */
  getEnvironmentVariables(): string[] {
    return [
      'DISCORD_API_MAX_RETRIES',
      'DISCORD_API_BASE_DELAY',
      'DISCORD_API_MAX_DELAY',
      'DISCORD_API_TIMEOUT',
      'DISCORD_API_CONNECTION_TIMEOUT',
      'DISCORD_API_READ_TIMEOUT',
      'DISCORD_API_WRITE_TIMEOUT',
      'DISCORD_API_CACHE_ENABLED',
      'DISCORD_API_CACHE_TTL',
      'DISCORD_API_STALE_WHILE_REVALIDATE',
      'DISCORD_API_CACHE_MAX_SIZE',
      'DISCORD_API_LOG_REQUESTS',
      'DISCORD_API_LOG_RETRIES',
      'DISCORD_API_LOG_CACHE_HITS',
      'DISCORD_API_LOG_ERRORS'
    ];
  }

  /**
   * Get current environment variable values
   */
  getCurrentEnvironmentValues(): Record<string, string | undefined> {
    const envVars = this.getEnvironmentVariables();
    const result: Record<string, string | undefined> = {};
    
    for (const envVar of envVars) {
      result[envVar] = process.env[envVar];
    }
    
    return result;
  }
}