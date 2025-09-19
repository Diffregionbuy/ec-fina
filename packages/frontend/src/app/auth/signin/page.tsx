'use client';

import { signIn, getSession } from 'next-auth/react';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AlertCircle, Bot, Shield, Zap, ArrowLeft, CheckCircle } from 'lucide-react';
import Link from 'next/link';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  useEffect(() => {
    const checkSession = async () => {
      const session = await getSession();
      if (session) {
        router.push(callbackUrl);
      }
    };
    checkSession();
  }, [router, callbackUrl]);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(getErrorMessage(errorParam));
    }
  }, [searchParams]);

  const handleDiscordSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signIn('discord', { callbackUrl });
    } catch (err) {
      setError('Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = (error: string): string => {
    switch (error) {
      case 'OAuthSignin':
        return 'Authentication service temporarily unavailable';
      case 'OAuthCallback':
        return 'Authentication callback failed';
      case 'OAuthCreateAccount':
        return 'Account creation failed';
      case 'EmailCreateAccount':
        return 'Email account creation failed';
      case 'Callback':
        return 'Authentication callback error';
      case 'OAuthAccountNotLinked':
        return 'Account linking failed. Please try again.';
      case 'EmailSignin':
        return 'Check your email for the signin link';
      case 'CredentialsSignin':
        return 'Invalid credentials provided';
      case 'SessionRequired':
        return 'Authentication required to access this page';
      default:
        return 'Authentication error occurred. Please try again.';
    }
  };

  const features = [
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level encryption and security protocols'
    },
    {
      icon: Zap,
      title: 'Instant Setup',
      description: 'Deploy your bot infrastructure in seconds'
    },
    {
      icon: CheckCircle,
      title: '99.99% Uptime',
      description: 'Guaranteed reliability for your community'
    }
  ];

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] flex">
      {/* Left Side - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--card))] to-[rgb(var(--background))]"></div>
        <div className="absolute inset-0 opacity-50" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
        
        <div className="relative z-10 flex flex-col justify-center px-12 py-16">
          <div className="mb-12">
            <div className="flex items-center space-x-3 mb-8">
              <div className="w-12 h-12 bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--primary))]/80 rounded-xl flex items-center justify-center">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <span className="text-2xl font-bold">EcBot</span>
            </div>
            
            <h1 className="text-4xl font-bold mb-4 leading-tight">
              Professional Discord
              <br />
              <span className="bg-gradient-to-r from-[rgb(var(--primary))] to-[rgb(var(--primary))]/80 bg-clip-text text-transparent">
                Commerce Platform
              </span>
            </h1>
            
            <p className="text-lg text-[rgb(var(--muted-foreground))] mb-12 leading-relaxed">
              Enterprise-grade infrastructure for Discord communities. 
              Advanced payment processing, automated delivery, and comprehensive analytics.
            </p>
          </div>

          <div className="space-y-6">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-[rgb(var(--primary))]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-[rgb(var(--primary))]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[rgb(var(--foreground))] mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[rgb(var(--muted-foreground))]">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Header */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--primary))]/80 rounded-lg flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold">EcBot</span>
            </div>
          </div>

          {/* Back to Home */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="text-sm">Back to Home</span>
            </Link>
          </div>

          {/* Login Header */}
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-[rgb(var(--foreground))]">
              Sign in to EcBot
            </h2>
            <p className="text-[rgb(var(--muted-foreground))]">
              Access your Discord commerce dashboard
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-[rgb(var(--destructive))]/10 border border-[rgb(var(--destructive))]/20 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-[rgb(var(--destructive))] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[rgb(var(--destructive))]">Authentication Error</p>
                <p className="text-sm text-[rgb(var(--destructive))]/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Login Card */}
          <Card className="card p-8">
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-[rgb(var(--foreground))] mb-2">
                  Continue with Discord
                </h3>
                <p className="text-sm text-[rgb(var(--muted-foreground))]">
                  Use your Discord account to access the platform
                </p>
              </div>

              <Button
                onClick={handleDiscordSignIn}
                disabled={isLoading}
                className="btn btn-primary w-full py-4 text-base font-medium"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Authenticating...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                    <span>Continue with Discord</span>
                  </div>
                )}
              </Button>

              <div className="text-center">
                <p className="text-xs text-[rgb(var(--muted-foreground))]">
                  By continuing, you agree to our{' '}
                  <Link href="/terms" className="text-[rgb(var(--primary))] hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-[rgb(var(--primary))] hover:underline">
                    Privacy Policy
                  </Link>
                </p>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[rgb(var(--background))] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[rgb(var(--primary))] border-t-transparent"></div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}