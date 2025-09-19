"use client";

import React from 'react';

interface FallbackErrorProps {
  error?: Error;
  resetErrorBoundary?: () => void;
}

const FallbackError: React.FC<FallbackErrorProps> = ({ error, resetErrorBoundary }) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
      <h3 className="text-lg font-medium text-red-600 mb-2">Chart could not be loaded</h3>
      <p className="text-sm text-gray-500 mb-4">
        There was an issue rendering the chart component.
      </p>
      {resetErrorBoundary && (
        <button
          onClick={resetErrorBoundary}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
};

export default FallbackError;