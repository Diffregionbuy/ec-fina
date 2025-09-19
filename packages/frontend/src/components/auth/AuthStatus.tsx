'use client';

import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { User, LogOut, RefreshCw } from 'lucide-react';

interface AuthStatusProps {
  showDetails?: boolean;
}

export function AuthStatus({ showDetails = false }: AuthStatusProps) {
  const { data: session, status, update } = useSession();

  if (status === 'loading') {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm text-gray-600">Loading authentication status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <Alert variant="warning" title="Not Authenticated">
        You need to sign in to access this content.
      </Alert>
    );
  }

  if (!session) {
    return (
      <Alert variant="error" title="Session Error">
        There was an error loading your session. Please try refreshing the page.
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {session.user?.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || 'User'}
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <div className="h-10 w-10 bg-gray-300 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-gray-600" />
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900">
                {session.user?.name || 'Unknown User'}
              </p>
              <p className="text-sm text-gray-600">
                {session.user?.email || 'No email provided'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => update()}
              title="Refresh session"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </Button>
          </div>
        </div>

        {showDetails && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">User ID:</span>
                <p className="text-gray-600 font-mono">{session.user?.id}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Session Status:</span>
                <p className="text-green-600 capitalize">{status}</p>
              </div>
              {(session as any)?.accessToken && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-700">Discord Access:</span>
                  <p className="text-green-600">Connected</p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}