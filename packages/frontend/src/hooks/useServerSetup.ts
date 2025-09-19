import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useServerContext } from '@/contexts/ServerContext';

export function useServerSetup() {
  const queryClient = useQueryClient();
  const { refreshServers } = useServerContext();

  return useMutation({
    mutationFn: ({ serverId, botConfig }: { serverId: string; botConfig?: any }) =>
      apiClient.setupServer(serverId, botConfig),
    onSuccess: async (data, variables) => {
      const { serverId } = variables;
      
      // Invalidate and refetch server data
      await refreshServers();
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      
      console.log('Server setup completed:', data);
    },
    onError: (error) => {
      console.error('Failed to set up server:', error);
    },
  });
}