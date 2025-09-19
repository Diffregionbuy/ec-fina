import React from 'react';
import { Button } from '@/components/ui/Button';
import { Package, Tag, Plus, ArrowRight } from 'lucide-react';

interface GettingStartedProps {
  onCreateProduct: () => void;
  onCreateCategory: () => void;
}

export const GettingStarted: React.FC<GettingStartedProps> = ({
  onCreateProduct,
  onCreateCategory,
}) => {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-12 mb-12">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
              <Package className="h-10 w-10 text-blue-600" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <Plus className="h-4 w-4 text-green-600" />
            </div>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Welcome to Product Management
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Set up your server store by creating products and organizing them into categories. 
          Your Discord community will be able to browse and purchase these items.
        </p>
      </div>

      {/* Getting Started Steps */}
      <div className="grid md:grid-cols-2 gap-8 mb-12">
        {/* Create Categories First */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 hover:shadow-lg transition-shadow">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
              <Tag className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">1. Create Categories</h3>
              <p className="text-sm text-gray-500">Optional but recommended</p>
            </div>
          </div>
          
          <p className="text-gray-600 mb-6">
            Organize your products into categories like "Weapons", "Armor", "Resources", or "VIP Ranks" 
            to make browsing easier for your customers.
          </p>
          
          <div className="space-y-3 mb-6">
            <div className="flex items-center text-sm text-gray-600">
              <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
              Group similar products together
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
              Add custom icons and descriptions
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
              Set custom display order
            </div>
          </div>
          
          <Button
            onClick={onCreateCategory}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
          >
            <Tag className="h-4 w-4" />
            Create Your First Category
          </Button>
        </div>

        {/* Create Products */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 hover:shadow-lg transition-shadow">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">2. Add Products</h3>
              <p className="text-sm text-gray-500">Start selling to your community</p>
            </div>
          </div>
          
          <p className="text-gray-600 mb-6">
            Create products with prices, descriptions, images, and Minecraft commands 
            that will be executed when someone makes a purchase.
          </p>
          
          <div className="space-y-3 mb-6">
            <div className="flex items-center text-sm text-gray-600">
              <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
              Set prices in multiple currencies
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
              Add product images and descriptions
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
              Configure Minecraft commands
            </div>
          </div>
          
          <Button
            onClick={onCreateProduct}
            className="w-full flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Your First Product
          </Button>
        </div>
      </div>

      {/* Quick Tips */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center mr-2">
            <span className="text-yellow-600 text-sm">💡</span>
          </div>
          Pro Tips
        </h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Start Simple</h4>
            <p className="text-sm text-gray-600">
              Begin with a few popular items. You can always add more products and categories later.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Use Clear Names</h4>
            <p className="text-sm text-gray-600">
              Choose descriptive names that your Discord community will easily understand.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Test Commands</h4>
            <p className="text-sm text-gray-600">
              Make sure your Minecraft commands work correctly before making products live.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Set Fair Prices</h4>
            <p className="text-sm text-gray-600">
              Research similar servers to ensure your pricing is competitive and fair.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};