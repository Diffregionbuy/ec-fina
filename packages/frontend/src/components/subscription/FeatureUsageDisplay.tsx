'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { 
  BarChart3, 
  AlertTriangle,
  Info
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { apiClient } from '@/lib/api-client';

interface FeatureUsage {
  featureKey: string;
  usageCount: number;
  limit: number;
  isUnlimited: boolean;
  remainingUsage: number;
}

interface FeatureUsageDisplayProps {
  serverId: string;
  currentPlan: any;
}

export function FeatureUsageDisplay({ serverId, currentPlan }: FeatureUsageDisplayProps) {
  const { data: session } = useSession();
  const [usage, setUsage] = useState<FeatureUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsageData();
  }, [serverId]);

  const fetchUsageData = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiClient.getFeatureUsage(serverId);
      setUsage(data.data.usage);
    } catch (err) {
      console.error('Error fetching usage data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  };

  const formatFeatureName = (featureKey: string) => {
    return featureKey
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/([a-z])([A-Z])/g, '$1 $2');
  };

  const getUsagePercentage = (usage: FeatureUsage) => {
    if (usage.isUnlimited) return 0;
    return Math.min((usage.usageCount / usage.limit) * 100, 100);
  };

  const getUsageColor = (usage: FeatureUsage) => {
    if (usage.isUnlimited) return 'bg-green-500';
    
    const percentage = getUsagePercentage(usage);
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const getUsageStatus = (usage: FeatureUsage) => {
    if (usage.isUnlimited) return 'unlimited';
    
    const percentage = getUsagePercentage(usage);
    if (percentage >= 100) return 'exceeded';
    if (percentage >= 90) return 'critical';
    if (percentage >= 75) return 'warning';
    return 'normal';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'exceeded':
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'unlimited':
        return <Info className="h-5 w-5 text-green-500" />;
      default:
        return <BarChart3 className="h-5 w-5 text-blue-500" />;
    }
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

  if (usage.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Feature Usage</h2>
        <p className="text-sm text-gray-600 mt-1">
          Track your current usage against plan limits
        </p>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {usage.map((featureUsage) => {
            const status = getUsageStatus(featureUsage);
            const percentage = getUsagePercentage(featureUsage);

            return (
              <div
                key={featureUsage.featureKey}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(status)}
                    <h3 className="text-sm font-medium text-gray-900">
                      {formatFeatureName(featureUsage.featureKey)}
                    </h3>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Used:</span>
                    <span className="font-medium text-gray-900">
                      {featureUsage.usageCount.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Limit:</span>
                    <span className="font-medium text-gray-900">
                      {featureUsage.isUnlimited 
                        ? 'Unlimited' 
                        : featureUsage.limit.toLocaleString()
                      }
                    </span>
                  </div>

                  {!featureUsage.isUnlimited && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Remaining:</span>
                        <span className={`font-medium ${
                          featureUsage.remainingUsage <= 0 
                            ? 'text-red-600' 
                            : featureUsage.remainingUsage < featureUsage.limit * 0.1
                            ? 'text-yellow-600'
                            : 'text-green-600'
                        }`}>
                          {Math.max(0, featureUsage.remainingUsage).toLocaleString()}
                        </span>
                      </div>

                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Usage</span>
                          <span>{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${getUsageColor(featureUsage)}`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {featureUsage.isUnlimited && (
                    <div className="mt-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Unlimited
                      </span>
                    </div>
                  )}

                  {status === 'exceeded' && (
                    <div className="mt-2 text-xs text-red-600">
                      Limit exceeded. Consider upgrading your plan.
                    </div>
                  )}

                  {status === 'critical' && (
                    <div className="mt-2 text-xs text-red-600">
                      Approaching limit. Consider upgrading soon.
                    </div>
                  )}

                  {status === 'warning' && (
                    <div className="mt-2 text-xs text-yellow-600">
                      Usage is high. Monitor closely.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-blue-900">
                Need more resources?
              </h4>
              <p className="text-sm text-blue-700 mt-1">
                Upgrade your subscription plan to get higher limits and access to premium features.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}