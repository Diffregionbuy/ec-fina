import React, { useState } from 'react';
import { Product, Category } from '@/types/dashboard';
import { ProductCard } from './ProductCard';
import { ProductFilters } from './ProductFilters';
import { Button } from '@/components/ui/Button';
import { 
  Package, 
  Grid, 
  List, 
  Edit, 
  Trash2, 
  Plus,
  MoreHorizontal,
  Eye,
  EyeOff
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ProductListProps {
  serverId?: string;
  products?: Product[];
  categories?: Category[];
  searchQuery?: string;
  selectedCategory?: string;
  onSearchChange?: (query: string) => void;
  onCategoryChange?: (categoryId: string) => void;
  onEdit?: (product: Product) => void;
  onDelete?: (productId: string) => void;
  onBulkDelete?: (productIds: string[]) => void;
  onCreateProduct?: () => void;
  onCreateCategory?: () => void;
}

type ViewMode = 'grid' | 'table';

export const ProductList: React.FC<ProductListProps> = (props) => {
  const {
    serverId,
    products = [],
    categories = [],
    searchQuery = '',
    selectedCategory = 'all',
    onSearchChange = () => {},
    onCategoryChange = () => {},
    onEdit = () => {},
    onDelete = () => {},
    onBulkDelete = () => {},
    onCreateProduct = () => {},
    onCreateCategory = () => {},
  } = props;
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());

  const productList = Array.isArray(products) ? products : [];
  const isFiltered = !!searchQuery || selectedCategory !== 'all';
  const hasProducts = productList.length > 0;

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Unknown Category';
  };

  const handleSelectProduct = (productId: string, selected: boolean) => {
    const newSelected = new Set(selectedProducts);
    if (selected) {
      newSelected.add(productId);
    } else {
      newSelected.delete(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedProducts(new Set(productList.map(p => p.id)));
    } else {
      setSelectedProducts(new Set());
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) return;
    
    const productNames = productList
      .filter(p => selectedProducts.has(p.id))
      .map(p => p.name)
      .join(', ');
    
    if (!confirm(`Are you sure you want to delete ${selectedProducts.size} product(s): ${productNames}?`)) {
      return;
    }

    // Delete selected products using bulk delete
    const productIds = Array.from(selectedProducts);
    await onBulkDelete(productIds);
    setSelectedProducts(new Set());
  };

  // Empty state when no products exist at all
  if (!hasProducts && !isFiltered) {
    const hasCategories = categories.length > 0;
    
    return (
      <div className="text-center py-16">
        <div className="max-w-md mx-auto">
          {/* Illustration */}
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
          
          {hasCategories ? (
            <>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Great! Now add your first product</h3>
              <p className="text-gray-600 mb-8">
                You've set up your categories. Now create products that your customers can purchase through your Discord bot.
              </p>
              
              {/* Show categories created */}
              <div className="bg-green-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center mb-2">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mr-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-green-800">
                    {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} created
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                  {categories.slice(0, 3).map((cat) => (
                    <span key={cat.id} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {cat.name}
                    </span>
                  ))}
                  {categories.length > 3 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      +{categories.length - 3} more
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-3 mx-auto mb-6">
                <Button
                  onClick={onCreateProduct}
                  size="lg"
                  className="flex items-center justify-center gap-2"
                >
                  <Plus className="h-5 w-5" />
                  Add Your First Product
                </Button>
                <Button
                  onClick={onCreateCategory}
                  size="lg"
                  variant="outline"
                  className="flex items-center justify-center gap-2"
                >
                  <Plus className="h-5 w-5" />
                  Add More Categories
                </Button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">No products yet</h3>
              <p className="text-gray-600 mb-8">
                This is where you'll manage your products. Create items or services that your customers can purchase through your Discord bot.
              </p>
              
              <div className="flex items-center justify-center gap-3 mx-auto mb-6">
                <Button
                  onClick={onCreateCategory}
                  size="lg"
                  variant="outline"
                  className="flex items-center justify-center gap-2"
                >
                  <Plus className="h-5 w-5" />
                  Add Category
                </Button>
                <Button
                  onClick={onCreateProduct}
                  size="lg"
                  className="flex items-center justify-center gap-2"
                >
                  <Plus className="h-5 w-5" />
                  Add Your First Product
                </Button>
              </div>
            </>
          )}
          
          {/* Quick tips */}
          <div className="bg-blue-50 rounded-lg p-4 text-left">
            <h4 className="font-medium text-gray-900 mb-2 text-sm">💡 Getting Started Tips:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Start with your most popular items</li>
              <li>• Add clear descriptions and images</li>
              <li>• Set up Minecraft commands for delivery</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Empty state when filtered but no results
  if (!hasProducts && isFiltered) {
    return (
      <div className="space-y-6">
        <ProductFilters
          searchQuery={searchQuery}
          selectedCategory={selectedCategory}
          categories={categories}
          onSearchChange={onSearchChange}
          onCategoryChange={onCategoryChange}
        />
        <div className="text-center py-16">
          <div className="max-w-sm mx-auto">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No products found</h3>
            <p className="text-gray-600 mb-6">
              Try adjusting your search or filters, or create a new product that matches your criteria.
            </p>
            <Button
              onClick={onCreateProduct}
              variant="outline"
              className="flex items-center gap-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Products</h2>
          <p className="text-sm text-gray-600">Manage your server's products and inventory</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onCreateCategory}
            className="flex items-center gap-2"
          >
            Manage Categories
          </Button>
          <Button
            onClick={onCreateProduct}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Filters and View Controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex-1">
          <ProductFilters
            searchQuery={searchQuery}
            selectedCategory={selectedCategory}
            categories={categories}
            onSearchChange={onSearchChange}
            onCategoryChange={onCategoryChange}
          />
        </div>
        
        <div className="flex items-center gap-2">
          {selectedProducts.size > 0 && (
            <div className="flex items-center gap-2 mr-4">
              <span className="text-sm text-gray-600">
                {selectedProducts.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected
              </Button>
            </div>
          )}
          
          <div className="flex items-center border rounded-md">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Products Display */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {productList.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categories={categories}
              onEdit={onEdit}
              onDelete={onDelete}
              selectable={true}
              selected={selectedProducts.has(product.id)}
              onSelect={(selected) => handleSelectProduct(product.id, selected)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedProducts.size === productList.length && productList.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date Added
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productList.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-10 w-10 rounded-lg object-cover mr-3"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center mr-3">
                            <Package className="h-5 w-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {product.name}
                          </div>
                          {product.description && (
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {product.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {getCategoryName(product.category_id || null)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatCurrency(product.price, product.currency)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {product.stock_quantity !== null ? product.stock_quantity : 'Unlimited'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        product.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {product.is_active ? (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3 mr-1" />
                            Inactive
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(product.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEdit(product)}
                          className="flex items-center gap-1"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(product.id)}
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
    </div>
  );
};