'use client';

import React, { memo, useMemo, useCallback, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useOptimizedToastWithDedup } from '@/hooks/useOptimizedToast';
import { useOptimizedData } from '@/contexts/OptimizedStateContext';
import { ToastContainer } from '@/components/ui/Toast';
import { Bot, Save } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Category, Product } from '@/types/dashboard';

interface OptimizedBotSettingsProps {
  serverId: string;
}

interface EmbedTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  color: string;
  thumbnail_url: string;
  footer_text: string;
  footer_icon_url: string;
  banner_url: string;
  fields: Array<{
    name: string;
    value: string;
    inline: boolean;
  }>;
}

interface BotTemplates {
  public_homepage: EmbedTemplate;
  private_main_menu: EmbedTemplate;
  confirmation_page: EmbedTemplate;
  invoice_page: EmbedTemplate;
  payment_successful: EmbedTemplate;
  link_minecraft: EmbedTemplate;
  reviews_page: EmbedTemplate;
  vouch_page: EmbedTemplate;
}

// Memoized template selector component
const MemoizedTemplateSelector = memo(({ 
  templates, 
  selectedTemplate, 
  onSelect 
}: {
  templates: BotTemplates;
  selectedTemplate: keyof BotTemplates;
  onSelect: (template: keyof BotTemplates) => void;
}) => (
  <Card>
    <CardHeader>
      <h3 className="text-lg font-semibold">Select Template</h3>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(templates).map(([key, template]) => (
          <button
            key={key}
            onClick={() => onSelect(key as keyof BotTemplates)}
            className={`p-3 text-sm rounded-lg border transition-colors ${
              selectedTemplate === key
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {template.name}
          </button>
        ))}
      </div>
    </CardContent>
  </Card>
));

// Memoized template editor component
const MemoizedTemplateEditor = memo(({ 
  template, 
  templateId, 
  onTemplateChange 
}: {
  template: EmbedTemplate;
  templateId: keyof BotTemplates;
  onTemplateChange: (templateId: keyof BotTemplates, field: keyof EmbedTemplate, value: any) => void;
}) => (
  <Card>
    <CardHeader>
      <h4 className="text-lg font-semibold">Edit {template.name}</h4>
    </CardHeader>
    <CardContent className="space-y-6">
      {/* Basic Template Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
          <input
            type="text"
            value={template.title}
            onChange={(e) => onTemplateChange(templateId, 'title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={template.color}
              onChange={(e) => onTemplateChange(templateId, 'color', e.target.value)}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={template.color}
              onChange={(e) => onTemplateChange(templateId, 'color', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
        <textarea
          value={template.description}
          onChange={(e) => onTemplateChange(templateId, 'description', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter the embed description..."
        />
        <p className="text-xs text-gray-500 mt-1">
          Use variables like {'{service_name}'}, {'{total_price}'}, etc. for dynamic content
        </p>
      </div>

      {/* URLs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Thumbnail URL</label>
          <input
            type="url"
            value={template.thumbnail_url}
            onChange={(e) => onTemplateChange(templateId, 'thumbnail_url', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://example.com/image.png"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Footer Icon URL</label>
          <input
            type="url"
            value={template.footer_icon_url}
            onChange={(e) => onTemplateChange(templateId, 'footer_icon_url', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://example.com/icon.png"
          />
        </div>
      </div>

      {/* Banner URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Banner Image URL</label>
        <input
          type="url"
          value={template.banner_url}
          onChange={(e) => onTemplateChange(templateId, 'banner_url', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="https://example.com/banner.png"
        />
        <p className="text-xs text-gray-500 mt-1">Large banner image displayed at the top of the embed</p>
      </div>

      {/* Footer Text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Footer Text</label>
        <input
          type="text"
          value={template.footer_text}
          onChange={(e) => onTemplateChange(templateId, 'footer_text', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Footer text"
        />
      </div>
    </CardContent>
  </Card>
));

// Memoized Discord preview component
const MemoizedDiscordPreview = memo(({ 
  template, 
  categories, 
  products 
}: {
  template: EmbedTemplate;
  categories: Category[];
  products: Product[];
}) => (
  <Card>
    <CardHeader>
      <h4 className="text-lg font-semibold">Live Preview</h4>
    </CardHeader>
    <CardContent>
      <div className="bg-gray-800 rounded-lg p-4 text-white">
        <div className="flex items-start space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <span className="font-semibold">EcBot</span>
              <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">BOT</span>
            </div>
            <div
              className="border-l-4 bg-gray-700 rounded p-4"
              style={{ borderLeftColor: template.color }}
            >
              {/* Banner Image */}
              {template.banner_url && (
                <div className="w-full h-24 mb-3 rounded overflow-hidden bg-gray-600">
                  <img
                    src={template.banner_url}
                    alt="Banner"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = `data:image/svg+xml;base64,${btoa(`
                        <svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
                          <rect width="100%" height="100%" fill="${template.color}"/>
                          <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" fill="white" text-anchor="middle" dy=".3em">
                            ${template.name}
                          </text>
                        </svg>
                      `)}`;
                    }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white">{template.title}</h3>
                {template.thumbnail_url && (
                  <img
                    src={template.thumbnail_url}
                    alt="Thumbnail"
                    className="w-12 h-12 rounded object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
              
              <div className="text-gray-300 text-sm mb-3 whitespace-pre-wrap">
                {template.description.split('\n').map((line, index) => {
                  if (line.startsWith('> ')) {
                    return (
                      <blockquote key={index} className="border-l-4 border-gray-500 pl-3 my-1 bg-gray-700/50 rounded-r">
                        {line.substring(2)}
                      </blockquote>
                    );
                  }
                  return (
                    <span key={index}>
                      {line}
                      {index < template.description.split('\n').length - 1 ? '\n' : ''}
                    </span>
                  );
                })}
              </div>

              {template.fields.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                  {template.fields.map((field, index) => (
                    <div key={index} className={field.inline ? 'col-span-1' : 'col-span-full'}>
                      <div className="text-sm font-medium text-white mb-1">{field.name}</div>
                      <div className="text-sm text-gray-300">
                        {field.value.startsWith('`') && field.value.endsWith('`') ? (
                          <code className="bg-gray-800 text-gray-200 px-2 py-1 rounded text-xs font-mono border border-gray-600">
                            {field.value.slice(1, -1)}
                          </code>
                        ) : (
                          <span>{field.value}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-600">
                <div className="flex items-center gap-2">
                  {template.footer_icon_url && (
                    <img
                      src={template.footer_icon_url}
                      alt="Footer Icon"
                      className="w-4 h-4 rounded object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <span>{template.footer_text}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
));

export const OptimizedBotSettings = memo<OptimizedBotSettingsProps>(({ serverId }) => {
  const { toasts, removeToast, success, error: showError } = useOptimizedToastWithDedup();
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<keyof BotTemplates>('public_homepage');

  // Fetch server data with optimized caching
  const { data: categories = [], loading: loadingCategories } = useOptimizedData(
    `categories-${serverId}`,
    () => apiClient.getCategories(serverId),
    { ttl: 10 * 60 * 1000 } // 10 minutes cache
  );

  const { data: products = [], loading: loadingProducts } = useOptimizedData(
    `products-${serverId}`,
    () => apiClient.getProducts(serverId),
    { ttl: 5 * 60 * 1000 } // 5 minutes cache
  );

  const { data: channels = [] } = useOptimizedData(
    `channels-${serverId}`,
    () => apiClient.getServerChannels(serverId).then(res => (res as any)?.data?.channels || []),
    { ttl: 15 * 60 * 1000 } // 15 minutes cache
  );

  // Default templates with memoization
  const templates = useMemo<BotTemplates>(() => ({
    public_homepage: {
      id: 'public_homepage',
      name: 'Public Homepage',
      title: '🌌 Game Top-Up Emporium',
      description: 'Welcome to our premium gaming top-up shop!\n\nChoose from the options below to get started!',
      color: '#3B82F6',
      thumbnail_url: '',
      footer_text: 'Game Top-Up Emporium | Powered by Diffregionbuy.com',
      footer_icon_url: 'https://cdn3.emoji.gg/emojis/5306_miku_waving.gif',
      banner_url: 'https://via.placeholder.com/800x200/3B82F6/FFFFFF?text=Game+Top-Up+Emporium',
      fields: []
    },
    private_main_menu: {
      id: 'private_main_menu',
      name: 'Private Main Menu',
      title: '🌌 Game Top-Up Emporium',
      description: 'Welcome to your private shopping panel! Browse our stores below to purchase in-game currency, subscriptions, or exclusive deals.\n\n📩 **Contact <@admin> before purchasing** for assistance or custom orders.\n\n🛍️ **Select a store** to view available services.',
      color: '#3B82F6',
      thumbnail_url: '',
      footer_text: 'Game Top-Up Emporium | Powered by Diffregionbuy.com',
      footer_icon_url: 'https://cdn3.emoji.gg/emojis/5306_miku_waving.gif',
      banner_url: 'https://via.placeholder.com/800x200/3B82F6/FFFFFF?text=Private+Shopping+Panel',
      fields: []
    },
    confirmation_page: {
      id: 'confirmation_page',
      name: 'Confirmation Page',
      title: '🛍️ Confirm Your Purchase',
      description: '**You are about to purchase** \n{product_name}.\n**Details**: \n{product_details}',
      color: '#3B82F6',
      thumbnail_url: '',
      footer_text: 'Game Top-Up Emporium | Powered by Diffregionbuy.com',
      footer_icon_url: 'https://cdn3.emoji.gg/emojis/5306_miku_waving.gif',
      banner_url: 'https://via.placeholder.com/800x200/3B82F6/FFFFFF?text=Confirm+Purchase',
      fields: [
        { name: '💵 Item Price', value: 'item_price', inline: true },
        { name: '⛽ Network Fee', value: '{network_fee} USD', inline: true },
        { name: '💸 Total Price', value: '{total_price}', inline: true },
        { name: '⛏️ Minecraft ID', value: '`{minecraft_username}`', inline: true },
        { name: '💱 Paying With', value: '**{crypto_currency}**', inline: false }
      ]
    },
    invoice_page: {
      id: 'invoice_page',
      name: 'Invoice Page',
      title: '🧾 Invoice',
      description: 'Scan the QR code or copy the details below to complete your payment. This invoice is valid for a limited time.\n\nAfter sending, please contact <@admin>.',
      color: '#10B981',
      thumbnail_url: '',
      footer_text: 'Game Top-Up Emporium | Powered by Diffregionbuy.com',
      footer_icon_url: 'https://cdn3.emoji.gg/emojis/5306_miku_waving.gif',
      banner_url: 'https://via.placeholder.com/800x200/10B981/FFFFFF?text=Payment+Invoice',
      fields: [
        { name: '💵 Total Price', value: '`{total_price} {currency}`', inline: false },
        { name: '🏠 Send To Address', value: '`{wallet_address}`', inline: false },
        { name: '💰 Exact Amount', value: '`{exact_amount} {crypto_currency}`', inline: false }
      ]
    },
    payment_successful: {
      id: 'payment_successful',
      name: 'Payment Successful',
      title: '✅ Payment Confirmed!',
      description: '🎉 **Thank you for your purchase!** 🎉\n\nYour payment has been successfully processed and confirmed.\n\n**What happens next?**\n• Your order is being processed\n• You will receive your items shortly\n• Check your account for updates\n\nIf you have any questions, feel free to contact us.',
      color: '#22C55E',
      thumbnail_url: '',
      footer_text: 'Game Top-Up Emporium | Powered by Diffregionbuy.com',
      footer_icon_url: 'https://cdn3.emoji.gg/emojis/5306_miku_waving.gif',
      banner_url: 'https://via.placeholder.com/800x200/22C55E/FFFFFF?text=Payment+Successful',
      fields: []
    },
    link_minecraft: {
      id: 'link_minecraft',
      name: 'Link to Minecraft',
      title: '⛏️ Link Your Minecraft Account',
      description: '🎮 **Connect your Minecraft account to get started!**\n\nLinking your account allows us to:\n• Deliver items directly to your account\n• Track your purchase history\n• Provide faster support\n• Send automatic notifications\n\n**How to link:**\n1. Click the "Link Account" button below\n2. Enter your Minecraft username\n3. Verify your account\n4. Start shopping!\n\n**Need help?** Contact <@admin> for assistance.',
      color: '#8B5CF6',
      thumbnail_url: '',
      footer_text: 'Game Top-Up Emporium | Powered by Diffregionbuy.com',
      footer_icon_url: 'https://cdn3.emoji.gg/emojis/5306_miku_waving.gif',
      banner_url: 'https://via.placeholder.com/800x200/8B5CF6/FFFFFF?text=Link+Minecraft+Account',
      fields: []
    },
    reviews_page: {
      id: 'reviews_page',
      name: 'Reviews Page',
      title: '📊 Analytics Dashboard',
      description: '**Store performance overview**\n\nHere you can see the store rating.',
      color: '#5865F2',
      thumbnail_url: '',
      footer_text: 'Updated every 24 hours • Last update: Today',
      footer_icon_url: 'https://cdn3.emoji.gg/emojis/5306_miku_waving.gif',
      banner_url: 'https://via.placeholder.com/800x200/5865F2/FFFFFF?text=Analytics+Dashboard',
      fields: [
        {
          name: '📈 Total Transactions',
          value: '```\n2,847 completed orders\n+127 this month\n```',
          inline: true
        },
        {
          name: '⭐ Average Rating',
          value: '```\n4.8/5.0 stars\nFrom 1,923 reviews\n```',
          inline: true
        },
        {
          name: '🏆 Best Selling Products',
          value: '```\n1. Premium Account - 847 sales\n2. VIP Package - 623 sales\n3. Starter Bundle - 445 sales\n```',
          inline: false
        },
        {
          name: '📅 Recent Performance',
          value: '```\nLast 7 days: 89 orders\nLast 30 days: 347 orders\nConversion rate: 12.3%\n```',
          inline: false
        }
      ]
    },
    vouch_page: {
      id: 'vouch_page',
      name: 'Vouch Page',
      title: '🌟 Customer Testimonial',
      description: '> *"Amazing service! Got my items super fast and exactly as described!"*\n\n**⭐ 9.5/10** \nPurchased **Minecraft Diamonds** \nMarch 15, 2025\n\n✅ **Verified Purchase** by <@user>',
      color: '#10B981',
      thumbnail_url: '',
      footer_text: 'Verified Customer Review • Posted {timestamp}',
      footer_icon_url: 'https://cdn3.emoji.gg/emojis/5306_miku_waving.gif',
      banner_url: 'https://via.placeholder.com/800x200/10B981/FFFFFF?text=Customer+Testimonial',
      fields: []
    }
  }), []);

  // Template change handler
  const handleTemplateChange = useCallback((templateId: keyof BotTemplates, field: keyof EmbedTemplate, value: any) => {
    // This would update the templates state in a real implementation
    console.log('Template change:', templateId, field, value);
  }, []);

  // Save handler
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      
      const botConfigUpdate = {
        templates: templates,
      };

      await apiClient.updateBotConfig(serverId, botConfigUpdate);
      success('Settings Saved', 'Bot settings and templates have been updated successfully.');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      
      if (error.code === 'AUTHENTICATION_ERROR') {
        showError('Authentication Required', 'Please sign in again to save settings.');
      } else if (error.status === 403) {
        showError('Permission Denied', 'You do not have permission to modify this server.');
      } else {
        showError('Save Failed', 'Failed to save settings. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [serverId, templates, success, showError]);

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Bot Message Templates</h1>
          <p className="text-gray-600">Customize your bot's embed messages for different pages</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Template Editor */}
          <div className="space-y-6">
            <MemoizedTemplateSelector
              templates={templates}
              selectedTemplate={selectedTemplate}
              onSelect={setSelectedTemplate}
            />

            <MemoizedTemplateEditor
              template={templates[selectedTemplate]}
              templateId={selectedTemplate}
              onTemplateChange={handleTemplateChange}
            />
          </div>

          {/* Template Preview */}
          <div className="space-y-6">
            <MemoizedDiscordPreview
              template={templates[selectedTemplate]}
              categories={categories}
              products={products}
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end mt-8">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Templates'}
          </Button>
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
});

OptimizedBotSettings.displayName = 'OptimizedBotSettings';