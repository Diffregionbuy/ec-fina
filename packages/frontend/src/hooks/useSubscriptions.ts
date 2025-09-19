import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Query keys
export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  plans: () => [...subscriptionKeys.all, 'plans'] as const,
  current: (serverId: string) => [...subscriptionKeys.all, 'current', serverId] as const,
  usage: (serverId: string) => [...subscriptionKeys.all, 'usage', serverId] as const,
  featureAccess: (serverId: string, featureKey: string) => 
    [...subscriptionKeys.all, 'feature-access', serverId, featureKey] as const,
};

// Get subscription plans
export function useSubscriptionPlans() {
  return useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: () => apiClient.getSubscriptionPlans(),
    staleTime: 10 * 60 * 1000, // 10 minutes - plans don't change often
  });
}

// Get current subscription for a server
export function useCurrentSubscription(serverId: string) {
  return useQuery({
    queryKey: subscriptionKeys.current(serverId),
    queryFn: () => apiClient.getCurrentSubscription(serverId),
    enabled: !!serverId,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Get feature usage for a server
export function useFeatureUsage(serverId: string) {
  return useQuery({
    queryKey: subscriptionKeys.usage(serverId),
    queryFn: () => apiClient.getFeatureUsage(serverId),
    enabled: !!serverId,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Check feature access
export function useFeatureAccess(serverId: string, featureKey: string) {
  return useQuery({
    queryKey: subscriptionKeys.featureAccess(serverId, featureKey),
    queryFn: () => apiClient.checkFeatureAccess(serverId, featureKey),
    enabled: !!serverId && !!featureKey,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Subscribe mutation
export function useSubscribe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      serverId, 
      planId, 
      paymentMethod 
    }: { 
      serverId: string; 
      planId: string; 
      paymentMethod: string; 
    }) => apiClient.subscribe(serverId, planId, paymentMethod),
    onSuccess: (data, variables) => {
      const { serverId } = variables;
      
      // Invalidate subscription-related queries
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.current(serverId) });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.usage(serverId) });
      
      // Invalidate all feature access queries for this server
      queryClient.invalidateQueries({ 
        queryKey: [...subscriptionKeys.all, 'feature-access', serverId],
        exact: false 
      });
    },
    onError: (error) => {
      console.error('Failed to subscribe:', error);
    },
  });
}

// Cancel subscription mutation
export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      serverId, 
      cancelAtPeriodEnd = true 
    }: { 
      serverId: string; 
      cancelAtPeriodEnd?: boolean; 
    }) => apiClient.cancelSubscription(serverId, cancelAtPeriodEnd),
    onMutate: async ({ serverId, cancelAtPeriodEnd }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: subscriptionKeys.current(serverId) });

      // Snapshot previous value
      const previousSubscription = queryClient.getQueryData(subscriptionKeys.current(serverId));

      // Optimistically update subscription status
      queryClient.setQueryData(subscriptionKeys.current(serverId), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            subscription: {
              ...old.data.subscription,
              cancel_at_period_end: cancelAtPeriodEnd,
              status: cancelAtPeriodEnd ? 'active' : 'canceled',
            },
          },
        };
      });

      return { previousSubscription };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousSubscription) {
        queryClient.setQueryData(
          subscriptionKeys.current(variables.serverId), 
          context.previousSubscription
        );
      }
      console.error('Failed to cancel subscription:', error);
    },
    onSettled: (data, error, variables) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.current(variables.serverId) });
    },
  });
}

// Reactivate subscription mutation
export function useReactivateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId }: { serverId: string }) =>
      apiClient.reactivateSubscription(serverId),
    onMutate: async ({ serverId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: subscriptionKeys.current(serverId) });

      // Snapshot previous value
      const previousSubscription = queryClient.getQueryData(subscriptionKeys.current(serverId));

      // Optimistically update subscription status
      queryClient.setQueryData(subscriptionKeys.current(serverId), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            subscription: {
              ...old.data.subscription,
              cancel_at_period_end: false,
              status: 'active',
            },
          },
        };
      });

      return { previousSubscription };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousSubscription) {
        queryClient.setQueryData(
          subscriptionKeys.current(variables.serverId), 
          context.previousSubscription
        );
      }
      console.error('Failed to reactivate subscription:', error);
    },
    onSettled: (data, error, variables) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.current(variables.serverId) });
    },
  });
}