import React, { useState } from 'react';
import { Category } from '@/types/dashboard';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { CategoryForm } from './CategoryForm';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Plus, Edit, Trash2, Tag, GripVertical, Package } from 'lucide-react';

interface CategoryManagerProps {
  serverId: string;
  categories: Category[];
  products?: any[]; // Add products prop to count them
  onUpdate: () => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  serverId,
  categories,
  products = [],
  onUpdate,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toasts, removeToast, success, error: showError } = useToast();

  const handleSave = async (categoryData: Partial<Category>) => {
    try {
      let categoryName = '';
      if (editingCategory) {
        // Note: Update category endpoint would need to be added to API
        console.log('Update category not implemented in API yet');
        categoryName = categoryData.name || editingCategory.name;
        success('Category Updated', `"${categoryName}" has been updated successfully.`);
      } else {
        await apiClient.createCategory({ ...categoryData, server_id: serverId });
        categoryName = categoryData.name || 'Category';
        success('Category Created', `"${categoryName}" has been created successfully.`);
      }
      await onUpdate();
      setShowForm(false);
      setEditingCategory(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save category';
      setError(errorMessage);
      showError('Save Failed', errorMessage);
    }
  };

  const handleDelete = async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    const productCount = getProductCount(categoryId);
    
    let confirmMessage = `Are you sure you want to delete "${category?.name}"?`;
    if (productCount > 0) {
      confirmMessage += `\n\nThis will also permanently delete ${productCount} product${productCount === 1 ? '' : 's'} in this category.`;
    } else {
      confirmMessage += `\n\nNote: Any products in this category will also be deleted.`;
    }
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const result = await apiClient.deleteCategory(categoryId, serverId);
      
      // Force refresh the data to ensure we have the latest state
      await onUpdate();
      
      // Show success message with product deletion info from backend response
      const deletedProductCount = result.data?.deletedProductCount || 0;
      const successMessage = deletedProductCount > 0 
        ? `"${category?.name}" and ${deletedProductCount} product${deletedProductCount === 1 ? '' : 's'} deleted successfully.`
        : `"${category?.name}" has been deleted successfully.`;
        
      success('Category Deleted', successMessage);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete category';
      setError(errorMessage);
      showError('Delete Failed', errorMessage);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setShowForm(true);
  };

  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  // Function to count products in a category
  const getProductCount = (categoryId: string) => {
    return products.filter(product => product.category_id === categoryId).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
          <p className="text-sm text-gray-600">Organize your products into categories</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setError(null)}
            className="mt-2"
          >
            Dismiss
          </Button>
        </div>
      )}

      {sortedCategories.length === 0 ? (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            {/* Illustration */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center">
                  <Tag className="h-10 w-10 text-purple-600" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <Plus className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </div>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-3">No categories yet</h3>
            <p className="text-gray-600 mb-8">
              This is where you'll organize your products. Create categories to help customers easily browse and find what they're looking for.
            </p>
            
            <Button 
              onClick={() => setShowForm(true)}
              size="lg"
              className="flex items-center justify-center gap-2 mx-auto mb-6"
            >
              <Plus className="h-5 w-5" />
              Create Your First Category
            </Button>
            
            {/* Quick tips */}
            <div className="bg-purple-50 rounded-lg p-4 text-left">
              <h4 className="font-medium text-gray-900 mb-2 text-sm">💡 Category Ideas:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Weapons & Tools</li>
                <li>• VIP Ranks & Perks</li>
                <li>• Resources & Materials</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Products
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedCategories.map((category) => (
                  <tr key={category.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="cursor-move text-gray-400 mr-3">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        
                        {category.image_url ? (
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 mr-3">
                            <img
                              src={category.image_url}
                              alt={category.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="hidden w-full h-full flex items-center justify-center">
                              <Tag className="w-5 h-5 text-gray-400" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mr-3">
                            <Tag className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {category.name}
                          </div>
                          {category.description && (
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {category.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-900">
                        <Package className="h-4 w-4 text-gray-400 mr-1" />
                        {getProductCount(category.id)} products
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {category.sort_order}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(category)}
                          className="flex items-center gap-1"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(category.id)}
                          className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingCategory(null);
        }}
        title={editingCategory ? 'Edit Category' : 'Create Category'}
      >
        <CategoryForm
          category={editingCategory}
          existingCategories={categories}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingCategory(null);
          }}
        />
      </Modal>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};