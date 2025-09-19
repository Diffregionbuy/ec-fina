'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert } from '@/components/ui/Alert';
import { apiClient } from '@/lib/api-client';
import { Wallet } from '@/types/dashboard';

interface WithdrawalFormProps {
  wallet: Wallet;
  onSuccess: () => void;
}

export function WithdrawalForm({ wallet, onSuccess }: WithdrawalFormProps) {
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const minWithdrawal = 10; // Minimum withdrawal amount
  const maxWithdrawal = wallet.balance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const withdrawalAmount = parseFloat(amount);

    // Validation
    if (!withdrawalAmount || withdrawalAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (withdrawalAmount < minWithdrawal) {
      setError(`Minimum withdrawal amount is $${minWithdrawal}`);
      return;
    }

    if (withdrawalAmount > maxWithdrawal) {
      setError('Insufficient balance');
      return;
    }

    if (!address.trim()) {
      setError('Please enter a valid wallet address');
      return;
    }

    // Basic address validation (simplified)
    if (address.length < 26 || address.length > 62) {
      setError('Please enter a valid wallet address');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.requestWithdrawal(withdrawalAmount, address.trim());
      
      setSuccess('Withdrawal request submitted successfully! Processing may take 1-3 business days.');
      setAmount('');
      setAddress('');
      
      // Call onSuccess after a short delay to show the success message
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit withdrawal request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMaxClick = () => {
    setAmount(maxWithdrawal.toString());
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(amount);
  };

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Request Withdrawal</h2>
        <p className="text-gray-600">
          Withdraw your earnings to your crypto wallet. Processing typically takes 1-3 business days.
        </p>
      </div>

      {/* Balance Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">Available Balance</p>
            <p className="text-2xl font-bold text-blue-900">
              {formatCurrency(wallet.balance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-blue-700">Minimum: {formatCurrency(minWithdrawal)}</p>
            <p className="text-sm text-blue-700">Maximum: {formatCurrency(maxWithdrawal)}</p>
          </div>
        </div>
      </div>

      {error && <Alert variant="error" description={error} className="mb-4" />}
      {success && <Alert variant="success" description={success} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Amount Input */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
            Withdrawal Amount (USD)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={minWithdrawal}
              max={maxWithdrawal}
              step="0.01"
              placeholder="0.00"
              className="block w-full pl-7 pr-20 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isSubmitting}
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                type="button"
                onClick={handleMaxClick}
                className="mr-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                disabled={isSubmitting}
              >
                MAX
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Enter amount between {formatCurrency(minWithdrawal)} and {formatCurrency(maxWithdrawal)}
          </p>
        </div>

        {/* Wallet Address Input */}
        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
            Wallet Address
          </label>
          <input
            type="text"
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter your crypto wallet address"
            className="block w-full px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isSubmitting}
          />
          <p className="mt-1 text-sm text-gray-500">
            Make sure this address supports the currency you're withdrawing
          </p>
        </div>

        {/* Fee Information */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Important Information
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ul className="list-disc list-inside space-y-1">
                  <li>Network fees may apply and will be deducted from your withdrawal</li>
                  <li>Processing time: 1-3 business days</li>
                  <li>Double-check your wallet address - transactions cannot be reversed</li>
                  <li>Minimum withdrawal: {formatCurrency(minWithdrawal)}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-gray-500">
            You will receive: <span className="font-medium">
              {amount ? formatCurrency(parseFloat(amount) || 0) : '$0.00'}
            </span>
            <span className="text-xs block">
              (minus network fees)
            </span>
          </div>
          <Button
            type="submit"
            disabled={isSubmitting || !amount || !address || parseFloat(amount) < minWithdrawal}
            className="min-w-[120px]"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="sm" />
                Processing...
              </>
            ) : (
              'Submit Withdrawal'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}