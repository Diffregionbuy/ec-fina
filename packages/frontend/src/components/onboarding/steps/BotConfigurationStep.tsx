'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Palette, Bot, Eye } from 'lucide-react';

const botConfigSchema = z.object({
  botName: z.string().min(1, 'Bot name is required').max(32, 'Bot name must be 32 characters or less'),
  botColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color'),
  embedStyle: z.enum(['minimal', 'detailed', 'rich']),
  showPrices: z.boolean(),
  showStock: z.boolean(),
  enableCategories: z.boolean(),
  welcomeMessage: z.string().max(500, 'Welcome message must be 500 characters or less').optional()
});

type BotConfigData = z.infer<typeof botConfigSchema>;

interface BotConfigurationStepProps {
  initialData: Partial<BotConfigData>;
  onComplete: (data: BotConfigData) => void;
  onNext: () => void;
}

const colorPresets = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Pink', value: '#EC4899' }
];

const embedStyles = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean and simple design',
    preview: 'Simple text with basic formatting'
  },
  {
    id: 'detailed',
    name: 'Detailed',
    description: 'More information and formatting',
    preview: 'Rich formatting with fields and descriptions'
  },
  {
    id: 'rich',
    name: 'Rich',
    description: 'Full featured with images and embeds',
    preview: 'Complete embed with images, thumbnails, and rich content'
  }
];

export function BotConfigurationStep({ initialData, onComplete, onNext }: BotConfigurationStepProps) {
  const [previewData, setPreviewData] = useState<BotConfigData | null>(null);
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<BotConfigData>({
    resolver: zodResolver(botConfigSchema),
    defaultValues: {
      botName: initialData.botName || 'EcBot',
      botColor: initialData.botColor || '#3B82F6',
      embedStyle: initialData.embedStyle || 'detailed',
      showPrices: initialData.showPrices ?? true,
      showStock: initialData.showStock ?? true,
      enableCategories: initialData.enableCategories ?? true,
      welcomeMessage: initialData.welcomeMessage || ''
    },
    mode: 'onChange'
  });

  const watchedValues = watch();

  useEffect(() => {
    setPreviewData(watchedValues);
  }, [watchedValues]);

  const onSubmit = (data: BotConfigData) => {
    onComplete(data);
    onNext();
  };

  const handleColorSelect = (color: string) => {
    setValue('botColor', color, { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Configuration Form */}
        <div className="space-y-6">
          {/* Bot Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bot Display Name
            </label>
            <input
              {...register('botName')}
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter bot name"
            />
            {errors.botName && (
              <p className="text-red-600 text-sm mt-1">{errors.botName.message}</p>
            )}
          </div>

          {/* Bot Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bot Theme Color
            </label>
            <div className="flex items-center space-x-3 mb-3">
              <input
                {...register('botColor')}
                type="color"
                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <input
                {...register('botColor')}
                type="text"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="#3B82F6"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {colorPresets.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => handleColorSelect(color.value)}
                  className="w-8 h-8 rounded-full border-2 border-gray-300 hover:border-gray-400 transition-colors"
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
            {errors.botColor && (
              <p className="text-red-600 text-sm mt-1">{errors.botColor.message}</p>
            )}
          </div>

          {/* Embed Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Message Style
            </label>
            <div className="space-y-3">
              {embedStyles.map((style) => (
                <label
                  key={style.id}
                  className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    {...register('embedStyle')}
                    type="radio"
                    value={style.id}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{style.name}</div>
                    <div className="text-sm text-gray-600">{style.description}</div>
                    <div className="text-xs text-gray-500 mt-1">{style.preview}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Display Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Display Options
            </label>
            <div className="space-y-3">
              <label className="flex items-center space-x-3">
                <input
                  {...register('showPrices')}
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Show product prices</span>
              </label>
              
              <label className="flex items-center space-x-3">
                <input
                  {...register('showStock')}
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Show stock quantities</span>
              </label>
              
              <label className="flex items-center space-x-3">
                <input
                  {...register('enableCategories')}
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Enable product categories</span>
              </label>
            </div>
          </div>

          {/* Welcome Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Welcome Message (Optional)
            </label>
            <textarea
              {...register('welcomeMessage')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Welcome to our shop! Browse our products below..."
            />
            {errors.welcomeMessage && (
              <p className="text-red-600 text-sm mt-1">{errors.welcomeMessage.message}</p>
            )}
          </div>
        </div>

        {/* Live Preview */}
        <div className="lg:sticky lg:top-8">
          <Card className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Eye className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Live Preview</h3>
            </div>
            
            {previewData && (
              <motion.div
                key={JSON.stringify(previewData)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                {/* Bot Message Preview */}
                <div className="bg-gray-800 rounded-lg p-4 text-white">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    <span className="font-medium">{previewData.botName}</span>
                    <span className="text-xs bg-blue-600 px-2 py-1 rounded">BOT</span>
                  </div>
                  
                  {previewData.welcomeMessage && (
                    <p className="text-gray-300 mb-3 text-sm">
                      {previewData.welcomeMessage}
                    </p>
                  )}
                  
                  {/* Sample Product Embed */}
                  <div 
                    className="border-l-4 bg-gray-700 p-4 rounded"
                    style={{ borderLeftColor: previewData.botColor }}
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: previewData.botColor }}
                      />
                      <span className="font-medium text-sm">Sample Product</span>
                    </div>
                    
                    {previewData.embedStyle === 'minimal' && (
                      <p className="text-gray-300 text-sm">Diamond Sword - $50</p>
                    )}
                    
                    {previewData.embedStyle === 'detailed' && (
                      <div className="space-y-2">
                        <p className="text-gray-300 text-sm">A powerful diamond sword for your adventures</p>
                        {previewData.showPrices && (
                          <div className="text-green-400 font-medium text-sm">Price: $50</div>
                        )}
                        {previewData.showStock && (
                          <div className="text-blue-400 text-sm">Stock: 25 available</div>
                        )}
                      </div>
                    )}
                    
                    {previewData.embedStyle === 'rich' && (
                      <div className="space-y-3">
                        <div className="w-full h-20 bg-gray-600 rounded flex items-center justify-center">
                          <span className="text-gray-400 text-xs">Product Image</span>
                        </div>
                        <p className="text-gray-300 text-sm">A powerful diamond sword crafted by master smiths</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {previewData.showPrices && (
                            <div className="text-green-400">💰 $50</div>
                          )}
                          {previewData.showStock && (
                            <div className="text-blue-400">📦 25 left</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </Card>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!isValid}
          className="px-8"
        >
          Continue to Products
        </Button>
      </div>
    </form>
  );
}