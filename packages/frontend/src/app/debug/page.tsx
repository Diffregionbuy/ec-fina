'use client';

import { useSession } from 'next-auth/react';
import { useAuth } from '@/hooks/useAuth';
import { useServers } from '@/hooks/useServers';
import { useState } from 'react';

export default function DebugPage() {
  const { data: session, status } = useSession();
  const { isAuthenticated, isBackendAuthenticated, backendToken, getBackendToken } = useAuth(false);
  const { servers, loading, error } = useServers();
  const [testResult, setTestResult] = useState<any>(null);

  const testBackendConnection = async () => {
    try {
      const token = await getBackendToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/users/servers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      setTestResult({
        status: response.status,
        ok: response.ok,
        data: data,
      });
    } catch (error) {
      setTestResult({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Debug Information</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Session Info */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Session Status</h2>
            <div className="space-y-2">
              <p><strong>Status:</strong> {status}</p>
              <p><strong>Authenticated:</strong> {isAuthenticated ? 'Yes' : 'No'}</p>
              <p><strong>Backend Auth:</strong> {isBackendAuthenticated ? 'Yes' : 'No'}</p>
              <p><strong>Has Session:</strong> {session ? 'Yes' : 'No'}</p>
              <p><strong>Has Backend Token:</strong> {backendToken ? 'Yes' : 'No'}</p>
            </div>
            
            {session && (
              <div className="mt-4">
                <h3 className="font-medium">Session Data:</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-auto">
                  {JSON.stringify(session, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Servers Info */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Servers Status</h2>
            <div className="space-y-2">
              <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
              <p><strong>Error:</strong> {error || 'None'}</p>
              <p><strong>Server Count:</strong> {servers.length}</p>
            </div>
            
            {servers.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium">Servers:</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-auto">
                  {JSON.stringify(servers, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Environment Info */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Environment</h2>
            <div className="space-y-2">
              <p><strong>API URL:</strong> {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}</p>
              <p><strong>NextAuth URL:</strong> {process.env.NEXTAUTH_URL || 'Not set'}</p>
              <p><strong>Node ENV:</strong> {process.env.NODE_ENV}</p>
            </div>
          </div>

          {/* Backend Test */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Backend Connection Test</h2>
            <button 
              onClick={testBackendConnection}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Test Backend Connection
            </button>
            
            {testResult && (
              <div className="mt-4">
                <h3 className="font-medium">Test Result:</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}