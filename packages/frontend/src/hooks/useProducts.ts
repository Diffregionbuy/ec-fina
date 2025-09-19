import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Query keys
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (serverId: string) => [...productKeys.lists(), serverId] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
};

export const categoryKeys = {
  all: ['categories'] as const,
  lists: () => [...categoryKeys.all, 'list'] as const,
  list: (serverId: string) => [...categoryKeys.lists(), serverId] as const,
};

// Get products for a server
export function useProducts(serverId: string) {
  return useQuery({
    queryKey: productKeys.list(serverId),
    queryFn: () => apiClient.getProducts(serverId),
    enabled: !!serverId,
    staleTime: 3 * 60 * 1000, // 3 minutes
  });
}

// Get categories for a server
export function useCategories(serverId: string) {
  return useQuery({
    queryKey: categoryKeys.list(serverId),
    queryFn: () => apiClient.getCategories(serverId),
    enabled: !!serverId,
    staleTime: 5 * 60 * 1000, // 5 minutes - categories change less frequently
  });
}

// Create product mutation
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => apiClient.createProduct(data),
    onSuccess: (data, variables) => {
      // Invalidate products list for the server
      queryClient.invalidateQueries({ 
        queryKey: productKeys.list(variables.server_id) 
      });
    },
    onError: (error) => {
      console.error('Failed to create product:', error);
    },
  });
}

// Update product mutation
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, data }: { productId: string; data: any }) =>
      apiClient.updateProduct(productId, data),
    onSuccess: (data, variables) => {
      // Invalidate products list for the server
      queryClient.invalidateQueries({ 
        queryKey: productKeys.list(variables.data.server_id) 
      });
      
      // Update individual product cache if it exists
      queryClient.setQueryData(productKeys.detail(variables.productId), data);
    },
    onError: (error) => {
      console.error('Failed to update product:', error);
    },
  });
}

// Delete product mutation
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, serverId }: { productId: string; serverId: string }) =>
      apiClient.deleteProduct(productId, serverId),
    onMutate: async ({ productId, serverId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: productKeys.list(serverId) });

      // Snapshot previous value
      const previousProducts = queryClient.getQueryData(productKeys.list(serverId));

      // Optimistically remove product from list
      queryClient.setQueryData(productKeys.list(serverId), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((product: any) => product.id !== productId),
        };
      });

      return { previousProducts };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousProducts) {
        queryClient.setQueryData(productKeys.list(variables.serverId), context.previousProducts);
      }
      console.error('Failed to delete product:', error);
    },
    onSettled: (data, error, variables) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: productKeys.list(variables.serverId) });
    },
  });
}

// Create category mutation
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => apiClient.createCategory(data),
    onSuccess: (data, variables) => {
      // Invalidate categories list for the server
      queryClient.invalidateQueries({ 
        queryKey: categoryKeys.list(variables.server_id) 
      });
    },
    onError: (error) => {
      console.error('Failed to create category:', error);
    },
  });
}

// Delete category mutation
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoryId, serverId }: { categoryId: string; serverId: string }) =>
      apiClient.deleteCategory(categoryId, serverId),
    onMutate: async ({ categoryId, serverId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: categoryKeys.list(serverId) });

      // Snapshot previous value
      const previousCategories = queryClient.getQueryData(categoryKeys.list(serverId));

      // Optimistically remove category from list
      queryClient.setQueryData(categoryKeys.list(serverId), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((category: any) => category.id !== categoryId),
        };
      });

      return { previousCategories };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousCategories) {
        queryClient.setQueryData(categoryKeys.list(variables.serverId), context.previousCategories);
      }
      console.error('Failed to delete category:', error);
    },
    onSettled: (data, error, variables) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: categoryKeys.list(variables.serverId) });
      // Also invalidate products since they might reference categories
      queryClient.invalidateQueries({ queryKey: productKeys.list(variables.serverId) });
    },
  });
}