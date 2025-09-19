'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useServers } from '@/hooks/useServers';
import { Server, DiscordApiLoadingState } from '@/types/dashboard';

interface ServerContextType {
  servers: Server[];
  selectedServerId: string | null;
  selectedServer: Server | undefined;
  loading: boolean;
  error: string | null;
  loadingState: DiscordApiLoadingState;
  setSelectedServerId: (serverId: string | null) => void;
  refreshServers: () => Promise<void>;
  retryServers: () => Promise<void>;
  forceRefreshServers: () => Promise<void>;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export function useServerContext() {
  const context = useContext(ServerContext);
  if (context === undefined) {
    throw new Error('useServerContext must be used within a ServerProvider');
  }
  return context;
}

interface ServerProviderProps {
  children: ReactNode;
}

export function ServerProvider({ children }: ServerProviderProps) {
  const {
    servers,
    selectedServerId,
    selectedServer,
    loading,
    error,
    loadingState,
    setSelectedServerId,
    refetch,
    retry,
    forceRefresh
  } = useServers();

  const value: ServerContextType = {
    servers,
    selectedServerId,
    selectedServer,
    loading,
    error,
    loadingState,
    setSelectedServerId,
    refreshServers: refetch,
    retryServers: retry,
    forceRefreshServers: forceRefresh,
  };

  return (
    <ServerContext.Provider value={value}>
      {children}
    </ServerContext.Provider>
  );
}