'use client';

import { Card } from '@/components/ui/Card';
import { Wallet } from '@/types/dashboard';

interface WalletBalanceProps {
  wallet: Wallet;
}

export function WalletBalance({ wallet }: WalletBalanceProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Current Balance */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Current Balance</p>
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(wallet.balance)}
            </p>
          </div>
          <div className="p-3 bg-green-100 rounded-full">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
              />
            </svg>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center text-sm text-gray-600">
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2"></span>
            Available for withdrawal
          </div>
        </div>
      </Card>

      {/* Total Earned */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Total Earned</p>
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(wallet.total_earned)}
            </p>
          </div>
          <div className="p-3 bg-blue-100 rounded-full">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center text-sm text-gray-600">
            <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
            All-time earnings
          </div>
        </div>
      </Card>

      {/* Total Withdrawn */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Total Withdrawn</p>
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(wallet.total_withdrawn)}
            </p>
          </div>
          <div className="p-3 bg-purple-100 rounded-full">
            <svg
              className="w-6 h-6 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center text-sm text-gray-600">
            <span className="inline-block w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
            Successfully withdrawn
          </div>
        </div>
      </Card>
    </div>
  );
}