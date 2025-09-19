'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { X, AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { apiClient } from '@/lib/api-client';

interface SubscriptionCancelModalProps {
  subscription: any;
  currentPlan: any;
  serverId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SubscriptionCancelModal({
  subscription,
  currentPlan,
  serverId,
  onClose,
  onSuccess
}: SubscriptionCancelModalProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(true);

  const handleCancel = async () => {
    try {
      setLoading(true);
      setError(null);

      await apiClient.cancelSubscription(serverId, cancelAtPeriodEnd);
      onSuccess();
    } catch (err) {
      console.error('Error cancelling subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Cancel Subscription
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-center space-x-3 p-4 bg-yellow-50 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-yellow-800">
                You're about to cancel your {currentPlan?.displayName} subscription
              </h4>
              <p className="text-sm text-yellow-700 mt-1">
                This action cannot be undone, but you can resubscribe at any time.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            What happens when you cancel:
          </h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-3 mt-2 flex-shrink-0" />
              You'll lose access to premium features
            </li>
            <li className="flex items-start">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-3 mt-2 flex-shrink-0" />
              Your bot will be downgraded to the free plan limits
            </li>
            <li className="flex items-start">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-3 mt-2 flex-shrink-0" />
              No more charges will be made to your payment method
            </li>
            <li className="flex items-start">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-3 mt-2 flex-shrink-0" />
              Your data and settings will be preserved
            </li>
          </ul>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Cancellation Options:
          </h4>
          <div className="space-y-3">
            <label className="flex items-start">
              <input
                type="radio"
                name="cancelOption"
                checked={cancelAtPeriodEnd}
                onChange={() => setCancelAtPeriodEnd(true)}
                className="mt-1 mr-3"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Cancel at period end (Recommended)
                </div>
                <div className="text-sm text-gray-600">
                  Keep access until {formatDate(subscription.currentPeriodEnd)}, then downgrade to free plan
                </div>
              </div>
            </label>
            <label className="flex items-start">
              <input
                type="radio"
                name="cancelOption"
                checked={!cancelAtPeriodEnd}
                onChange={() => setCancelAtPeriodEnd(false)}
                className="mt-1 mr-3"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Cancel immediately
                </div>
                <div className="text-sm text-gray-600">
                  Lose access right away (no refund for remaining time)
                </div>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Keep Subscription
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Cancelling...
              </>
            ) : (
              'Cancel Subscription'
            )}
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          Need help? Contact our support team before cancelling.
        </div>
      </div>
    </div>
  );
}