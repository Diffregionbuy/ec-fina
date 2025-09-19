import { apiClient } from '../api-client';
import { getSession } from 'next-auth/react';

// Mock next-auth
jest.mock('next-auth/react');
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('ApiClient - Discord API Resilience', () => {
  const mockSession = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(mockSession as any);
  });

  describe('getUserServersWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockResponse = {
        success: true,
        data: { servers: { owned: [], member: [] } },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await apiClient.getUserServersWithRetry();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 503 Service Unavailable', async () => {
      const mockResponse = {
        success: true,
        data: { servers: { owned: [], member: [] } },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve({
            error: { message: 'Service Unavailable', code: 'SERVICE_UNAVAILABLE' }
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);

      const startTime = Date.now();
      const result = await apiClient.getUserServersWithRetry();
      const endTime = Date.now();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Should have waited at least 1 second for exponential backoff
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
    });

    it('should retry on 502 Bad Gateway', async () => {
      const mockResponse = {
        success: true,
        data: { servers: { owned: [], member: [] } },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          json: () => Promise.resolve({
            error: { message: 'Bad Gateway', code: 'BAD_GATEWAY' }
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);

      const result = await apiClient.getUserServersWithRetry();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on network errors', async () => {
      const mockResponse = {
        success: true,
        data: { servers: { owned: [], member: [] } },
      };

      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);

      const result = await apiClient.getUserServersWithRetry();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { message: 'Unauthorized', code: 'UNAUTHORIZED' }
        }),
      } as Response);

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 400 Bad Request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { message: 'Bad Request', code: 'BAD_REQUEST' }
        }),
      } as Response);

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying after max attempts', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({
          error: { message: 'Service Unavailable', code: 'SERVICE_UNAVAILABLE' }
        }),
      } as Response);

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff for retries', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0); // Execute immediately for test
      }) as any;

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({
          error: { message: 'Service Unavailable', code: 'SERVICE_UNAVAILABLE' }
        }),
      } as Response);

      try {
        await apiClient.getUserServersWithRetry();
      } catch (error) {
        // Expected to fail after retries
      }

      // Should use exponential backoff: 1000ms, 2000ms
      expect(delays).toEqual([1000, 2000]);
      
      global.setTimeout = originalSetTimeout;
    });

    it('should respect maximum delay cap', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0);
      }) as any;

      // Mock many failures to test delay cap
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({
          error: { message: 'Service Unavailable', code: 'SERVICE_UNAVAILABLE' }
        }),
      } as Response);

      try {
        await apiClient.getUserServersWithRetry();
      } catch (error) {
        // Expected to fail
      }

      // All delays should be capped at 10000ms
      delays.forEach(delay => {
        expect(delay).toBeLessThanOrEqual(10000);
      });
      
      global.setTimeout = originalSetTimeout;
    });
  });

  describe('Error Classification', () => {
    it('should classify 503 as retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({
          error: { message: 'Service Unavailable', code: 'SERVICE_UNAVAILABLE' }
        }),
      } as Response);

      // Should attempt retry (will fail after max attempts)
      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should classify 502 as retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () => Promise.resolve({
          error: { message: 'Bad Gateway', code: 'BAD_GATEWAY' }
        }),
      } as Response);

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should classify 504 as retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 504,
        json: () => Promise.resolve({
          error: { message: 'Gateway Timeout', code: 'GATEWAY_TIMEOUT' }
        }),
      } as Response);

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should classify network errors as retryable', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should classify 401 as non-retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { message: 'Unauthorized', code: 'UNAUTHORIZED' }
        }),
      } as Response);

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should classify 403 as non-retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({
          error: { message: 'Forbidden', code: 'FORBIDDEN' }
        }),
      } as Response);

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should classify 400 as non-retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { message: 'Bad Request', code: 'BAD_REQUEST' }
        }),
      } as Response);

      await expect(apiClient.getUserServersWithRetry()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});