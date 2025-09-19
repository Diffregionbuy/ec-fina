'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert } from '@/components/ui/Alert';
import { apiClient } from '@/lib/api-client';
import { Wallet } from '@/types/dashboard';

interface PaymentMethodConfigProps {
  wallet: Wallet;
  onUpdate: () => void;
}

export function PaymentMethodConfig({ wallet, onUpdate }: PaymentMethodConfigProps) {
  const [walletAddress, setWalletAddress] = useState(wallet.okx_wallet_address || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Basic validation
    if (walletAddress && (walletAddress.length < 26 || walletAddress.length > 62)) {
      setError('Please enter a valid wallet address');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Update wallet configuration via API
      await apiClient.updateWalletConfig({
        okx_wallet_address: walletAddress.trim() || null
      });
      
      setSuccess('Payment method updated successfully!');
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment method');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAddress = () => {
    setWalletAddress('');
  };

  return (
    <div className="space-y-6">
      {/* OKX Wallet Configuration */}
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment Method Configuration</h2>
          <p className="text-gray-600">
            Configure your preferred wallet address for receiving payments and withdrawals.
          </p>
        </div>

        {error && <Alert variant="error" description={error} className="mb-4" />}
        {success && <Alert variant="success" description={success} className="mb-4" />}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Default Wallet Address */}
          <div>
            <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700 mb-2">
              Default Wallet Address
            </label>
            <div className="relative">
              <input
                type="text"
                id="walletAddress"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Enter your crypto wallet address (optional)"
                className="block w-full px-3 py-3 pr-20 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isSubmitting}
              />
              {walletAddress && (
                <button
                  type="button"
                  onClick={handleClearAddress}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  disabled={isSubmitting}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              This address will be used as the default for withdrawals. You can always specify a different address when making a withdrawal.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Payment Processing Status */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Processing Status</h3>
        
        <div className="space-y-4">
          {/* OKX Integration Status */}
          <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">OKX Payment Integration</p>
                <p className="text-sm text-green-600">Active and ready to process payments</p>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Connected
            </span>
          </div>

          {/* Wallet Status */}
          <div className={`flex items-center justify-between p-4 border rounded-lg ${
            walletAddress 
              ? 'bg-green-50 border-green-200' 
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {walletAddress ? (
                  <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${
                  walletAddress ? 'text-green-800' : 'text-yellow-800'
                }`}>
                  Default Wallet Address
                </p>
                <p className={`text-sm ${
                  walletAddress ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {walletAddress 
                    ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`
                    : 'No default address configured'
                  }
                </p>
              </div>
            </div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              walletAddress 
                ? 'bg-green-100 text-green-800' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {walletAddress ? 'Configured' : 'Optional'}
            </span>
          </div>
        </div>

        {/* Information Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                How Payment Processing Works
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <ul className="list-disc list-inside space-y-1">
                  <li>Customers pay using cryptocurrency through OKX integration</li>
                  <li>Payments are automatically processed and added to your balance</li>
                  <li>You can withdraw earnings to any compatible wallet address</li>
                  <li>Setting a default address makes withdrawals faster and easier</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}