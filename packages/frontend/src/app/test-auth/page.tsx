'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function TestAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    console.log('TestAuth - Session status:', status);
    console.log('TestAuth - Session data:', session);
  }, [session, status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p>Loading authentication...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Not Authenticated</h1>
          <p className="mb-4">You need to sign in to access this page.</p>
          <button
            onClick={() => router.push('/auth/signin')}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Authentication Test Page</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Session Status: {status}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">User Info</h3>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <p><strong>Name:</strong> {session?.user?.name || 'N/A'}</p>
                <p><strong>Email:</strong> {session?.user?.email || 'N/A'}</p>
                <p><strong>Image:</strong> {session?.user?.image ? 'Yes' : 'No'}</p>
                <p><strong>ID:</strong> {session?.user?.id || 'N/A'}</p>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Discord Tokens</h3>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <p><strong>Discord ID:</strong> {(session as any)?.discordTokens?.discordId || 'N/A'}</p>
                <p><strong>Username:</strong> {(session as any)?.discordTokens?.discordUsername || 'N/A'}</p>
                <p><strong>Access Token:</strong> {(session as any)?.discordTokens?.discordAccessToken ? 'Present' : 'Missing'}</p>
                <p><strong>Refresh Token:</strong> {(session as any)?.discordTokens?.discordRefreshToken ? 'Present' : 'Missing'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-medium text-gray-900 mb-4">Navigation Test</h3>
          <div className="space-y-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="block w-full text-left bg-indigo-50 hover:bg-indigo-100 p-3 rounded border"
            >
              Go to Dashboard (this might cause redirect loop)
            </button>
            <button
              onClick={() => router.push('/')}
              className="block w-full text-left bg-green-50 hover:bg-green-100 p-3 rounded border"
            >
              Go to Home Page
            </button>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="block w-full text-left bg-yellow-50 hover:bg-yellow-100 p-3 rounded border"
            >
              Force Navigate to Dashboard (window.location)
            </button>
          </div>
        </div>

        <div className="mt-6 bg-gray-100 p-4 rounded">
          <h3 className="font-medium mb-2">Raw Session Data:</h3>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(session, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}