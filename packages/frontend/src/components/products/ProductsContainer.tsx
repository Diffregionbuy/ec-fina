import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Product, Category } from '@/types/dashboard';
import { ProductList } from './ProductList';
import { ProductForm } from './ProductForm';
import { CategoryManager } from './CategoryManager';

interface ProductsContainerProps {
  serverId: string;
}

// Global cache for products data
const globalProductsCache = new Map<string, Promise<any>>();
const globalProductsDataCache = new Map<string, { products: Product[]; categories: Category[]; timestamp: number }>();
const PRODUCTS_CACHE_TTL = 20000; // 20 seconds

export const ProductsContainer: React.FC<ProductsContainerProps> = ({ serverId }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const mountedRef = useRef(true);
  const serverIdRef = useRef(serverId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    serverIdRef.current = serverId;
  }, [serverId]);

  // Helper: proxy fetch to backend (Next.js route proxies to backend service)
  const api = useMemo(() => {
    const base = '/api/backend';
    return {
      getProducts: async (sid: string) => {
        const url = `${base}/products?server_id=${encodeURIComponent(sid)}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
        return res.json();
      },
      getCategories: async (sid: string) => {
        const url = `${base}/categories?server_id=${encodeURIComponent(sid)}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
        return res.json();
      },
      createProduct: async (sid: string, data: Partial<Product>) => {
        const res = await fetch(`${base}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ server_id: sid, ...data }),
        });
        if (!res.ok) throw new Error(`Failed to create product: ${res.status}`);
        return res.json();
      },
      updateProduct: async (sid: string, id: string, data: Partial<Product>) => {
        const res = await fetch(`${base}/products/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ server_id: sid, ...data }),
        });
        if (!res.ok) throw new Error(`Failed to update product: ${res.status}`);
        return res.json();
      },
      deleteProduct: async (sid: string, id: string) => {
        const url = `${base}/products/${encodeURIComponent(id)}?server_id=${encodeURIComponent(sid)}`;
        const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to delete product: ${res.status}`);
        return res.json();
      },
    };
  }, []);

  const loadAll = useCallback(async () => {
    const cacheKey = `products-data-${serverId}`;
    
    // Check if we have fresh cached data
    const cachedData = globalProductsDataCache.get(cacheKey);
    if (cachedData && Date.now() - cachedData.timestamp < PRODUCTS_CACHE_TTL) {
      console.log(`[Products] 📦 Using cached products data for server ${serverId}`);
      if (mountedRef.current && serverIdRef.current === serverId) {
        setProducts(cachedData.products);
        setCategories(cachedData.categories);
        setLoading(false);
      }
      return;
    }

    // Check if there's already a fetch in progress
    let fetchPromise = globalProductsCache.get(cacheKey);
    
    if (!fetchPromise) {
      console.log(`[Products] 🔄 Fetching products data (optimized) for server ${serverId}`);
      
      fetchPromise = (async () => {
        try {
          const [prodRes, catRes] = await Promise.allSettled([
            api.getProducts(serverId),
            api.getCategories(serverId),
          ]);

          // Handle products response
          let prodList: any[] = [];
          if (prodRes.status === 'fulfilled') {
            const response = prodRes.value;
            if (Array.isArray(response?.data?.products)) {
              prodList = response.data.products;
            } else if (Array.isArray(response?.data)) {
              prodList = response.data;
            } else if (Array.isArray(response?.items)) {
              prodList = response.items;
            } else if (Array.isArray(response)) {
              prodList = response;
            } else if (Array.isArray(response?.data?.items)) {
              prodList = response.data.items;
            }
          } else {
            console.warn(`[Products] ❌ Products API failed:`, prodRes.reason);
          }

          // Handle categories response
          let catList: any[] = [];
          if (catRes.status === 'fulfilled') {
            const response = catRes.value;
            if (Array.isArray(response?.data?.categories)) {
              catList = response.data.categories;
            } else if (Array.isArray(response?.data)) {
              catList = response.data;
            } else if (Array.isArray(response)) {
              catList = response;
            }
          } else {
            console.warn(`[Products] ❌ Categories API failed:`, catRes.reason);
          }

          const result = {
            products: prodList as Product[],
            categories: catList as Category[],
            timestamp: Date.now()
          };

          // Cache the results
          globalProductsDataCache.set(cacheKey, result);
          return result;

        } catch (error) {
          console.error(`[Products] ❌ Failed to load products/categories:`, error);
          
          const fallbackData = {
            products: [],
            categories: [],
            timestamp: Date.now() - PRODUCTS_CACHE_TTL + 5000 // Expire in 5 seconds
          };
          
          globalProductsDataCache.set(cacheKey, fallbackData);
          return fallbackData;
        } finally {
          // Remove from fetch cache when done
          globalProductsCache.delete(cacheKey);
        }
      })();

      globalProductsCache.set(cacheKey, fetchPromise);
    } else {
      console.log(`[Products] ⏳ Waiting for existing products fetch for server ${serverId}`);
    }

    try {
      const result = await fetchPromise;
      
      // Only update state if component is still mounted and server hasn't changed
      if (mountedRef.current && serverIdRef.current === serverId) {
        setProducts(result.products);
        setCategories(result.categories);
        setLoading(false);
      }
    } catch (error) {
      if (mountedRef.current && serverIdRef.current === serverId) {
        setProducts([]);
        setCategories([]);
        setLoading(false);
      }
    }
  }, [api, serverId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSearchChange = (q: string) => setSearchQuery(q);
  const handleCategoryChange = (catId: string) => setSelectedCategory(catId);

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleDelete = async (productId: string) => {
    try {
      await api.deleteProduct(serverId, productId);
      
      // Invalidate cache after successful delete
      const cacheKey = `products-data-${serverId}`;
      globalProductsDataCache.delete(cacheKey);
      globalProductsCache.delete(cacheKey);
      console.log(`[Products] 🔄 Cache invalidated after product delete`);
      
      await loadAll();
    } catch (e) {
      console.error('Delete failed', e);
    }
  };

  const handleBulkDelete = async (productIds: string[]) => {
    try {
      await api.bulkDeleteProducts(productIds, serverId);
      
      // Invalidate cache after successful bulk delete
      const cacheKey = `products-data-${serverId}`;
      globalProductsDataCache.delete(cacheKey);
      globalProductsCache.delete(cacheKey);
      console.log(`[Products] 🔄 Cache invalidated after bulk product delete`);
      
      await loadAll();
    } catch (e) {
      console.error('Bulk delete failed', e);
    }
  };

  const handleCreateProduct = () => {
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleSaveProduct = async (data: Partial<Product>) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editingProduct?.id) {
        await api.updateProduct(serverId, editingProduct.id, data);
      } else {
        await api.createProduct(serverId, data);
      }
      
      // Invalidate cache after successful save
      const cacheKey = `products-data-${serverId}`;
      globalProductsDataCache.delete(cacheKey);
      globalProductsCache.delete(cacheKey);
      console.log(`[Products] 🔄 Cache invalidated after product save`);
      
      setShowForm(false);
      setEditingProduct(null);
      await loadAll();
    } catch (e) {
      console.error('Save failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCategory = () => {
    setShowCategoryManager(true);
  };

  const forceRefresh = useCallback(async () => {
    // Clear cache to force fresh data fetch
    const cacheKey = `products-data-${serverId}`;
    globalProductsDataCache.delete(cacheKey);
    globalProductsCache.delete(cacheKey);
    console.log(`[Products] 🔄 Cache cleared, forcing fresh data fetch`);
    
    await loadAll();
  }, [loadAll, serverId]);

  // Optional client-side filtering if backend returns all
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter(p => {
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
              onUpdate={forceRefresh}
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
        onBulkDelete={handleBulkDelete}
        onCreateProduct={handleCreateProduct}
        onCreateCategory={handleCreateCategory}
      />

      {loading && (
        <div className="text-sm text-gray-500">Loading products...</div>
      )}
    </div>
  );
};