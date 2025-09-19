import { RateLimitManager, RateLimitInfo, RateLimitState } from '../RateLimitManager';
import { logger } from '../../../utils/logger';

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('RateLimitManager', () => {
  let rateLimitManager: RateLimitManager;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeEach(() => {
    rateLimitManager = new RateLimitManager();
    mockLogger = logger as jest.Mocked<typeof logger>;
    jest.clearAllMocks();
    
    // Mock Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1000000); // Fixed timestamp
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseRateLimitHeaders', () => {
    it('should parse complete Discord rate limit headers', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '3',
        'x-ratelimit-reset': '1609459200.123',
        'x-ratelimit-reset-after': '30.5',
        'x-ratelimit-bucket': 'user-guilds',
        'x-ratelimit-global': 'false'
      };

      const result = rateLimitManager.parseRateLimitHeaders(headers);

      expect(result).toEqual({
        limit: 5,
        remaining: 3,
        reset: 1609459200.123,
        resetAfter: 30.5,
        bucket: 'user-guilds',
        global: false
      });
    });

    it('should parse headers with Retry-After for 429 responses', () => {
      const headers = {
        'retry-after': '60'
      };

      const result = rateLimitManager.parseRateLimitHeaders(headers);

      expect(result).toEqual({
        limit: 0,
        remaining: 0,
        reset: 0,
        resetAfter: 60,
        bucket: 'unknown',
        global: false
      });
    });

    it('should handle global rate limit headers', () => {
      const headers = {
        'x-ratelimit-limit': '50',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '120',
        'x-ratelimit-global': 'true'
      };

      const result = rateLimitManager.parseRateLimitHeaders(headers);

      expect(result).toEqual({
        limit: 50,
        remaining: 0,
        reset: 0,
        resetAfter: 120,
        bucket: 'unknown',
        global: true
      });
    });

    it('should return null for headers without rate limit info', () => {
      const headers = {
        'content-type': 'application/json',
        'server': 'nginx'
      };

      const result = rateLimitManager.parseRateLimitHeaders(headers);

      expect(result).toBeNull();
    });

    it('should handle missing or invalid header values', () => {
      const headers = {
        'x-ratelimit-limit': 'invalid',
        'x-ratelimit-remaining': '',
        'x-ratelimit-reset-after': '15'
      };

      const result = rateLimitManager.parseRateLimitHeaders(headers);

      expect(result).toEqual({
        limit: 0, // NaN becomes 0
        remaining: 0, // Empty string becomes 0
        reset: 0,
        resetAfter: 15,
        bucket: 'unknown',
        global: false
      });
    });
  });

  describe('updateRateLimitState', () => {
    it('should update bucket rate limit state', () => {
      const headers = {
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '7',
        'x-ratelimit-reset-after': '45',
        'x-ratelimit-bucket': 'user-me'
      };

      rateLimitManager.updateRateLimitState(headers, '/users/@me');

      const status = rateLimitManager.getRateLimitStatus('/users/@me');
      expect(status).toEqual({
        bucket: 'user-me',
        limit: 10,
        remaining: 7,
        resetTime: 1000000 + (45 * 1000), // Current time + resetAfter in ms
        resetAfter: 45,
        global: false
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Rate limit state updated', {
        bucket: 'user-me',
        remaining: 7,
        limit: 10
      });
    });

    it('should update global rate limit state', () => {
      const headers = {
        'x-ratelimit-limit': '50',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '120',
        'x-ratelimit-global': 'true'
      };

      rateLimitManager.updateRateLimitState(headers, '/users/@me');

      const allStates = rateLimitManager.getAllRateLimitStates();
      expect(allStates.global).toEqual({
        bucket: 'global',
        limit: 50,
        remaining: 0,
        resetTime: 1000000 + (120 * 1000),
        resetAfter: 120,
        global: true
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('Global rate limit detected', {
        resetAfter: 120,
        resetTime: new Date(1000000 + (120 * 1000)).toISOString()
      });
    });

    it('should warn when rate limit is reached', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '30',
        'x-ratelimit-bucket': 'user-guilds'
      };

      rateLimitManager.updateRateLimitState(headers, '/users/@me/guilds');

      expect(mockLogger.warn).toHaveBeenCalledWith('Rate limit reached for bucket', {
        bucket: 'user-guilds',
        limit: 5,
        resetAfter: 30,
        resetTime: new Date(1000000 + (30 * 1000)).toISOString()
      });
    });

    it('should ignore headers without rate limit info', () => {
      const headers = {
        'content-type': 'application/json'
      };

      rateLimitManager.updateRateLimitState(headers, '/users/@me');

      const status = rateLimitManager.getRateLimitStatus('/users/@me');
      expect(status).toBeNull();
    });
  });

  describe('handleRateLimitError', () => {
    it('should handle 429 error with proper headers', () => {
      const error = {
        response: {
          status: 429,
          headers: {
            'x-ratelimit-limit': '5',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset-after': '60',
            'x-ratelimit-bucket': 'user-guilds'
          }
        }
      };

      const waitTime = rateLimitManager.handleRateLimitError(error, '/users/@me/guilds');

      expect(waitTime).toBe(60000); // 60 seconds in milliseconds
      
      const metrics = rateLimitManager.getMetrics();
      expect(metrics.totalRateLimits).toBe(1);
      expect(metrics.bucketRateLimits['user-guilds']).toBe(1);
      expect(metrics.rateLimitsByEndpoint['/users/@me/guilds']).toBe(1);

      expect(mockLogger.error).toHaveBeenCalledWith('Bucket rate limit hit', {
        endpoint: '/users/@me/guilds',
        bucket: 'user-guilds',
        waitTimeMs: 60000,
        resetAfter: 60
      });
    });

    it('should handle global rate limit error', () => {
      const error = {
        response: {
          status: 429,
          headers: {
            'x-ratelimit-limit': '50',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset-after': '300',
            'x-ratelimit-global': 'true'
          }
        }
      };

      const waitTime = rateLimitManager.handleRateLimitError(error, '/users/@me');

      expect(waitTime).toBe(300000); // 5 minutes in milliseconds
      
      const metrics = rateLimitManager.getMetrics();
      expect(metrics.totalRateLimits).toBe(1);
      expect(metrics.globalRateLimits).toBe(1);

      expect(mockLogger.error).toHaveBeenCalledWith('Global rate limit hit', {
        endpoint: '/users/@me',
        waitTimeMs: 300000,
        resetAfter: 300
      });
    });

    it('should handle error without proper headers', () => {
      const error = {
        response: {
          status: 429,
          headers: {}
        }
      };

      const waitTime = rateLimitManager.handleRateLimitError(error, '/users/@me');

      expect(waitTime).toBe(1000); // Default 1 second
      expect(mockLogger.warn).toHaveBeenCalledWith('Rate limit error without proper headers', {
        endpoint: '/users/@me'
      });
    });

    it('should handle error without response', () => {
      const error = {
        message: 'Network error'
      };

      const waitTime = rateLimitManager.handleRateLimitError(error, '/users/@me');

      expect(waitTime).toBe(1000); // Default 1 second
    });

    it('should update wait time metrics', () => {
      const error1 = {
        response: {
          status: 429,
          headers: {
            'x-ratelimit-reset-after': '120',
            'x-ratelimit-bucket': 'test-bucket'
          }
        }
      };

      const error2 = {
        response: {
          status: 429,
          headers: {
            'x-ratelimit-reset-after': '60',
            'x-ratelimit-bucket': 'test-bucket-2'
          }
        }
      };

      rateLimitManager.handleRateLimitError(error1, '/test1');
      rateLimitManager.handleRateLimitError(error2, '/test2');

      const metrics = rateLimitManager.getMetrics();
      expect(metrics.longestWaitTime).toBe(120000);
      expect(metrics.averageWaitTime).toBe(90000); // (120000 + 60000) / 2
      expect(metrics.totalRateLimits).toBe(2);
    });
  });

  describe('shouldWaitForRateLimit', () => {
    beforeEach(() => {
      // Reset Date.now mock for each test
      jest.spyOn(Date, 'now').mockReturnValue(1000000);
    });

    it('should return wait time for active global rate limit', () => {
      // Set up global rate limit that expires in 30 seconds
      const headers = {
        'x-ratelimit-global': 'true',
        'x-ratelimit-reset-after': '30',
        'x-ratelimit-limit': '50',
        'x-ratelimit-remaining': '0'
      };
      rateLimitManager.updateRateLimitState(headers, '/test');

      const waitTime = rateLimitManager.shouldWaitForRateLimit('/users/@me');
      expect(waitTime).toBe(30000); // 30 seconds

      expect(mockLogger.info).toHaveBeenCalledWith('Waiting for global rate limit reset', {
        waitTimeMs: 30000,
        resetTime: new Date(1000000 + 30000).toISOString()
      });
    });

    it('should return wait time for active bucket rate limit', () => {
      // Set up bucket rate limit
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '45',
        'x-ratelimit-bucket': 'user-guilds'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me/guilds');

      const waitTime = rateLimitManager.shouldWaitForRateLimit('/users/@me/guilds');
      expect(waitTime).toBe(45000); // 45 seconds

      expect(mockLogger.info).toHaveBeenCalledWith('Waiting for bucket rate limit reset', {
        bucket: 'user-guilds',
        endpoint: '/users/@me/guilds',
        waitTimeMs: 45000,
        resetTime: new Date(1000000 + 45000).toISOString()
      });
    });

    it('should return 0 for no active rate limits', () => {
      const waitTime = rateLimitManager.shouldWaitForRateLimit('/users/@me');
      expect(waitTime).toBe(0);
    });

    it('should clear expired global rate limit', () => {
      // Set up expired global rate limit
      const headers = {
        'x-ratelimit-global': 'true',
        'x-ratelimit-reset-after': '30'
      };
      rateLimitManager.updateRateLimitState(headers, '/test');

      // Move time forward past the reset time
      jest.spyOn(Date, 'now').mockReturnValue(1000000 + 35000);

      const waitTime = rateLimitManager.shouldWaitForRateLimit('/users/@me');
      expect(waitTime).toBe(0);

      expect(mockLogger.info).toHaveBeenCalledWith('Global rate limit expired');
    });

    it('should clear expired bucket rate limit', () => {
      // Set up expired bucket rate limit
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '30',
        'x-ratelimit-bucket': 'user-guilds'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me/guilds');

      // Move time forward past the reset time
      jest.spyOn(Date, 'now').mockReturnValue(1000000 + 35000);

      const waitTime = rateLimitManager.shouldWaitForRateLimit('/users/@me/guilds');
      expect(waitTime).toBe(0);

      expect(mockLogger.debug).toHaveBeenCalledWith('Bucket rate limit expired', {
        bucket: 'user-guilds',
        endpoint: '/users/@me/guilds'
      });
    });
  });

  describe('waitForRateLimit', () => {
    it('should wait when rate limit is active', async () => {
      // Mock sleep
      const sleepSpy = jest.spyOn(rateLimitManager as any, 'sleep').mockResolvedValue(undefined);

      // Set up rate limit
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '10',
        'x-ratelimit-bucket': 'user-me'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me');

      await rateLimitManager.waitForRateLimit('/users/@me');

      expect(sleepSpy).toHaveBeenCalledWith(10000);
      expect(mockLogger.info).toHaveBeenCalledWith('Waiting for rate limit reset', {
        endpoint: '/users/@me',
        waitTimeMs: 10000
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Rate limit wait completed', {
        endpoint: '/users/@me',
        waitedMs: 10000
      });
    });

    it('should not wait when no rate limit is active', async () => {
      const sleepSpy = jest.spyOn(rateLimitManager as any, 'sleep').mockResolvedValue(undefined);

      await rateLimitManager.waitForRateLimit('/users/@me');

      expect(sleepSpy).not.toHaveBeenCalled();
    });
  });

  describe('isApproachingRateLimit', () => {
    it('should return true when approaching rate limit threshold', () => {
      const headers = {
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '1', // 90% used, above default 10% threshold
        'x-ratelimit-bucket': 'user-guilds'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me/guilds');

      const approaching = rateLimitManager.isApproachingRateLimit('/users/@me/guilds');
      expect(approaching).toBe(true);

      expect(mockLogger.warn).toHaveBeenCalledWith('Approaching rate limit threshold', {
        bucket: 'user-guilds',
        endpoint: '/users/@me/guilds',
        remaining: 1,
        limit: 10,
        usageRatio: '0.90',
        threshold: 0.1
      });
    });

    it('should return false when not approaching rate limit', () => {
      const headers = {
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '8', // 20% used, below threshold
        'x-ratelimit-bucket': 'user-guilds'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me/guilds');

      const approaching = rateLimitManager.isApproachingRateLimit('/users/@me/guilds');
      expect(approaching).toBe(false);
    });

    it('should use custom threshold', () => {
      const headers = {
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '3', // 70% used
        'x-ratelimit-bucket': 'user-guilds'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me/guilds');

      // 30% threshold - should return true
      const approaching = rateLimitManager.isApproachingRateLimit('/users/@me/guilds', 0.3);
      expect(approaching).toBe(true);
    });

    it('should return false when no rate limit state exists', () => {
      const approaching = rateLimitManager.isApproachingRateLimit('/unknown/endpoint');
      expect(approaching).toBe(false);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return global rate limit when active', () => {
      const headers = {
        'x-ratelimit-global': 'true',
        'x-ratelimit-limit': '50',
        'x-ratelimit-remaining': '10',
        'x-ratelimit-reset-after': '60'
      };
      rateLimitManager.updateRateLimitState(headers, '/test');

      const status = rateLimitManager.getRateLimitStatus('/users/@me');
      expect(status?.global).toBe(true);
      expect(status?.remaining).toBe(10);
    });

    it('should return bucket rate limit when no global limit', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '3',
        'x-ratelimit-bucket': 'user-me'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me');

      const status = rateLimitManager.getRateLimitStatus('/users/@me');
      expect(status?.bucket).toBe('user-me');
      expect(status?.remaining).toBe(3);
    });

    it('should return null when no rate limit state exists', () => {
      const status = rateLimitManager.getRateLimitStatus('/unknown/endpoint');
      expect(status).toBeNull();
    });
  });

  describe('metrics and management', () => {
    it('should track metrics correctly', () => {
      const error1 = {
        response: {
          status: 429,
          headers: {
            'x-ratelimit-reset-after': '30',
            'x-ratelimit-bucket': 'test-bucket-1'
          }
        }
      };

      const error2 = {
        response: {
          status: 429,
          headers: {
            'x-ratelimit-reset-after': '30',
            'x-ratelimit-bucket': 'test-bucket-2'
          }
        }
      };

      rateLimitManager.handleRateLimitError(error1, '/test1');
      rateLimitManager.handleRateLimitError(error2, '/test2');

      const metrics = rateLimitManager.getMetrics();
      expect(metrics.totalRateLimits).toBe(2);
      expect(metrics.rateLimitsByEndpoint['/test1']).toBe(1);
      expect(metrics.rateLimitsByEndpoint['/test2']).toBe(1);
    });

    it('should reset metrics', () => {
      const error = {
        response: {
          status: 429,
          headers: {
            'x-ratelimit-reset-after': '30'
          }
        }
      };

      rateLimitManager.handleRateLimitError(error, '/test');
      rateLimitManager.resetMetrics();

      const metrics = rateLimitManager.getMetrics();
      expect(metrics.totalRateLimits).toBe(0);
      expect(Object.keys(metrics.rateLimitsByEndpoint)).toHaveLength(0);
    });

    it('should clear all rate limit states', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '3',
        'x-ratelimit-bucket': 'user-me'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me');

      rateLimitManager.clearRateLimitStates();

      const status = rateLimitManager.getRateLimitStatus('/users/@me');
      expect(status).toBeNull();
    });

    it('should log rate limit status', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '3',
        'x-ratelimit-bucket': 'user-me'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me');

      rateLimitManager.logRateLimitStatus();

      expect(mockLogger.info).toHaveBeenCalledWith('Current rate limit status', expect.objectContaining({
        globalRateLimit: null,
        bucketCount: 1,
        buckets: expect.arrayContaining([
          expect.objectContaining({
            bucket: 'user-me',
            remaining: 3,
            limit: 5
          })
        ])
      }));
    });
  });

  describe('bucket identification', () => {
    it('should identify user guilds bucket', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '3'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me/guilds');

      const status = rateLimitManager.getRateLimitStatus('/users/@me/guilds');
      expect(status?.bucket).toBe('user-guilds');
    });

    it('should identify user me bucket', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '3'
      };
      rateLimitManager.updateRateLimitState(headers, '/users/@me');

      const status = rateLimitManager.getRateLimitStatus('/users/@me');
      expect(status?.bucket).toBe('user-me');
    });

    it('should identify oauth token bucket', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '3'
      };
      rateLimitManager.updateRateLimitState(headers, '/oauth2/token');

      const status = rateLimitManager.getRateLimitStatus('/oauth2/token');
      expect(status?.bucket).toBe('oauth-token');
    });

    it('should create generic bucket for unknown endpoints', () => {
      const headers = {
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '3'
      };
      rateLimitManager.updateRateLimitState(headers, '/guilds/123456/members');

      const status = rateLimitManager.getRateLimitStatus('/guilds/123456/members');
      expect(status?.bucket).toBe('/guilds/:id/members');
    });
  });
});