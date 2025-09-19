import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Query keys
export const serverKeys = {
  all: ['server'] as const,
  lists: () => [...serverKeys.all, 'list'] as const,
  list: (filters: string) => [...serverKeys.lists(), { filters }] as const,
  details: () => [...serverKeys.all, 'detail'] as const,
  detail: (id: string) => [...serverKeys.details(), id] as const,
  stats: (id: string) => [...serverKeys.all, 'stats', id] as const,
  botStatus: (id: string) => [...serverKeys.all, 'bot-status', id] as const,
  botConfig: (id: string) => [...serverKeys.all, 'bot-config', id] as const,
};

// Get server details
export function useServer(serverId: string) {
  return useQuery({
    queryKey: serverKeys.detail(serverId),
    queryFn: () => apiClient.getServer(serverId),
    enabled: !!serverId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get server stats
export function useServerStats(serverId: string) {
  return useQuery({
    queryKey: serverKeys.stats(serverId),
    queryFn: () => apiClient.getServerStats(serverId),
    enabled: !!serverId,
    staleTime: 2 * 60 * 1000, // 2 minutes - stats change more frequently
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
  });
}

// Get bot status
export function useBotStatus(serverId: string) {
  return useQuery({
    queryKey: serverKeys.botStatus(serverId),
    queryFn: () => apiClient.getBotStatus(serverId),
    enabled: !!serverId,
    staleTime: 30 * 1000, // 30 seconds - bot status changes quickly
    refetchInterval: 60 * 1000, // Auto-refetch every minute
  });
}

// Get bot configuration
export function useBotConfig(serverId: string) {
  return useQuery({
    queryKey: serverKeys.botConfig(serverId),
    queryFn: () => apiClient.getBotConfig(serverId),
    enabled: !!serverId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Update server mutation
export function useUpdateServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId, data }: { serverId: string; data: any }) =>
      apiClient.updateServer(serverId, data),
    onSuccess: (data, variables) => {
      const { serverId } = variables;
      
      // Update server cache
      queryClient.setQueryData(serverKeys.detail(serverId), data);
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: serverKeys.detail(serverId) });
      queryClient.invalidateQueries({ queryKey: ['user', 'servers'] });
    },
    onError: (error) => {
      console.error('Failed to update server:', error);
    },
  });
}

// Update bot configuration mutation
export function useUpdateBotConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId, config }: { serverId: string; config: any }) =>
      apiClient.updateBotConfig(serverId, config),
    onMutate: async ({ serverId, config }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: serverKeys.botConfig(serverId) });

      // Snapshot previous value
      const previousConfig = queryClient.getQueryData(serverKeys.botConfig(serverId));

      // Optimistically update
      queryClient.setQueryData(serverKeys.botConfig(serverId), (old: any) => ({
        ...old,
        data: { ...old?.data, ...config },
      }));

      return { previousConfig };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousConfig) {
        queryClient.setQueryData(serverKeys.botConfig(variables.serverId), context.previousConfig);
      }
      console.error('Failed to update bot config:', error);
    },
    onSettled: (data, error, variables) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: serverKeys.botConfig(variables.serverId) });
    },
  });
}