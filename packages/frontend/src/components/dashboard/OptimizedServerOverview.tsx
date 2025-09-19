'use client';

import { Server } from '@/types/dashboard';
import { Card, CardContent } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useServerData, useBotStatus, useServerStats } from '@/hooks/useApiQuery';
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

interface OptimizedServerOverviewProps {
  server: Server;
  className?: string;
}

export function OptimizedServerOverview({ server, className = '' }: OptimizedServerOverviewProps) {
  // Use optimized React Query hooks with intelligent caching
  const { data: serverDetails, isLoading: serverLoading } = useServerData(server.id);
  const { data: botStatusData, isLoading: botLoading } = useBotStatus(server.id);
  const { data: statsData, isLoading: statsLoading } = useServerStats(server.id);

  const isLoading = serverLoading || botLoading || statsLoading;

  // Extract data with fallbacks
  const memberCount = serverDetails?.data?.member_count || server.member_count || null;
  const botStatus = botStatusData?.data?.botStatus || {
    invited: server.bot_invited,
    configured: false,
    online: server.bot_invited,
    permissions: server.bot_invited ? ['SEND_MESSAGES', 'EMBED_LINKS', 'MANAGE_ROLES'] : [],
    lastSeen: server.bot_invited ? new Date().toISOString() : null
  };
  
  const stats = statsData?.data || {
    total_sales: 0,
    total_revenue: 0,
    active_products: 0,
    total_orders: 0,
    recent_orders: []
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getBotStatusColor = () => {
    if (!botStatus?.invited) return 'text-red-500';
    if (!botStatus?.online) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getBotStatusText = () => {
    if (!botStatus?.invited) return 'Not in server';
    if (!botStatus?.online) return 'Offline';
    return 'Online';
  };

  const getBotStatusIcon = () => {
    if (!botStatus?.invited || !botStatus?.online) return AlertCircle;
    return CheckCircle;
  };

  if (isLoading) {
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
                  {formatCurrency(stats.total_revenue)}
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
                  {stats.total_sales}
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
                  {stats.active_products}
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
                  {stats.total_orders}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}