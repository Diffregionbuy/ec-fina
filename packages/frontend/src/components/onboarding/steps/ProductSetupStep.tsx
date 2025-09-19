'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Plus, Trash2, Package, Tag, Edit3 } from 'lucide-react';

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(50, 'Category name must be 50 characters or less'),
  emoji: z.string().optional(),
  description: z.string().max(200, 'Description must be 200 characters or less').optional()
});

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(100, 'Product name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  price: z.number().min(0.01, 'Price must be greater than 0'),
  categoryId: z.string().optional(),
  imageUrl: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  stock: z.number().min(0, 'Stock cannot be negative').optional()
});

type Category = z.infer<typeof categorySchema> & { id: string };
type Product = z.infer<typeof productSchema> & { id: string };

interface ProductSetupStepProps {
  initialData: {
    categories: Category[];
    products: Product[];
  };
  onComplete: (data: { categories: Category[]; products: Product[] }) => void;
  onNext: () => void;
}

export function ProductSetupStep({ initialData, onComplete, onNext }: ProductSetupStepProps) {
  const [categories, setCategories] = useState<Category[]>(initialData.categories || []);
  const [products, setProducts] = useState<Product[]>(initialData.products || []);
  const [activeTab, setActiveTab] = useState<'categories' | 'products'>('categories');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const categoryForm = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', emoji: '', description: '' }
  });

  const productForm = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', description: '', price: 0, categoryId: '', imageUrl: '', stock: undefined }
  });

  const handleAddCategory = (data: z.infer<typeof categorySchema>) => {
    const newCategory: Category = {
      ...data,
      id: Date.now().toString()
    };
    setCategories(prev => [...prev, newCategory]);
    categoryForm.reset();
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    categoryForm.reset(category);
  };

  const handleUpdateCategory = (data: z.infer<typeof categorySchema>) => {
    if (!editingCategory) return;
    
    setCategories(prev => prev.map(cat => 
      cat.id === editingCategory.id ? { ...cat, ...data } : cat
    ));
    setEditingCategory(null);
    categoryForm.reset();
  };

  const handleDeleteCategory = (categoryId: string) => {
    setCategories(prev => prev.filter(cat => cat.id !== categoryId));
    // Remove category from products
    setProducts(prev => prev.map(product => 
      product.categoryId === categoryId ? { ...product, categoryId: undefined } : product
    ));
  };

  const handleAddProduct = (data: z.infer<typeof productSchema>) => {
    const newProduct: Product = {
      ...data,
      id: Date.now().toString()
    };
    setProducts(prev => [...prev, newProduct]);
    productForm.reset();
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    productForm.reset(product);
  };

  const handleUpdateProduct = (data: z.infer<typeof productSchema>) => {
    if (!editingProduct) return;
    
    setProducts(prev => prev.map(prod => 
      prod.id === editingProduct.id ? { ...prod, ...data } : prod
    ));
    setEditingProduct(null);
    productForm.reset();
  };

  const handleDeleteProduct = (productId: string) => {
    setProducts(prev => prev.filter(prod => prod.id !== productId));
  };

  const handleContinue = () => {
    onComplete({ categories, products });
    onNext();
  };

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(cat => cat.id === categoryId);
    return category ? `${category.emoji} ${category.name}` : 'Uncategorized';
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md transition-all ${
            activeTab === 'categories'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Categories ({categories.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md transition-all ${
            activeTab === 'products'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Products ({products.length})</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'categories' && (
          <motion.div
            key="categories"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Add/Edit Category Form */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </h3>
              
              <form
                onSubmit={categoryForm.handleSubmit(editingCategory ? handleUpdateCategory : handleAddCategory)}
                className="grid md:grid-cols-3 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    {...categoryForm.register('name')}
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Tools & Weapons"
                  />
                  {categoryForm.formState.errors.name && (
                    <p className="text-red-600 text-sm mt-1">
                      {categoryForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Emoji
                  </label>
                  <input
                    {...categoryForm.register('emoji')}
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="⚔️"
                  />
                </div>
                
                <div className="flex items-end space-x-2">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={!categoryForm.formState.isValid}
                  >
                    {editingCategory ? 'Update' : 'Add'} Category
                  </Button>
                  {editingCategory && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingCategory(null);
                        categoryForm.reset();
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </Card>

            {/* Categories List */}
            {categories.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Categories</h3>
                <div className="space-y-3">
                  {categories.map((category) => (
                    <motion.div
                      key={category.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{category.emoji || '📁'}</span>
                        <div>
                          <div className="font-medium text-gray-900">{category.name}</div>
                          {category.description && (
                            <div className="text-sm text-gray-600">{category.description}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditCategory(category)}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteCategory(category.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {activeTab === 'products' && (
          <motion.div
            key="products"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* Add/Edit Product Form */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h3>
              
              <form
                onSubmit={productForm.handleSubmit(editingProduct ? handleUpdateProduct : handleAddProduct)}
                className="space-y-4"
              >
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Name *
                    </label>
                    <input
                      {...productForm.register('name')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Diamond Sword"
                    />
                    {productForm.formState.errors.name && (
                      <p className="text-red-600 text-sm mt-1">
                        {productForm.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price *
                    </label>
                    <input
                      {...productForm.register('price', { valueAsNumber: true })}
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                    {productForm.formState.errors.price && (
                      <p className="text-red-600 text-sm mt-1">
                        {productForm.formState.errors.price.message}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <select
                      {...productForm.register('categoryId')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.emoji} {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Stock (Optional)
                    </label>
                    <input
                      {...productForm.register('stock', { valueAsNumber: true })}
                      type="number"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Unlimited"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    {...productForm.register('description')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Product description..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Image URL (Optional)
                  </label>
                  <input
                    {...productForm.register('imageUrl')}
                    type="url"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://your-domain.com/image.png"
                  />
                  {productForm.formState.errors.imageUrl && (
                    <p className="text-red-600 text-sm mt-1">
                      {productForm.formState.errors.imageUrl.message}
                    </p>
                  )}
                </div>
                
                <div className="flex justify-end space-x-2">
                  {editingProduct && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingProduct(null);
                        productForm.reset();
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={!productForm.formState.isValid}
                  >
                    {editingProduct ? 'Update' : 'Add'} Product
                  </Button>
                </div>
              </form>
            </Card>

            {/* Products List */}
            {products.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Products</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {products.map((product) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-sm text-gray-600">{getCategoryName(product.categoryId)}</div>
                        </div>
                        <div className="text-lg font-bold text-green-600">
                          ${product.price}
                        </div>
                      </div>
                      
                      {product.description && (
                        <p className="text-sm text-gray-600 mb-3">{product.description}</p>
                      )}
                      
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-500">
                          {product.stock !== undefined ? `Stock: ${product.stock}` : 'Unlimited stock'}
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditProduct(product)}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteProduct(product.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between">
        <div className="text-sm text-gray-600">
          {categories.length === 0 && products.length === 0 ? (
            'You can skip this step and add products later'
          ) : (
            `${categories.length} categories, ${products.length} products configured`
          )}
        </div>
        
        <Button onClick={handleContinue} className="px-8">
          Continue to Payment Setup
        </Button>
      </div>
    </div>
  );
}