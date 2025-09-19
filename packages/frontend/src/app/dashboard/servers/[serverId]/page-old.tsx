'use client';

import { useEffect, Suspense, lazy } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider, useServerContext } from '@/contexts/ServerContext';
import { saveLastVisitedServer } from '@/utils/serverPreferences';
import { DashboardSkeleton } from '@/components/ui/LoadingComponents';

// Lazy load the dashboard overview component
const DashboardOverview = lazy(() => 
  import('@/components/dashboard/DashboardOverview').then(module => ({
    default: module.DashboardOverview
  }))
);

interface ServerPageProps {
  params: {
    serverId: string;
  };
}

function ServerPageContent({ serverId }: { serverId: string }) {
  const { setSelectedServerId, servers, loading } = useServerContext();

  useEffect(() => {
    // Set the selected server based on the URL parameter once servers are loaded
    if (!loading && servers.length > 0 && serverId) {
      const serverExists = servers.find(server => server.id === serverId);
      if (serverExists) {
        setSelectedServerId(serverId);
        // Save this server as the user's preference when they visit directly
        saveLastVisitedServer(serverId, serverExists.name);
      }
    }
  }, [serverId, servers, loading, setSelectedServerId]);

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardOverview />
    </Suspense>
  );
}

export default function ServerPage({ params }: ServerPageProps) {
  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <ServerPageContent serverId={params.serverId} />
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}