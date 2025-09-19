'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server } from '@/types/dashboard';
import { ChevronDown, Server as ServerIcon, Crown, Users, CheckCircle, AlertCircle } from 'lucide-react';

interface ServerSelectorProps {
  servers: Server[];
  selectedServerId: string | null;
  onServerSelect: (serverId: string) => void;
}

export function ServerSelector({ servers, selectedServerId, onServerSelect }: ServerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

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

  const getStatusText = (server: Server) => {
    if (!server.bot_invited) return 'Setup needed';
    return 'Bot invited';
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
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
                {getStatusText(selectedServer)}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-gray-500 text-sm">Select a server...</span>
        )}
        
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
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
                    onServerSelect(server.id);
                    setIsOpen(false);
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
                          {getStatusText(server)}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </motion.div>
            
            {/* Overlay */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}