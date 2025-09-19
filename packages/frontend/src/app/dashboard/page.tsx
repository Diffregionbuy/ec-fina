'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider } from '@/contexts/ServerContext';
import { DashboardRedirect } from '@/components/dashboard/DashboardRedirect';

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <DashboardRedirect />
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}
