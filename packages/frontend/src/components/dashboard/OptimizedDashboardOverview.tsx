'use client';

import { useServerContext } from '@/contexts/ServerContext';
import { OptimizedServerOverview } from './OptimizedServerOverview';
import { QuickActions } from './QuickActions';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Card, CardContent } from '@/components/ui/Card';
import { AlertCircle } from 'lucide-react';

export function OptimizedDashboardOverview() {
  const { selectedServer, loading, error } = useServerContext();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" className="mr-3" />
        <span className="text-lg text-gray-600">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <div className="flex items-center text-red-700">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span>Error loading dashboard: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedServer) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            <p>No server selected. Please select a server from the sidebar.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Optimized Server Overview with React Query caching */}
      <OptimizedServerOverview server={selectedServer} />
      
      {/* Setup Progress, Quick Actions, and Subscription in horizontal layout */}
      <div className="w-full">
        <QuickActions server={selectedServer} />
      </div>
    </div>
  );
}
