'use client';

import { useState } from 'react';
import { useServerDetails } from '@/hooks/useServerDetails';
import { 
  Users, 
  Crown, 
  Shield, 
  Calendar,
  Bot,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User
} from 'lucide-react';

interface ServerDetailsPanelProps {
  serverId: string | null;
  className?: string;
}

export function ServerDetailsPanel({ serverId, className = '' }: ServerDetailsPanelProps) {
  const {
    serverDetails,
    members,
    loading,
    error,
    refetch,
    fetchMembers,
    membersLoading,
    membersError
  } = useServerDetails(serverId);

  const [showMembers, setShowMembers] = useState(false);
  const [memberLimit, setMemberLimit] = useState(50);

  if (!serverId) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center text-gray-500">
          Select a server to view details
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading server details...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center text-red-600 mb-4">
          <AlertCircle className="w-5 h-5 mr-2" />
          Error loading server details
        </div>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!serverDetails) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center text-gray-500">
          No server details available
        </div>
      </div>
    );
  }

  const getVerificationLevelText = (level: number) => {
    const levels = ['None', 'Low', 'Medium', 'High', 'Very High'];
    return levels[level] || 'Unknown';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleLoadMembers = async () => {
    if (!showMembers) {
      setShowMembers(true);
      if (members.length === 0) {
        await fetchMembers(memberLimit);
      }
    } else {
      setShowMembers(false);
    }
  };

  const handleLoadMoreMembers = async () => {
    const newLimit = memberLimit + 50;
    setMemberLimit(newLimit);
    await fetchMembers(newLimit);
  };

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Server Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
            {serverDetails.icon ? (
              <img
                src={`https://cdn.discordapp.com/icons/${serverDetails.id}/${serverDetails.icon}.png`}
                alt={serverDetails.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Users className="w-8 h-8 text-gray-600" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">{serverDetails.name}</h2>
            {serverDetails.description && (
              <p className="text-gray-600 mt-1">{serverDetails.description}</p>
            )}
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
              <div className="flex items-center">
                <Users className="w-4 h-4 mr-1" />
                {serverDetails.member_count.toLocaleString()} members
              </div>
              {serverDetails.presence_count && (
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1" />
                  {serverDetails.presence_count.toLocaleString()} online
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {serverDetails.bot_in_server ? (
              <div className="flex items-center text-green-600 text-sm">
                <Bot className="w-4 h-4 mr-1" />
                Bot Connected
              </div>
            ) : (
              <div className="flex items-center text-amber-600 text-sm">
                <AlertCircle className="w-4 h-4 mr-1" />
                Limited Data
              </div>
            )}
            <button
              onClick={refetch}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Server Info */}
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center text-sm">
              <Crown className="w-4 h-4 mr-2 text-yellow-500" />
              <span className="text-gray-600">Owner ID:</span>
              <span className="ml-2 font-mono text-gray-900">{serverDetails.owner_id}</span>
            </div>
            
            <div className="flex items-center text-sm">
              <Shield className="w-4 h-4 mr-2 text-blue-500" />
              <span className="text-gray-600">Verification:</span>
              <span className="ml-2 text-gray-900">{getVerificationLevelText(serverDetails.verification_level)}</span>
            </div>
            
            <div className="flex items-center text-sm">
              <Calendar className="w-4 h-4 mr-2 text-purple-500" />
              <span className="text-gray-600">Created:</span>
              <span className="ml-2 text-gray-900">{formatDate(serverDetails.created_at)}</span>
            </div>
          </div>

          <div className="space-y-3">
            {serverDetails.features.length > 0 && (
              <div>
                <span className="text-sm text-gray-600">Features:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {serverDetails.features.slice(0, 3).map((feature) => (
                    <span
                      key={feature}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                    >
                      {feature.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {serverDetails.features.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      +{serverDetails.features.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Members Section */}
        {serverDetails.bot_in_server && (
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={handleLoadMembers}
              className="flex items-center justify-between w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="flex items-center">
                <Users className="w-5 h-5 mr-2 text-gray-600" />
                <span className="font-medium">Server Members</span>
                {members.length > 0 && (
                  <span className="ml-2 text-sm text-gray-500">({members.length} loaded)</span>
                )}
              </div>
              {showMembers ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showMembers && (
              <div className="mt-4 space-y-2">
                {membersLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    Loading members...
                  </div>
                ) : membersError ? (
                  <div className="text-red-600 text-sm p-3 bg-red-50 rounded">
                    {membersError}
                  </div>
                ) : members.length > 0 ? (
                  <>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {members.map((member) => (
                        <div key={member.user.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                            {member.user.avatar ? (
                              <img
                                src={`https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`}
                                alt={member.user.username}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-gray-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm truncate">
                                {member.nick || member.user.username}
                              </span>
                              {member.user.bot && (
                                <span className="px-1 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                                  BOT
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              Joined {formatDate(member.joined_at)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {members.length >= memberLimit && (
                      <button
                        onClick={handleLoadMoreMembers}
                        disabled={membersLoading}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {membersLoading ? 'Loading...' : 'Load More Members'}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-gray-500 text-sm p-3 bg-gray-50 rounded">
                    No members data available
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error Messages */}
        {serverDetails.error && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center text-amber-800">
              <AlertCircle className="w-4 h-4 mr-2" />
              <span className="text-sm">{serverDetails.error}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}