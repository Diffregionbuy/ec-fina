'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

import { ChevronDown, Server, Crown, Users } from 'lucide-react';

interface DiscordServer {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
  memberCount?: number;
}

interface ServerSelectorProps {
  onServerSelect: (serverId: string) => void;
  selectedServer: string | null;
}

export function ServerSelector({ onServerSelect, selectedServer }: ServerSelectorProps) {
  const { user } = useAuth();
  const [servers, setServers] = useState<DiscordServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  console.log('🔍 Onboarding ServerSelector mounted, user:', user);

  useEffect(() => {
    console.log('🔍 Onboarding ServerSelector useEffect triggered');
    fetchUserServers();
  }, []);

  const fetchUserServers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Onboarding: Fetching servers...');
      console.log('🔍 Onboarding: User state:', { user: !!user, userId: user?.id });
      
      const response = await fetch('/api/backend/users/servers', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('🔍 Onboarding: Response status:', response.status);
      console.log('🔍 Onboarding: Response headers:', Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log('🔍 Onboarding: Raw response:', responseText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${responseText}`);
      }

      const data = JSON.parse(responseText);
      console.log('🔍 Onboarding: Parsed response data:', data);
      
      if (data.success && data.data.servers) {
        // Transform the API response to match our interface
        const allServers = [...(data.data.servers.owned || []), ...(data.data.servers.member || [])];
        console.log('🔍 Onboarding: All servers:', allServers);
        
        const transformedServers: DiscordServer[] = allServers
          .filter(server => server.owner || hasManageGuildPermission(server.permissions))
          .map((server: any) => ({
            id: server.id,
            name: server.name,
            icon: server.icon,
            owner: server.owner,
            permissions: server.permissions,
            memberCount: server.approximate_member_count || undefined
          }));
        
        console.log('🔍 Onboarding: Transformed servers:', transformedServers);
        setServers(transformedServers);
      } else {
        console.error('🔍 Onboarding: API response not successful:', data);
        throw new Error(data.error?.message || 'Failed to fetch servers');
      }
      
      setLoading(false);
    } catch (error) {
      console.error('🔍 Onboarding: Failed to fetch servers:', error);
      setError('Failed to load your servers. Please try again.');
      setLoading(false);
    }
  };

  const hasManageGuildPermission = (permissions: string) => {
    const permissionBits = parseInt(permissions);
    return (permissionBits & 0x20) === 0x20; // MANAGE_GUILD permission
  };

  const getServerIcon = (server: DiscordServer) => {
    if (server.icon) {
      return `https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`;
    }
    return null;
  };

  const selectedServerData = servers.find(s => s.id === selectedServer);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="sm" className="mr-2" />
        <span className="text-gray-600">Loading your servers...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchUserServers}
          className="text-blue-600 hover:text-blue-700 underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="text-center py-8">
        <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 mb-2">No eligible servers found</p>
        <p className="text-sm text-gray-500">
          You need to own a server or have "Manage Server" permissions to add the bot.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors text-left flex items-center justify-between"
      >
        {selectedServerData ? (
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
              {getServerIcon(selectedServerData) ? (
                <img
                  src={getServerIcon(selectedServerData)!}
                  alt={selectedServerData.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Server className="w-5 h-5 text-gray-600" />
              )}
            </div>
            <div>
              <div className="font-medium text-gray-900 flex items-center">
                {selectedServerData.name}
                {selectedServerData.owner && (
                  <Crown className="w-4 h-4 text-yellow-500 ml-2" />
                )}
              </div>
              {selectedServerData.memberCount && (
                <div className="text-sm text-gray-500 flex items-center">
                  <Users className="w-3 h-3 mr-1" />
                  {selectedServerData.memberCount} members
                </div>
              )}
            </div>
          </div>
        ) : (
          <span className="text-gray-500">Select a server...</span>
        )}
        
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute top-full left-0 right-0 z-10 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
        >
          {servers.map((server) => (
            <button
              key={server.id}
              onClick={() => {
                onServerSelect(server.id);
                setIsOpen(false);
              }}
              className="w-full p-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                  {getServerIcon(server) ? (
                    <img
                      src={getServerIcon(server)!}
                      alt={server.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Server className="w-5 h-5 text-gray-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 flex items-center">
                    {server.name}
                    {server.owner && (
                      <Crown className="w-4 h-4 text-yellow-500 ml-2" />
                    )}
                  </div>
                  {server.memberCount && (
                    <div className="text-sm text-gray-500 flex items-center">
                      <Users className="w-3 h-3 mr-1" />
                      {server.memberCount} members
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}