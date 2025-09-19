'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Server } from '@/types/dashboard';
import { 
  Server as ServerIcon, 
  Crown, 
  Users, 
  CheckCircle, 
  AlertCircle,
  Plus,
  ChevronDown,
  Settings,
  Package,
  BarChart3,
  Wallet,
  CreditCard
} from 'lucide-react';
import { clsx } from 'clsx';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DiscordApiError } from '@/components/ui/DiscordApiError';
import { DiscordApiLoader } from '@/components/ui/DiscordApiLoader';
import { DiscordApiLoadingState } from '@/types/dashboard';

interface ServerSidebarProps {
  servers: Server[];
  selectedServerId: string | null;
  onServerSelect: (serverId: string) => void;
  loading: boolean;
  error?: string | null;
  loadingState?: DiscordApiLoadingState;
  onRetry?: () => void;
}

export function ServerSidebar({ 
  servers, 
  selectedServerId, 
  onServerSelect, 
  loading, 
  error, 
  loadingState, 
  onRetry 
}: ServerSidebarProps) {
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(true);
  const pathname = usePathname();

  const selectedServer = servers.find(s => s.id === selectedServerId);

  const getServerIcon = (server: Server) => {
    if (server.icon) {
      return `https://cdn.discordapp.com/icons/${server.discord_server_id}/${server.icon}.png`;
    }
    return null;
  };

  const getStatusColor = (server: Server) => {
    if (!server.bot_invited) return 'text-red-500';
    return 'text-green-500';
  };

  const getStatusIcon = (server: Server) => {
    if (!server.bot_invited) return AlertCircle;
    return CheckCircle;
  };

  const serverNavigation = [
    { name: 'Overview', href: `/dashboard/servers/${selectedServerId}`, icon: BarChart3 },
    { name: 'Products', href: `/dashboard/servers/${selectedServerId}/products`, icon: Package },
    { name: 'Bot Settings', href: `/dashboard/servers/${selectedServerId}/bot-settings`, icon: Settings },
    { name: 'Wallet', href: `/dashboard/servers/${selectedServerId}/wallet`, icon: Wallet },
    { name: 'Subscription', href: `/dashboard/servers/${selectedServerId}/subscription`, icon: CreditCard },
  ];

  if (loading || (loadingState?.isLoading && servers.length === 0)) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Servers</h2>
          {loadingState ? (
            <DiscordApiLoader 
              loadingState={loadingState} 
              message="Loading your Discord servers..."
            />
          ) : (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Servers</h2>
          
          {/* Show error if there's one */}
          {loadingState && (error || loadingState.error) && (
            <div className="mb-4">
              <DiscordApiError 
                loadingState={loadingState} 
                onRetry={onRetry}
              />
            </div>
          )}
          
          {/* Show no servers message only if no error */}
          {!error && !loadingState?.error && (
            <div className="text-center py-8">
              <Plus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No servers found</h3>
              <p className="text-sm text-gray-600 mb-4">
                You need to own a Discord server or have "Manage Server" permissions.
              </p>
              <Link
                href="/onboarding"
                className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      {/* Server Selector Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
          className="w-full flex items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-gray-900">Servers</h2>
          <ChevronDown className={clsx(
            'w-5 h-5 text-gray-400 transition-transform',
            isServerMenuOpen ? 'rotate-180' : ''
          )} />
        </button>
      </div>

      {/* Server List */}
      {isServerMenuOpen && (
        <div className="flex-1 overflow-y-auto">
          {/* Show error/loading state at the top */}
          {loadingState && (error || loadingState.error || loadingState.isStale) && (
            <div className="p-2">
              <DiscordApiError 
                loadingState={loadingState} 
                onRetry={onRetry}
                className="mb-2"
              />
            </div>
          )}
          
          {loadingState?.isLoading && servers.length > 0 && (
            <div className="p-2">
              <DiscordApiLoader 
                loadingState={loadingState} 
                message="Refreshing server data..."
                className="py-2"
              />
            </div>
          )}
          
          <div className="p-2">
            {servers.map((server) => (
              <button
                key={server.id}
                onClick={() => onServerSelect(server.id)}
                className={clsx(
                  'w-full p-3 rounded-lg text-left hover:bg-gray-50 transition-colors mb-2',
                  server.id === selectedServerId ? 'bg-blue-50 border border-blue-200' : 'border border-transparent'
                )}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    {getServerIcon(server) ? (
                      <img
                        src={getServerIcon(server)!}
                        alt={server.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ServerIcon className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 flex items-center">
                      <span className="truncate">{server.name}</span>
                      {server.owner_id && (
                        <Crown className="w-4 h-4 text-yellow-500 ml-2 flex-shrink-0" />
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
          </div>

          {/* Server Navigation */}
          {selectedServer && (
            <div className="border-t border-gray-200 p-2">
              <div className="px-2 py-2">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {selectedServer.name}
                </h3>
              </div>
              <nav className="space-y-1">
                {serverNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={clsx(
                        'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      <item.icon className={clsx(
                        'w-4 h-4 mr-3',
                        isActive ? 'text-blue-700' : 'text-gray-400'
                      )} />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Add Server Button */}
          <div className="border-t border-gray-200 p-4">
            <Link
              href="/onboarding"
              className="w-full flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Server
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}