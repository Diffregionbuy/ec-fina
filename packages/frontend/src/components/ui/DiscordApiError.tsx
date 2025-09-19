import React from 'react';
import { AlertCircle, RefreshCw, Wifi, WifiOff, Clock } from 'lucide-react';
import { DiscordApiLoadingState } from '@/types/dashboard';

interface DiscordApiErrorProps {
  loadingState: DiscordApiLoadingState;
  onRetry?: () => void;
  className?: string;
}

export function DiscordApiError({ loadingState, onRetry, className = '' }: DiscordApiErrorProps) {
  const { error, isRetrying, retryCount, isStale } = loadingState;

  if (!error && !isStale) return null;

  const getErrorIcon = () => {
    if (isRetrying) return <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />;
    if (error?.includes('network') || error?.includes('connect')) return <WifiOff className="h-5 w-5 text-red-500" />;
    if (error?.includes('timeout')) return <Clock className="h-5 w-5 text-orange-500" />;
    return <AlertCircle className="h-5 w-5 text-red-500" />;
  };

  const getErrorType = () => {
    if (isRetrying) return 'Retrying...';
    if (error?.includes('503') || error?.includes('unavailable')) return 'Service Unavailable';
    if (error?.includes('network') || error?.includes('connect')) return 'Connection Error';
    if (error?.includes('timeout')) return 'Request Timeout';
    if (error?.includes('rate limit') || error?.includes('429')) return 'Rate Limited';
    return 'Discord API Error';
  };

  const getErrorMessage = () => {
    if (isRetrying) {
      return `Attempting to reconnect... (${retryCount}/3)`;
    }
    return error || 'An unexpected error occurred';
  };

  const getBgColor = () => {
    if (isRetrying) return 'bg-blue-50 border-blue-200';
    if (isStale) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getTextColor = () => {
    if (isRetrying) return 'text-blue-800';
    if (isStale) return 'text-yellow-800';
    return 'text-red-800';
  };

  return (
    <div className={`rounded-lg border p-4 ${getBgColor()} ${className}`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getErrorIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-medium ${getTextColor()}`}>
              {getErrorType()}
            </h3>
            {isStale && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                <Wifi className="h-3 w-3 mr-1" />
                Cached Data
              </span>
            )}
          </div>
          <p className={`mt-1 text-sm ${getTextColor()}`}>
            {getErrorMessage()}
          </p>
          {isStale && (
            <p className="mt-1 text-xs text-yellow-600">
              Showing cached data while Discord services are unavailable.
            </p>
          )}
          {onRetry && !isRetrying && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}