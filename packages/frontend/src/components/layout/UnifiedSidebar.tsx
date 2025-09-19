'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useServerContext } from '@/contexts/ServerContext';
import { 
  ChevronDown,
  ChevronRight,
  Server as ServerIcon, 
  Crown, 
  Users, 
  CheckCircle, 
  AlertCircle,
  Plus,
  BarChart3,
  Package,
  Settings,
  ShoppingCart,
  TrendingUp,
  FileText,
  Menu,
  Wallet,
  CreditCard
} from 'lucide-react';
import { clsx } from 'clsx';
import { DiscordApiError } from '@/components/ui/DiscordApiError';
import { DiscordApiLoader } from '@/components/ui/DiscordApiLoader';
import { motion, AnimatePresence } from 'framer-motion';

export function UnifiedSidebar() {
  const { 
    servers,
    selectedServerId, 
    selectedServer,
    setSelectedServerId,
    loading, 
    error, 
    loadingState, 
    retryServers 
  } = useServerContext();
  const pathname = usePathname();
  const router = useRouter();
  
  const [isServerSelectorOpen, setIsServerSelectorOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const getServerIcon = (server: any) => {
    if (server.icon) {
      return `https://cdn.discordapp.com/icons/${server.discord_server_id}/${server.icon}.png`;
    }
    return null;
  };

  const getStatusColor = (server: any) => {
    if (!server.bot_invited) return 'text-red-500';
    return 'text-green-500';
  };

  const getStatusIcon = (server: any) => {
    if (!server.bot_invited) return AlertCircle;
    return CheckCircle;
  };

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
      name: 'Account',
      items: [
        { 
          name: 'Wallet', 
          href: `/dashboard/wallet`, 
          icon: Wallet,
          description: 'Manage your earnings and withdrawals'
        },
        { 
          name: 'Subscription', 
          href: `/dashboard/subscription`, 
          icon: CreditCard,
          description: 'Manage your subscription plan'
        },
      ]
    }
  ];

  if (loading || (loadingState?.isLoading && servers.length === 0)) {
    return (
      <div className={clsx(
        'bg-white border-r border-gray-200 flex flex-col transition-all duration-300',
        isSidebarCollapsed ? 'w-16' : 'w-80'
      )}>
        <div className="p-4">
          <DiscordApiLoader 
            loadingState={loadingState} 
            message="Loading servers..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className={clsx(
      'bg-white border-r border-gray-200 flex flex-col transition-all duration-300 relative',
      isSidebarCollapsed ? 'w-16' : 'w-80'
    )}>
      {/* Collapse Toggle */}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className="fixed top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-full p-1 shadow-sm hover:shadow-md transition-shadow z-50"
        style={{ left: isSidebarCollapsed ? '61px' : '301px' }}
      >
        {isSidebarCollapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-600" />
        ) : (
          <Menu className="w-4 h-4 text-gray-600" />
        )}
      </button>

      {/* Server Selector Section */}
      <div className="border-b border-gray-200">
        {!isSidebarCollapsed ? (
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Server
            </h2>
            
            {/* Show error state */}
            {(error || loadingState?.error) && (
              <div className="mb-4">
                <DiscordApiError 
                  loadingState={loadingState} 
                  onRetry={retryServers}
                  className="text-sm"
                />
              </div>
            )}
            
            {/* Show loading state for refreshing */}
            {loadingState?.isLoading && servers.length > 0 && (
              <div className="mb-3">
                <DiscordApiLoader 
                  loadingState={loadingState} 
                  message="Refreshing servers..."
                  className="py-2"
                />
              </div>
            )}

            {/* Server Selector */}
            {servers.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setIsServerSelectorOpen(!isServerSelectorOpen)}
                  className="w-full p-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors text-left flex items-center justify-between shadow-sm"
                >
                  {selectedServer ? (
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                        {getServerIcon(selectedServer) ? (
                          <img
                            src={getServerIcon(selectedServer)!}
                            alt={selectedServer.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ServerIcon className="w-4 h-4 text-gray-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 flex items-center truncate text-sm">
                          <span className="truncate">{selectedServer.name}</span>
                          {selectedServer.owner_id && (
                            <Crown className="w-3 h-3 text-yellow-500 ml-1 flex-shrink-0" />
                          )}
                        </div>
                        <div className={`flex items-center text-xs ${getStatusColor(selectedServer)}`}>
                          {(() => {
                            const StatusIcon = getStatusIcon(selectedServer);
                            return <StatusIcon className="w-3 h-3 mr-1" />;
                          })()}
                          {selectedServer.bot_invited ? 'Active' : 'Setup needed'}
                          {loadingState?.isStale && (
                            <span className="ml-2 text-yellow-600">(cached)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-500 text-sm">Select a server...</span>
                  )}
                  
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${isServerSelectorOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Server Dropdown */}
                <AnimatePresence>
                  {isServerSelectorOpen && (
                    <>
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
                      >
                        {servers.map((server) => (
                          <button
                            key={server.id}
                            onClick={() => {
                              setSelectedServerId(server.id);
                              setIsServerSelectorOpen(false);
                              
                              // Navigate to the selected server's dashboard
                              const currentPath = pathname;
                              const serverPathRegex = /^\/dashboard\/servers\/[^\/]+/;
                              
                              if (serverPathRegex.test(currentPath)) {
                                // Replace the current server ID in the URL with the new one
                                const newPath = currentPath.replace(
                                  /\/dashboard\/servers\/[^\/]+/,
                                  `/dashboard/servers/${server.id}`
                                );
                                router.push(newPath);
                              } else {
                                // Navigate to the default dashboard for the selected server
                                router.push(`/dashboard/servers/${server.id}`);
                              }
                            }}
                            className={`w-full p-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-b-0 ${
                              server.id === selectedServerId ? 'bg-indigo-50' : ''
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                                {getServerIcon(server) ? (
                                  <img
                                    src={getServerIcon(server)!}
                                    alt={server.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <ServerIcon className="w-4 h-4 text-gray-600" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 flex items-center text-sm">
                                  <span className="truncate">{server.name}</span>
                                  {server.owner_id && (
                                    <Crown className="w-3 h-3 text-yellow-500 ml-1 flex-shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center space-x-3 text-xs text-gray-500">
                                  {server.member_count && (
                                    <div className="flex items-center">
                                      <Users className="w-3 h-3 mr-1" />
                                      {server.member_count}
                                    </div>
                                  )}
                                  <div className={`flex items-center ${getStatusColor(server)}`}>
                                    {(() => {
                                      const StatusIcon = getStatusIcon(server);
                                      return <StatusIcon className="w-3 h-3 mr-1" />;
                                    })()}
                                    {server.bot_invited ? 'Active' : 'Setup needed'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                        
                        {/* Add Server Option */}
                        <Link
                          href="/onboarding"
                          className="w-full p-3 hover:bg-gray-50 transition-colors text-left border-t border-gray-200 flex items-center space-x-3 text-gray-600"
                          onClick={() => setIsServerSelectorOpen(false)}
                        >
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            <Plus className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium">Add Server</span>
                        </Link>
                      </motion.div>
                      
                      {/* Overlay */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsServerSelectorOpen(false)}
                      />
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* No servers state */}
            {servers.length === 0 && !error && !loadingState?.error && (
              <div className="text-center py-6">
                <Plus className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-900 mb-2">No servers found</h3>
                <p className="text-xs text-gray-600 mb-3">
                  You need to own a Discord server or have "Manage Server" permissions.
                </p>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center px-3 py-2 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-3 h-3 mr-2" />
                  Get Started
                </Link>
              </div>
            )}
          </div>
        ) : (
          // Collapsed server indicator
          <div className="p-3 flex justify-center">
            {selectedServer ? (
              <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                {getServerIcon(selectedServer) ? (
                  <img
                    src={getServerIcon(selectedServer)!}
                    alt={selectedServer.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ServerIcon className="w-5 h-5 text-gray-600" />
                )}
              </div>
            ) : (
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <ServerIcon className="w-5 h-5 text-gray-400" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Section */}
      {selectedServer && !isSidebarCollapsed && (
        <nav className="flex-1 overflow-y-auto py-4">
          {navigationSections.map((section) => (
            <div key={section.name} className="mb-6">
              <h4 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {section.name}
              </h4>
              <div className="space-y-1 px-2">
                {section.items.map((item) => {
                  // More precise active state detection
                  const isActive = pathname === item.href || 
                    (pathname.startsWith(item.href + '/') && 
                     !navigationSections.flatMap(s => s.items)
                       .some(otherItem => 
                         otherItem.href !== item.href && 
                         pathname === otherItem.href
                       )
                    );
                  
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
      )}

      {/* Collapsed Navigation */}
      {selectedServer && isSidebarCollapsed && (
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-2 px-2">
            {navigationSections.flatMap(section => section.items).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={item.name}
                  className={clsx(
                    'flex items-center justify-center p-2 rounded-lg transition-colors',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Quick Actions */}
      {selectedServer && !isSidebarCollapsed && (
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
      )}
    </div>
  );
}