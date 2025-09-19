import { ErrorClassifier, ErrorCategory, ErrorSeverity } from '../ErrorClassifier';
import { logger } from '../../../utils/logger';

// Mock logger to avoid console output during tests
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ErrorClassifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('classify', () => {
    describe('HTTP response errors', () => {
      it('should classify 401 Unauthorized correctly', () => {
        const error = {
          response: {
            status: 401,
            statusText: 'Unauthorized',
            data: {},
            headers: {}
          }
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('UNAUTHORIZED');
        expect(classified.retryable).toBe(false);
        expect(classified.category).toBe(ErrorCategory.AUTHENTICATION);
        expect(classified.severity).toBe(ErrorSeverity.HIGH);
        expect(classified.statusCode).toBe(401);
      });

      it('should classify 403 Forbidden correctly', () => {
        const error = {
          response: {
            status: 403,
            statusText: 'Forbidden',
            data: {},
            headers: {}
          }
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('FORBIDDEN');
        expect(classified.retryable).toBe(false);
        expect(classified.category).toBe(ErrorCategory.AUTHORIZATION);
        expect(classified.severity).toBe(ErrorSeverity.HIGH);
      });

      it('should classify 429 Rate Limited correctly', () => {
        const error = {
          response: {
            status: 429,
            statusText: 'Too Many Requests',
            data: {},
            headers: { 'retry-after': '60' }
          }
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('RATE_LIMITED');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.RATE_LIMIT);
        expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
        expect(classified.retryAfter).toBe(60);
      });

      it('should classify 404 Not Found correctly', () => {
        const error = {
          response: {
            status: 404,
            statusText: 'Not Found',
            data: {},
            headers: {}
          }
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('HTTP_404');
        expect(classified.retryable).toBe(false);
        expect(classified.category).toBe(ErrorCategory.CLIENT_ERROR);
        expect(classified.severity).toBe(ErrorSeverity.LOW);
      });

      it('should classify 500 Internal Server Error correctly', () => {
        const error = {
          response: {
            status: 500,
            statusText: 'Internal Server Error',
            data: {},
            headers: {}
          }
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('HTTP_500');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.SERVER_ERROR);
        expect(classified.severity).toBe(ErrorSeverity.HIGH);
      });

      it('should classify 503 Service Unavailable correctly', () => {
        const error = {
          response: {
            status: 503,
            statusText: 'Service Unavailable',
            data: {},
            headers: {}
          }
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('HTTP_503');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.SERVER_ERROR);
        expect(classified.severity).toBe(ErrorSeverity.HIGH);
      });

      it('should extract Discord error information', () => {
        const error = {
          response: {
            status: 400,
            statusText: 'Bad Request',
            data: {
              code: 50001,
              message: 'Missing Access'
            },
            headers: {}
          }
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('DISCORD_50001');
        expect(classified.message).toBe('Missing Access');
      });

      it('should extract Discord error from errors array', () => {
        const error = {
          response: {
            status: 400,
            statusText: 'Bad Request',
            data: {
              errors: {
                field: {
                  _errors: [{
                    code: 'INVALID_VALUE',
                    message: 'Invalid field value'
                  }]
                }
              }
            },
            headers: {}
          }
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('INVALID_VALUE');
        expect(classified.message).toBe('Invalid field value');
      });
    });

    describe('Network errors', () => {
      it('should classify ECONNRESET correctly', () => {
        const error = {
          request: {},
          code: 'ECONNRESET',
          message: 'Connection reset by peer'
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('ECONNRESET');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.NETWORK);
        expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      });

      it('should classify ETIMEDOUT correctly', () => {
        const error = {
          request: {},
          code: 'ETIMEDOUT',
          message: 'Connection timed out'
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('ETIMEDOUT');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.TIMEOUT);
        expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      });

      it('should classify ECONNREFUSED correctly', () => {
        const error = {
          request: {},
          code: 'ECONNREFUSED',
          message: 'Connection refused'
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('ECONNREFUSED');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.NETWORK);
        expect(classified.severity).toBe(ErrorSeverity.HIGH);
      });

      it('should classify ENOTFOUND correctly', () => {
        const error = {
          request: {},
          code: 'ENOTFOUND',
          message: 'DNS lookup failed'
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('ENOTFOUND');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.NETWORK);
        expect(classified.severity).toBe(ErrorSeverity.HIGH);
      });

      it('should classify unknown network error as non-retryable', () => {
        const error = {
          request: {},
          code: 'UNKNOWN_NET_ERROR',
          message: 'Unknown network error'
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('UNKNOWN_NET_ERROR');
        expect(classified.retryable).toBe(false);
        expect(classified.category).toBe(ErrorCategory.NETWORK);
      });
    });

    describe('Generic errors', () => {
      it('should classify timeout errors correctly', () => {
        const error = new Error('Request timeout occurred');

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('TIMEOUT');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.TIMEOUT);
        expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      });

      it('should classify abort errors correctly', () => {
        const error = new Error('Request was aborted');

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('ABORTED');
        expect(classified.retryable).toBe(true);
        expect(classified.category).toBe(ErrorCategory.NETWORK);
        expect(classified.severity).toBe(ErrorSeverity.LOW);
      });

      it('should classify unknown errors correctly', () => {
        const error = new Error('Something went wrong');

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('UNKNOWN_ERROR');
        expect(classified.retryable).toBe(false);
        expect(classified.category).toBe(ErrorCategory.UNKNOWN);
        expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      });

      it('should handle errors with custom code', () => {
        const error = {
          code: 'CUSTOM_ERROR',
          message: 'Custom error message'
        };

        const classified = ErrorClassifier.classify(error);

        expect(classified.code).toBe('CUSTOM_ERROR');
        expect(classified.message).toBe('Custom error message');
      });
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable errors', () => {
      const retryableError = {
        response: { status: 503, statusText: 'Service Unavailable', headers: {} }
      };

      expect(ErrorClassifier.isRetryable(retryableError)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const nonRetryableError = {
        response: { status: 401, statusText: 'Unauthorized', headers: {} }
      };

      expect(ErrorClassifier.isRetryable(nonRetryableError)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should return retry delay from Retry-After header', () => {
      const error = {
        response: {
          status: 429,
          headers: { 'retry-after': '30' }
        }
      };

      expect(ErrorClassifier.getRetryDelay(error)).toBe(30);
    });

    it('should return undefined when no Retry-After header', () => {
      const error = {
        response: {
          status: 503,
          headers: {}
        }
      };

      expect(ErrorClassifier.getRetryDelay(error)).toBeUndefined();
    });
  });

  describe('logError', () => {
    it('should log critical errors with error level', () => {
      // Create a mock error that would be classified as critical
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error'
        }
      };

      // Mock the classify method to return critical severity
      const originalClassify = ErrorClassifier.classify;
      ErrorClassifier.classify = jest.fn().mockReturnValue({
        code: 'HTTP_500',
        message: 'Critical system failure',
        retryable: true,
        category: ErrorCategory.SERVER_ERROR,
        severity: ErrorSeverity.CRITICAL,
        statusCode: 500
      });

      ErrorClassifier.logError(error, 'test-operation');

      expect(logger.error).toHaveBeenCalledWith(
        'Critical error in test-operation',
        expect.objectContaining({
          context: 'test-operation',
          code: 'HTTP_500',
          severity: ErrorSeverity.CRITICAL
        })
      );

      // Restore original method
      ErrorClassifier.classify = originalClassify;
    });

    it('should log high severity errors with error level', () => {
      const error = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          headers: {}
        }
      };

      ErrorClassifier.logError(error, 'auth-operation');

      expect(logger.error).toHaveBeenCalledWith(
        'High severity error in auth-operation',
        expect.objectContaining({
          context: 'auth-operation',
          severity: ErrorSeverity.HIGH
        })
      );
    });

    it('should log medium severity errors with warn level', () => {
      const error = {
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          headers: {}
        }
      };

      ErrorClassifier.logError(error, 'rate-limit-test');

      expect(logger.warn).toHaveBeenCalledWith(
        'Medium severity error in rate-limit-test',
        expect.objectContaining({
          context: 'rate-limit-test',
          severity: ErrorSeverity.MEDIUM
        })
      );
    });

    it('should log low severity errors with info level', () => {
      const error = {
        response: {
          status: 404,
          statusText: 'Not Found',
          headers: {}
        }
      };

      ErrorClassifier.logError(error, 'fetch-operation');

      expect(logger.info).toHaveBeenCalledWith(
        'Low severity error in fetch-operation',
        expect.objectContaining({
          context: 'fetch-operation',
          severity: ErrorSeverity.LOW
        })
      );
    });

    it('should return classified error', () => {
      const error = {
        response: {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {}
        }
      };

      const result = ErrorClassifier.logError(error, 'test');

      expect(result).toMatchObject({
        code: 'HTTP_503',
        retryable: true,
        category: ErrorCategory.SERVER_ERROR,
        severity: ErrorSeverity.HIGH
      });
    });
  });
});