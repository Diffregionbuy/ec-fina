import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Query keys for consistent cache management
export const userKeys = {
  all: ['user'] as const,
  profile: () => [...userKeys.all, 'profile'] as const,
  servers: () => [...userKeys.all, 'servers'] as const,
};

// User profile hook
export function useUserProfile() {
  return useQuery({
    queryKey: userKeys.profile(),
    queryFn: () => apiClient.getUserProfile(),
    staleTime: 10 * 60 * 1000, // 10 minutes - profile data doesn't change often
  });
}

// User servers hook
export function useUserServers() {
  return useQuery({
    queryKey: userKeys.servers(),
    queryFn: () => apiClient.getUserServers(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Update user profile mutation
export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => apiClient.updateUserProfile?.(data) || Promise.resolve(data),
    onSuccess: (data) => {
      // Update the profile cache with new data
      queryClient.setQueryData(userKeys.profile(), data);
      
      // Optionally refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: userKeys.profile() });
    },
    onError: (error) => {
      console.error('Failed to update user profile:', error);
    },
  });
}