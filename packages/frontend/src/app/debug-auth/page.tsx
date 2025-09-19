'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';

export default function DebugAuthPage() {
  const { data: session, status } = useSession();
  const [apiResult, setApiResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testApi = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/backend/users/servers');
      const data = await response.json();
      setApiResult({ status: response.status, data });
    } catch (error) {
      setApiResult({ error: error instanceof Error ? error.message : String(error) });
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Authentication Debug</h1>
      
      <div className="space-y-6">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Session Status</h2>
          <p><strong>Status:</strong> {status}</p>
          <p><strong>User:</strong> {session?.user?.name || 'None'}</p>
          <p><strong>Email:</strong> {session?.user?.email || 'None'}</p>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Session Data</h2>
          <pre className="text-sm overflow-auto">
            {JSON.stringify(session, null, 2)}
          </pre>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">API Test</h2>
          <button 
            onClick={testApi}
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test /api/backend/users/servers'}
          </button>
          
          {apiResult && (
            <div className="mt-4">
              <h3 className="font-semibold">API Result:</h3>
              <pre className="text-sm overflow-auto bg-white p-2 rounded">
                {JSON.stringify(apiResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}