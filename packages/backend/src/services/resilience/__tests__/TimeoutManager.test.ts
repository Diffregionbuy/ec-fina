import { TimeoutManager, TimeoutError, withTimeout, createTimeoutPromise } from '../TimeoutManager';
import { logger } from '../../../utils/logger';

// Mock logger to avoid console output during tests
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TimeoutManager', () => {
  let timeoutManager: TimeoutManager;

  beforeEach(() => {
    const config = {
      defaultTimeout: 1000,
      connectionTimeout: 500,
      readTimeout: 1500,
      writeTimeout: 1000
    };
    timeoutManager = new TimeoutManager(config);
    jest.clearAllMocks();
  });

  describe('createTimeoutController', () => {
    it('should create AbortController with default timeout', () => {
      const controller = timeoutManager.createTimeoutController();
      
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });

    it('should create AbortController with custom timeout', () => {
      const controller = timeoutManager.createTimeoutController(2000);
      
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });

    it('should abort after timeout', async () => {
      const controller = timeoutManager.createTimeoutController(100);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(controller.signal.aborted).toBe(true);
    });

    it('should log timeout warning', async () => {
      timeoutManager.createTimeoutController(50);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Operation timed out',
        { timeoutMs: 50 }
      );
    });
  });

  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 100));
      
      const result = await timeoutManager.withTimeout(promise, { timeout: 500 });
      
      expect(result).toBe('success');
    });

    it('should reject with TimeoutError when promise takes too long', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 500));
      
      await expect(
        timeoutManager.withTimeout(promise, { timeout: 100 })
      ).rejects.toThrow(TimeoutError);
    });

    it('should use custom timeout message', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 500));
      const customMessage = 'Custom timeout message';
      
      await expect(
        timeoutManager.withTimeout(promise, { 
          timeout: 100, 
          timeoutMessage: customMessage 
        })
      ).rejects.toThrow(customMessage);
    });

    it('should use external AbortSignal', async () => {
      const controller = new AbortController();
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 500));
      
      setTimeout(() => controller.abort(), 100);
      
      await expect(
        timeoutManager.withTimeout(promise, { signal: controller.signal })
      ).rejects.toThrow(TimeoutError);
    });

    it('should reject immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 100));
      
      await expect(
        timeoutManager.withTimeout(promise, { signal: controller.signal })
      ).rejects.toThrow(TimeoutError);
    });

    it('should propagate original error when promise rejects', async () => {
      const originalError = new Error('Original error');
      const promise = Promise.reject(originalError);
      
      await expect(
        timeoutManager.withTimeout(promise, { timeout: 500 })
      ).rejects.toThrow('Original error');
    });
  });

  describe('createAxiosTimeoutConfig', () => {
    it('should create config with default timeout', () => {
      const config = timeoutManager.createAxiosTimeoutConfig();
      
      expect(config.timeout).toBe(1000);
      expect(config.signal).toBeUndefined();
    });

    it('should create config with custom timeout', () => {
      const config = timeoutManager.createAxiosTimeoutConfig({ timeout: 2000 });
      
      expect(config.timeout).toBe(2000);
    });

    it('should include signal when provided', () => {
      const controller = new AbortController();
      const config = timeoutManager.createAxiosTimeoutConfig({ signal: controller.signal });
      
      expect(config.signal).toBe(controller.signal);
    });
  });

  describe('createFetchTimeoutConfig', () => {
    it('should create config with timeout signal', () => {
      const config = timeoutManager.createFetchTimeoutConfig();
      
      expect(config.signal).toBeInstanceOf(AbortSignal);
    });

    it('should use provided signal', () => {
      const controller = new AbortController();
      const config = timeoutManager.createFetchTimeoutConfig({ signal: controller.signal });
      
      expect(config.signal).toBe(controller.signal);
    });
  });

  describe('validateTimeout', () => {
    it('should accept valid timeout values', () => {
      expect(() => TimeoutManager.validateTimeout(1000)).not.toThrow();
      expect(() => TimeoutManager.validateTimeout(5000)).not.toThrow();
    });

    it('should reject zero or negative timeouts', () => {
      expect(() => TimeoutManager.validateTimeout(0)).toThrow('Timeout must be greater than 0');
      expect(() => TimeoutManager.validateTimeout(-1000)).toThrow('Timeout must be greater than 0');
    });

    it('should warn about very high timeouts', () => {
      TimeoutManager.validateTimeout(400000);
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Timeout is very high',
        { timeout: 400000 }
      );
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = { defaultTimeout: 2000, connectionTimeout: 1000 };
      
      timeoutManager.updateConfig(newConfig);
      
      const config = timeoutManager.getConfig();
      expect(config.defaultTimeout).toBe(2000);
      expect(config.connectionTimeout).toBe(1000);
      expect(config.readTimeout).toBe(1500); // Should preserve unchanged values
    });

    it('should validate new timeout values', () => {
      expect(() => {
        timeoutManager.updateConfig({ defaultTimeout: -1000 });
      }).toThrow('Timeout must be greater than 0');
    });

    it('should log configuration update', () => {
      timeoutManager.updateConfig({ defaultTimeout: 2000 });
      
      expect(logger.info).toHaveBeenCalledWith(
        'TimeoutManager configuration updated',
        expect.objectContaining({
          config: expect.objectContaining({ defaultTimeout: 2000 })
        })
      );
    });
  });

  describe('getTimeoutForOperation', () => {
    it('should return appropriate timeout for different operations', () => {
      expect(timeoutManager.getTimeoutForOperation('api')).toBe(1000);
      expect(timeoutManager.getTimeoutForOperation('database')).toBe(1000);
      expect(timeoutManager.getTimeoutForOperation('file')).toBe(1500);
      expect(timeoutManager.getTimeoutForOperation('network')).toBe(500);
    });

    it('should cap database timeout at 30 seconds', () => {
      timeoutManager.updateConfig({ defaultTimeout: 60000 });
      
      expect(timeoutManager.getTimeoutForOperation('database')).toBe(30000);
    });

    it('should return default timeout for unknown operation types', () => {
      expect(timeoutManager.getTimeoutForOperation('unknown' as any)).toBe(1000);
    });
  });
});

describe('TimeoutError', () => {
  it('should create error with default message', () => {
    const error = new TimeoutError();
    
    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('Operation timed out');
  });

  it('should create error with custom message', () => {
    const error = new TimeoutError('Custom timeout message');
    
    expect(error.message).toBe('Custom timeout message');
  });

  it('should maintain proper stack trace', () => {
    const error = new TimeoutError();
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('TimeoutError');
  });
});

describe('utility functions', () => {
  describe('createTimeoutPromise', () => {
    it('should create promise that rejects after timeout', async () => {
      const timeoutPromise = createTimeoutPromise(100);
      
      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
    });

    it('should use custom message', async () => {
      const timeoutPromise = createTimeoutPromise(100, 'Custom message');
      
      await expect(timeoutPromise).rejects.toThrow('Custom message');
    });
  });

  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 50));
      
      const result = await withTimeout(promise, 200);
      
      expect(result).toBe('success');
    });

    it('should reject with TimeoutError when promise takes too long', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 200));
      
      await expect(withTimeout(promise, 50)).rejects.toThrow(TimeoutError);
    });

    it('should use custom timeout message', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 200));
      
      await expect(
        withTimeout(promise, 50, 'Custom timeout')
      ).rejects.toThrow('Custom timeout');
    });
  });
});