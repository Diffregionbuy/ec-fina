'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Wallet } from '@/types/dashboard';
import { CreditCard, Building, Plus, Trash2, AlertCircle } from 'lucide-react';
import { stripeApiService, StripePaymentMethod } from '@/services/stripeApi';

interface FiatWithdrawalProps {
  wallet: Wallet | null;
  onSuccess: () => void;
}

export function FiatWithdrawal({ wallet, onSuccess }: FiatWithdrawalProps) {
  const [paymentMethods, setPaymentMethods] = useState<StripePaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<StripePaymentMethod | null>(null);
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingMethod, setIsAddingMethod] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableBalance = wallet?.balance || 0;

  useEffect(() => {
    loadPaymentMethods();
  }, []);

  const loadPaymentMethods = async () => {
    try {
      setIsLoading(true);
      const methods = await stripeApiService.getPaymentMethods();
      setPaymentMethods(methods);
      if (methods.length > 0 && !selectedMethod) {
        setSelectedMethod(methods[0]);
      }
    } catch (error) {
      console.error('Failed to load payment methods:', error);
      setError('Failed to load payment methods');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    try {
      setIsAddingMethod(true);
      const { client_secret } = await stripeApiService.createSetupIntent();
      
      // In a real implementation, you would use Stripe Elements here
      // For now, we'll simulate adding a payment method
      console.log('Setup intent created:', client_secret);
      
      // Simulate successful payment method addition
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reload payment methods
      await loadPaymentMethods();
      
    } catch (error) {
      console.error('Failed to add payment method:', error);
      setError('Failed to add payment method');
    } finally {
      setIsAddingMethod(false);
    }
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    try {
      await stripeApiService.deletePaymentMethod(methodId);
      await loadPaymentMethods();
      
      // If deleted method was selected, select first available
      if (selectedMethod?.id === methodId && paymentMethods.length > 1) {
        const remaining = paymentMethods.filter(m => m.id !== methodId);
        setSelectedMethod(remaining[0] || null);
      }
    } catch (error) {
      console.error('Failed to delete payment method:', error);
      setError('Failed to delete payment method');
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedMethod || !withdrawalAmount) {
      setError('Please select a payment method and enter an amount');
      return;
    }

    const amount = parseFloat(withdrawalAmount);
    if (amount <= 0 || amount > availableBalance) {
      setError('Invalid withdrawal amount');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await stripeApiService.createWithdrawal({
        amount: amount * 100, // Convert to cents
        currency: 'usd',
        payment_method_id: selectedMethod.id,
        description: `Wallet withdrawal - ${amount} USD`
      });

      onSuccess();
    } catch (error) {
      console.error('Withdrawal failed:', error);
      setError(error instanceof Error ? error.message : 'Withdrawal failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPaymentMethodIcon = (method: StripePaymentMethod) => {
    switch (method.type) {
      case 'card':
        return <CreditCard className="w-6 h-6" />;
      case 'us_bank_account':
      case 'bank_account':
        return <Building className="w-6 h-6" />;
      default:
        return <CreditCard className="w-6 h-6" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const calculateFees = () => {
    if (!selectedMethod || !withdrawalAmount) return { fee: 0, total: 0 };
    
    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount <= 0) return { fee: 0, total: 0 };
    
    return stripeApiService.getWithdrawalFee(amount, selectedMethod);
  };

  const { fee, total } = calculateFees();

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="overflow-hidden">
          <div className="p-8">
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
              <span className="ml-3 text-gray-600">Loading payment methods...</span>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="overflow-hidden relative">
        <div className="p-8 space-y-8 pb-0">
          {/* Balance Display */}
          <div className="bg-blue-50 p-6 rounded-lg">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Available Balance</h3>
              <div className="text-3xl font-bold text-blue-600">
                {formatCurrency(availableBalance)}
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <span className="text-red-700">{error}</span>
              </div>
            </div>
          )}

          {/* Payment Methods */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Payment Methods</h3>
              <Button
                onClick={handleAddPaymentMethod}
                disabled={isAddingMethod}
                variant="outline"
                size="sm"
              >
                {isAddingMethod ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Method
                  </>
                )}
              </Button>
            </div>

            {paymentMethods.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CreditCard className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No payment methods added yet</p>
                <p className="text-sm">Add a payment method to start withdrawing funds</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className={`p-4 border-2 rounded-lg transition-colors ${
                      selectedMethod?.id === method.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setSelectedMethod(method)}
                        className="flex items-center space-x-4 flex-1 text-left"
                      >
                        <div className={`p-2 rounded-lg ${
                          selectedMethod?.id === method.id 
                            ? 'bg-blue-100 text-blue-600' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {getPaymentMethodIcon(method)}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">
                            {stripeApiService.formatPaymentMethod(method)}
                          </div>
                          <div className="text-sm text-gray-600">
                            {stripeApiService.getProcessingTime(method)}
                          </div>
                        </div>
                      </button>
                      <Button
                        onClick={() => handleDeletePaymentMethod(method.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Withdrawal Form */}
          {selectedMethod && (
            <form onSubmit={handleWithdraw} className="space-y-6">
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Withdrawal Amount
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">$</span>
                  </div>
                  <input
                    type="number"
                    id="amount"
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    className="block w-full pl-7 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                    min="0"
                    max={availableBalance}
                    step="0.01"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <span className="text-gray-500 sm:text-sm">USD</span>
                  </div>
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  Maximum: {formatCurrency(availableBalance)}
                </div>
              </div>

              {/* Fee Breakdown */}
              {withdrawalAmount && parseFloat(withdrawalAmount) > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Withdrawal Amount:</span>
                    <span>{formatCurrency(parseFloat(withdrawalAmount))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Processing Fee:</span>
                    <span>-{formatCurrency(fee)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>You'll Receive:</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Processing time: {stripeApiService.getProcessingTime(selectedMethod)}
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0}
                className="w-full py-4 text-lg font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Processing withdrawal...
                  </>
                ) : (
                  'Withdraw Funds'
                )}
              </Button>
            </form>
          )}

          {/* Processing Info */}
          <div className="text-sm text-gray-500 space-y-1">
            <p><strong>Note:</strong> Withdrawals are processed securely through Stripe.</p>
            <p>You'll receive an email confirmation once your withdrawal is processed.</p>
            <p>Processing times may vary depending on your bank and payment method.</p>
          </div>

          {/* Stripe Branding with Rainbow Background */}
          <div className="stripe-branding-container">
            <div 
              className="stripe-branding-section"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%)',
                backgroundSize: '400% 400%',
                animation: 'gradient 15s ease infinite'
              }}
            >
              <div className="flex items-center justify-center">
                <div className="flex items-center space-x-3">
                  <span className="text-white text-lg font-semibold tracking-wide">
                    Secured by:
                  </span>
                  <Image 
                    src="/Stripe_Logo.png" 
                    alt="Stripe" 
                    width={70} 
                    height={30}
                    className="filter brightness-0 invert"
                  />
                </div>
              </div>
            </div>
            <style jsx>{`
              .stripe-branding-container {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                margin: 0;
                z-index: 10;
              }
              
              .stripe-branding-section {
                padding: 1.5rem 2rem;
                margin: 0;
                width: 100%;
                border-radius: 0;
              }
              
              @keyframes gradient {
                0% {
                  background-position: 0% 50%;
                }
                50% {
                  background-position: 100% 50%;
                }
                100% {
                  background-position: 0% 50%;
                }
              }
            `}</style>
          </div>
        </div>
      </Card>
    </div>
  );
}