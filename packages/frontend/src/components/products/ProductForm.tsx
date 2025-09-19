import React, { useState, useEffect, useCallback } from 'react';
import { Product, Category } from '@/types/dashboard';
import { Button } from '@/components/ui/Button';
import { 
  DollarSign, 
  Package, 
  Tag, 
  Hash, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  Plus,
  X,
  Terminal,
  Info
} from 'lucide-react';

interface ProductFormProps {
  product?: Product | null;
  categories: Category[];
  onSave: (data: Partial<Product>) => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  description: string;
  price: string;
  currency: string;
  image_url: string;
  category_id: string;
  stock_quantity: string;
  is_active: boolean;
  minecraft_commands: string[];
}

interface FormErrors {
  [key: string]: string;
}

interface ImageValidation {
  status: 'idle' | 'validating' | 'valid' | 'invalid';
  error?: string;
}

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export const ProductForm: React.FC<ProductFormProps> = ({
  product,
  categories,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    price: '',
    currency: 'USD',
    image_url: '',
    category_id: '',
    stock_quantity: '',
    is_active: true,
    minecraft_commands: [],
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [imageValidation, setImageValidation] = useState<ImageValidation>({ status: 'idle' });
  const [commandInput, setCommandInput] = useState('');

  // Initialize form data when product changes
  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        description: product.description || '',
        price: product.price?.toString() || '',
        currency: product.currency || 'USD',
        image_url: product.image_url || '',
        category_id: product.category_id || '',
        stock_quantity: product.stock_quantity?.toString() || '',
        is_active: product.is_active ?? true,
        minecraft_commands: (product as any).minecraft_commands || [],
      });
    } else {
      // Reset form when no product (for create mode)
      setFormData({
        name: '',
        description: '',
        price: '',
        currency: 'USD',
        image_url: '',
        category_id: '',
        stock_quantity: '',
        is_active: true,
        minecraft_commands: [],
      });
    }
  }, [product]);

  // Debounced image URL validation
  const validateImageUrl = useCallback(
    debounce(async (url: string) => {
      if (!url.trim()) {
        setImageValidation({ status: 'idle' });
        return;
      }

      setImageValidation({ status: 'validating' });

      try {
        // Basic URL validation
        const urlObj = new URL(url);
        
        // Check protocol
        if (urlObj.protocol !== 'https:' && !urlObj.hostname.includes('localhost')) {
          setImageValidation({ 
            status: 'invalid', 
            error: 'Image URL must use HTTPS for security' 
          });
          return;
        }

        // Check if it's likely an image URL
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const hasImageExtension = imageExtensions.some(ext => 
          url.toLowerCase().includes(ext)
        );

        const trustedHosts = ['imgur.com', 'discord.com', 'discordapp.com', 'cdn.discordapp.com'];
        const isTrustedHost = trustedHosts.some(host => urlObj.hostname.includes(host));

        if (!hasImageExtension && !isTrustedHost) {
          setImageValidation({ 
            status: 'invalid', 
            error: 'URL should point to an image file or be from a trusted image host' 
          });
          return;
        }

        setImageValidation({ status: 'valid' });
      } catch {
        setImageValidation({ 
          status: 'invalid', 
          error: 'Please enter a valid URL' 
        });
      }
    }, 800),
    []
  );

  // Handle form field changes
  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Validate image URL on change
    if (field === 'image_url' && typeof value === 'string') {
      validateImageUrl(value);
    }
  };

  // Add minecraft command
  const addCommand = () => {
    const trimmedCommand = commandInput.trim();
    if (trimmedCommand && !formData.minecraft_commands.includes(trimmedCommand)) {
      // Basic command validation
      if (!trimmedCommand.startsWith('/')) {
        setErrors(prev => ({ ...prev, commandInput: 'Commands must start with /' }));
        return;
      }
      
      setFormData(prev => ({
        ...prev,
        minecraft_commands: [...prev.minecraft_commands, trimmedCommand]
      }));
      setCommandInput('');
      setErrors(prev => ({ ...prev, commandInput: '' }));
    }
  };

  // Remove minecraft command
  const removeCommand = (index: number) => {
    setFormData(prev => ({
      ...prev,
      minecraft_commands: prev.minecraft_commands.filter((_, i) => i !== index)
    }));
  };

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Product name cannot exceed 100 characters';
    }

    // Price validation
    if (!formData.price.trim()) {
      newErrors.price = 'Price is required';
    } else {
      const price = parseFloat(formData.price);
      if (isNaN(price) || price <= 0) {
        newErrors.price = 'Price must be a positive number';
      } else if (!/^\d+(\.\d{1,2})?$/.test(formData.price)) {
        newErrors.price = 'Price can have at most 2 decimal places';
      }
    }

    // Description validation
    if (formData.description.length > 2000) {
      newErrors.description = 'Description cannot exceed 2000 characters';
    }

    // Stock quantity validation
    if (formData.stock_quantity && formData.stock_quantity.trim()) {
      const stock = parseInt(formData.stock_quantity);
      if (isNaN(stock) || stock < 0) {
        newErrors.stock_quantity = 'Stock quantity must be a non-negative number';
      }
    }

    // Image URL validation
    if (imageValidation.status === 'invalid') {
      newErrors.image_url = imageValidation.error || 'Invalid image URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const productData: Partial<Product> = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        price: parseFloat(formData.price),
        currency: formData.currency as any,
        image_url: formData.image_url.trim() || undefined,
        category_id: formData.category_id.trim() || undefined,
        stock_quantity: formData.stock_quantity ? parseInt(formData.stock_quantity) : undefined,
        is_active: formData.is_active,
        ...(formData.minecraft_commands.length > 0 && { minecraft_commands: formData.minecraft_commands }),
      } as any;

      await onSave(productData);
    } catch (error) {
      console.error('Error saving product:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {product ? 'Edit Product' : 'Create New Product'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {product ? 'Update your product details' : 'Add a new product to your server store'}
          </p>
        </div>

        {/* Basic Information */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Package className="h-5 w-5 mr-2" />
            Basic Information
          </h3>
          
          <div className="space-y-4">
            {/* Product Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Name *
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter product name"
                maxLength={100}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.name}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                {formData.name.length}/100 characters
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Describe your product..."
                rows={3}
                maxLength={2000}
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.description}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                {formData.description.length}/2000 characters
              </p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2" />
            Pricing
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price || ''}
                onChange={(e) => handleChange('price', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.price ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0.00"
              />
              {errors.price && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.price}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency
              </label>
              <select
                value={formData.currency || 'USD'}
                onChange={(e) => handleChange('currency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="BTC">BTC (₿)</option>
                <option value="ETH">ETH (Ξ)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Organization */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Tag className="h-5 w-5 mr-2" />
            Organization
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={formData.category_id || ''}
                onChange={(e) => handleChange('category_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stock Quantity
              </label>
              <input
                type="number"
                min="0"
                value={formData.stock_quantity || ''}
                onChange={(e) => handleChange('stock_quantity', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.stock_quantity ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Leave empty for unlimited"
              />
              {errors.stock_quantity && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.stock_quantity}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Leave empty for unlimited stock
              </p>
            </div>
          </div>
        </div>

        {/* Product Image */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Eye className="h-5 w-5 mr-2" />
            Product Image
          </h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image URL
            </label>
            <div className="relative">
              <input
                type="url"
                value={formData.image_url || ''}
                onChange={(e) => handleChange('image_url', e.target.value)}
                className={`w-full px-3 py-2 pr-10 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.image_url ? 'border-red-500' : 
                  imageValidation.status === 'valid' ? 'border-green-500' :
                  'border-gray-300'
                }`}
                placeholder="https://example.com/image.jpg"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                {imageValidation.status === 'validating' && (
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                )}
                {imageValidation.status === 'valid' && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {imageValidation.status === 'invalid' && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            </div>
            {errors.image_url && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.image_url}
              </p>
            )}
            
            {formData.image_url && imageValidation.status === 'valid' && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowImagePreview(!showImagePreview)}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                >
                  {showImagePreview ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-1" />
                      Hide Preview
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-1" />
                      Show Preview
                    </>
                  )}
                </button>
                {showImagePreview && (
                  <div className="mt-3 border rounded-md p-3 bg-gray-50">
                    <img
                      src={formData.image_url}
                      alt="Product preview"
                      className="max-w-full h-48 object-contain rounded mx-auto"
                      onError={() => setImageValidation({ 
                        status: 'invalid', 
                        error: 'Failed to load image' 
                      })}
                    />
                  </div>
                )}
              </div>
            )}
            
            <div className="mt-2 p-3 bg-blue-50 rounded-md">
              <p className="text-xs text-blue-700 flex items-start">
                <Info className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                For best results, use HTTPS URLs from trusted image hosts like Discord, Imgur, or your own domain. Supported formats: JPEG, PNG, GIF, WebP.
              </p>
            </div>
          </div>
        </div>

        {/* Minecraft Commands */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Terminal className="h-5 w-5 mr-2" />
            Minecraft Commands
          </h3>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={commandInput || ''}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCommand())}
                className={`flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.commandInput ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter a command (e.g., /give {player} diamond 1)"
                maxLength={500}
              />
              <Button
                type="button"
                onClick={addCommand}
                disabled={!commandInput.trim()}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {errors.commandInput && (
              <p className="text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.commandInput}
              </p>
            )}
            
            {formData.minecraft_commands.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Commands to execute:</p>
                {formData.minecraft_commands.map((command, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded border">
                    <code className="text-sm text-gray-800 flex-1">{command}</code>
                    <button
                      type="button"
                      onClick={() => removeCommand(index)}
                      className="text-red-600 hover:text-red-800 ml-2"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="p-3 bg-yellow-50 rounded-md">
              <p className="text-xs text-yellow-700 flex items-start">
                <Info className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                Commands will be executed when the product is purchased. Use {'{player}'} as a placeholder for the buyer's username. Commands must start with /.
              </p>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Status</h3>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => handleChange('is_active', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-3 block text-sm text-gray-700">
              Product is active and available for purchase
            </label>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-6 border-t">
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
            disabled={isSubmitting || imageValidation.status === 'validating'}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {product ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                <Package className="h-4 w-4 mr-2" />
                {product ? 'Update Product' : 'Create Product'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};