'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider } from '@/contexts/ServerContext';
import { SubscriptionStatus } from '@/components/subscription/SubscriptionStatus';
import { SubscriptionPlansComparison } from '@/components/subscription/SubscriptionPlansComparison';

export default function SubscriptionPage() {
  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <div className="p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900">Subscription & Billing</h1>
              <p className="text-gray-600 mt-2">
                Manage your subscription plans and billing across all servers
              </p>
            </div>
            <div className="space-y-8">
              {/* Current Subscription Status */}
              <SubscriptionStatus 
                subscription={null}
                currentPlan={null}
                isActive={false}
                isTrial={false}
                serverId=""
                onSubscriptionChange={() => {}}
              />

              {/* Available Plans (User-based) */}
              <SubscriptionPlansComparison 
                serverId=""
                currentPlan={undefined}
                onSubscriptionChange={() => {}}
              />
            </div>
          </div>
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}