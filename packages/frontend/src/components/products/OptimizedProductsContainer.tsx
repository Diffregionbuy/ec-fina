'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Product, Category } from '@/types/dashboard';
import { ProductList } from './ProductList';
import { ProductForm } from './ProductForm';
import { CategoryManager } from './CategoryManager';
import { useProducts, useApiQuery, useApiMutation } from '@/hooks/useApiQuery';
import { useQueryClient } from '@tanstack/react-query';

interface OptimizedProductsContainerProps {
  serverId: string;
}

export const OptimizedProductsContainer: React.FC<OptimizedProductsContainerProps> = ({ serverId }) => {
  const queryClient = useQueryClient();
  
  // Use optimized React Query hooks
  const { data: productsData, isLoading: productsLoading } = useProducts(serverId);
  const { data: categoriesData, isLoading: categoriesLoading } = useApiQuery(`categories?server_id=${serverId}`, {
    staleTime: 300000, // 5 minutes for categories
  });

  // Local state for UI
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  // Mutations with optimistic updates
  const createProductMutation = useApiMutation(`products`, 'POST');
  const updateProductMutation = useApiMutation(`products/${editingProduct?.id}`, 'PUT');
  const deleteProductMutation = useApiMutation(`products`, 'DELETE');

  // Extract data with proper fallbacks
  const products = useMemo(() => {
    if (Array.isArray(productsData?.data?.products)) {
      return productsData.data.products;
    } else if (Array.isArray(productsData?.data)) {
      return productsData.data;
    } else if (Array.isArray(productsData?.items)) {
      return productsData.items;
    } else if (Array.isArray(productsData)) {
      return productsData;
    } else if (Array.isArray(productsData?.data?.items)) {
      return productsData.data.items;
    }
    return [];
  }, [productsData]);

  const categories = useMemo(() => {
    if (Array.isArray(categoriesData?.data?.categories)) {
      return categoriesData.data.categories;
    } else if (Array.isArray(categoriesData?.data)) {
      return categoriesData.data;
    } else if (Array.isArray(categoriesData)) {
      return categoriesData;
    }
    return [];
  }, [categoriesData]);

  const loading = productsLoading || categoriesLoading;

  // Event handlers
  const handleSearchChange = (q: string) => setSearchQuery(q);
  const handleCategoryChange = (catId: string) => setSelectedCategory(catId);

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleDelete = useCallback(async (productId: string) => {
    try {
      await deleteProductMutation.mutateAsync({ 
        server_id: serverId, 
        product_id: productId 
      });
      
      // Optimistically update the cache
      queryClient.setQueryData(['api', `products?server_id=${serverId}`], (oldData: any) => {
        if (!oldData) return oldData;
        
        const updatedProducts = products.filter(p => p.id !== productId);
        
        if (oldData.data?.products) {
          return { ...oldData, data: { ...oldData.data, products: updatedProducts } };
        } else if (Array.isArray(oldData.data)) {
          return { ...oldData, data: updatedProducts };
        } else if (Array.isArray(oldData)) {
          return updatedProducts;
        }
        
        return oldData;
      });
    } catch (error) {
      console.error('Delete failed', error);
    }
  }, [deleteProductMutation, serverId, products, queryClient]);

  const handleCreateProduct = () => {
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleSaveProduct = useCallback(async (data: Partial<Product>) => {
    try {
      const productData = { server_id: serverId, ...data };
      
      if (editingProduct?.id) {
        await updateProductMutation.mutateAsync(productData);
      } else {
        await createProductMutation.mutateAsync(productData);
      }
      
      setShowForm(false);
      setEditingProduct(null);
      
      // Invalidate and refetch products
      queryClient.invalidateQueries({ queryKey: ['api', `products?server_id=${serverId}`] });
    } catch (error) {
      console.error('Save failed', error);
    }
  }, [editingProduct, serverId, createProductMutation, updateProductMutation, queryClient]);

  const handleCreateCategory = () => {
    setShowCategoryManager(true);
  };

  const handleCategoryUpdate = useCallback(() => {
    // Invalidate categories cache when categories are updated
    queryClient.invalidateQueries({ queryKey: ['api', `categories?server_id=${serverId}`] });
    queryClient.invalidateQueries({ queryKey: ['api', `products?server_id=${serverId}`] });
  }, [queryClient, serverId]);

  // Client-side filtering with memoization
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p: Product) => {
      const matchesQuery = q ? (p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)) : true;
      const matchesCat = selectedCategory === 'all' ? true : p.category_id === selectedCategory;
      return matchesQuery && matchesCat;
    });
  }, [products, searchQuery, selectedCategory]);

  return (
    <div className="space-y-8">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setShowForm(false); setEditingProduct(null); }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative bg-white rounded-lg border border-gray-200 p-6 max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-xl"
          >
            <div className="absolute top-3 right-3">
              <button
                onClick={() => { setShowForm(false); setEditingProduct(null); }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <ProductForm
              product={editingProduct}
              categories={categories}
              onSave={handleSaveProduct}
              onCancel={() => { setShowForm(false); setEditingProduct(null); }}
            />
          </div>
        </div>
      )}

      {showCategoryManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCategoryManager(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative bg-white rounded-lg border border-gray-200 p-6 max-h-[90vh] w-full max-w-4xl overflow-y-auto shadow-xl"
          >
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setShowCategoryManager(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <CategoryManager
              serverId={serverId}
              categories={categories}
              products={products}
              onUpdate={handleCategoryUpdate}
            />
          </div>
        </div>
      )}

      <ProductList
        serverId={serverId}
        products={filteredProducts}
        categories={categories}
        searchQuery={searchQuery}
        selectedCategory={selectedCategory}
        onSearchChange={handleSearchChange}
        onCategoryChange={handleCategoryChange}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreateProduct={handleCreateProduct}
        onCreateCategory={handleCreateCategory}
      />

      {loading && (
        <div className="text-sm text-gray-500">Loading products...</div>
      )}
    </div>
  );
};