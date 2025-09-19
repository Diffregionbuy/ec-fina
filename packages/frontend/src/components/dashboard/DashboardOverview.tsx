'use client';

import { useServerContext } from '@/contexts/ServerContext';
import { ServerOverview } from '@/components/dashboard/ServerOverview';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert } from '@/components/ui/Alert';
import { Plus, Server } from 'lucide-react';
import Link from 'next/link';

export function DashboardOverview() {
  const { selectedServer, loading, error, servers } = useServerContext();

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" className="mr-3" />
          <span className="text-lg text-gray-600">Loading dashboard...</span>
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

  if (!selectedServer) {
    return (
      <div className="p-8">
        <div className="text-center py-16">
          <Server className="w-16 h-16 text-gray-400 mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Select a server</h2>
          <p className="text-gray-600">
            Choose a server from the dropdown above to view its dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {selectedServer.name} Dashboard
        </h1>
        <p className="text-gray-600">
          Manage your Discord server's bot, products, and sales.
        </p>
      </div>

      {/* Server Overview */}
      <ServerOverview server={selectedServer} className="mb-8" />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <QuickActions server={selectedServer} />
        <RecentActivity server={selectedServer} />
      </div>
    </div>
  );
}