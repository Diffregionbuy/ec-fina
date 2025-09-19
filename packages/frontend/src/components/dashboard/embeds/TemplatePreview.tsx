'use client';

import React from 'react';
import { Bot } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { BotTemplates, ProductDisplaySettings } from '@/types/botTemplates';
import { Category, Product } from '@/types/dashboard';
import DescriptionRenderer from './DescriptionRenderer';
import FieldValueRenderer from './FieldValueRenderer';

// Safe base64 encoding function that handles Unicode characters
const safeBase64Encode = (str: string): string => {
  try {
    // Convert Unicode string to UTF-8 bytes, then to base64
    return btoa(unescape(encodeURIComponent(str)));
  } catch (error) {
    // Fallback: remove non-Latin1 characters and encode
    const latin1Safe = str.replace(/[^\x00-\xFF]/g, '?');
    return btoa(latin1Safe);
  }
};

interface TemplatePreviewProps {
  selectedTemplate: keyof BotTemplates;
  templates: BotTemplates;
  categories: Category[];
  products: Product[];
  loadingCategories: boolean;
  loadingProducts: boolean;
  productDisplaySettings: ProductDisplaySettings;
  previewSelectedCategory: string;
  setPreviewSelectedCategory: (value: string) => void;
  previewSelectedProduct: string;
  setPreviewSelectedProduct: (value: string) => void;
  previewSelectedQuantity: string;
  setPreviewSelectedQuantity: (value: string) => void;
  previewSelectedPaymentMethod: string;
  setPreviewSelectedPaymentMethod: (value: string) => void;
  confirmationCrypto: string;
  setConfirmationCrypto: (value: string) => void;
  confirmationNetwork: string;
  setConfirmationNetwork: (value: string) => void;
}

const paymentMethods = [
  { id: 'crypto', name: 'Crypto - Integrate with 300+coins ', emoji: '🪙' },
  { id: 'paypal', name: 'Fiat   - Secured by Stripe', emoji: '💳' },
];

const cryptoOptions = [
  { id: 'bitcoin', name: 'Bitcoin', emoji: '₿' },
  { id: 'ethereum', name: 'Ethereum', emoji: 'Ξ' },
  { id: 'usdt', name: 'Tether', emoji: '₮' },
];

const networkOptions = [
  { id: 'ethereum', name: 'Ethereum', emoji: '🔷' },
  { id: 'bsc', name: 'Binance Smart Chain', emoji: '🟡' },
];

