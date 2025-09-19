'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AlertCircle, ArrowLeft } from 'lucide-react';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const getErrorMessage = (error: string | null): { title: string; description: string } => {
    switch (error) {
      case 'Configuration':
        return {
          title: 'Server Configuration Error',
          description: 'There is a problem with the server configuration. Please contact support.',
        };
      case 'AccessDenied':
        return {
          title: 'Access Denied',
          description: 'You do not have permission to sign in. Please contact an administrator.',
        };
      case 'Verification':
        return {
          title: 'Verification Error',
          description: 'The verification token has expired or is invalid. Please try signing in again.',
        };
      case 'OAuthSignin':
      case 'OAuthCallback':
      case 'OAuthCreateAccount':
        return {
          title: 'Discord Authentication Error',
          description: 'There was an error connecting to Discord. Please try again or contact support if the problem persists.',
        };
      case 'EmailCreateAccount':
        return {
          title: 'Account Creation Error',
          description: 'Unable to create your account. Please try again or contact support.',
        };
      case 'Callback':
        return {
          title: 'Callback Error',
          description: 'There was an error during the authentication process. Please try signing in again.',
        };
      case 'OAuthAccountNotLinked':
        return {
          title: 'Account Not Linked',
          description: 'This Discord account is not linked to an existing account. Please try signing in again.',
        };
      case 'SessionRequired':
        return {
          title: 'Session Required',
          description: 'You need to be signed in to access this page.',
        };
      default:
        return {
          title: 'Authentication Error',
          description: 'An unexpected error occurred during authentication. Please try again.',
        };
    }
  };

  const { title, description } = getErrorMessage(error);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-red-500 p-3 rounded-full">
              <AlertCircle className="h-8 w-8 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">{title}</h2>
          <p className="mt-2 text-gray-600">{description}</p>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    What happened?
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{description}</p>
                    {error && (
                      <p className="mt-2 font-mono text-xs bg-red-100 p-2 rounded">
                        Error code: {error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Link href="/auth/signin">
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                  Try Again
                </Button>
              </Link>
              
              <Link href="/">
                <Button variant="outline" className="w-full flex items-center justify-center space-x-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Home</span>
                </Button>
              </Link>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-500">
                Still having trouble?{' '}
                <a href="mailto:support@ecbot.dev" className="text-indigo-600 hover:text-indigo-500">
                  Contact Support
                </a>
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AuthError() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
    </div>}>
      <AuthErrorContent />
    </Suspense>
  );
}