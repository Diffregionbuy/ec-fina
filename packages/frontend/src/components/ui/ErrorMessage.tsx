'use client';

import { AlertTriangle } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  className?: string;
}

export function ErrorMessage({ message, className = '' }: ErrorMessageProps) {
  return (
    <div className={`flex items-center space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
      <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
      <div>
        <h3 className="text-sm font-medium text-red-800">Error</h3>
        <p className="text-sm text-red-700 mt-1">{message}</p>
      </div>
    </div>
  );
}