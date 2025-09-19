import { ResilienceConfigManager } from '../ResilienceConfig';
import { logger } from '../../../utils/logger';

// Mock logger to avoid console output during tests
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ResilienceConfigManager', () => {
  let configManager: ResilienceConfigManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Reset singleton instance
    (ResilienceConfigManager as any).instance = undefined;
    
    // Store original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables
    delete process.env.DISCORD_API_MAX_RETRIES;
    delete process.env.DISCORD_API_BASE_DELAY;
    delete process.env.DISCORD_API_MAX_DELAY;
    delete process.env.DISCORD_API_TIMEOUT;
    delete process.env.DISCORD_API_CONNECTION_TIMEOUT;
    delete process.env.DISCORD_API_READ_TIMEOUT;
    delete process.env.DISCORD_API_WRITE_TIMEOUT;
    delete process.env.DISCORD_API_CACHE_ENABLED;
    delete process.env.DISCORD_API_CACHE_TTL;
    delete process.env.DISCORD_API_STALE_WHILE_REVALIDATE;
    delete process.env.DISCORD_API_CACHE_MAX_SIZE;
    delete process.env.DISCORD_API_LOG_REQUESTS;
    delete process.env.DISCORD_API_LOG_RETRIES;
    delete process.env.DISCORD_API_LOG_CACHE_HITS;
    delete process.env.DISCORD_API_LOG_ERRORS;
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = ResilienceConfigManager.getInstance();
      const instance2 = ResilienceConfigManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('default configuration', () => {
    beforeEach(() => {
      configManager = ResilienceConfigManager.getInstance();
    });

    it('should load default retry configuration', () => {
      const retryConfig = configManager.getRetryConfig();
      
      expect(retryConfig.maxRetries).toBe(3);
      expect(retryConfig.baseDelay).toBe(1000);
      expect(retryConfig.maxDelay).toBe(10000);
      expect(retryConfig.retryableErrors).toContain('ECONNRESET');
      expect(retryConfig.retryableErrors).toContain('ETIMEDOUT');
    });

    it('should load default timeout configuration', () => {
      const timeoutConfig = configManager.getTimeoutConfig();
      
      expect(timeoutConfig.defaultTimeout).toBe(10000);
      expect(timeoutConfig.connectionTimeout).toBe(5000);
      expect(timeoutConfig.readTimeout).toBe(15000);
      expect(timeoutConfig.writeTimeout).toBe(10000);
    });

    it('should load default cache configuration', () => {
      const config = configManager.getConfig();
      
      expect(config.cache.enabled).toBe(true);
      expect(config.cache.ttl).toBe(300000);
      expect(config.cache.staleWhileRevalidate).toBe(true);
      expect(config.cache.maxSize).toBe(1000);
    });

    it('should load default logging configuration', () => {
      const config = configManager.getConfig();
      
      expect(config.logging.logRequests).toBe(true);
      expect(config.logging.logRetries).toBe(true);
      expect(config.logging.logCacheHits).toBe(false);
      expect(config.logging.logErrors).toBe(true);
    });
  });

  describe('environment configuration', () => {
    it('should load retry configuration from environment', () => {
      process.env.DISCORD_API_MAX_RETRIES = '5';
      process.env.DISCORD_API_BASE_DELAY = '2000';
      process.env.DISCORD_API_MAX_DELAY = '20000';
      
      configManager = ResilienceConfigManager.getInstance();
      const retryConfig = configManager.getRetryConfig();
      
      expect(retryConfig.maxRetries).toBe(5);
      expect(retryConfig.baseDelay).toBe(2000);
      expect(retryConfig.maxDelay).toBe(20000);
    });

    it('should load timeout configuration from environment', () => {
      process.env.DISCORD_API_TIMEOUT = '15000';
      process.env.DISCORD_API_CONNECTION_TIMEOUT = '8000';
      process.env.DISCORD_API_READ_TIMEOUT = '20000';
      process.env.DISCORD_API_WRITE_TIMEOUT = '12000';
      
      configManager = ResilienceConfigManager.getInstance();
      const timeoutConfig = configManager.getTimeoutConfig();
      
      expect(timeoutConfig.defaultTimeout).toBe(15000);
      expect(timeoutConfig.connectionTimeout).toBe(8000);
      expect(timeoutConfig.readTimeout).toBe(20000);
      expect(timeoutConfig.writeTimeout).toBe(12000);
    });

    it('should load cache configuration from environment', () => {
      process.env.DISCORD_API_CACHE_ENABLED = 'false';
      process.env.DISCORD_API_CACHE_TTL = '600000';
      process.env.DISCORD_API_STALE_WHILE_REVALIDATE = 'false';
      process.env.DISCORD_API_CACHE_MAX_SIZE = '2000';
      
      configManager = ResilienceConfigManager.getInstance();
      const config = configManager.getConfig();
      
      expect(config.cache.enabled).toBe(false);
      expect(config.cache.ttl).toBe(600000);
      expect(config.cache.staleWhileRevalidate).toBe(false);
      expect(config.cache.maxSize).toBe(2000);
    });

    it('should load logging configuration from environment', () => {
      process.env.DISCORD_API_LOG_REQUESTS = 'false';
      process.env.DISCORD_API_LOG_RETRIES = 'false';
      process.env.DISCORD_API_LOG_CACHE_HITS = 'true';
      process.env.DISCORD_API_LOG_ERRORS = 'false';
      
      configManager = ResilienceConfigManager.getInstance();
      const config = configManager.getConfig();
      
      expect(config.logging.logRequests).toBe(false);
      expect(config.logging.logRetries).toBe(false);
      expect(config.logging.logCacheHits).toBe(true);
      expect(config.logging.logErrors).toBe(false);
    });

    it('should log successful environment configuration load', () => {
      process.env.DISCORD_API_MAX_RETRIES = '5';
      
      configManager = ResilienceConfigManager.getInstance();
      
      expect(logger.info).toHaveBeenCalledWith(
        'Discord API resilience configuration loaded',
        expect.objectContaining({
          source: 'environment'
        })
      );
    });

    it('should handle invalid environment values gracefully', () => {
      process.env.DISCORD_API_MAX_RETRIES = 'invalid';
      
      configManager = ResilienceConfigManager.getInstance();
      
      // Should fall back to default value
      expect(configManager.getRetryConfig().maxRetries).toBe(3);
    });
  });

  describe('configuration validation', () => {
    beforeEach(() => {
      configManager = ResilienceConfigManager.getInstance();
    });

    it('should validate retry configuration', () => {
      const result1 = configManager.updateConfig({
        retry: {
          maxRetries: -1,
          baseDelay: 1000,
          maxDelay: 10000,
          retryableErrors: []
        }
      });
      
      expect(result1.success).toBe(false);
      expect(result1.errors![0].field).toBe('retry.maxRetries');
      expect(result1.errors![0].message).toContain('must be a number between 0 and 10');

      const result2 = configManager.updateConfig({
        retry: {
          maxRetries: 15,
          baseDelay: 1000,
          maxDelay: 10000,
          retryableErrors: []
        }
      });
      
      expect(result2.success).toBe(false);
      expect(result2.errors![0].field).toBe('retry.maxRetries');
      expect(result2.errors![0].message).toContain('must be a number between 0 and 10');
    });

    it('should validate base delay', () => {
      const result1 = configManager.updateConfig({
        retry: {
          maxRetries: 3,
          baseDelay: 50,
          maxDelay: 10000,
          retryableErrors: []
        }
      });
      
      expect(result1.success).toBe(false);
      expect(result1.errors![0].field).toBe('retry.baseDelay');
      expect(result1.errors![0].message).toContain('must be a number between 100ms and 10s');

      const result2 = configManager.updateConfig({
        retry: {
          maxRetries: 3,
          baseDelay: 15000,
          maxDelay: 20000,
          retryableErrors: []
        }
      });
      
      expect(result2.success).toBe(false);
      expect(result2.errors![0].field).toBe('retry.baseDelay');
      expect(result2.errors![0].message).toContain('must be a number between 100ms and 10s');
    });

    it('should validate max delay relative to base delay', () => {
      const result = configManager.updateConfig({
        retry: {
          maxRetries: 3,
          baseDelay: 5000,
          maxDelay: 2000,
          retryableErrors: []
        }
      });
      
      expect(result.success).toBe(false);
      expect(result.errors![0].field).toBe('retry.maxDelay');
      expect(result.errors![0].message).toContain('must be a number greater than or equal to baseDelay');
    });

    it('should validate timeout configuration', () => {
      const result1 = configManager.updateConfig({
        timeout: {
          defaultTimeout: 500,
          connectionTimeout: 5000,
          readTimeout: 15000,
          writeTimeout: 10000
        }
      });
      
      expect(result1.success).toBe(false);
      expect(result1.errors![0].field).toBe('timeout.defaultTimeout');
      expect(result1.errors![0].message).toContain('must be a number between 1s and 5m');

      const result2 = configManager.updateConfig({
        timeout: {
          defaultTimeout: 400000,
          connectionTimeout: 5000,
          readTimeout: 15000,
          writeTimeout: 10000
        }
      });
      
      expect(result2.success).toBe(false);
      expect(result2.errors![0].field).toBe('timeout.defaultTimeout');
      expect(result2.errors![0].message).toContain('must be a number between 1s and 5m');
    });

    it('should validate cache configuration', () => {
      const result1 = configManager.updateConfig({
        cache: {
          enabled: true,
          ttl: 5000,
          staleWhileRevalidate: true,
          maxSize: 1000
        }
      });
      
      expect(result1.success).toBe(false);
      expect(result1.errors![0].field).toBe('cache.ttl');
      expect(result1.errors![0].message).toContain('must be a number between 10s and 1h');

      const result2 = configManager.updateConfig({
        cache: {
          enabled: true,
          ttl: 300000,
          staleWhileRevalidate: true,
          maxSize: 5
        }
      });
      
      expect(result2.success).toBe(false);
      expect(result2.errors![0].field).toBe('cache.maxSize');
      expect(result2.errors![0].message).toContain('must be a number between 10 and 10000');
    });
  });

  describe('runtime configuration updates', () => {
    beforeEach(() => {
      configManager = ResilienceConfigManager.getInstance();
    });

    it('should update configuration successfully', () => {
      const updates = {
        retry: {
          maxRetries: 5,
          baseDelay: 2000,
          maxDelay: 15000,
          retryableErrors: ['ECONNRESET']
        }
      };

      const result = configManager.updateConfig(updates);
      
      expect(result.success).toBe(true);
      const config = configManager.getConfig();
      expect(config.retry.maxRetries).toBe(5);
      expect(config.retry.baseDelay).toBe(2000);
    });

    it('should return validation errors for invalid updates', () => {
      const updates = {
        retry: { maxRetries: -1, baseDelay: 1000, maxDelay: 10000, retryableErrors: [] }
      };
      
      const result = configManager.updateConfig(updates);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].field).toBe('retry.maxRetries');
    });

    it('should return warnings for potentially problematic configurations', () => {
      const updates = {
        retry: { maxRetries: 0, baseDelay: 1000, maxDelay: 10000, retryableErrors: [] }
      };
      
      const result = configManager.updateConfig(updates);
      
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('Retry is disabled');
    });

    it('should validate configuration without updating', () => {
      const updates = {
        retry: { maxRetries: -1, baseDelay: 1000, maxDelay: 10000, retryableErrors: [] }
      };
      
      const result = configManager.validateConfigUpdate(updates);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      
      // Original config should be unchanged
      const config = configManager.getConfig();
      expect(config.retry.maxRetries).toBe(3);
    });

    it('should log successful configuration update', () => {
      const updates = { retry: { maxRetries: 5 } };
      
      configManager.updateConfig(updates);
      
      expect(logger.info).toHaveBeenCalledWith(
        'Discord API resilience configuration updated',
        expect.objectContaining({ updates })
      );
    });
  });

  describe('configuration queries', () => {
    beforeEach(() => {
      configManager = ResilienceConfigManager.getInstance();
    });

    it('should return deep clone of configuration', () => {
      const config1 = configManager.getConfig();
      const config2 = configManager.getConfig();
      
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
      
      // Modify one config and ensure the other is unchanged
      config1.retry.maxRetries = 999;
      expect(config2.retry.maxRetries).not.toBe(999);
    });

    it('should check if retry is enabled', () => {
      expect(configManager.isRetryEnabled()).toBe(true);
      
      configManager.updateConfig({
        retry: { maxRetries: 0, baseDelay: 1000, maxDelay: 10000, retryableErrors: [] }
      });
      
      expect(configManager.isRetryEnabled()).toBe(false);
    });

    it('should check if cache is enabled', () => {
      expect(configManager.isCacheEnabled()).toBe(true);
      
      configManager.updateConfig({
        cache: { enabled: false, ttl: 300000, staleWhileRevalidate: true, maxSize: 1000 }
      });
      
      expect(configManager.isCacheEnabled()).toBe(false);
    });

    it('should check if logging is enabled for different types', () => {
      expect(configManager.isLoggingEnabled('logRequests')).toBe(true);
      expect(configManager.isLoggingEnabled('logCacheHits')).toBe(false);
      
      configManager.updateConfig({
        logging: { logRequests: false, logRetries: true, logCacheHits: true, logErrors: true }
      });
      
      expect(configManager.isLoggingEnabled('logRequests')).toBe(false);
      expect(configManager.isLoggingEnabled('logCacheHits')).toBe(true);
    });
  });

  describe('enhanced environment variable parsing', () => {
    it('should handle invalid integer environment variables', () => {
      process.env.DISCORD_API_MAX_RETRIES = 'invalid';
      process.env.DISCORD_API_BASE_DELAY = '2000';
      
      configManager = ResilienceConfigManager.getInstance();
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Environment variable parsing errors, using defaults for invalid values',
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.stringContaining('DISCORD_API_MAX_RETRIES')
          ])
        })
      );
      
      // Should use default for invalid value
      expect(configManager.getRetryConfig().maxRetries).toBe(3);
      // Should use parsed value for valid value
      expect(configManager.getRetryConfig().baseDelay).toBe(2000);
    });

    it('should handle invalid boolean environment variables', () => {
      process.env.DISCORD_API_CACHE_ENABLED = 'maybe';
      process.env.DISCORD_API_LOG_REQUESTS = 'false';
      
      configManager = ResilienceConfigManager.getInstance();
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Environment variable parsing errors, using defaults for invalid values',
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.stringContaining('DISCORD_API_CACHE_ENABLED')
          ])
        })
      );
      
      // Should use default for invalid value
      expect(configManager.getConfig().cache.enabled).toBe(true);
      // Should use parsed value for valid value
      expect(configManager.getConfig().logging.logRequests).toBe(false);
    });

    it('should accept various boolean formats', () => {
      process.env.DISCORD_API_CACHE_ENABLED = '1';
      process.env.DISCORD_API_LOG_REQUESTS = '0';
      process.env.DISCORD_API_LOG_RETRIES = 'TRUE';
      process.env.DISCORD_API_LOG_ERRORS = 'False';
      
      configManager = ResilienceConfigManager.getInstance();
      const config = configManager.getConfig();
      
      expect(config.cache.enabled).toBe(true);
      expect(config.logging.logRequests).toBe(false);
      expect(config.logging.logRetries).toBe(true);
      expect(config.logging.logErrors).toBe(false);
    });
  });

  describe('configuration utilities', () => {
    beforeEach(() => {
      configManager = ResilienceConfigManager.getInstance();
    });

    it('should provide configuration summary', () => {
      const summary = configManager.getConfigSummary();
      
      expect(summary).toEqual({
        retryEnabled: true,
        cacheEnabled: true,
        maxRetries: 3,
        defaultTimeout: 10000,
        cacheTtl: 300000,
        loggingEnabled: true
      });
    });

    it('should export configuration as JSON', () => {
      const exported = configManager.exportConfig();
      const parsed = JSON.parse(exported);
      
      expect(parsed.retry.maxRetries).toBe(3);
      expect(parsed.cache.enabled).toBe(true);
    });

    it('should import valid configuration', () => {
      const configJson = JSON.stringify({
        retry: { maxRetries: 5, baseDelay: 2000, maxDelay: 15000, retryableErrors: [] },
        timeout: { defaultTimeout: 15000, connectionTimeout: 8000, readTimeout: 20000, writeTimeout: 12000 },
        cache: { enabled: false, ttl: 600000, staleWhileRevalidate: false, maxSize: 2000 },
        logging: { logRequests: false, logRetries: false, logCacheHits: true, logErrors: true }
      });
      
      const result = configManager.importConfig(configJson);
      
      expect(result.success).toBe(true);
      const config = configManager.getConfig();
      expect(config.retry.maxRetries).toBe(5);
      expect(config.cache.enabled).toBe(false);
    });

    it('should reject invalid JSON during import', () => {
      const result = configManager.importConfig('invalid json');
      
      expect(result.success).toBe(false);
      expect(result.errors![0].field).toBe('configJson');
      expect(result.errors![0].message).toBe('Invalid JSON format');
    });

    it('should reject invalid configuration during import', () => {
      const configJson = JSON.stringify({
        retry: { maxRetries: -1, baseDelay: 1000, maxDelay: 10000, retryableErrors: [] },
        timeout: { defaultTimeout: 10000, connectionTimeout: 5000, readTimeout: 15000, writeTimeout: 10000 },
        cache: { enabled: true, ttl: 300000, staleWhileRevalidate: true, maxSize: 1000 },
        logging: { logRequests: true, logRetries: true, logCacheHits: false, logErrors: true }
      });
      
      const result = configManager.importConfig(configJson);
      
      expect(result.success).toBe(false);
      expect(result.errors![0].field).toBe('retry.maxRetries');
    });

    it('should list environment variables', () => {
      const envVars = configManager.getEnvironmentVariables();
      
      expect(envVars).toContain('DISCORD_API_MAX_RETRIES');
      expect(envVars).toContain('DISCORD_API_TIMEOUT');
      expect(envVars).toContain('DISCORD_API_CACHE_ENABLED');
      expect(envVars).toContain('DISCORD_API_LOG_REQUESTS');
    });

    it('should get current environment values', () => {
      process.env.DISCORD_API_MAX_RETRIES = '5';
      process.env.DISCORD_API_CACHE_ENABLED = 'false';
      
      const envValues = configManager.getCurrentEnvironmentValues();
      
      expect(envValues.DISCORD_API_MAX_RETRIES).toBe('5');
      expect(envValues.DISCORD_API_CACHE_ENABLED).toBe('false');
    });
  });

  describe('resetToDefaults', () => {
    beforeEach(() => {
      configManager = ResilienceConfigManager.getInstance();
    });

    it('should reset configuration to defaults', () => {
      // Modify configuration
      configManager.updateConfig({
        retry: { maxRetries: 5, baseDelay: 2000, maxDelay: 15000, retryableErrors: [] }
      });
      
      // Reset to defaults
      configManager.resetToDefaults();
      
      const config = configManager.getConfig();
      expect(config.retry.maxRetries).toBe(3);
      expect(config.retry.baseDelay).toBe(1000);
    });

    it('should log reset action', () => {
      configManager.resetToDefaults();
      
      expect(logger.info).toHaveBeenCalledWith(
        'Discord API resilience configuration reset to defaults'
      );
    });
  });
});