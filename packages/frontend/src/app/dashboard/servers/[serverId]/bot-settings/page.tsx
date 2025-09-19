'use client';

import { Suspense, lazy } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider } from '@/contexts/ServerContext';
import { ServerSettingsSkeleton } from '@/components/ui/LoadingComponents';

// Lazy load bot settings components
const BotSettings = lazy(() => 
  import('@/components/dashboard/BotSettings').then(module => ({
    default: module.BotSettings
  }))
);

interface BotSettingsPageProps {
  params: {
    serverId: string;
  };
}

export default function BotSettingsPage({ params }: BotSettingsPageProps) {
  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <div className="p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Bot Settings</h1>
              <p className="text-gray-600">
                Configure your Discord bot's behavior and features.
              </p>
            </div>
            
            <Suspense fallback={<ServerSettingsSkeleton />}>
              <BotSettings serverId={params.serverId} />
            </Suspense>
          </div>
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}