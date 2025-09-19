'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  Calendar,
  CreditCard
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SubscriptionCancelModal } from './SubscriptionCancelModal';
import { apiClient } from '@/lib/api-client';

interface SubscriptionStatusProps {
  subscription: any;
  currentPlan: any;
  isActive: boolean;
  isTrial: boolean;
  serverId: string;
  onSubscriptionChange: () => void;
}

export function SubscriptionStatus({
  subscription,
  currentPlan,
  isActive,
  isTrial,
  serverId,
  onSubscriptionChange
}: SubscriptionStatusProps) {
  const { data: session } = useSession();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const getStatusIcon = () => {
    if (!subscription) {
      return <CheckCircle className="h-6 w-6 text-gray-500" />;
    }

    switch (subscription.status) {
      case 'active':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'cancelled':
        return <AlertTriangle className="h-6 w-6 text-yellow-500" />;
      case 'expired':
        return <XCircle className="h-6 w-6 text-red-500" />;
      default:
        return <AlertTriangle className="h-6 w-6 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    if (!subscription) {
      return 'Free Plan';
    }

    if (isTrial) {
      return 'Trial Active';
    }

    switch (subscription.status) {
      case 'active':
        return subscription.cancelAtPeriodEnd ? 'Cancelling at Period End' : 'Active';
      case 'cancelled':
        return 'Cancelled';
      case 'expired':
        return 'Expired';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    if (!subscription) {
      return 'text-gray-600';
    }

    if (isTrial) {
      return 'text-blue-600';
    }

    switch (subscription.status) {
      case 'active':
        return subscription.cancelAtPeriodEnd ? 'text-yellow-600' : 'text-green-600';
      case 'cancelled':
        return 'text-yellow-600';
      case 'expired':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleReactivate = async () => {
    try {
      setLoading(true);

      await apiClient.reactivateSubscription(serverId);
      onSubscriptionChange();
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      // Handle error (show toast, etc.)
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Current Subscription</h2>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon()}
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {currentPlan?.displayName || 'Free Plan'}
                </h3>
                <p className={`text-sm font-medium ${getStatusColor()}`}>
                  {getStatusText()}
                </p>
                {currentPlan?.description && (
                  <p className="text-sm text-gray-600 mt-1">
                    {currentPlan.description}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right">
              {currentPlan && currentPlan.price > 0 && (
                <div className="text-lg font-semibold text-gray-900">
                  ${currentPlan.price.toFixed(2)}/{currentPlan.billingInterval === 'monthly' ? 'month' : 'year'}
                </div>
              )}
            </div>
          </div>

          {subscription && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Current Period</p>
                  <p className="text-sm text-gray-600">
                    {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
              </div>

              {subscription.status === 'active' && !subscription.cancelAtPeriodEnd && (
                <div className="flex items-center space-x-3">
                  <CreditCard className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Next Billing</p>
                    <p className="text-sm text-gray-600">
                      {formatDate(subscription.currentPeriodEnd)}
                    </p>
                  </div>
                </div>
              )}

              {isTrial && subscription.trialEnd && (
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-5 w-5 text-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Trial Ends</p>
                    <p className="text-sm text-gray-600">
                      {formatDate(subscription.trialEnd)}
                    </p>
                  </div>
                </div>
              )}

              {subscription.cancelledAt && (
                <div className="flex items-center space-x-3">
                  <XCircle className="h-5 w-5 text-red-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Cancelled On</p>
                    <p className="text-sm text-gray-600">
                      {formatDate(subscription.cancelledAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {subscription && subscription.status === 'active' && (
            <div className="mt-6 flex space-x-3">
              {subscription.cancelAtPeriodEnd ? (
                <button
                  onClick={handleReactivate}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Reactivating...
                    </>
                  ) : (
                    'Reactivate Subscription'
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showCancelModal && subscription && (
        <SubscriptionCancelModal
          subscription={subscription}
          currentPlan={currentPlan}
          serverId={serverId}
          onClose={() => setShowCancelModal(false)}
          onSuccess={() => {
            setShowCancelModal(false);
            onSubscriptionChange();
          }}
        />
      )}
    </>
  );
}