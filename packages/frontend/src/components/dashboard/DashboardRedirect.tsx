'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useServerContext } from '@/contexts/ServerContext';
import { getBestServerForRedirect, saveLastVisitedServer } from '@/utils/serverPreferences';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert } from '@/components/ui/Alert';
import { Plus, Server } from 'lucide-react';
import Link from 'next/link';

export function DashboardRedirect() {
  const { servers, loading, error } = useServerContext();
  const router = useRouter();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    console.log('🔄 DashboardRedirect component mounted');
    console.log('🔄 Loading:', loading, 'HasRedirected:', hasRedirected);
    console.log('🔄 Servers:', servers);
    
    if (loading || hasRedirected) return;

    // Handle no servers case
    if (servers.length === 0) {
      console.log('🔄 No servers found, staying on dashboard');
      return; // Let the component render the no servers UI
    }

    // Get the best server to redirect to
    const bestServerId = getBestServerForRedirect(servers);
    console.log('🔄 Best server ID for redirect:', bestServerId);
    
    if (bestServerId) {
      const selectedServer = servers.find(s => s.id === bestServerId);
      
      // Save this choice as the user's preference
      if (selectedServer) {
        saveLastVisitedServer(bestServerId, selectedServer.name);
      }
      
      // Set redirect flag to prevent multiple redirects
      setHasRedirected(true);
      
      console.log('🔄 DashboardRedirect: Redirecting to server dashboard:', bestServerId);
      // Use push instead of replace to avoid redirect loops
      router.push(`/dashboard/servers/${bestServerId}`);
    }
  }, [servers, loading, router, hasRedirected]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" className="mr-3" />
          <span className="text-lg text-gray-600">Loading your servers...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Alert variant="error" className="mb-6">
          <p>{error}</p>
        </Alert>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="p-8">
        <div className="text-center py-16">
          <Server className="w-16 h-16 text-gray-400 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No servers found</h2>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            You need to own a Discord server or have "Manage Server" permissions to use EcBot. 
            Get started by adding your first server.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Your First Server
          </Link>
        </div>
      </div>
    );
  }

  // This should not render as we redirect above, but just in case
  return (
    <div className="p-8">
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" className="mr-3" />
        <span className="text-lg text-gray-600">Redirecting to your dashboard...</span>
      </div>
    </div>
  );
}