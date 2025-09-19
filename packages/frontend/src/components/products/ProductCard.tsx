import React, { useState } from 'react';
import { Product, Category } from '@/types/dashboard';
import { Button } from '@/components/ui/Button';
import { ProductPreview } from './ProductPreview';
import { Edit, Trash2, Eye, Package, DollarSign } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  categories: Category[];
  onEdit: (product: Product) => void;
  onDelete: (productId: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  categories,
  onEdit,
  onDelete,
  selectable = false,
  selected = false,
  onSelect,
}) => {
  const [showPreview, setShowPreview] = useState(false);

  const category = categories.find(c => c.id === product.category_id);
  const isOutOfStock = product.stock_quantity !== null && product.stock_quantity !== undefined && product.stock_quantity <= 0;

  return (
    <>
      <div className={`bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow relative ${!product.is_active ? 'opacity-60' : ''
        } ${selected ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}>
        {selectable && (
          <div className="absolute top-3 left-3 z-10">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect?.(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>
        )}
        {product.image_url ? (
          <div className="aspect-video w-full overflow-hidden rounded-t-lg">
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden aspect-video w-full bg-gray-100 flex items-center justify-center">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          </div>
        ) : (
          <div className="aspect-video w-full bg-gray-100 flex items-center justify-center rounded-t-lg">
            <Package className="h-8 w-8 text-gray-400" />
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="mb-1.5">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Product Name</span>
                <h3 className="font-semibold text-gray-900 truncate mt-1">{product.name}</h3>
              </div>

              {category && (
                <div className="mb-1.5">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Category</span>
                  <div className="flex items-center gap-1 text-sm text-gray-700 mt-1">
                    {category.image_url && (
                      <img
                        src={category.image_url}
                        alt={category.name}
                        className="w-4 h-4 rounded object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    )}
                    {category.name}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 ml-2">
              {!product.is_active && (
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                  Inactive
                </span>
              )}
              {isOutOfStock && (
                <span className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded">
                  Out of Stock
                </span>
              )}
            </div>
          </div>

          {product.description && (
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</span>
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                {product.description}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="font-semibold text-green-600">
                {product.price} {product.currency}
              </span>
            </div>
            {product.stock_quantity !== null && (
              <span className="text-sm text-gray-500">
                Stock: {product.stock_quantity}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(true)}
              className="flex-1 flex items-center justify-center gap-1"
            >
              <Eye className="h-3 w-3" />
              Preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(product)}
              className="flex items-center justify-center gap-1"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(product.id)}
              className="flex items-center justify-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <ProductPreview
        product={product}
        category={category}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </>
  );
};