'use client';

import React from 'react';

export const FieldValueRenderer = ({ value }: { value: string }) => {
  if (value.startsWith('`') && value.endsWith('`')) {
    const codeContent = value.slice(1, -1);
    return (
      <code className="bg-gray-800 text-gray-200 px-2 py-1 rounded text-xs font-mono border border-gray-600">
        {codeContent}
      </code>
    );
  }
  return <span>{value}</span>;
};

export default FieldValueRenderer;