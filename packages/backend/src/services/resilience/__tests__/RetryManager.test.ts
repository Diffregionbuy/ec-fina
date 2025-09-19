import { RetryManager, RetryConfig, ApiError } from '../RetryManager';
import { logger } from '../../../utils/logger';

// Mock logger to avoid console output during tests
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let mockConfig: RetryConfig;

  beforeEach(() => {
    mockConfig = {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']
    };
    retryManager = new RetryManager(mockConfig);
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await retryManager.execute(mockOperation, 'test-operation');
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors and eventually succeed', async () => {
      const mockError = {
        response: { status: 503, statusText: 'Service Unavailable', headers: {} }
      };
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValue('success');
      
      const result = await retryManager.execute(mockOperation, 'test-operation');
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(3);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting all retries', async () => {
      const mockError = {
        response: { status: 503, statusText: 'Service Unavailable', headers: {} }
      };
      const mockOperation = jest.fn().mockRejectedValue(mockError);
      
      const result = await retryManager.execute(mockOperation, 'test-operation');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(4); // Initial attempt + 3 retries
      expect(mockOperation).toHaveBeenCalledTimes(4);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockError = {
        response: { status: 401, statusText: 'Unauthorized', headers: {} }
      };
      const mockOperation = jest.fn().mockRejectedValue(mockError);
      
      const result = await retryManager.execute(mockOperation, 'test-operation');
      
      expect(result.success).toBe(false);
      expect(result.error?.retryable).toBe(false);
      expect(result.attempts).toBe(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should respect Retry-After header', async () => {
      const mockError = {
        response: { 
          status: 429, 
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '2' }
        }
      };
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      const result = await retryManager.execute(mockOperation, 'test-operation');
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(endTime - startTime).toBeGreaterThanOrEqual(2000); // Should wait at least 2 seconds
    });

    it('should handle network errors correctly', async () => {
      const mockError = {
        code: 'ECONNRESET',
        message: 'Connection reset by peer'
      };
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValue('success');
      
      const result = await retryManager.execute(mockOperation, 'test-operation');
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should handle timeout errors', async () => {
      const mockError = new Error('Request timeout');
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValue('success');
      
      const result = await retryManager.execute(mockOperation, 'test-operation');
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });
  });

  describe('calculateDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      // Access private method through type assertion for testing
      const calculateDelay = (retryManager as any).calculateDelay.bind(retryManager);
      
      const delay0 = calculateDelay(0);
      const delay1 = calculateDelay(1);
      const delay2 = calculateDelay(2);
      
      expect(delay0).toBeGreaterThanOrEqual(75); // 100 * 1 with jitter
      expect(delay0).toBeLessThanOrEqual(125);
      
      expect(delay1).toBeGreaterThanOrEqual(150); // 100 * 2 with jitter
      expect(delay1).toBeLessThanOrEqual(250);
      
      expect(delay2).toBeGreaterThanOrEqual(300); // 100 * 4 with jitter
      expect(delay2).toBeLessThanOrEqual(500);
    });

    it('should respect maxDelay', () => {
      const calculateDelay = (retryManager as any).calculateDelay.bind(retryManager);
      
      const delay = calculateDelay(10); // Very high attempt number
      
      expect(delay).toBeLessThanOrEqual(mockConfig.maxDelay);
    });

    it('should use retryAfter when provided', () => {
      const calculateDelay = (retryManager as any).calculateDelay.bind(retryManager);
      
      const delay = calculateDelay(0, 5); // 5 seconds retry-after
      
      expect(delay).toBe(5000); // Should be exactly 5 seconds in ms
    });
  });

  describe('classifyError', () => {
    it('should classify HTTP errors correctly', () => {
      const classifyError = (retryManager as any).classifyError.bind(retryManager);
      
      const httpError = {
        response: { status: 503, statusText: 'Service Unavailable', headers: {} }
      };
      
      const classified = classifyError(httpError);
      
      expect(classified.code).toBe('HTTP_503');
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(503);
    });

    it('should classify network errors correctly', () => {
      const classifyError = (retryManager as any).classifyError.bind(retryManager);
      
      const networkError = {
        code: 'ECONNRESET',
        message: 'Connection reset'
      };
      
      const classified = classifyError(networkError);
      
      expect(classified.code).toBe('ECONNRESET');
      expect(classified.retryable).toBe(true);
    });

    it('should classify timeout errors correctly', () => {
      const classifyError = (retryManager as any).classifyError.bind(retryManager);
      
      const timeoutError = new Error('Request timeout occurred');
      
      const classified = classifyError(timeoutError);
      
      expect(classified.code).toBe('TIMEOUT');
      expect(classified.retryable).toBe(true);
    });

    it('should classify unknown errors as non-retryable', () => {
      const classifyError = (retryManager as any).classifyError.bind(retryManager);
      
      const unknownError = new Error('Something went wrong');
      
      const classified = classifyError(unknownError);
      
      expect(classified.code).toBe('UNKNOWN_ERROR');
      expect(classified.retryable).toBe(false);
    });
  });

  describe('isRetryableStatusCode', () => {
    it('should identify retryable status codes', () => {
      const isRetryableStatusCode = (retryManager as any).isRetryableStatusCode.bind(retryManager);
      
      expect(isRetryableStatusCode(500)).toBe(true);
      expect(isRetryableStatusCode(502)).toBe(true);
      expect(isRetryableStatusCode(503)).toBe(true);
      expect(isRetryableStatusCode(504)).toBe(true);
      expect(isRetryableStatusCode(429)).toBe(true);
      expect(isRetryableStatusCode(408)).toBe(true);
    });

    it('should identify non-retryable status codes', () => {
      const isRetryableStatusCode = (retryManager as any).isRetryableStatusCode.bind(retryManager);
      
      expect(isRetryableStatusCode(400)).toBe(false);
      expect(isRetryableStatusCode(401)).toBe(false);
      expect(isRetryableStatusCode(403)).toBe(false);
      expect(isRetryableStatusCode(404)).toBe(false);
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      const newConfig = { maxRetries: 5, baseDelay: 200 };
      
      retryManager.updateConfig(newConfig);
      
      const config = retryManager.getConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.baseDelay).toBe(200);
      expect(config.maxDelay).toBe(mockConfig.maxDelay); // Should preserve unchanged values
    });

    it('should return a copy of configuration', () => {
      const config1 = retryManager.getConfig();
      const config2 = retryManager.getConfig();
      
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });
  });

  describe('logging', () => {
    it('should log successful operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      await retryManager.execute(mockOperation, 'test-operation');
      
      expect(logger.info).toHaveBeenCalledWith(
        'Executing test-operation',
        expect.objectContaining({ attempt: 1, maxRetries: 4 })
      );
    });

    it('should log retry attempts', async () => {
      const mockError = {
        response: { status: 503, statusText: 'Service Unavailable', headers: {} }
      };
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValue('success');
      
      await retryManager.execute(mockOperation, 'test-operation');
      
      expect(logger.warn).toHaveBeenCalledWith(
        'test-operation failed',
        expect.objectContaining({
          attempt: 1,
          retryable: true
        })
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        'test-operation succeeded after retries',
        expect.objectContaining({
          attempts: 2,
          recovered: true
        })
      );
    });

    it('should log final failure', async () => {
      const mockError = {
        response: { status: 503, statusText: 'Service Unavailable', headers: {} }
      };
      const mockOperation = jest.fn().mockRejectedValue(mockError);
      
      await retryManager.execute(mockOperation, 'test-operation');
      
      expect(logger.error).toHaveBeenCalledWith(
        'test-operation failed after all retries exhausted',
        expect.objectContaining({
          totalAttempts: 4,
          maxRetries: 4
        })
      );
    });
  });
});