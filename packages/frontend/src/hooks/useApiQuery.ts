'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ApiQueryOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number;
}

export function useApiQuery<T = any>(
  endpoint: string,
  options: ApiQueryOptions = {}
) {
  const {
    enabled = true,
    staleTime = 30000, // 30 seconds default
    gcTime = 300000, // 5 minutes default (formerly cacheTime)
    refetchOnWindowFocus = false,
    refetchOnReconnect = false,
    refetchInterval,
  } = options;

  return useQuery({
    queryKey: ['api', endpoint],
    queryFn: async () => {
      const response = await fetch(`/api/backend/${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return response.json();
    },
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnReconnect,
    refetchInterval,
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

export function useApiMutation<T = any, V = any>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'POST'
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: V) => {
      const response = await fetch(`/api/backend/${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['api'] });
    },
  });
}

// Specialized hooks for common endpoints
export function useServerData(serverId: string) {
  return useApiQuery(`servers/${serverId}/details`, {
    staleTime: 30000, // 30 seconds
    enabled: !!serverId,
  });
}

export function useBotStatus(serverId: string) {
  return useApiQuery(`servers/${serverId}/bot-status`, {
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!serverId,
  });
}

export function useServerStats(serverId: string) {
  return useApiQuery(`servers/${serverId}/stats`, {
    staleTime: 30000, // 30 seconds
    enabled: !!serverId,
  });
}

export function useProducts(serverId: string) {
  return useApiQuery(`products?server_id=${serverId}`, {
    staleTime: 60000, // 1 minute
    enabled: !!serverId,
  });
}

export function useUserServers() {
  return useApiQuery('users/servers', {
    staleTime: 300000, // 5 minutes
    gcTime: 600000, // 10 minutes
  });
}

export function useServerAnalytics(serverId: string) {
  return useApiQuery(`analytics/servers/${serverId}/analytics`, {
    staleTime: 300000, // 5 minutes
    enabled: !!serverId,
  });
}

// Prefetch utilities
export function usePrefetchServerData() {
  const queryClient = useQueryClient();

  return async (serverId: string) => {
    await queryClient.prefetchQuery({
      queryKey: ['api', `servers/${serverId}/details`],
      queryFn: async () => {
        const response = await fetch(`/api/backend/servers/${serverId}/details`, {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        return response.ok ? response.json() : null;
      },
      staleTime: 30000,
    });
  };
}
