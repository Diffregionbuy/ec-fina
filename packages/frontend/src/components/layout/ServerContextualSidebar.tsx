'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useServerContext } from '@/contexts/ServerContext';
import { 
  BarChart3,
  Package,
  Settings,
  Users,
  ShoppingCart,
  TrendingUp,
  FileText
} from 'lucide-react';
import { clsx } from 'clsx';
import { DiscordApiError } from '@/components/ui/DiscordApiError';
import { DiscordApiLoader } from '@/components/ui/DiscordApiLoader';

export function ServerContextualSidebar() {
  const { 
    selectedServerId, 
    selectedServer, 
    loading, 
    error, 
    loadingState, 
    retryServers 
  } = useServerContext();
  const pathname = usePathname();

  if (loading || (loadingState.isLoading && !selectedServer)) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6">
          <DiscordApiLoader 
            loadingState={loadingState} 
            message="Loading servers..."
          />
        </div>
      </div>
    );
  }

  if (!selectedServerId || !selectedServer) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6">
          {/* Show error if there's one */}
          {(error || loadingState.error) && (
            <div className="mb-4">
              <DiscordApiError 
                loadingState={loadingState} 
                onRetry={retryServers}
              />
            </div>
          )}
          
          {/* Show no server selected message only if no error */}
          {!error && !loadingState.error && (
            <div className="text-center">
              <div className="text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-sm">Select a server to view options</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const navigationSections = [
    {
      name: 'Overview',
      items: [
        { 
          name: 'Dashboard', 
          href: `/dashboard/servers/${selectedServerId}`, 
          icon: BarChart3,
          description: 'Server stats and activity'
        },
        { 
          name: 'Analytics', 
          href: `/dashboard/servers/${selectedServerId}/analytics`, 
          icon: TrendingUp,
          description: 'Sales and performance metrics'
        },
      ]
    },
    {
      name: 'Store Management',
      items: [
        { 
          name: 'Products', 
          href: `/dashboard/servers/${selectedServerId}/products`, 
          icon: Package,
          description: 'Manage your store inventory'
        },
        { 
          name: 'Orders', 
          href: `/dashboard/servers/${selectedServerId}/orders`, 
          icon: ShoppingCart,
          description: 'View and manage orders'
        },
        { 
          name: 'Customers', 
          href: `/dashboard/servers/${selectedServerId}/customers`, 
          icon: Users,
          description: 'Customer management'
        },
      ]
    },
    {
      name: 'Bot Configuration',
      items: [
        { 
          name: 'Bot Settings', 
          href: `/dashboard/servers/${selectedServerId}/bot-settings`, 
          icon: Settings,
          description: 'Configure appearance, behavior, permissions, and messages'
        },
      ]
    },
    {
      name: 'Reports',
      items: [
        { 
          name: 'Sales Reports', 
          href: `/dashboard/servers/${selectedServerId}/reports/sales`, 
          icon: FileText,
          description: 'Detailed sales analytics'
        },
        { 
          name: 'Activity Logs', 
          href: `/dashboard/servers/${selectedServerId}/reports/activity`, 
          icon: FileText,
          description: 'Bot and user activity'
        },
      ]
    }
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Server Info Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
            {selectedServer.icon ? (
              <img
                src={`https://cdn.discordapp.com/icons/${selectedServer.discord_server_id}/${selectedServer.icon}.png`}
                alt={selectedServer.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Package className="w-5 h-5 text-gray-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">
              {selectedServer.name}
            </h3>
            <p className="text-sm text-gray-500 capitalize">
              {selectedServer.subscription_tier} plan
              {loadingState.isStale && (
                <span className="ml-2 text-xs text-yellow-600">(cached)</span>
              )}
            </p>
          </div>
        </div>
        
        {/* Show loading state for refreshing */}
        {loadingState.isLoading && selectedServer && (
          <div className="mt-3">
            <DiscordApiLoader 
              loadingState={loadingState} 
              message="Refreshing server data..."
              className="py-1"
            />
          </div>
        )}
        
        {/* Show error state */}
        {(error || loadingState.error) && (
          <div className="mt-3">
            <DiscordApiError 
              loadingState={loadingState} 
              onRetry={retryServers}
              className="text-xs"
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navigationSections.map((section) => (
          <div key={section.name} className="mb-6">
            <h4 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {section.name}
            </h4>
            <div className="space-y-1 px-2">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={clsx(
                      'group flex items-start px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <item.icon className={clsx(
                      'w-5 h-5 mr-3 mt-0.5 flex-shrink-0',
                      isActive ? 'text-indigo-700' : 'text-gray-400 group-hover:text-gray-600'
                    )} />
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className={clsx(
                        'text-xs mt-0.5',
                        isActive ? 'text-indigo-600' : 'text-gray-500'
                      )}>
                        {item.description}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Quick Actions */}
      <div className="border-t border-gray-200 p-4">
        <div className="space-y-2">
          <Link
            href={`/dashboard/servers/${selectedServerId}/products/new`}
            className="w-full flex items-center justify-center px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Package className="w-4 h-4 mr-2" />
            Add Product
          </Link>
          <Link
            href={`https://discord.com/channels/${selectedServer.discord_server_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Open Discord
          </Link>
        </div>
      </div>
    </div>
  );
}