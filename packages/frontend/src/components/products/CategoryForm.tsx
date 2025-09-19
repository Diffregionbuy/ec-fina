import React, { useState, useEffect } from 'react';
import { Category } from '@/types/dashboard';
import { Button } from '@/components/ui/Button';
import { Tag, Hash, Package } from 'lucide-react';

interface CategoryFormProps {
  category?: Category | null;
  existingCategories: Category[];
  onSave: (data: Partial<Category>) => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  description: string;
  image_url: string;
  sort_order: string;
}

// Image URL validation helper
const validateImageUrl = (url: string): boolean => {
  if (!url) return true; // Empty URL is valid
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const CategoryForm: React.FC<CategoryFormProps> = ({
  category,
  existingCategories,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    image_url: '',
    sort_order: '',
  });

  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || '',
        description: category.description || '',
        image_url: category.image_url || '',
        sort_order: (category.sort_order ?? 0).toString(),
      });
    } else {
      // Set default sort order for new categories
      const maxOrder = Math.max(...existingCategories.map(c => c.sort_order || 0), -1);
      setFormData(prev => ({
        ...prev,
        sort_order: (maxOrder + 1).toString(),
      }));
    }
  }, [category, existingCategories]);

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Category name is required';
    } else if (existingCategories.some(c => 
      c.name.toLowerCase() === formData.name.toLowerCase() && c.id !== category?.id
    )) {
      newErrors.name = 'A category with this name already exists';
    }

    if (formData.sort_order && formData.sort_order.trim()) {
      const order = parseInt(formData.sort_order);
      if (isNaN(order) || order < 0) {
        newErrors.sort_order = 'Sort order must be a valid positive number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const submitData: Partial<Category> = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        image_url: formData.image_url.trim() || undefined,
        sort_order: formData.sort_order ? parseInt(formData.sort_order) : 0,
      };

      await onSave(submitData);
    } catch (error) {
      console.error('Failed to save category:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };



  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="category-name" className="block text-sm font-medium text-gray-700 mb-1">
            Category Name *
          </label>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              id="category-name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full pl-10 pr-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter category name"
            />
          </div>
          {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="category-description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="category-description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter category description (optional)"
          />
        </div>

        <div>
          <label htmlFor="category-image-url" className="block text-sm font-medium text-gray-700 mb-1">
            Category Image URL
          </label>
          <div className="space-y-3">
            <input
              id="category-image-url"
              type="url"
              value={formData.image_url}
              onChange={(e) => handleInputChange('image_url', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://example.com/category-image.jpg"
            />
            
            {formData.image_url && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Image Preview</h4>
                <div className="relative w-full max-w-xs mx-auto">
                  <div className="aspect-video w-full bg-white rounded border overflow-hidden">
                    <img
                      src={formData.image_url}
                      alt="Category preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <div className="hidden w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <Package className="h-8 w-8 mb-2" />
                      <p className="text-xs text-center">Failed to load image</p>
                      <p className="text-xs text-center mt-1">Check if the URL is valid</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="category-sort-order" className="block text-sm font-medium text-gray-700 mb-1">
            Sort Order
          </label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              id="category-sort-order"
              type="number"
              min="0"
              value={formData.sort_order}
              onChange={(e) => handleInputChange('sort_order', e.target.value)}
              className={`w-full pl-10 pr-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.sort_order ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="0"
            />
          </div>
          {errors.sort_order && <p className="text-red-600 text-sm mt-1">{errors.sort_order}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Lower numbers appear first. Leave empty to add at the end.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Saving...
            </>
          ) : (
            <>
              <Tag className="h-4 w-4" />
              {category ? 'Update Category' : 'Create Category'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
};