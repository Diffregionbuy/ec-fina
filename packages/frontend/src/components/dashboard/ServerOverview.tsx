'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Server, ServerStats, BotStatus } from '@/types/dashboard';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { apiClient } from '@/lib/api-client';
import { 
  Bot, 
  Users, 
  ShoppingBag, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle,
  Settings,
  ExternalLink
} from 'lucide-react';

interface ServerOverviewProps {
  server: Server;
  className?: string;
}

// Global cache for server overview data
const globalOverviewCache = new Map<string, Promise<any>>();
const globalOverviewDataCache = new Map<string, { stats: ServerStats; botStatus: BotStatus; memberCount: number | null; timestamp: number }>();
const OVERVIEW_CACHE_TTL = 30000; // 30 seconds

export function ServerOverview({ server, className = '' }: ServerOverviewProps) {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(server.member_count ?? null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const serverIdRef = useRef(server.id);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    serverIdRef.current = server.id;
  }, [server.id]);

  const fetchServerData = useCallback(async () => {
    const cacheKey = `server-overview-${server.id}`;
    
    // Check if we have fresh cached data
    const cachedData = globalOverviewDataCache.get(cacheKey);
    if (cachedData && Date.now() - cachedData.timestamp < OVERVIEW_CACHE_TTL) {
      console.log(`[${server.name}] 📊 Using cached overview data`);
      if (mountedRef.current && serverIdRef.current === server.id) {
        setStats(cachedData.stats);
        setBotStatus(cachedData.botStatus);
        setMemberCount(cachedData.memberCount);
        setLoading(false);
      }
      return;
    }

    // Check if there's already a fetch in progress
    let fetchPromise = globalOverviewCache.get(cacheKey);
    
    if (!fetchPromise) {
      console.log(`[${server.name}] 🔄 Fetching server overview (optimized)`);
      
      fetchPromise = (async () => {
        try {
          // Use Promise.allSettled to handle individual failures gracefully
          const [statsResult, statusResult, detailsResult] = await Promise.allSettled([
            apiClient.getServerStats(server.id),
            apiClient.getBotStatus(server.id),
            fetch(`/api/backend/servers/${server.id}/details`).then(res => res.json())
          ]);

          // Handle stats response
          let statsData: ServerStats = {
            total_sales: 0,
            total_revenue: 0,
            active_products: 0,
            total_orders: 0,
            recent_orders: []
          };

          if (statsResult.status === 'fulfilled') {
            const response = statsResult.value as any;
            statsData = {
              total_sales: response.total_sales || 0,
              total_revenue: response.total_revenue || 0,
              active_products: response.active_products || 0,
              total_orders: response.total_orders || 0,
              recent_orders: response.recent_orders || []
            };
          }

          // Handle bot status response
          let botStatusData: BotStatus = {
            is_online: server.bot_invited,
            is_in_server: server.bot_invited,
            has_permissions: server.bot_invited,
            missing_permissions: server.bot_invited ? [] : ['SEND_MESSAGES', 'EMBED_LINKS'],
            last_seen: server.bot_invited ? new Date().toISOString() : undefined
          };

          if (statusResult.status === 'fulfilled') {
            const response = statusResult.value as any;
            const botData = response.data?.botStatus || response;
            botStatusData = {
              is_online: botData.online || server.bot_invited,
              is_in_server: botData.invited || server.bot_invited,
              has_permissions: (botData.permissions || []).length > 0 || server.bot_invited,
              missing_permissions: server.bot_invited ? [] : ['SEND_MESSAGES', 'EMBED_LINKS'],
              last_seen: botData.lastSeen || (server.bot_invited ? new Date().toISOString() : undefined)
            };
          }

          // Handle member count
          let memberCountData = server.member_count ?? null;
          if (detailsResult.status === 'fulfilled') {
            const response = detailsResult.value as any;
            if (response?.success && response.data?.member_count) {
              memberCountData = response.data.member_count;
            }
          }

          // Cache the results
          const result = {
            stats: statsData,
            botStatus: botStatusData,
            memberCount: memberCountData,
            timestamp: Date.now()
          };

          globalOverviewDataCache.set(cacheKey, result);
          return result;

        } catch (error) {
          console.error(`[${server.name}] ❌ Failed to fetch server overview:`, error);
          
          // Return fallback data
          const fallbackData = {
            stats: {
              total_sales: 0,
              total_revenue: 0,
              active_products: 0,
              total_orders: 0,
              recent_orders: []
            },
            botStatus: {
              is_online: server.bot_invited,
              is_in_server: server.bot_invited,
              has_permissions: server.bot_invited,
              missing_permissions: server.bot_invited ? [] : ['SEND_MESSAGES', 'EMBED_LINKS'],
              last_seen: server.bot_invited ? new Date().toISOString() : undefined
            },
            memberCount: server.member_count ?? null,
            timestamp: Date.now() - OVERVIEW_CACHE_TTL + 5000 // Expire in 5 seconds
          };
          
          globalOverviewDataCache.set(cacheKey, fallbackData);
          return fallbackData;
        } finally {
          // Remove from fetch cache when done
          globalOverviewCache.delete(cacheKey);
        }
      })();

      globalOverviewCache.set(cacheKey, fetchPromise);
    } else {
      console.log(`[${server.name}] ⏳ Waiting for existing overview fetch`);
    }

    try {
      const result = await fetchPromise;
      
      // Only update state if component is still mounted and server hasn't changed
      if (mountedRef.current && serverIdRef.current === server.id) {
        setStats(result.stats);
        setBotStatus(result.botStatus);
        setMemberCount(result.memberCount);
        setLoading(false);
      }
    } catch (error) {
      if (mountedRef.current && serverIdRef.current === server.id) {
        setStats({
          total_sales: 0,
          total_revenue: 0,
          active_products: 0,
          total_orders: 0,
          recent_orders: []
        });
        setBotStatus({
          is_online: server.bot_invited,
          is_in_server: server.bot_invited,
          has_permissions: server.bot_invited,
          missing_permissions: server.bot_invited ? [] : ['SEND_MESSAGES', 'EMBED_LINKS'],
          last_seen: server.bot_invited ? new Date().toISOString() : undefined
        });
        setLoading(false);
      }
    }
  }, [server.id, server.name, server.bot_invited, server.member_count]);

  useEffect(() => {
    fetchServerData();
  }, [fetchServerData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getBotStatusColor = () => {
    if (!botStatus?.is_in_server) return 'text-red-500';
    if (!botStatus?.is_online) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getBotStatusText = () => {
    if (!botStatus?.is_in_server) return 'Not in server';
    if (!botStatus?.is_online) return 'Offline';
    return 'Online';
  };

  const getBotStatusIcon = () => {
    if (!botStatus?.is_in_server || !botStatus?.is_online) return AlertCircle;
    return CheckCircle;
  };

  if (loading) {
    return (
      <div className={`${className}`}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" className="mr-2" />
              <span className="text-gray-600">Loading server overview...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Server Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                {server.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${server.discord_server_id}/${server.icon}.png`}
                    alt={server.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Bot className="w-8 h-8 text-gray-600" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{server.name}</h2>
                <div className="flex items-center space-x-4 mt-1">
                  {memberCount && (
                    <div className="flex items-center text-sm text-gray-500">
                      <Users className="w-4 h-4 mr-1" />
                      {memberCount} members
                    </div>
                  )}
                  <div className={`flex items-center text-sm ${getBotStatusColor()}`}>
                    {(() => {
                      const StatusIcon = getBotStatusIcon();
                      return <StatusIcon className="w-4 h-4 mr-1" />;
                    })()}
                    {getBotStatusText()}
                  </div>
                  <div className="text-sm text-gray-500 capitalize">
                    {server.subscription_tier} plan
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <a
                href={`/dashboard/servers/${server.id}/bot-settings`}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </a>
              <a
                href={`https://discord.com/channels/${server.discord_server_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Discord
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="bg-green-500 p-3 rounded-lg">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats ? formatCurrency(stats.total_revenue) : '$0.00'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="bg-blue-500 p-3 rounded-lg">
                <ShoppingBag className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Sales</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.total_sales || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="bg-purple-500 p-3 rounded-lg">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Products</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.active_products || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="bg-yellow-500 p-3 rounded-lg">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.total_orders || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}