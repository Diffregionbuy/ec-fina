'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Wallet, CreditCard, Shield, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';

const paymentConfigSchema = z.object({
  walletAddress: z.string().min(1, 'Wallet address is required'),
  enablePayments: z.boolean(),
  acceptedCurrencies: z.array(z.string()).min(1, 'Select at least one currency'),
  minimumOrder: z.number().min(0, 'Minimum order must be 0 or greater'),
  taxRate: z.number().min(0).max(100, 'Tax rate must be between 0 and 100').optional()
});

type PaymentConfigData = z.infer<typeof paymentConfigSchema>;

interface PaymentSetupStepProps {
  initialData: Partial<PaymentConfigData>;
  onComplete: (data: PaymentConfigData) => void;
  onNext: () => void;
}

const supportedCurrencies = [
  { code: 'USDT', name: 'Tether (USDT)', icon: '₮' },
  { code: 'BTC', name: 'Bitcoin', icon: '₿' },
  { code: 'ETH', name: 'Ethereum', icon: 'Ξ' },
  { code: 'USDC', name: 'USD Coin', icon: '$' }
];

export function PaymentSetupStep({ initialData, onComplete, onNext }: PaymentSetupStepProps) {
  const [walletValidation, setWalletValidation] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [skipPayments, setSkipPayments] = useState(!initialData.enablePayments);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<PaymentConfigData>({
    resolver: zodResolver(paymentConfigSchema),
    defaultValues: {
      walletAddress: initialData.walletAddress || '',
      enablePayments: initialData.enablePayments ?? true,
      acceptedCurrencies: initialData.acceptedCurrencies || ['USDT'],
      minimumOrder: initialData.minimumOrder || 0,
      taxRate: initialData.taxRate || 0
    },
    mode: 'onChange'
  });

  const watchedValues = watch();

  const validateWalletAddress = async (address: string) => {
    if (!address) {
      setWalletValidation('idle');
      return;
    }

    setWalletValidation('validating');
    
    // Simulate wallet validation
    setTimeout(() => {
      // Basic validation for demo - in real app, this would call OKX API
      const isValid = address.length >= 26 && address.length <= 62;
      setWalletValidation(isValid ? 'valid' : 'invalid');
    }, 1500);
  };

  const handleWalletAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const address = e.target.value;
    setValue('walletAddress', address, { shouldValidate: true });
    validateWalletAddress(address);
  };

  const handleCurrencyToggle = (currencyCode: string) => {
    const current = watchedValues.acceptedCurrencies || [];
    const updated = current.includes(currencyCode)
      ? current.filter(c => c !== currencyCode)
      : [...current, currencyCode];
    
    setValue('acceptedCurrencies', updated, { shouldValidate: true });
  };

  const onSubmit = (data: PaymentConfigData) => {
    onComplete(data);
    onNext();
  };

  const handleSkip = () => {
    onComplete({
      walletAddress: '',
      enablePayments: false,
      acceptedCurrencies: [],
      minimumOrder: 0
    });
    onNext();
  };

  if (skipPayments) {
    return (
      <div className="text-center py-12">
        <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Payment Setup (Optional)
        </h3>
        <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
          You can set up payments later to start accepting orders. 
          For now, your bot will work in catalog mode only.
        </p>
        
        <div className="flex justify-center space-x-4">
          <Button
            variant="outline"
            onClick={() => setSkipPayments(false)}
          >
            Set Up Payments Now
          </Button>
          <Button onClick={handleSkip}>
            Skip for Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Payment Provider Info */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex items-start space-x-3">
          <Shield className="w-6 h-6 text-blue-600 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Secure Payments with OKX
            </h3>
            <p className="text-blue-800 mb-4">
              We use OKX's secure payment infrastructure to process all transactions. 
              Your customers can pay with various cryptocurrencies, and you'll receive 
              payments directly to your wallet.
            </p>
            <a
              href="https://www.okx.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Learn more about OKX
              <ExternalLink className="w-4 h-4 ml-1" />
            </a>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Wallet Configuration */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Wallet Address *
            </label>
            <div className="relative">
              <input
                {...register('walletAddress')}
                onChange={handleWalletAddressChange}
                type="text"
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your OKX wallet address"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                {walletValidation === 'validating' && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                )}
                {walletValidation === 'valid' && (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                )}
                {walletValidation === 'invalid' && (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
            </div>
            {errors.walletAddress && (
              <p className="text-red-600 text-sm mt-1">{errors.walletAddress.message}</p>
            )}
            {walletValidation === 'invalid' && (
              <p className="text-red-600 text-sm mt-1">
                Please enter a valid wallet address
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              This is where you'll receive payments from your customers
            </p>
          </div>

          {/* Accepted Currencies */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Accepted Currencies *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {supportedCurrencies.map((currency) => (
                <label
                  key={currency.code}
                  className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={watchedValues.acceptedCurrencies?.includes(currency.code) || false}
                    onChange={() => handleCurrencyToggle(currency.code)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{currency.icon}</span>
                    <div>
                      <div className="font-medium text-gray-900">{currency.code}</div>
                      <div className="text-xs text-gray-600">{currency.name}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {errors.acceptedCurrencies && (
              <p className="text-red-600 text-sm mt-1">{errors.acceptedCurrencies.message}</p>
            )}
          </div>

          {/* Order Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Order ($)
              </label>
              <input
                {...register('minimumOrder', { valueAsNumber: true })}
                type="number"
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
              {errors.minimumOrder && (
                <p className="text-red-600 text-sm mt-1">{errors.minimumOrder.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tax Rate (%)
              </label>
              <input
                {...register('taxRate', { valueAsNumber: true })}
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
              {errors.taxRate && (
                <p className="text-red-600 text-sm mt-1">{errors.taxRate.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Payment Preview */}
        <div className="lg:sticky lg:top-8">
          <Card className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <CreditCard className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Payment Preview</h3>
            </div>
            
            <div className="space-y-4">
              {/* Sample Transaction */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Sample Order</span>
                  <span className="text-sm font-medium">$25.00</span>
                </div>
                
                {watchedValues.taxRate && watchedValues.taxRate > 0 && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Tax ({watchedValues.taxRate}%)</span>
                    <span className="text-sm">${((25 * watchedValues.taxRate) / 100).toFixed(2)}</span>
                  </div>
                )}
                
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="font-medium">Total</span>
                  <span className="font-bold text-green-600">
                    ${(25 + (25 * (watchedValues.taxRate || 0)) / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Accepted Currencies Display */}
              {watchedValues.acceptedCurrencies && watchedValues.acceptedCurrencies.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Customers can pay with:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {watchedValues.acceptedCurrencies.map((code) => {
                      const currency = supportedCurrencies.find(c => c.code === code);
                      return currency ? (
                        <span
                          key={code}
                          className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                        >
                          {currency.icon} {currency.code}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Minimum Order */}
              {watchedValues.minimumOrder && watchedValues.minimumOrder > 0 && (
                <div className="text-sm text-gray-600">
                  Minimum order: ${watchedValues.minimumOrder}
                </div>
              )}
            </div>
          </Card>

          {/* Security Notice */}
          <Alert className="mt-4">
            <Shield className="w-4 h-4" />
            <div>
              <div className="font-medium">Secure & Private</div>
              <div className="text-sm">
                Your wallet address is encrypted and only used for payment processing. 
                We never store your private keys.
              </div>
            </div>
          </Alert>
        </div>
      </div>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSkipPayments(true)}
        >
          Skip Payment Setup
        </Button>
        
        <Button
          type="submit"
          disabled={!isValid || walletValidation === 'invalid'}
          className="px-8"
        >
          Continue to Review
        </Button>
      </div>
    </form>
  );
}