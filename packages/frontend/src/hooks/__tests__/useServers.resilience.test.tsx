import { renderHook, act, waitFor } from '@testing-library/react';
import { useServers } from '../useServers';
import { useAuth } from '../useAuth';

// Mock the useAuth hook
jest.mock('../useAuth');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock console methods to avoid noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.useFakeTimers();
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  jest.useRealTimers();
});

describe('useServers - Discord API Resilience', () => {
  const mockSession = {
    discordTokens: {
      discordId: 'test-discord-id',
      accessToken: 'test-token',
    },
  };

  const mockUser = {
    id: 'test-user-id',
    name: 'Test User',
  };

  const mockServerResponse = {
    success: true,
    data: {
      servers: {
        owned: [
          {
            id: 'server-1',
            name: 'Test Server 1',
            icon: 'test-icon',
            approximate_member_count: 100,
            configured: true,
            configuration: {
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z',
            },
          },
        ],
        member: [],
      },
    },
  };

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      session: mockSession,
    } as any);
  });

  describe('Enhanced Error Response Handling', () => {
    it('should handle enhanced error response format with retryable error', async () => {
      const enhancedError = {
        success: false,
        error: {
          code: 'DISCORD_API_ERROR',
          message: 'Discord services are temporarily unavailable',
          timestamp: '2023-01-01T00:00:00Z',
          retryable: true,
          retryAfter: 2,
          attempts: 1,
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve(JSON.stringify(enhancedError)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockServerResponse),
        } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should show user-friendly error message
      expect(result.current.error).toBe(
        'Discord services are temporarily unavailable. We\'re retrying automatically.'
      );
      expect(result.current.loadingState.error).toBe(
        'Discord services are temporarily unavailable. We\'re retrying automatically.'
      );
      expect(result.current.loadingState.retryCount).toBe(1);

      // Should auto-retry after delay
      act(() => {
        jest.advanceTimersByTime(2000); // retryAfter * 1000
      });

      await waitFor(() => {
        expect(result.current.servers).toHaveLength(1);
        expect(result.current.error).toBeNull();
        expect(result.current.loadingState.error).toBeNull();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle non-retryable errors without auto-retry', async () => {
      const nonRetryableError = {
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid authentication token',
          timestamp: '2023-01-01T00:00:00Z',
          retryable: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify(nonRetryableError)),
      } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Invalid authentication token');
      expect(result.current.loadingState.retryCount).toBe(0);

      // Should not auto-retry
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle cached data response', async () => {
      const cachedResponse = {
        ...mockServerResponse,
        cached: true,
        retryCount: 2,
        responseTime: 150,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(cachedResponse),
      } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.servers).toHaveLength(1);
      expect(result.current.loadingState.isStale).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Loading States', () => {
    it('should show correct loading states during initial load', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve(mockServerResponse),
              } as Response);
            }, 1000);
          })
      );

      const { result } = renderHook(() => useServers());

      // Initial loading state
      expect(result.current.loading).toBe(true);
      expect(result.current.loadingState.isLoading).toBe(true);
      expect(result.current.loadingState.isRetrying).toBe(false);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.loadingState.isLoading).toBe(false);
      });
    });

    it('should show retry loading state during auto-retry', async () => {
      const retryableError = {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Network request failed',
          retryable: true,
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve(JSON.stringify(retryableError)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockServerResponse),
        } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.loadingState.isRetrying).toBe(false);
        expect(result.current.loadingState.retryCount).toBe(0);
      });

      // Trigger retry
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.loadingState.isRetrying).toBe(true);
        expect(result.current.loadingState.retryCount).toBe(1);
      });
    });
  });

  describe('Manual Retry Functionality', () => {
    it('should allow manual retry and reset retry count', async () => {
      const retryableError = {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error',
          retryable: true,
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve(JSON.stringify(retryableError)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockServerResponse),
        } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Manual retry should reset retry count
      act(() => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(result.current.servers).toHaveLength(1);
        expect(result.current.error).toBeNull();
        expect(result.current.loadingState.retryCount).toBe(0);
      });
    });
  });

  describe('Network Error Handling', () => {
    it('should handle network errors with auto-retry', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockServerResponse),
        } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.error).toBe(
          'Failed to connect to server. Please check your internet connection and try again.'
        );
      });

      // Should auto-retry network errors
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.servers).toHaveLength(1);
        expect(result.current.error).toBeNull();
      });
    });

    it('should stop retrying after max attempts', async () => {
      const retryableError = {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Server error',
          retryable: true,
        },
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve(JSON.stringify(retryableError)),
      } as Response);

      const { result } = renderHook(() => useServers());

      // Wait for initial failure
      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Advance through all retry attempts
      for (let i = 0; i < 3; i++) {
        act(() => {
          jest.advanceTimersByTime(Math.pow(2, i) * 1000);
        });
        
        await waitFor(() => {
          expect(result.current.loadingState.retryCount).toBe(i + 1);
        });
      }

      // Should stop retrying after 3 attempts
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(result.current.loadingState.retryCount).toBe(3);
    });
  });

  describe('User-Friendly Error Messages', () => {
    it('should show user-friendly message for 503 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.error).toBe(
          'Discord services are temporarily unavailable. We\'re retrying automatically.'
        );
      });
    });

    it('should show user-friendly message for 429 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Too Many Requests'),
      } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.error).toBe(
          'Too many requests. Please wait a moment before trying again.'
        );
      });
    });

    it('should show user-friendly message for 5xx errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as Response);

      const { result } = renderHook(() => useServers());

      await waitFor(() => {
        expect(result.current.error).toBe(
          'Server error occurred. Please try again in a moment.'
        );
      });
    });
  });
});