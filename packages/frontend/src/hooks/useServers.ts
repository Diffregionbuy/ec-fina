import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Server, DiscordApiLoadingState } from '@/types/dashboard';
import { saveLastVisitedServer } from '@/utils/serverPreferences';

interface UseServersReturn {
  servers: Server[];
  selectedServerId: string | null;
  selectedServer: Server | undefined;
  loading: boolean;
  error: string | null;
  loadingState: DiscordApiLoadingState;
  setSelectedServerId: (serverId: string | null) => void;
  refetch: () => Promise<void>;
  retry: () => Promise<void>;
  forceRefresh: () => Promise<void>;
}

export function useServers(): UseServersReturn {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<DiscordApiLoadingState>({
    isLoading: false,
    isRetrying: false,
    retryCount: 0,
    error: null,
    isStale: false,
  });
  const hasInitialized = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUserServers = useCallback(async (force = false, isRetry = false) => {
    try {
      // Update loading state
      setLoading(true);
      setError(null);
      setLoadingState(prev => ({
        ...prev,
        isLoading: true,
        isRetrying: isRetry,
        error: null,
      }));
      
      // Check if user is authenticated
      if (!isAuthenticated) {
        setServers([]);
        setSelectedServerId(null);
        setLoading(false);
        setLoadingState(prev => ({ ...prev, isLoading: false }));
        return;
      }
      
      // Prevent duplicate calls unless forced
      if (!force && hasInitialized.current) {
        setLoading(false);
        setLoadingState(prev => ({ ...prev, isLoading: false }));
        return;
      }
      
      // Try to fetch real server data from the API proxy
      try {
        const response = await fetch('/api/backend/users/servers', {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          let data;
          try {
            data = await response.json();
          } catch (jsonError) {
            if (process.env.NODE_ENV === 'development') {
              console.error('Failed to parse JSON response:', jsonError);
            }
            const errorMsg = 'Invalid response from server';
            setError(errorMsg);
            setLoadingState(prev => ({
              ...prev,
              isLoading: false,
              isRetrying: false,
              error: errorMsg,
            }));
            hasInitialized.current = true;
            setLoading(false);
            return;
          }
          
          if (data.success && data.data.servers) {
            // Transform the API response to match our Server interface
            const allServers = [...(data.data.servers.owned || []), ...(data.data.servers.member || [])];
            const transformedServers: Server[] = allServers.map((server: any) => ({
              id: server.id,
              discord_server_id: server.id,
              name: server.name,
              icon: server.icon,
              owner_id: user?.id || '',
              bot_invited: server.botInvited || false,
              bot_config: server.configuration || {},
              subscription_tier: 'free', // Default for now
              member_count: server.approximate_member_count || server.member_count || null,
              created_at: server.configuration?.createdAt || new Date().toISOString(),
              updated_at: server.configuration?.updatedAt || new Date().toISOString(),
            }));
            
            setServers(transformedServers);
            if (transformedServers.length > 0 && !selectedServerId) {
              setSelectedServerId(transformedServers[0].id);
            }
            
            // Reset loading state on success
            setLoadingState({
              isLoading: false,
              isRetrying: false,
              retryCount: 0,
              error: null,
              isStale: data.cached || false,
            });
            
            hasInitialized.current = true;
            setLoading(false);
            return;
          }
        } else if (response.status === 401) {
          setServers([]);
          setSelectedServerId(null);
          setLoadingState(prev => ({ ...prev, isLoading: false, isRetrying: false }));
          hasInitialized.current = true;
          setLoading(false);
          return;
        } else {
          // Handle enhanced error response format
          let errorData;
          try {
            const errorText = await response.text();
            
            try {
              errorData = JSON.parse(errorText);
            } catch (jsonParseError) {
              errorData = { 
                success: false,
                error: { 
                  message: errorText || `HTTP ${response.status} ${response.statusText}`,
                  code: 'PARSE_ERROR',
                  retryable: false,
                  timestamp: new Date().toISOString()
                } 
              };
            }
          } catch (parseError) {
            errorData = { 
              success: false,
              error: { 
                message: `HTTP ${response.status} ${response.statusText}`,
                code: 'HTTP_ERROR',
                retryable: response.status >= 500 || response.status === 503,
                timestamp: new Date().toISOString()
              } 
            };
          }
          
          // Handle enhanced error response
          if (errorData.error) {
            const { message, retryable, attempts, cached } = errorData.error;
            
            let userFriendlyMessage = message;
            if (response.status === 503) {
              userFriendlyMessage = 'Discord services are temporarily unavailable. We\'re retrying automatically.';
            } else if (response.status >= 500) {
              userFriendlyMessage = 'Server error occurred. Please try again in a moment.';
            } else if (response.status === 429) {
              userFriendlyMessage = 'Too many requests. Please wait a moment before trying again.';
            }
            
            setError(userFriendlyMessage);
            setLoadingState(prev => ({
              ...prev,
              isLoading: false,
              isRetrying: false,
              error: userFriendlyMessage,
              retryCount: attempts || prev.retryCount,
              isStale: cached || false,
            }));
            
            // Auto-retry for retryable errors
            if (retryable && loadingState.retryCount < 3) {
              const delay = Math.min(1000 * Math.pow(2, loadingState.retryCount), 10000);
              
              retryTimeoutRef.current = setTimeout(() => {
                setLoadingState(prev => ({ 
                  ...prev, 
                  retryCount: prev.retryCount + 1 
                }));
                fetchUserServers(true, true);
              }, delay);
              
              return;
            }
          } else {
            const fallbackMessage = 'Failed to load servers. Please try again.';
            setError(fallbackMessage);
            setLoadingState(prev => ({
              ...prev,
              isLoading: false,
              isRetrying: false,
              error: fallbackMessage,
            }));
          }
        }
      } catch (apiError) {
        console.error('Failed to fetch servers from API:', apiError);
        const networkError = 'Failed to connect to server. Please check your internet connection and try again.';
        setError(networkError);
        setLoadingState(prev => ({
          ...prev,
          isLoading: false,
          isRetrying: false,
          error: networkError,
        }));
        
        // Auto-retry network errors
        if (loadingState.retryCount < 3) {
          const delay = Math.min(1000 * Math.pow(2, loadingState.retryCount), 10000);
          
          console.log(`Auto-retrying network request in ${delay}ms (attempt ${loadingState.retryCount + 1}/3)`);
          
          retryTimeoutRef.current = setTimeout(() => {
            setLoadingState(prev => ({ 
              ...prev, 
              retryCount: prev.retryCount + 1 
            }));
            fetchUserServers(true, true);
          }, delay);
          
          return;
        }
      }

      hasInitialized.current = true;
      setLoading(false);
      setLoadingState(prev => ({ ...prev, isLoading: false, isRetrying: false }));
    } catch (error) {
      console.error('Failed to fetch servers:', error);
      const generalError = 'Failed to load your servers. Please try again.';
      setError(generalError);
      setLoadingState(prev => ({
        ...prev,
        isLoading: false,
        isRetrying: false,
        error: generalError,
      }));
      hasInitialized.current = true;
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, selectedServerId, loadingState.retryCount]);

  // Manual retry function
  const retry = useCallback(async () => {
    setLoadingState(prev => ({ 
      ...prev, 
      retryCount: 0 // Reset retry count for manual retries
    }));
    await fetchUserServers(true, true);
  }, [fetchUserServers]);

  // Force refresh function that bypasses initialization check
  const forceRefresh = useCallback(async () => {
    hasInitialized.current = false; // Reset initialization flag
    setLoadingState(prev => ({ 
      ...prev, 
      retryCount: 0
    }));
    await fetchUserServers(true, false);
  }, [fetchUserServers]);

  useEffect(() => {
    // Only fetch servers if user is authenticated and not loading
    if (isAuthenticated && !authLoading && !hasInitialized.current) {
      fetchUserServers();
    } else if (!authLoading && !isAuthenticated) {
      // User is not authenticated, set empty state
      setServers([]);
      setSelectedServerId(null);
      setLoading(false);
      setLoadingState({
        isLoading: false,
        isRetrying: false,
        retryCount: 0,
        error: null,
        isStale: false,
      });
      hasInitialized.current = true;
    }
  }, [isAuthenticated, authLoading, fetchUserServers]);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Enhanced setSelectedServerId that saves preferences
  const setSelectedServerIdWithPreference = useCallback((serverId: string | null) => {
    setSelectedServerId(serverId);
    
    // Save to localStorage if serverId is valid
    if (serverId) {
      const server = servers.find(s => s.id === serverId);
      if (server) {
        saveLastVisitedServer(serverId, server.name);
      }
    }
  }, [servers]);

  return {
    servers,
    selectedServerId,
    selectedServer,
    loading,
    error,
    loadingState,
    setSelectedServerId: setSelectedServerIdWithPreference,
    refetch: () => fetchUserServers(true),
    retry,
    forceRefresh,
  };
}