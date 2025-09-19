'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { 
  Bot, 
  Palette, 
  Package, 
  Tag, 
  Wallet, 
  CreditCard, 
  CheckCircle, 
  Rocket,
  Settings
} from 'lucide-react';

interface WizardData {
  botConfig: {
    botName?: string;
    botColor?: string;
    embedStyle?: string;
    showPrices?: boolean;
    showStock?: boolean;
    enableCategories?: boolean;
    welcomeMessage?: string;
  };
  products: Array<{
    id: string;
    name: string;
    price: number;
    categoryId?: string;
    description?: string;
  }>;
  categories: Array<{
    id: string;
    name: string;
    emoji?: string;
    description?: string;
  }>;
  paymentConfig: {
    walletAddress?: string;
    enablePayments?: boolean;
    acceptedCurrencies?: string[];
    minimumOrder?: number;
    taxRate?: number;
  };
}

interface ReviewStepProps {
  wizardData: WizardData;
  onFinish: () => void;
  isProcessing: boolean;
}

export function ReviewStep({ wizardData, onFinish, isProcessing }: ReviewStepProps) {
  const { botConfig, products, categories, paymentConfig } = wizardData;

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(cat => cat.id === categoryId);
    return category ? `${category.emoji || '📁'} ${category.name}` : 'Uncategorized';
  };

  const completionSteps = [
    'Configuring your bot settings',
    'Setting up product catalog',
    'Configuring payment processing',
    'Deploying bot to your server',
    'Running final tests'
  ];

  if (isProcessing) {
    return (
      <div className="text-center py-12">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <Rocket className="w-10 h-10 text-white" />
        </motion.div>
        
        <h3 className="text-2xl font-bold text-gray-900 mb-4">
          Setting Up Your Bot...
        </h3>
        
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          We're configuring everything for you. This will take just a moment.
        </p>

        <div className="max-w-md mx-auto space-y-4">
          {completionSteps.map((step, index) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.5 }}
              className="flex items-center space-x-3 text-left"
            >
              <div className="flex-shrink-0">
                {index < 3 ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : index === 3 ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                )}
              </div>
              <span className={`text-sm ${
                index < 3 ? 'text-green-600' : 
                index === 3 ? 'text-blue-600 font-medium' : 'text-gray-500'
              }`}>
                {step}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <CheckCircle className="w-8 h-8 text-white" />
        </motion.div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Review Your Configuration
        </h2>
        
        <p className="text-gray-600 max-w-2xl mx-auto">
          Everything looks great! Review your settings below and launch your bot.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Bot Configuration */}
        <Card className="p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Bot className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Bot Configuration</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Bot Name:</span>
              <span className="font-medium">{botConfig.botName || 'EcBot'}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Theme Color:</span>
              <div className="flex items-center space-x-2">
                <div 
                  className="w-4 h-4 rounded-full border border-gray-300"
                  style={{ backgroundColor: botConfig.botColor || '#3B82F6' }}
                />
                <span className="font-medium">{botConfig.botColor || '#3B82F6'}</span>
              </div>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Message Style:</span>
              <span className="font-medium capitalize">{botConfig.embedStyle || 'detailed'}</span>
            </div>
            
            <div className="pt-2 border-t">
              <div className="text-sm text-gray-600 mb-2">Display Options:</div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center space-x-2">
                  <CheckCircle className={`w-4 h-4 ${botConfig.showPrices ? 'text-green-600' : 'text-gray-400'}`} />
                  <span>Show Prices</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className={`w-4 h-4 ${botConfig.showStock ? 'text-green-600' : 'text-gray-400'}`} />
                  <span>Show Stock</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className={`w-4 h-4 ${botConfig.enableCategories ? 'text-green-600' : 'text-gray-400'}`} />
                  <span>Enable Categories</span>
                </div>
              </div>
            </div>
            
            {botConfig.welcomeMessage && (
              <div className="pt-2 border-t">
                <div className="text-sm text-gray-600 mb-1">Welcome Message:</div>
                <div className="text-sm bg-gray-50 p-2 rounded italic">
                  "{botConfig.welcomeMessage}"
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Products & Categories */}
        <Card className="p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Package className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Products & Categories</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Categories:</span>
              <span className="font-medium">{categories.length}</span>
            </div>
            
            {categories.length > 0 && (
              <div className="space-y-2">
                {categories.slice(0, 3).map((category) => (
                  <div key={category.id} className="flex items-center space-x-2 text-sm">
                    <Tag className="w-3 h-3 text-gray-400" />
                    <span>{category.emoji} {category.name}</span>
                  </div>
                ))}
                {categories.length > 3 && (
                  <div className="text-xs text-gray-500">
                    +{categories.length - 3} more categories
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-between pt-2 border-t">
              <span className="text-gray-600">Products:</span>
              <span className="font-medium">{products.length}</span>
            </div>
            
            {products.length > 0 && (
              <div className="space-y-2">
                {products.slice(0, 3).map((product) => (
                  <div key={product.id} className="flex justify-between items-center text-sm">
                    <div className="flex items-center space-x-2">
                      <Package className="w-3 h-3 text-gray-400" />
                      <span>{product.name}</span>
                    </div>
                    <span className="font-medium text-green-600">${product.price}</span>
                  </div>
                ))}
                {products.length > 3 && (
                  <div className="text-xs text-gray-500">
                    +{products.length - 3} more products
                  </div>
                )}
              </div>
            )}
            
            {categories.length === 0 && products.length === 0 && (
              <div className="text-center py-4 text-gray-500">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <div className="text-sm">No products configured</div>
                <div className="text-xs">You can add products later</div>
              </div>
            )}
          </div>
        </Card>

        {/* Payment Configuration */}
        <Card className="p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Wallet className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Payment Settings</h3>
          </div>
          
          {paymentConfig.enablePayments ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium text-green-600">Enabled</span>
              </div>
              
              <div>
                <div className="text-gray-600 mb-1">Wallet Address:</div>
                <div className="text-sm font-mono bg-gray-50 p-2 rounded break-all">
                  {paymentConfig.walletAddress}
                </div>
              </div>
              
              {paymentConfig.acceptedCurrencies && paymentConfig.acceptedCurrencies.length > 0 && (
                <div>
                  <div className="text-gray-600 mb-2">Accepted Currencies:</div>
                  <div className="flex flex-wrap gap-1">
                    {paymentConfig.acceptedCurrencies.map((currency) => (
                      <span
                        key={currency}
                        className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {currency}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <div className="text-gray-600 text-sm">Minimum Order:</div>
                  <div className="font-medium">${paymentConfig.minimumOrder || 0}</div>
                </div>
                <div>
                  <div className="text-gray-600 text-sm">Tax Rate:</div>
                  <div className="font-medium">{paymentConfig.taxRate || 0}%</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <CreditCard className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <div className="text-sm">Payments disabled</div>
              <div className="text-xs">Bot will work in catalog mode</div>
            </div>
          )}
        </Card>

        {/* Next Steps */}
        <Card className="p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Settings className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">What Happens Next</h3>
          </div>
          
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-600 font-medium text-xs">1</span>
              </div>
              <div>
                <div className="font-medium">Bot Deployment</div>
                <div className="text-gray-600">Your bot will be configured and deployed to your Discord server</div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-600 font-medium text-xs">2</span>
              </div>
              <div>
                <div className="font-medium">Commands Available</div>
                <div className="text-gray-600">Users can start browsing products with /shop command</div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-600 font-medium text-xs">3</span>
              </div>
              <div>
                <div className="font-medium">Dashboard Access</div>
                <div className="text-gray-600">Manage your bot, products, and orders from the dashboard</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="text-center">
        <Button
          onClick={onFinish}
          size="lg"
          className="px-12 py-4 text-lg"
          disabled={isProcessing}
        >
          <Rocket className="w-5 h-5 mr-2" />
          Launch My Bot
        </Button>
        
        <p className="text-sm text-gray-500 mt-4">
          This will deploy your bot and make it live on your Discord server
        </p>
      </div>
    </div>
  );
}