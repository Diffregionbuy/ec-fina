'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { TemplateCard } from '@/components/onboarding/TemplateCard';
import { Palette, Gamepad2, Store, Zap } from 'lucide-react';

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

const templateCategories = [
  { id: 'all', name: 'All Templates', icon: Palette },
  { id: 'minecraft', name: 'Minecraft', icon: Gamepad2 },
  { id: 'gaming', name: 'Gaming', icon: Gamepad2 },
  { id: 'general', name: 'General Store', icon: Store }
];

export default function TemplatesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/signin');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      // This will be implemented when we have the API client
      // const response = await apiClient.get('/onboarding/templates');
      // setTemplates(response.data);
      
      // For now, use mock data
      const mockTemplates: Template[] = [
        {
          id: 'minecraft-survival',
          name: 'Minecraft Survival Shop',
          category: 'minecraft',
          description: 'Perfect for survival servers with tools, blocks, and resources',
          features: ['Pre-configured categories', 'Popular Minecraft items', 'Balanced pricing'],
          botConfig: { theme: 'minecraft', color: '#4CAF50' },
          defaultCategories: [
            { name: 'Tools & Weapons', emoji: '⚔️' },
            { name: 'Building Blocks', emoji: '🧱' },
            { name: 'Resources', emoji: '💎' }
          ],
          defaultProducts: [
            { name: 'Diamond Sword', price: 50, category: 'Tools & Weapons' },
            { name: 'Stone Blocks (64)', price: 10, category: 'Building Blocks' }
          ]
        },
        {
          id: 'minecraft-creative',
          name: 'Minecraft Creative Hub',
          category: 'minecraft',
          description: 'For creative servers focusing on cosmetics and special items',
          features: ['Cosmetic items', 'Special effects', 'VIP packages'],
          botConfig: { theme: 'creative', color: '#FF9800' },
          defaultCategories: [
            { name: 'Cosmetics', emoji: '✨' },
            { name: 'VIP Packages', emoji: '👑' },
            { name: 'Special Items', emoji: '🎁' }
          ],
          defaultProducts: [
            { name: 'VIP Rank (30 days)', price: 25, category: 'VIP Packages' },
            { name: 'Rainbow Trail', price: 15, category: 'Cosmetics' }
          ]
        },
        {
          id: 'gaming-general',
          name: 'Gaming Community Store',
          category: 'gaming',
          description: 'Versatile template for any gaming community',
          features: ['Flexible categories', 'Game-agnostic items', 'Community focused'],
          botConfig: { theme: 'gaming', color: '#9C27B0' },
          defaultCategories: [
            { name: 'Game Items', emoji: '🎮' },
            { name: 'Memberships', emoji: '🎫' },
            { name: 'Merchandise', emoji: '👕' }
          ],
          defaultProducts: [
            { name: 'Premium Membership', price: 20, category: 'Memberships' },
            { name: 'Community T-Shirt', price: 30, category: 'Merchandise' }
          ]
        },
        {
          id: 'general-store',
          name: 'General Store',
          category: 'general',
          description: 'Simple store template for any type of community',
          features: ['Clean design', 'Easy customization', 'Universal appeal'],
          botConfig: { theme: 'clean', color: '#2196F3' },
          defaultCategories: [
            { name: 'Products', emoji: '📦' },
            { name: 'Services', emoji: '🛠️' },
            { name: 'Digital Goods', emoji: '💾' }
          ],
          defaultProducts: [
            { name: 'Custom Service', price: 15, category: 'Services' },
            { name: 'Digital Download', price: 10, category: 'Digital Goods' }
          ]
        }
      ];
      
      setTemplates(mockTemplates);
      setTemplatesLoading(false);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      setTemplatesLoading(false);
    }
  };

  const filteredTemplates = selectedCategory === 'all' 
    ? templates 
    : templates.filter(t => t.category === selectedCategory);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplate) return;
    
    setIsApplying(true);
    try {
      // This will be implemented when we have the API client
      // await apiClient.post('/onboarding/apply-template', {
      //   templateId: selectedTemplate,
      //   serverId: selectedServer
      // });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      router.push('/onboarding/setup-wizard');
    } catch (error) {
      console.error('Failed to apply template:', error);
      setIsApplying(false);
    }
  };

  const handleSkipTemplate = () => {
    router.push('/onboarding/setup-wizard');
  };

  if (isLoading || templatesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <OnboardingProgress currentStep="template" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Palette className="w-8 h-8 text-white" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Choose Your Template
        </h1>
        
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Start with a pre-built template to get your shop up and running quickly. 
          You can customize everything later.
        </p>
      </motion.div>

      {/* Category Filter */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap justify-center gap-2 mb-8"
      >
        {templateCategories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`
              flex items-center space-x-2 px-4 py-2 rounded-full transition-all
              ${selectedCategory === category.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-300'
              }
            `}
          >
            <category.icon className="w-4 h-4" />
            <span>{category.name}</span>
          </button>
        ))}
      </motion.div>

      {/* Templates Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
      >
        {filteredTemplates.map((template, index) => (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + index * 0.1 }}
          >
            <TemplateCard
              template={template}
              isSelected={selectedTemplate === template.id}
              onSelect={() => handleTemplateSelect(template.id)}
            />
          </motion.div>
        ))}
      </motion.div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No templates found for this category.</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => router.push('/onboarding/invite-bot')}
        >
          Back
        </Button>

        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={handleSkipTemplate}
            disabled={isApplying}
          >
            Skip Template
          </Button>
          
          <Button
            onClick={handleApplyTemplate}
            disabled={!selectedTemplate || isApplying}
          >
            {isApplying ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Applying Template...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Apply Template
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}