export function TemplatePreview({
  selectedTemplate,
  templates,
  categories,
  products,
  loadingCategories,
  loadingProducts,
  productDisplaySettings,
  previewSelectedCategory,
  setPreviewSelectedCategory,
  previewSelectedProduct,
  setPreviewSelectedProduct,
  previewSelectedQuantity,
  setPreviewSelectedQuantity,
  previewSelectedPaymentMethod,
  setPreviewSelectedPaymentMethod,
  confirmationCrypto,
  setConfirmationCrypto,
  confirmationNetwork,
  setConfirmationNetwork,
}: TemplatePreviewProps) {
  return (
    <Card>
      <CardHeader>
        <h4 className="text-lg font-semibold">Live Preview</h4>
      </CardHeader>
      <CardContent>
        <div className="bg-gray-800 rounded-lg p-4 text-white">
          {selectedTemplate === 'private_main_menu' ? (
            // Show original embed first, then category embeds for Private Main Menu
            <div className="space-y-4">
              {/* Original Private Main Menu Embed */}
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-semibold">EcBot</span>
                    <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">BOT</span>
                  </div>
                  {/* Banner for Private Main Menu (outside the embed) */}
                  {templates[selectedTemplate].banner_url && (
                    <div
                      className="border-l-4 bg-gray-700 rounded-lg p-4 mb-2"
                      style={{ borderLeftColor: templates[selectedTemplate].color }}
                    >
                      <div className="w-full h-32 rounded-lg overflow-hidden bg-gray-600 border border-gray-500">
                        <img
                          src={templates[selectedTemplate].banner_url}
                          alt="Banner Image"
                          className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = `data:image/svg+xml;base64,${safeBase64Encode(`
                            <svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
                              <rect width="100%" height="100%" fill="${templates[selectedTemplate].color}"/>
                              <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" fill="white" text-anchor="middle" dy=".3em">
                                Banner: ${templates[selectedTemplate].name}
                              </text>
                            </svg>
                          `)}`;
                        }}
                        />
                      </div>
                    </div>
                  )}
                  <div
                    className="border-l-4 bg-gray-700 rounded p-4"
                    style={{ borderLeftColor: templates[selectedTemplate].color }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-white">{templates[selectedTemplate].title}</h3>
                      {templates[selectedTemplate].thumbnail_url && (
                        <img
                          src={templates[selectedTemplate].thumbnail_url}
                          alt="Thumbnail"
                          className="w-12 h-12 rounded object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <DescriptionRenderer text={templates[selectedTemplate].description} />

                    {templates[selectedTemplate].fields.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                        {templates[selectedTemplate].fields.map((field, index) => (
                          <div key={index} className={field.inline ? 'col-span-1' : 'col-span-full'}>
                            <div className="text-sm font-medium text-white mb-1">{field.name}</div>
                            <div className="text-sm text-gray-300">
                              <FieldValueRenderer value={field.value} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-600">
                      <span>{templates[selectedTemplate].footer_text}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category Embeds */}
              {loadingCategories ? (
                <div className="text-center text-gray-400 py-4">Loading categories...</div>
              ) : categories.length === 0 ? (
                <div className="text-center text-gray-400 py-4">No categories found for this server.</div>
              ) : (
                categories.map((category) => (
                  <div key={category.id} className="flex items-start space-x-3">
                    <div className="w-10 h-10 flex-shrink-0"></div>
                    <div className="flex-1">
                      <div
                        className="border-l-4 bg-gray-700 rounded p-4"
                        style={{ borderLeftColor: templates[selectedTemplate].color }}
                      >
                        {/* Category Banner Image */}
                        {category.image_url && (
                          <div className="w-full h-24 mb-3 rounded overflow-hidden bg-gray-600">
                            <img
                              src={category.image_url}
                              alt={`${category.name} Banner`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = `data:image/svg+xml;base64,${safeBase64Encode(`
                                  <svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
                                    <rect width="100%" height="100%" fill="${templates[selectedTemplate].color}"/>
                                    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" fill="white" text-anchor="middle" dy=".3em">
                                      ${category.emoji || '🛍️'} ${category.name}
                                    </text>
                                  </svg>
                                `)}`;
                              }}
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-white">
                            {category.emoji && <span className="mr-2">{category.emoji}</span>}
                            {category.name}
                          </h3>
                          {templates[selectedTemplate].thumbnail_url && (
                            <img
                              src={templates[selectedTemplate].thumbnail_url}
                              alt="Thumbnail"
                              className="w-12 h-12 rounded object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                        </div>
                        <p className="text-gray-300 text-sm mb-3">
                          {category.description || `Browse ${category.name} products and services.`}
                        </p>

                        {/* Products Display */}
                        {productDisplaySettings.showProducts && !loadingProducts && (
                          (() => {
                            const categoryProducts = products.filter(
                              (product) => product.category_id === category.id && product.is_active
                            );

                            if (categoryProducts.length === 0) {
                              return (
                                <div className="text-gray-400 text-xs mb-3 italic">
                                  No products available in this category
                                </div>
                              );
                            }

                            const renderProduct = (product: Product, index: number) => {
                              const ratings = [4.3, 5, 4.2, 4.7, 4.2, 4.5, 4.3];
                              const rating = ratings[index % ratings.length];

                              return (
                                <div key={product.id} className="flex items-start gap-3 text-gray-300 text-xs">
                                  <div className="w-1 self-stretch bg-gray-500 rounded-full"></div>
                                  <div>
                                    <div>
                                      <span className="text-white font-medium">{product.name}</span>
                                      {product.description && (
                                        <span className="text-gray-300">
                                          {' '}
                                          -{' '}
                                          {productDisplaySettings.displayMode === 'vertical'
                                            ? product.description
                                            : product.description.length > 25
                                            ? product.description.substring(0, 25) + '...'
                                            : product.description}
                                        </span>
                                      )}
                                      <span className="text-white font-medium">
                                        {' '}
                                        ({product.price} {product.currency})
                                      </span>
                                      {product.stock_quantity !== null && product.stock_quantity !== undefined && (
                                        <span className="text-gray-400"> [Stock: {product.stock_quantity}]</span>
                                      )}
                                    </div>
                                    <div className="text-white text-xs mt-1">⭐ {rating}/5 from - deals</div>
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <div className="mb-3">
                                {productDisplaySettings.displayMode === 'horizontal' ? (
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                    {categoryProducts.map((product, index) => renderProduct(product, index))}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {categoryProducts.map((product, index) => renderProduct(product, index))}
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        )}

                        {productDisplaySettings.showProducts && loadingProducts && (
                          <div className="text-gray-400 text-xs mb-3 italic">Loading products...</div>
                        )}

                        <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-600">
                          <div className="flex items-center gap-2">
                            {templates[selectedTemplate].footer_icon_url && (
                              <img
                                src={templates[selectedTemplate].footer_icon_url}
                                alt="Footer Icon"
                                className="w-4 h-4 rounded object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <span>{templates[selectedTemplate].footer_text}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Discord-style Dropdowns for Private Main Menu */}
              <div className="space-y-3 mt-4">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 flex-shrink-0"></div>
                  <div className="flex-1">
                    <select
                      value={previewSelectedCategory}
                      onChange={(e) => {
                        setPreviewSelectedCategory(e.target.value);
                        setPreviewSelectedProduct('');
                        setPreviewSelectedQuantity('');
                        setPreviewSelectedPaymentMethod('');
                      }}
                      className="w-full bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-500 focus:border-blue-400 focus:outline-none"
                    >
                      <option value="">🏪 Choose a category...</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.emoji ? `${category.emoji} ` : '🏷️ '}
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {previewSelectedCategory && (
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 flex-shrink-0"></div>
                    <div className="flex-1">
                      <select
                        value={previewSelectedProduct}
                        onChange={(e) => {
                          setPreviewSelectedProduct(e.target.value);
                          setPreviewSelectedQuantity('');
                          setPreviewSelectedPaymentMethod('');
                        }}
                        className="w-full bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-500 focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">🛍️ Choose a product...</option>
                        {products
                          .filter((product) => product.category_id === previewSelectedCategory && product.is_active)
                          .map((product) => (
                            <option key={product.id} value={product.id}>
                              💎 {product.name} - {product.price} {product.currency}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}

                {previewSelectedProduct && (
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 flex-shrink-0"></div>
                    <div className="flex-1">
                      <select
                        value={previewSelectedQuantity}
                        onChange={(e) => setPreviewSelectedQuantity(e.target.value)}
                        className="w-full bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-500 focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">🔢 Choose quantity...</option>
                        <option value="1">🔢 Quantity: 1</option>
                        <option value="2">🔢 Quantity: 2</option>
                        <option value="3">🔢 Quantity: 3</option>
                        <option value="5">🔢 Quantity: 5</option>
                        <option value="10">🔢 Quantity: 10</option>
                        <option value="25">🔢 Quantity: 25</option>
                        <option value="50">🔢 Quantity: 50</option>
                        <option value="100">🔢 Quantity: 100</option>
                      </select>
                    </div>
                  </div>
                )}

                {previewSelectedQuantity && (
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 flex-shrink-0"></div>
                    <div className="flex-1">
                      <select
                        value={previewSelectedPaymentMethod}
                        onChange={(e) => setPreviewSelectedPaymentMethod(e.target.value)}
                        className="w-full bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-500 focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">💳 Choose payment method...</option>
                        {paymentMethods.map((method) => (
                          <option key={method.id} value={method.id}>
                            {method.emoji} {method.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Show single embed for other templates
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="font-semibold">EcBot</span>
                  <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">BOT</span>
                </div>
                {/* Banner for all templates (outside the embed) */}
                {templates[selectedTemplate].banner_url && (
                  <div
                    className="border-l-4 bg-gray-700 rounded-lg p-4 mb-2"
                    style={{ borderLeftColor: templates[selectedTemplate].color }}
                  >
                    <div className="w-full h-32 rounded-lg overflow-hidden bg-gray-600 border border-gray-500">
                      <img
                        src={templates[selectedTemplate].banner_url}
                        alt="Banner Image"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = `data:image/svg+xml;base64,${btoa(`
                            <svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
                              <rect width="100%" height="100%" fill="${templates[selectedTemplate].color}"/>
                              <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" fill="white" text-anchor="middle" dy=".3em">
                                Banner: ${templates[selectedTemplate].name}
                              </text>
                            </svg>
                          `)}`;
                        }}
                      />
                    </div>
                  </div>
                )}
                <div
                  className="border-l-4 bg-gray-700 rounded-lg p-4"
                  style={{ borderLeftColor: templates[selectedTemplate].color }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-white">{templates[selectedTemplate].title}</h3>
                    {templates[selectedTemplate].thumbnail_url && (
                      <img
                        src={templates[selectedTemplate].thumbnail_url}
                        alt="Thumbnail"
                        className="w-12 h-12 rounded object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  <DescriptionRenderer text={templates[selectedTemplate].description} />

                  {templates[selectedTemplate].fields.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                      {templates[selectedTemplate].fields.map((field, index) => (
                        <div key={index} className={field.inline ? 'col-span-1' : 'col-span-full'}>
                          <div className="text-sm font-medium text-white mb-1">{field.name}</div>
                          <div className="text-sm text-gray-300">
                            <FieldValueRenderer value={field.value} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-600">
                    <div className="flex items-center gap-2">
                      {templates[selectedTemplate].footer_icon_url && (
                        <img
                          src={templates[selectedTemplate].footer_icon_url}
                          alt="Footer Icon"
                          className="w-4 h-4 rounded object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <span>{templates[selectedTemplate].footer_text}</span>
                    </div>
                  </div>
                </div>

                {/* Buttons for Public Homepage */}
                {selectedTemplate === 'public_homepage' && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <div className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm font-medium cursor-pointer transition-colors border border-gray-500">
                      🛍️ Start Shopping
                    </div>
                    <div className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm font-medium cursor-pointer transition-colors border border-gray-500">
                      ⛏️ Link to Minecraft
                    </div>
                    <div className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm font-medium cursor-pointer transition-colors border border-gray-500">
                      ⭐ Check Reviews
                    </div>
                  </div>
                )}

                {/* Button for Link to Minecraft */}
                {selectedTemplate === 'link_minecraft' && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <div className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded text-sm font-medium cursor-pointer transition-colors border border-purple-500 text-white">
                      🔗 Link Account
                    </div>
                  </div>
                )}

                {/* Dropdowns and Buttons for Confirmation Page */}
                {selectedTemplate === 'confirmation_page' && (
                  <div className="space-y-3 mt-4">
                    <select
                      value={confirmationCrypto}
                      onChange={(e) => {
                        setConfirmationCrypto(e.target.value);
                        setConfirmationNetwork('');
                      }}
                      className="w-full bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-500 focus:border-blue-400 focus:outline-none"
                    >
                      <option value="">Select cryptocurrency...</option>
                      {cryptoOptions.map((crypto) => (
                        <option key={crypto.id} value={crypto.id}>
                          {crypto.emoji} {crypto.name}
                        </option>
                      ))}
                    </select>

                    {confirmationCrypto && (
                      <select
                        value={confirmationNetwork}
                        onChange={(e) => setConfirmationNetwork(e.target.value)}
                        className="w-full bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-500 focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">🌐 Select network...</option>
                        {networkOptions.map((network) => (
                          <option key={network.id} value={network.id}>
                            {network.emoji} {network.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="flex gap-2">
                      <div className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded text-sm font-medium cursor-pointer transition-colors border border-red-500 text-white">
                        ⬅️ Back
                      </div>
                      <div className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded text-sm font-medium cursor-pointer transition-colors border border-green-500 text-white">
                        ✅ Confirm
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default TemplatePreview;