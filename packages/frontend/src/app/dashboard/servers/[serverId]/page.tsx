'use client';

import { useEffect, Suspense, lazy } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider, useServerContext } from '@/contexts/ServerContext';
import { saveLastVisitedServer } from '@/utils/serverPreferences';
import { DashboardSkeleton } from '@/components/ui/LoadingComponents';
import { usePrefetchServerData } from '@/hooks/useApiQuery';

// Lazy load the optimized dashboard overview component
const OptimizedDashboardOverview = lazy(() => 
  import('@/components/dashboard/OptimizedDashboardOverview').then(module => ({
    default: module.OptimizedDashboardOverview
  }))
);

interface OptimizedServerPageProps {
  params: {
    serverId: string;
  };
}

function OptimizedServerPageContent({ serverId }: { serverId: string }) {
  const { setSelectedServerId, servers, loading } = useServerContext();
  const prefetchServerData = usePrefetchServerData();

  useEffect(() => {
    // Set the selected server based on the URL parameter once servers are loaded
    if (!loading && servers.length > 0 && serverId) {
      const serverExists = servers.find(server => server.id === serverId);
      if (serverExists) {
        setSelectedServerId(serverId);
        // Save this server as the user's preference when they visit directly
        saveLastVisitedServer(serverId, serverExists.name);
        
        // Prefetch server data for better performance
        prefetchServerData(serverId).catch(console.error);
      }
    }
  }, [serverId, servers, loading, setSelectedServerId, prefetchServerData]);

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <OptimizedDashboardOverview />
    </Suspense>
  );
}

export default function OptimizedServerPage({ params }: OptimizedServerPageProps) {
  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <OptimizedServerPageContent serverId={params.serverId} />
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}