import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUserProfile, useUserServers, userKeys } from '../useUser';
import { apiClient } from '@/lib/api-client';

// Mock the API client
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    getUserProfile: jest.fn(),
    getUserServers: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

// Test wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('useUser hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useUserProfile', () => {
    it('should fetch user profile successfully', async () => {
      const mockProfile = {
        success: true,
        data: { id: '1', name: 'Test User', email: 'test@example.com' },
      };

      mockApiClient.getUserProfile.mockResolvedValueOnce(mockProfile);

      const { result } = renderHook(() => useUserProfile(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockProfile);
      expect(mockApiClient.getUserProfile).toHaveBeenCalledTimes(1);
    });

    it('should handle errors correctly', async () => {
      const mockError = new Error('Failed to fetch profile');
      mockApiClient.getUserProfile.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useUserProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });

    it('should use correct query key', () => {
      const { result } = renderHook(() => useUserProfile(), {
        wrapper: createWrapper(),
      });

      // The query key should match our userKeys.profile()
      expect(result.current.queryKey).toEqual(userKeys.profile());
    });
  });

  describe('useUserServers', () => {
    it('should fetch user servers successfully', async () => {
      const mockServers = {
        success: true,
        data: [
          { id: '1', name: 'Server 1' },
          { id: '2', name: 'Server 2' },
        ],
      };

      mockApiClient.getUserServers.mockResolvedValueOnce(mockServers);

      const { result } = renderHook(() => useUserServers(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockServers);
      expect(mockApiClient.getUserServers).toHaveBeenCalledTimes(1);
    });

    it('should use correct query key', () => {
      const { result } = renderHook(() => useUserServers(), {
        wrapper: createWrapper(),
      });

      expect(result.current.queryKey).toEqual(userKeys.servers());
    });
  });

  describe('query keys', () => {
    it('should generate consistent query keys', () => {
      expect(userKeys.all).toEqual(['user']);
      expect(userKeys.profile()).toEqual(['user', 'profile']);
      expect(userKeys.servers()).toEqual(['user', 'servers']);
    });
  });
});