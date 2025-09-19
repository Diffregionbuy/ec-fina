import React from 'react';
import { Product, Category } from '@/types/dashboard';
import { Modal } from '@/components/ui/Modal';
import { Package, DollarSign, Tag, Hash } from 'lucide-react';

interface ProductPreviewProps {
  product: Product;
  category?: Category;
  isOpen: boolean;
  onClose: () => void;
}

export const ProductPreview: React.FC<ProductPreviewProps> = ({
  product,
  category,
  isOpen,
  onClose,
}) => {
  const isOutOfStock = product.stock_quantity !== null && product.stock_quantity !== undefined && product.stock_quantity <= 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Product Preview"
      size="lg"
    >
      <div className="space-y-6">
        {/* Discord Embed Preview */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-3">Discord Bot Preview</h3>
          <div className="bg-gray-700 rounded border-l-4 border-blue-500 p-4">
            <div className="flex items-start gap-3">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-16 h-16 rounded object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-16 h-16 bg-gray-600 rounded flex items-center justify-center">
                  <Package className="h-6 w-6 text-gray-400" />
                </div>
              )}
              
              <div className="flex-1">
                <h4 className="text-white font-semibold text-lg">{product.name}</h4>
                
                {category && (
                  <div className="flex items-center gap-1 text-gray-300 text-sm mb-2">
                    {category.image_url ? (
                      <img
                        src={category.image_url}
                        alt={category.name}
                        className="w-4 h-4 rounded object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : (
                      <Tag className="h-3 w-3" />
                    )}
                    <span className="hidden">
                      <Tag className="h-3 w-3" />
                    </span>
                    {category.name}
                  </div>
                )}

                {product.description && (
                  <p className="text-gray-300 text-sm mb-3">{product.description}</p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-green-400 font-semibold">
                    <DollarSign className="h-4 w-4" />
                    {product.price} {product.currency}
                  </div>
                  
                  {product.stock_quantity !== null && (
                    <div className="flex items-center gap-1 text-gray-300 text-sm">
                      <Hash className="h-3 w-3" />
                      Stock: {product.stock_quantity}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      isOutOfStock || !product.is_active
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    disabled={isOutOfStock || !product.is_active}
                  >
                    {isOutOfStock ? 'Out of Stock' : !product.is_active ? 'Unavailable' : 'Purchase'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Details */}
        <div className="space-y-4">
          <h3 className="font-medium text-gray-900">Product Details</h3>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Status:</span>
              <span className={`ml-2 font-medium ${
                product.is_active ? 'text-green-600' : 'text-red-600'
              }`}>
                {product.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            <div>
              <span className="text-gray-500">Price:</span>
              <span className="ml-2 font-medium text-green-600">
                {product.price} {product.currency}
              </span>
            </div>
            
            {product.stock_quantity !== null && (
              <div>
                <span className="text-gray-500">Stock:</span>
                <span className={`ml-2 font-medium ${
                  (product.stock_quantity ?? 0) > 0 ? 'text-gray-900' : 'text-red-600'
                }`}>
                  {product.stock_quantity ?? 0}
                </span>
              </div>
            )}
            
            <div>
              <span className="text-gray-500">Category:</span>
              <span className="ml-2 font-medium flex items-center gap-1">
                {category ? (
                  <>
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
                  </>
                ) : (
                  'Uncategorized'
                )}
              </span>
            </div>
          </div>

          {product.description && (
            <div>
              <span className="text-gray-500 text-sm">Description:</span>
              <p className="mt-1 text-gray-900">{product.description}</p>
            </div>
          )}

          <div className="text-xs text-gray-500">
            Created: {new Date(product.created_at).toLocaleDateString()}
            {product.updated_at !== product.created_at && (
              <span className="ml-4">
                Updated: {new Date(product.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};