import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  isLoading: boolean;
  error?: Error | null;
  children: ReactNode;
  loadingText?: string;
  errorFallback?: ReactNode;
  onRetry?: () => void;
}

export function LoadingState({
  isLoading,
  error,
  children,
  loadingText = 'Loading...',
  errorFallback,
  onRetry,
}: LoadingStateProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-gray-600">{loadingText}</span>
        </div>
      </div>
    );
  }

  if (error) {
    if (errorFallback) {
      return <>{errorFallback}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-4">
          <div className="text-red-600 text-sm font-medium">
            {error.message || 'An error occurred'}
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

// Specialized loading states for common scenarios
export function PageLoadingState({ message = 'Loading page...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center space-x-2">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="text-gray-600">{message}</span>
      </div>
    </div>
  );
}

export function CardLoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span className="text-sm text-gray-600">{message}</span>
        </div>
      </div>
    </div>
  );
}

export function InlineLoadingState({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <Loader2 className={`animate-spin text-blue-600 ${sizeClasses[size]}`} />
  );
}