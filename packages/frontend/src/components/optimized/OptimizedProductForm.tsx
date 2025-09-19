'use client';

import React, { memo, useMemo, useCallback } from 'react';
import { Product, Category } from '@/types/dashboard';
import { Button } from '@/components/ui/Button';
import { useOptimizedForm } from '@/contexts/OptimizedStateContext';
import { 
  DollarSign, 
  Package, 
  Tag, 
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

interface OptimizedProductFormProps {
  product?: Product | null;
  categories: Category[];
  onSave: (data: Partial<Product>) => Promise<void>;
  onCancel: () => void;
}

interface ProductFormData {
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

// Memoized field components to prevent unnecessary re-renders
const MemoizedTextField = memo(({ 
  label, 
  value, 
  onChange, 
  onBlur,
  error, 
  placeholder, 
  maxLength,
  required = false,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  type?: string;
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label} {required && '*'}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
        error ? 'border-red-500' : 'border-gray-300'
      }`}
      placeholder={placeholder}
      maxLength={maxLength}
    />
    {error && (
      <p className="mt-1 text-sm text-red-600 flex items-center">
        <AlertCircle className="h-4 w-4 mr-1" />
        {error}
      </p>
    )}
    {maxLength && (
      <p className="mt-1 text-xs text-gray-500">
        {value.length}/{maxLength} characters
      </p>
    )}
  </div>
));

const MemoizedTextArea = memo(({ 
  label, 
  value, 
  onChange, 
  onBlur,
  error, 
  placeholder, 
  maxLength,
  rows = 3
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label}
    </label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
        error ? 'border-red-500' : 'border-gray-300'
      }`}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
    />
    {error && (
      <p className="mt-1 text-sm text-red-600 flex items-center">
        <AlertCircle className="h-4 w-4 mr-1" />
        {error}
      </p>
    )}
    {maxLength && (
      <p className="mt-1 text-xs text-gray-500">
        {value.length}/{maxLength} characters
      </p>
    )}
  </div>
));

