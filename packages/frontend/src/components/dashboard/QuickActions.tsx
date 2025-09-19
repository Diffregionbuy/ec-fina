 'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Server } from '@/types/dashboard';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import { 
  Bot, 
  Settings, 
  ShoppingBag, 
  ExternalLink,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface QuickActionsProps {
  server: Server;
}

// Global cache to prevent duplicate requests across all component instances
const globalFetchCache = new Map<string, Promise<any>>();
const globalDataCache = new Map<string, { botStatus: any; hasProducts: boolean; hasWallet: boolean; timestamp: number }>();
const CACHE_TTL = 15000; // 15 seconds

export function QuickActions({ server }: QuickActionsProps) {
  const [botStatus, setBotStatus] = useState<any>(null);
  const [hasProducts, setHasProducts] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const serverIdRef = useRef(server.id);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Update server ID ref and clear cache when server changes
  useEffect(() => {
    const previousServerId = serverIdRef.current;
    serverIdRef.current = server.id;
    
    // If server changed, clear the cache for the new server to force fresh data
    if (previousServerId !== server.id) {
      const cacheKey = `server-data-${server.id}`;
      globalDataCache.delete(cacheKey);
      globalFetchCache.delete(cacheKey);
      
      // Don't clear wallet cache since it's account-based, not server-based
      // But reset the component state to show loading
      setBotStatus(null);
      setHasProducts(false);
      setHasWallet(false);
      setLoading(true);
      
      console.log(`[${server.name}] 🔄 Server changed from ${previousServerId} to ${server.id}, clearing cache`);
    }
  }, [server.id, server.name]);

  const fetchServerData = useCallback(async () => {
    const cacheKey = `server-data-${server.id}`;
    const walletCacheKey = 'wallet-data'; // Wallet is account-based, not server-based
    
    // Check if we have fresh cached data
    const cachedData = globalDataCache.get(cacheKey);
    const cachedWalletData = globalDataCache.get(walletCacheKey);
    
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
      console.log(`[${server.name}] 📋 Using cached data`);
      if (mountedRef.current && serverIdRef.current === server.id) {
        setBotStatus(cachedData.botStatus);
        setHasProducts(cachedData.hasProducts);
        // Use cached wallet data if available, otherwise use the server-specific cached value
        setHasWallet(cachedWalletData?.hasWallet ?? cachedData.hasWallet);
        setLoading(false);
      }
      return;
    }

    // Check if there's already a fetch in progress
    let fetchPromise = globalFetchCache.get(cacheKey);
    
    if (!fetchPromise) {
      console.log(`[${server.name}] 🔄 Fetching server data (single call)`);
      
      fetchPromise = (async () => {
        try {
          // Use Promise.allSettled to handle individual failures gracefully
          const [botStatusResult, productsResult, walletResult] = await Promise.allSettled([
            apiClient.getBotStatus(server.id),
            apiClient.getProducts(server.id),
            apiClient.getWalletAddresses() // Use apiClient method instead of direct fetch
          ]);

          let botStatusData = null;
          let hasProductsData = false;
          let hasWalletData = false;

          // Handle bot status response
          if (botStatusResult.status === 'fulfilled' && (botStatusResult.value as any)?.data?.botStatus) {
            const apiStatus = (botStatusResult.value as any).data.botStatus;
            botStatusData = {
              invited: Boolean(apiStatus.invited),
              configured: Boolean(apiStatus.configured),
              online: Boolean(apiStatus.online)
            };
            console.log(`[${server.name}] ✅ Bot Status from API:`, botStatusData);
          } else {
            console.warn(`[${server.name}] ❌ Bot status API failed:`, 
              botStatusResult.status === 'rejected' ? botStatusResult.reason : 'No data');
            botStatusData = {
              invited: false,
              configured: false,
              online: false
            };
          }

          // Handle products response
          if (productsResult.status === 'fulfilled') {
            const products = Array.isArray(productsResult.value) ? productsResult.value : 
                            productsResult.value?.data?.products || [];
            hasProductsData = products.length > 0;
          } else {
            console.warn(`[${server.name}] ❌ Products API failed:`, productsResult.reason);
            hasProductsData = false;
          }

          // Handle wallet response
          if (walletResult.status === 'fulfilled') {
            const walletData = walletResult.value;
            const addresses = walletData?.data?.addresses || walletData?.addresses || [];
            hasWalletData = Array.isArray(addresses) && addresses.length > 0;
            console.log(`[${server.name}] ✅ Wallet Status:`, { hasWallet: hasWalletData, addressCount: addresses.length });
          } else {
            console.error(`[${server.name}] ❌ Wallet API failed:`, walletResult.reason);
            hasWalletData = false;
          }

          // Cache the results - separate wallet cache since it's account-based
          globalDataCache.set(cacheKey, {
            botStatus: botStatusData,
            hasProducts: hasProductsData,
            hasWallet: hasWalletData, // Keep for backward compatibility
            timestamp: Date.now()
          });

          // Cache wallet data separately (account-based)
          globalDataCache.set(walletCacheKey, {
            hasWallet: hasWalletData,
            timestamp: Date.now()
          });

          return { botStatus: botStatusData, hasProducts: hasProductsData, hasWallet: hasWalletData };

        } catch (error) {
          console.error(`[${server.name}] ❌ Failed to fetch server data:`, error);
          const fallbackData = {
            botStatus: { invited: false, configured: false, online: false },
            hasProducts: false,
            hasWallet: false
          };
          
          // Cache fallback data for a shorter time
          globalDataCache.set(cacheKey, {
            ...fallbackData,
            timestamp: Date.now() - CACHE_TTL + 5000 // Expire in 5 seconds
          });

          // Cache wallet fallback separately
          globalDataCache.set(walletCacheKey, {
            hasWallet: false,
            timestamp: Date.now() - CACHE_TTL + 5000 // Expire in 5 seconds
          });
          
          return fallbackData;
        } finally {
          // Remove from fetch cache when done
          globalFetchCache.delete(cacheKey);
        }
      })();

      globalFetchCache.set(cacheKey, fetchPromise);
    } else {
      console.log(`[${server.name}] ⏳ Waiting for existing fetch to complete`);
    }

    try {
      const result = await fetchPromise;
      
      // Only update state if component is still mounted and server hasn't changed
      if (mountedRef.current && serverIdRef.current === server.id) {
        setBotStatus(result.botStatus);
        setHasProducts(result.hasProducts);
        setHasWallet(result.hasWallet);
        setLoading(false);
      }
    } catch (error) {
      if (mountedRef.current && serverIdRef.current === server.id) {
        setBotStatus({ invited: false, configured: false, online: false });
        setHasProducts(false);
        setHasWallet(false);
        setLoading(false);
      }
    }
  }, [server.id, server.name]);

  useEffect(() => {
    fetchServerData();
  }, [fetchServerData]);

  const getSetupSteps = () => {
    const steps = [
      {
        id: 'invite',
        title: 'Invite Bot',
        description: 'Add the bot to your Discord server',
        completed: botStatus?.invited === true, // Only true if API explicitly confirms
        action: botStatus?.invited === true ? null : 'invite',
        href: botStatus?.invited === true ? null : `/dashboard/servers/${server.id}/invite`
      },
      {
        id: 'products',
        title: 'Add Products',
        description: 'Create your first products to sell',
        completed: hasProducts,
        action: 'products',
        href: `/dashboard/servers/${server.id}/products`
      },
      {
        id: 'wallet',
        title: 'Set Wallet',
        description: 'Configure payment wallet settings',
        completed: hasWallet,
        action: 'wallet',
        href: `/dashboard/wallet`
      },
      {
        id: 'configure',
        title: 'Configure Bot',
        description: 'Set up your bot\'s appearance and settings',
        completed: botStatus?.configured === true,
        action: 'configure',
        href: `/dashboard/servers/${server.id}/bot-settings`
      }
    ];

    return steps;
  };

  const setupSteps = getSetupSteps();
  const completedSteps = setupSteps.filter(step => step.completed).length;
  const progressPercentage = (completedSteps / setupSteps.length) * 100;

  const quickLinks = [
    {
      title: 'Bot Settings',
      description: 'Customize appearance and behavior',
      icon: Settings,
      href: `/dashboard/servers/${server.id}/bot-settings`,
      color: 'bg-blue-500'
    },
    {
      title: 'Manage Products',
      description: 'Add, edit, and organize products',
      icon: ShoppingBag,
      href: `/dashboard/servers/${server.id}/products`,
      color: 'bg-green-500'
    },
    {
      title: 'View Analytics',
      description: 'Track sales and performance',
      icon: Bot,
      href: `/dashboard/servers/${server.id}/analytics`,
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 w-full">
      {/* Setup Progress - Left Column */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Setup Progress</h3>
              <p className="text-sm text-gray-600">Get your bot running</p>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900">{completedSteps}/{setupSteps.length}</div>
              <div className="text-xs text-gray-500">completed</div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-3">
            {setupSteps.map((step) => (
              <div key={step.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    step.completed ? 'bg-green-100' : 'bg-gray-200'
                  }`}>
                    {step.completed ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 text-xs">{step.title}</h4>
                  </div>
                </div>
                
                {!step.completed && step.href && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs px-2 py-1"
                    onClick={() => window.location.href = step.href!}
                  >
                    {step.action === 'invite' ? 'Invite' : 'Setup'}
                  </Button>
                )}
                
                {step.completed && (
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                    ✓
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions - Middle Column */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          <p className="text-gray-600">Common tasks and settings</p>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-3">
            {quickLinks.map((link) => (
              <a
                key={link.title}
                href={link.href}
                className="flex items-center p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors group"
              >
                <div className={`${link.color} p-2 rounded-lg group-hover:scale-105 transition-transform`}>
                  <link.icon className="w-4 h-4 text-white" />
                </div>
                <div className="ml-3 flex-1">
                  <h4 className="font-medium text-gray-900 group-hover:text-gray-700 text-sm">
                    {link.title}
                  </h4>
                  <p className="text-xs text-gray-600">{link.description}</p>
                </div>
                <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-gray-600" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subscription - Right Column */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Subscription</h3>
          <p className="text-gray-600">Plan and billing</p>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm text-gray-700">
              Current plan: <span className="font-medium capitalize">{(server as any)?.subscription_tier || 'free'}</span>
            </div>
            <Button
              className="w-full justify-start"
              variant="outline"
              onClick={() => window.location.href = `/dashboard/subscription`}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Manage Subscription
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}