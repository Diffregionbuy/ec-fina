'use client';

import { BotConfig } from '@/types/dashboard';
import { Bot, Clock } from 'lucide-react';

interface BotPreviewProps {
  config: BotConfig;
  message: string;
  serverName: string;
}

export function BotPreview({ config, message, serverName }: BotPreviewProps) {
  const botName = config.name || 'EcBot';
  const botColor = config.color || '#5865F2';
  const embedFooter = config.embed_footer || 'Powered by EcBot';
  const currencySymbol = config.currency_symbol || '$';

  const sampleProducts = [
    { name: 'VIP Rank', price: 25.99, stock: config.show_stock ? 5 : null },
    { name: 'Diamond Sword', price: 15.50, stock: config.show_stock ? 12 : null },
    { name: 'Starter Pack', price: 9.99, stock: config.show_stock ? 'Unlimited' : null }
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm">
      {/* Discord-like header */}
      <div className="flex items-center space-x-2 mb-4 text-gray-300">
        <span className="text-green-400">#</span>
        <span>shop</span>
        <span className="text-gray-500">•</span>
        <span className="text-gray-400">{serverName}</span>
      </div>

      {/* Bot message */}
      <div className="flex space-x-3 mb-4">
        <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
          {config.avatar_url ? (
            <img
              src={config.avatar_url}
              alt={botName}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <Bot className="w-5 h-5 text-gray-300" />
          )}
        </div>
        
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-white font-semibold">{botName}</span>
            <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">BOT</span>
            <span className="text-gray-400 text-xs">Today at 12:34 PM</span>
          </div>
          
          {/* Simple message */}
          <div className="text-gray-300 mb-3">
            {message}
          </div>

          {/* Embed preview */}
          <div 
            className="border-l-4 bg-gray-700 rounded p-4"
            style={{ borderLeftColor: botColor }}
          >
            <div className="text-white font-semibold mb-2">🛍️ Shop</div>
            <div className="text-gray-300 text-sm mb-3">
              Welcome to our shop! Here are some featured products:
            </div>
            
            <div className="space-y-2">
              {sampleProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-600 rounded p-2">
                  <div className="text-white">{product.name}</div>
                  <div className="flex items-center space-x-2">
                    <span className="text-green-400 font-semibold">
                      {currencySymbol}{product.price}
                    </span>
                    {product.stock && (
                      <span className="text-gray-400 text-xs">
                        ({product.stock} left)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-600">
              <div className="text-gray-400 text-xs">{embedFooter}</div>
              <div className="flex items-center text-gray-400 text-xs">
                <Clock className="w-3 h-3 mr-1" />
                12:34 PM
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User command example */}
      <div className="flex space-x-3">
        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-semibold">U</span>
        </div>
        
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-white font-semibold">User</span>
            <span className="text-gray-400 text-xs">Today at 12:35 PM</span>
          </div>
          
          <div className="text-gray-300">
            {config.prefix || '!'}shop
          </div>
        </div>
      </div>
    </div>
  );
}