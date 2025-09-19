import React from 'react';
import { RefreshCw, Loader2, Wifi } from 'lucide-react';
import { DiscordApiLoadingState } from '@/types/dashboard';

interface DiscordApiLoaderProps {
  loadingState: DiscordApiLoadingState;
  message?: string;
  className?: string;
}

export function DiscordApiLoader({ 
  loadingState, 
  message = 'Loading Discord data...', 
  className = '' 
}: DiscordApiLoaderProps) {
  const { isLoading, isRetrying, retryCount } = loadingState;

  if (!isLoading && !isRetrying) return null;

  const getIcon = () => {
    if (isRetrying) return <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />;
    return <Loader2 className="h-5 w-5 animate-spin text-gray-500" />;
  };

  const getMessage = () => {
    if (isRetrying) {
      return `Reconnecting to Discord... (${retryCount}/3)`;
    }
    return message;
  };

  return (
    <div className={`flex items-center justify-center p-6 ${className}`}>
      <div className="flex flex-col items-center space-y-3">
        <div className="flex items-center space-x-2">
          {getIcon()}
          <span className="text-sm font-medium text-gray-700">
            {getMessage()}
          </span>
        </div>
        {isRetrying && (
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <Wifi className="h-4 w-4" />
            <span>Discord services may be temporarily unavailable</span>
          </div>
        )}
      </div>
    </div>
  );
}