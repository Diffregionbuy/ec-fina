'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Check, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { SubscriptionPurchaseModal } from './SubscriptionPurchaseModal';
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
  isActive: boolean;
}

interface SubscriptionPlansComparisonProps {
  serverId: string;
  currentPlan?: SubscriptionPlan;
  onSubscriptionChange: () => void;
}

export function SubscriptionPlansComparison({
  serverId,
  currentPlan,
  onSubscriptionChange
}: SubscriptionPlansComparisonProps) {
  const { data: session } = useSession();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiClient.getSubscriptionPlans();
      setPlans(data.data.plans);
    } catch (err) {
      console.error('Error fetching plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanSelect = (plan: SubscriptionPlan) => {
    if (plan.name === 'free') return;
    if (currentPlan?.id === plan.id) return;
    
    setSelectedPlan(plan);
    setShowPurchaseModal(true);
  };

  const formatPrice = (price: number, currency: string, interval: string) => {
    if (price === 0) return 'Free';
    return `$${price.toFixed(2)}/${interval === 'monthly' ? 'month' : 'year'}`;
  };

  const isCurrentPlan = (plan: SubscriptionPlan) => {
    return currentPlan?.id === plan.id;
  };

  const getPlanButtonText = (plan: SubscriptionPlan) => {
    if (plan.name === 'free') return 'Current Plan';
    if (isCurrentPlan(plan)) return 'Current Plan';
    if (currentPlan && plan.price < currentPlan.price) return 'Downgrade';
    if (currentPlan && plan.price > currentPlan.price) return 'Upgrade';
    return 'Subscribe';
  };

  const getPlanButtonStyle = (plan: SubscriptionPlan) => {
    if (plan.name === 'free' || isCurrentPlan(plan)) {
      return 'bg-gray-100 text-gray-500 cursor-not-allowed';
    }
    if (plan.name === 'premium') {
      return 'bg-blue-600 hover:bg-blue-700 text-white';
    }
    if (plan.name === 'enterprise') {
      return 'bg-purple-600 hover:bg-purple-700 text-white';
    }
    return 'bg-gray-600 hover:bg-gray-700 text-white';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <ErrorMessage message={error} />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Subscription Plans</h2>
          <p className="text-sm text-gray-600 mt-1">
            Choose the plan that best fits your server's needs
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-lg border-2 p-6 ${
                  isCurrentPlan(plan)
                    ? 'border-blue-500 bg-blue-50'
                    : plan.name === 'premium'
                    ? 'border-blue-200 hover:border-blue-300'
                    : plan.name === 'enterprise'
                    ? 'border-purple-200 hover:border-purple-300'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {isCurrentPlan(plan) && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                      Current Plan
                    </span>
                  </div>
                )}

                {plan.name === 'premium' && !isCurrentPlan(plan) && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {plan.displayName}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {plan.description}
                  </p>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-gray-900">
                      {formatPrice(plan.price, plan.currency, plan.billingInterval)}
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Features:</h4>
                  <ul className="space-y-2">
                    {Object.entries(plan.features).map(([key, value]) => (
                      <li key={key} className="flex items-center text-sm">
                        {value ? (
                          <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                        ) : (
                          <X className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                        )}
                        <span className={value ? 'text-gray-700' : 'text-gray-400'}>
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Limits:</h4>
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

                <div className="mt-8">
                  <button
                    onClick={() => handlePlanSelect(plan)}
                    disabled={plan.name === 'free' || isCurrentPlan(plan)}
                    className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${getPlanButtonStyle(plan)}`}
                  >
                    {getPlanButtonText(plan)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showPurchaseModal && selectedPlan && (
        <SubscriptionPurchaseModal
          plan={selectedPlan}
          serverId={serverId}
          onClose={() => {
            setShowPurchaseModal(false);
            setSelectedPlan(null);
          }}
          onSuccess={() => {
            setShowPurchaseModal(false);
            setSelectedPlan(null);
            onSubscriptionChange();
          }}
        />
      )}
    </>
  );
}