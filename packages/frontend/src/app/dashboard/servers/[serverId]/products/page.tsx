'use client';

import { Suspense, lazy, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider, useServerContext } from '@/contexts/ServerContext';
import { ProductListSkeleton } from '@/components/ui/LoadingComponents';

const ProductsContainer = lazy(() => 
  import('@/components/products/ProductsContainer').then(module => ({
    default: module.ProductsContainer
  }))
);

interface ProductsPageProps {
  params: {
    serverId: string;
  };
}

function ProductsPageContent({ serverId }: { serverId: string }) {
  const { setSelectedServerId, servers, loading } = useServerContext();

  useEffect(() => {
    if (!loading && servers.length > 0 && serverId) {
      const serverExists = servers.find(server => server.id === serverId);
      if (serverExists) {
        setSelectedServerId(serverId);
      }
    }
  }, [serverId, servers, loading, setSelectedServerId]);

  return (
    <Suspense fallback={<ProductListSkeleton />}>
      <ProductsContainer serverId={serverId} />
    </Suspense>
  );
}

export default function ProductsPage({ params }: ProductsPageProps) {
  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <div className="p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Products</h1>
              <p className="text-gray-600">
                Manage your server's digital products and services.
              </p>
            </div>
            
            <ProductsPageContent serverId={params.serverId} />
          </div>
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}