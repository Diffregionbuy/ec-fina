'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { X, CreditCard } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { apiClient } from '@/lib/api-client';

interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  description: string;
  price: number;
  currency: string;
  billingInterval: 'monthly' | 'yearly';
  features: Record<string, any>;
  limits: Record<string, any>;
}

interface SubscriptionPurchaseModalProps {
  plan: SubscriptionPlan;
  serverId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SubscriptionPurchaseModal({
  plan,
  serverId,
  onClose,
  onSuccess
}: SubscriptionPurchaseModalProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'crypto'>('card');

  const handleSubscribe = async () => {
    try {
      setLoading(true);
      setError(null);

      await apiClient.subscribe(serverId, plan.id, paymentMethod);
      onSuccess();
    } catch (err) {
      console.error('Error creating subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to create subscription');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number, currency: string, interval: string) => {
    return `$${price.toFixed(2)}/${interval === 'monthly' ? 'month' : 'year'}`;
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Subscribe to {plan.displayName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {formatPrice(plan.price, plan.currency, plan.billingInterval)}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {plan.description}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            What you'll get:
          </h4>
          <ul className="space-y-2">
            {Object.entries(plan.features).map(([key, value]) => (
              value && (
                <li key={key} className="flex items-center text-sm text-gray-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3 flex-shrink-0" />
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </li>
              )
            ))}
          </ul>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Plan Limits:
          </h4>
          <ul className="space-y-2">
            {Object.entries(plan.limits).map(([key, value]) => (
              <li key={key} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
                </span>
                <span className="font-medium text-gray-900">
                  {value === -1 ? 'Unlimited' : value.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Payment Method:
          </h4>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="paymentMethod"
                value="card"
                checked={paymentMethod === 'card'}
                onChange={(e) => setPaymentMethod(e.target.value as 'card' | 'crypto')}
                className="mr-3"
              />
              <CreditCard className="h-5 w-5 text-gray-400 mr-2" />
              <span className="text-sm text-gray-700">Credit/Debit Card</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="paymentMethod"
                value="crypto"
                checked={paymentMethod === 'crypto'}
                onChange={(e) => setPaymentMethod(e.target.value as 'card' | 'crypto')}
                className="mr-3"
              />
              <div className="w-5 h-5 bg-orange-500 rounded mr-2" />
              <span className="text-sm text-gray-700">Cryptocurrency (OKX)</span>
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
            Cancel
          </button>
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Processing...
              </>
            ) : (
              `Subscribe for ${formatPrice(plan.price, plan.currency, plan.billingInterval)}`
            )}
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          By subscribing, you agree to our Terms of Service and Privacy Policy.
          You can cancel anytime from your subscription settings.
        </div>
      </div>
    </div>
  );
}