const MemoizedSelect = memo(({ 
  label, 
  value, 
  onChange, 
  onBlur,
  options,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
));

const MemoizedImagePreview = memo(({ 
  imageUrl, 
  isValid, 
  showPreview, 
  onTogglePreview 
}: {
  imageUrl: string;
  isValid: boolean;
  showPreview: boolean;
  onTogglePreview: () => void;
}) => {
  if (!imageUrl || !isValid) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onTogglePreview}
        className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
      >
        {showPreview ? (
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
      {showPreview && (
        <div className="mt-3 border rounded-md p-3 bg-gray-50">
          <img
            src={imageUrl}
            alt="Product preview"
            className="max-w-full h-48 object-contain rounded mx-auto"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
});

const MemoizedCommandList = memo(({ 
  commands, 
  onRemove 
}: {
  commands: string[];
  onRemove: (index: number) => void;
}) => {
  if (commands.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Commands to execute:</p>
      {commands.map((command, index) => (
        <div key={`${command}-${index}`} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded border">
          <code className="text-sm text-gray-800 flex-1">{command}</code>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-red-600 hover:text-red-800 ml-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
});

export const OptimizedProductForm = memo<OptimizedProductFormProps>(({
  product,
  categories,
  onSave,
  onCancel,
}) => {
  // Initialize form data
  const initialValues: ProductFormData = useMemo(() => ({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price?.toString() || '',
    currency: product?.currency || 'USD',
    image_url: product?.image_url || '',
    category_id: product?.category_id || '',
    stock_quantity: product?.stock_quantity?.toString() || '',
    is_active: product?.is_active ?? true,
    minecraft_commands: (product as any)?.minecraft_commands || [],
  }), [product]);

  // Form validation
  const validateForm = useCallback((values: ProductFormData) => {
    const errors: Partial<Record<keyof ProductFormData, string>> = {};

    // Name validation
    if (!values.name.trim()) {
      errors.name = 'Product name is required';
    } else if (values.name.length > 100) {
      errors.name = 'Product name cannot exceed 100 characters';
    }

    // Price validation
    if (!values.price.trim()) {
      errors.price = 'Price is required';
    } else {
      const price = parseFloat(values.price);
      if (isNaN(price) || price <= 0) {
        errors.price = 'Price must be a positive number';
      } else if (!/^\d+(\.\d{1,2})?$/.test(values.price)) {
        errors.price = 'Price can have at most 2 decimal places';
      }
    }

    // Description validation
    if (values.description.length > 2000) {
      errors.description = 'Description cannot exceed 2000 characters';
    }

    // Stock quantity validation
    if (values.stock_quantity && values.stock_quantity.trim()) {
      const stock = parseInt(values.stock_quantity);
      if (isNaN(stock) || stock < 0) {
        errors.stock_quantity = 'Stock quantity must be a non-negative number';
      }
    }

    // Image URL validation
    if (values.image_url) {
      try {
        const url = new URL(values.image_url);
        if (url.protocol !== 'https:' && !url.hostname.includes('localhost')) {
          errors.image_url = 'Image URL must use HTTPS for security';
        }
      } catch {
        errors.image_url = 'Please enter a valid URL';
      }
    }

    return errors;
  }, []);

  // Form submission handler
  const handleSubmit = useCallback(async (values: ProductFormData) => {
    const productData: Partial<Product> = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      price: parseFloat(values.price),
      currency: values.currency as any,
      image_url: values.image_url.trim() || undefined,
      category_id: values.category_id.trim() || undefined,
      stock_quantity: values.stock_quantity ? parseInt(values.stock_quantity) : undefined,
      is_active: values.is_active,
      ...(values.minecraft_commands.length > 0 && { minecraft_commands: values.minecraft_commands }),
    } as any;

    await onSave(productData);
  }, [onSave]);

  // Use optimized form hook
  const {
    values,
    errors,
    touched,
    isSubmitting,
    updateField,
    blurField,
    handleSubmit: onSubmit,
    isValid,
  } = useOptimizedForm(initialValues, {
    validate: validateForm,
    onSubmit: handleSubmit,
  });

  // Local state for UI interactions
  const [showImagePreview, setShowImagePreview] = React.useState(false);
  const [commandInput, setCommandInput] = React.useState('');

  // Memoized options
  const currencyOptions = useMemo(() => [
    { value: 'USD', label: 'USD ($)' },
    { value: 'EUR', label: 'EUR (€)' },
    { value: 'GBP', label: 'GBP (£)' },
    { value: 'BTC', label: 'BTC (₿)' },
    { value: 'ETH', label: 'ETH (Ξ)' },
  ], []);

  const categoryOptions = useMemo(() => [
    ...categories.map(cat => ({ value: cat.id, label: cat.name }))
  ], [categories]);

  // Command management
  const addCommand = useCallback(() => {
    const trimmedCommand = commandInput.trim();
    if (trimmedCommand && !values.minecraft_commands.includes(trimmedCommand)) {
      if (!trimmedCommand.startsWith('/')) {
        return; // Invalid command
      }
      
      updateField('minecraft_commands', [...values.minecraft_commands, trimmedCommand]);
      setCommandInput('');
    }
  }, [commandInput, values.minecraft_commands, updateField]);

  const removeCommand = useCallback((index: number) => {
    updateField('minecraft_commands', values.minecraft_commands.filter((_, i) => i !== index));
  }, [values.minecraft_commands, updateField]);

  // Image validation
  const isImageValid = useMemo(() => {
    if (!values.image_url) return false;
    try {
      const url = new URL(values.image_url);
      return url.protocol === 'https:' || url.hostname.includes('localhost');
    } catch {
      return false;
    }
  }, [values.image_url]);

  const toggleImagePreview = useCallback(() => {
    setShowImagePreview(prev => !prev);
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={onSubmit} className="space-y-8">
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
            <MemoizedTextField
              label="Product Name"
              value={values.name}
              onChange={(value) => updateField('name', value)}
              onBlur={() => blurField('name')}
              error={touched.name ? errors.name : undefined}
              placeholder="Enter product name"
              maxLength={100}
              required
            />

            <MemoizedTextArea
              label="Description"
              value={values.description}
              onChange={(value) => updateField('description', value)}
              onBlur={() => blurField('description')}
              error={touched.description ? errors.description : undefined}
              placeholder="Describe your product..."
              maxLength={2000}
              rows={3}
            />
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2" />
            Pricing
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <MemoizedTextField
              label="Price"
              value={values.price}
              onChange={(value) => updateField('price', value)}
              onBlur={() => blurField('price')}
              error={touched.price ? errors.price : undefined}
              placeholder="0.00"
              type="number"
              required
            />

            <MemoizedSelect
              label="Currency"
              value={values.currency}
              onChange={(value) => updateField('currency', value)}
              onBlur={() => blurField('currency')}
              options={currencyOptions}
            />
          </div>
        </div>

        {/* Organization */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Tag className="h-5 w-5 mr-2" />
            Organization
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <MemoizedSelect
              label="Category"
              value={values.category_id}
              onChange={(value) => updateField('category_id', value)}
              onBlur={() => blurField('category_id')}
              options={categoryOptions}
              placeholder="No Category"
            />

            <MemoizedTextField
              label="Stock Quantity"
              value={values.stock_quantity}
              onChange={(value) => updateField('stock_quantity', value)}
              onBlur={() => blurField('stock_quantity')}
              error={touched.stock_quantity ? errors.stock_quantity : undefined}
              placeholder="Leave empty for unlimited"
              type="number"
            />
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
                value={values.image_url}
                onChange={(e) => updateField('image_url', e.target.value)}
                onBlur={() => blurField('image_url')}
                className={`w-full px-3 py-2 pr-10 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  touched.image_url && errors.image_url ? 'border-red-500' : 
                  isImageValid ? 'border-green-500' :
                  'border-gray-300'
                }`}
                placeholder="https://example.com/image.jpg"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                {isImageValid && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {touched.image_url && errors.image_url && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            </div>
            {touched.image_url && errors.image_url && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.image_url}
              </p>
            )}
            
            <MemoizedImagePreview
              imageUrl={values.image_url}
              isValid={isImageValid}
              showPreview={showImagePreview}
              onTogglePreview={toggleImagePreview}
            />
            
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
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCommand())}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter a command (e.g., /give {player} diamond 1)"
                maxLength={500}
              />
              <Button
                type="button"
                onClick={addCommand}
                disabled={!commandInput.trim() || !commandInput.startsWith('/')}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            <MemoizedCommandList
              commands={values.minecraft_commands}
              onRemove={removeCommand}
            />
            
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
              checked={values.is_active}
              onChange={(e) => updateField('is_active', e.target.checked)}
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
            disabled={isSubmitting || !isValid}
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
});

OptimizedProductForm.displayName = 'OptimizedProductForm';
