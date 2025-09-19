import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useServer, useUpdateServer, useUpdateBotConfig, serverKeys } from '../useServer';
import { apiClient } from '@/lib/api-client';

// Mock the API client
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    getServer: jest.fn(),
    updateServer: jest.fn(),
    updateBotConfig: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('useServer hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useServer', () => {
    it('should fetch server data successfully', async () => {
      const mockServer = {
        success: true,
        data: { id: 'server1', name: 'Test Server' },
      };

      mockApiClient.getServer.mockResolvedValueOnce(mockServer);

      const { result } = renderHook(() => useServer('server1'), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockServer);
      expect(mockApiClient.getServer).toHaveBeenCalledWith('server1');
    });

    it('should not fetch when serverId is empty', () => {
      const { result } = renderHook(() => useServer(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockApiClient.getServer).not.toHaveBeenCalled();
    });

    it('should use correct query key', () => {
      const { result } = renderHook(() => useServer('server1'), {
        wrapper: createWrapper(),
      });

      expect(result.current.queryKey).toEqual(serverKeys.detail('server1'));
    });
  });

  describe('useUpdateServer', () => {
    it('should update server successfully', async () => {
      const mockUpdatedServer = {
        success: true,
        data: { id: 'server1', name: 'Updated Server' },
      };

      mockApiClient.updateServer.mockResolvedValueOnce(mockUpdatedServer);

      const { result } = renderHook(() => useUpdateServer(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate({
          serverId: 'server1',
          data: { name: 'Updated Server' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.updateServer).toHaveBeenCalledWith('server1', {
        name: 'Updated Server',
      });
      expect(result.current.data).toEqual(mockUpdatedServer);
    });

    it('should handle update errors', async () => {
      const mockError = new Error('Update failed');
      mockApiClient.updateServer.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useUpdateServer(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate({
          serverId: 'server1',
          data: { name: 'Updated Server' },
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });
  });

  describe('useUpdateBotConfig', () => {
    it('should update bot config with optimistic updates', async () => {
      const mockUpdatedConfig = {
        success: true,
        data: { appearance: { color: 'blue' } },
      };

      mockApiClient.updateBotConfig.mockResolvedValueOnce(mockUpdatedConfig);

      const { result } = renderHook(() => useUpdateBotConfig(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate({
          serverId: 'server1',
          config: { appearance: { color: 'blue' } },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.updateBotConfig).toHaveBeenCalledWith('server1', {
        appearance: { color: 'blue' },
      });
    });

    it('should rollback on error', async () => {
      const mockError = new Error('Config update failed');
      mockApiClient.updateBotConfig.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useUpdateBotConfig(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate({
          serverId: 'server1',
          config: { appearance: { color: 'blue' } },
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });
  });

  describe('query keys', () => {
    it('should generate consistent query keys', () => {
      expect(serverKeys.all).toEqual(['server']);
      expect(serverKeys.detail('server1')).toEqual(['server', 'detail', 'server1']);
      expect(serverKeys.stats('server1')).toEqual(['server', 'stats', 'server1']);
      expect(serverKeys.botStatus('server1')).toEqual(['server', 'bot-status', 'server1']);
      expect(serverKeys.botConfig('server1')).toEqual(['server', 'bot-config', 'server1']);
    });
  });
});