'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

export default function TestApiDirectPage() {
  const { data: session, status } = useSession();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testServersApi = async () => {
    setLoading(true);
    try {
      console.log('🧪 Testing servers API...');
      const response = await fetch('/api/backend/users/servers', {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('🧪 Response status:', response.status);
      const data = await response.json();
      console.log('🧪 Response data:', data);
      
      setResult({
        status: response.status,
        data
      });
    } catch (error) {
      console.error('🧪 API test error:', error);
      setResult({
        error: error instanceof Error ? error.message : String(error)
      });
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Direct API Test</h1>
      
      <div className="space-y-4">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Session Status</h2>
          <p>Status: {status}</p>
          <p>User: {session?.user?.name || 'None'}</p>
        </div>

        <button 
          onClick={testServersApi}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Testing...' : 'Test /api/backend/users/servers'}
        </button>

        {result && (
          <div className="bg-gray-100 p-4 rounded">
            <h3 className="font-semibold mb-2">API Result:</h3>
            <pre className="text-sm overflow-auto bg-white p-2 rounded">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}