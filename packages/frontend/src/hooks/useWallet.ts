import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Query keys
export const walletKeys = {
  all: ['wallet'] as const,
  balance: () => [...walletKeys.all, 'balance'] as const,
  transactions: () => [...walletKeys.all, 'transactions'] as const,
  config: () => [...walletKeys.all, 'config'] as const,
};

// Get wallet balance
export function useWalletBalance() {
  return useQuery({
    queryKey: walletKeys.balance(),
    queryFn: () => apiClient.getWalletBalance(),
    staleTime: 30 * 1000, // 30 seconds - balance changes frequently
    refetchInterval: 60 * 1000, // Auto-refetch every minute
  });
}

// Get transaction history
export function useTransactions() {
  return useQuery({
    queryKey: walletKeys.transactions(),
    queryFn: () => apiClient.getTransactions(),
    staleTime: 60 * 1000, // 1 minute
  });
}

// Request withdrawal mutation
export function useRequestWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amount, address }: { amount: number; address: string }) =>
      apiClient.requestWithdrawal(amount, address),
    onMutate: async ({ amount }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: walletKeys.balance() });

      // Snapshot previous balance
      const previousBalance = queryClient.getQueryData(walletKeys.balance());

      // Optimistically update balance (subtract withdrawal amount)
      queryClient.setQueryData(walletKeys.balance(), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            balance: Math.max(0, (old.data.balance || 0) - amount),
          },
        };
      });

      return { previousBalance };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousBalance) {
        queryClient.setQueryData(walletKeys.balance(), context.previousBalance);
      }
      console.error('Failed to request withdrawal:', error);
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: walletKeys.balance() });
      queryClient.invalidateQueries({ queryKey: walletKeys.transactions() });
    },
  });
}

// Update wallet configuration mutation
export function useUpdateWalletConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: { okx_wallet_address?: string | null }) =>
      apiClient.updateWalletConfig(config),
    onSuccess: () => {
      // Invalidate wallet balance to refetch with new config
      queryClient.invalidateQueries({ queryKey: walletKeys.balance() });
      queryClient.invalidateQueries({ queryKey: walletKeys.config() });
    },
    onError: (error) => {
      console.error('Failed to update wallet config:', error);
    },
  });
}