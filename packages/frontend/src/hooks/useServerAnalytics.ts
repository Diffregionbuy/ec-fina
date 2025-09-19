'use client';

import { useState, useEffect } from 'react';
import { useApiQuery } from './useApiQuery';

export function useServerAnalytics(serverId: string | undefined) {
  const [isReady, setIsReady] = useState(false);
  
  // Only enable the query when we have a valid serverId and component is mounted
  const query = useApiQuery(`analytics/servers/${serverId}/analytics`, {
    staleTime: 300000, // 5 minutes
    enabled: isReady && !!serverId,
  });
  
  // Set ready state after component mount to avoid hydration issues
  useEffect(() => {
    if (serverId) {
      setIsReady(true);
    }
  }, [serverId]);
  
  return query;
}