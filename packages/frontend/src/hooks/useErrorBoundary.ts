import { useCallback } from 'react';
import { ApiClientError, AuthenticationError, ValidationError, NetworkError } from '@/lib/api-client';

export interface ErrorInfo {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info';
  canRetry: boolean;
}

export function useErrorHandler() {
  const handleError = useCallback((error: unknown): ErrorInfo => {
    console.error('Error occurred:', error);

    if (error instanceof AuthenticationError) {
      return {
        title: 'Authentication Required',
        message: 'Please sign in to continue.',
        type: 'warning',
        canRetry: false,
      };
    }

    if (error instanceof ValidationError) {
      return {
        title: 'Invalid Data',
        message: error.message || 'Please check your input and try again.',
        type: 'warning',
        canRetry: true,
      };
    }

    if (error instanceof NetworkError) {
      return {
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection.',
        type: 'error',
        canRetry: true,
      };
    }

    if (error instanceof ApiClientError) {
      switch (error.code) {
        case 'RATE_LIMITED':
          return {
            title: 'Too Many Requests',
            message: 'Please wait a moment before trying again.',
            type: 'warning',
            canRetry: true,
          };
        case 'NOT_FOUND':
          return {
            title: 'Not Found',
            message: 'The requested resource could not be found.',
            type: 'warning',
            canRetry: false,
          };
        case 'SERVER_ERROR':
          return {
            title: 'Server Error',
            message: 'Something went wrong on our end. Please try again later.',
            type: 'error',
            canRetry: true,
          };
        default:
          return {
            title: 'Error',
            message: error.message || 'An unexpected error occurred.',
            type: 'error',
            canRetry: true,
          };
      }
    }

    // Generic error handling
    if (error instanceof Error) {
      return {
        title: 'Error',
        message: error.message || 'An unexpected error occurred.',
        type: 'error',
        canRetry: true,
      };
    }

    return {
      title: 'Unknown Error',
      message: 'An unexpected error occurred. Please try again.',
      type: 'error',
      canRetry: true,
    };
  }, []);

  return { handleError };
}