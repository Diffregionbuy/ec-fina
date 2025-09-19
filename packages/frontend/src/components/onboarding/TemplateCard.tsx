'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Check, Gamepad2, Store, Palette } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  previewImage?: string;
  features: string[];
  botConfig: any;
  defaultCategories: any[];
  defaultProducts: any[];
}

interface TemplateCardProps {
  template: Template;
  isSelected: boolean;
  onSelect: () => void;
}

const categoryIcons = {
  minecraft: Gamepad2,
  gaming: Gamepad2,
  general: Store,
  default: Palette
};

const categoryColors = {
  minecraft: 'bg-green-100 text-green-600',
  gaming: 'bg-purple-100 text-purple-600',
  general: 'bg-blue-100 text-blue-600',
  default: 'bg-gray-100 text-gray-600'
};

export function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  const CategoryIcon = categoryIcons[template.category as keyof typeof categoryIcons] || categoryIcons.default;
  const categoryColorClass = categoryColors[template.category as keyof typeof categoryColors] || categoryColors.default;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="relative"
    >
      <Card 
        className={`
          p-6 cursor-pointer transition-all duration-200 h-full
          ${isSelected 
            ? 'ring-2 ring-blue-500 shadow-lg bg-blue-50' 
            : 'hover:shadow-lg border-gray-200'
          }
        `}
        onClick={onSelect}
      >
        {/* Selection Indicator */}
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center"
          >
            <Check className="w-4 h-4 text-white" />
          </motion.div>
        )}

        {/* Category Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${categoryColorClass}`}>
            <CategoryIcon className="w-3 h-3 mr-1" />
            {template.category.charAt(0).toUpperCase() + template.category.slice(1)}
          </div>
        </div>

        {/* Template Preview */}
        <div className="mb-4">
          {template.previewImage ? (
            <img
              src={template.previewImage}
              alt={template.name}
              className="w-full h-32 object-cover rounded-lg bg-gray-100"
            />
          ) : (
            <div className="w-full h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
              <CategoryIcon className="w-12 h-12 text-gray-400" />
            </div>
          )}
        </div>

        {/* Template Info */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {template.name}
          </h3>
          <p className="text-gray-600 text-sm mb-3">
            {template.description}
          </p>
        </div>

        {/* Features */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Features:</h4>
          <ul className="space-y-1">
            {template.features.slice(0, 3).map((feature, index) => (
              <li key={index} className="text-xs text-gray-600 flex items-center">
                <div className="w-1 h-1 bg-blue-500 rounded-full mr-2" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Preview Data */}
        <div className="space-y-3">
          {/* Categories Preview */}
          {template.defaultCategories.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-1">Categories:</h4>
              <div className="flex flex-wrap gap-1">
                {template.defaultCategories.slice(0, 3).map((category, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 bg-gray-100 text-xs text-gray-600 rounded"
                  >
                    {category.emoji} {category.name}
                  </span>
                ))}
                {template.defaultCategories.length > 3 && (
                  <span className="text-xs text-gray-400">
                    +{template.defaultCategories.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Products Preview */}
          {template.defaultProducts.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-1">Sample Products:</h4>
              <div className="space-y-1">
                {template.defaultProducts.slice(0, 2).map((product, index) => (
                  <div key={index} className="flex justify-between items-center text-xs">
                    <span className="text-gray-600 truncate">{product.name}</span>
                    <span className="text-gray-500 font-medium">${product.price}</span>
                  </div>
                ))}
                {template.defaultProducts.length > 2 && (
                  <div className="text-xs text-gray-400">
                    +{template.defaultProducts.length - 2} more products
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selection Overlay */}
        {isSelected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-blue-500 bg-opacity-5 rounded-lg pointer-events-none"
          />
        )}
      </Card>
    </motion.div>
  );
}