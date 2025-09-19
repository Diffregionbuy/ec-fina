'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { CheckCircle, AlertCircle, Bot } from 'lucide-react';

function BotCallbackPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const guildId = searchParams.get('guild_id');

    if (error) {
      setStatus('error');
      setMessage(getErrorMessage(error));
      return;
    }

    if (code && guildId) {
      handleBotInvitation(code, guildId);
    } else {
      setStatus('error');
      setMessage('Missing required parameters from Discord');
    }
  }, [searchParams]);

  const getErrorMessage = (error: string) => {
    switch (error) {
      case 'access_denied':
        return 'Bot invitation was cancelled. Please try again if you want to add the bot to your server.';
      case 'invalid_scope':
        return 'Invalid permissions requested. Please contact support.';
      default:
        return `An error occurred during bot invitation: ${error}`;
    }
  };

  const handleBotInvitation = async (code: string, guildId: string) => {
    try {
      console.log('🤖 Processing bot invitation callback (fallback)', { code, guildId });
      
      // This is now a fallback since we're using simple bot invitations
      setStatus('success');
      setMessage('Bot invitation process completed. Redirecting...');
      
      // Close the popup window
      if (window.opener) {
        setTimeout(() => window.close(), 1000);
      } else {
        // If not in popup, redirect to templates
        setTimeout(() => {
          router.push('/onboarding/templates');
        }, 2000);
      }
      
    } catch (error) {
      console.error('🤖 Failed to process bot invitation:', error);
      setStatus('error');
      setMessage('Failed to complete bot invitation. Please try again.');
    }
  };

  const handleRetry = () => {
    router.push('/onboarding/invite-bot');
  };

  const handleContinue = () => {
    router.push('/onboarding/templates');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg p-8 text-center"
        >
          {status === 'processing' && (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <Bot className="w-8 h-8 text-white" />
              </motion.div>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Processing Bot Invitation
              </h2>
              
              <p className="text-gray-600 mb-6">
                We're setting up the bot for your server...
              </p>
              
              <LoadingSpinner size="lg" />
            </>
          )}

          {status === 'success' && (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="w-8 h-8 text-white" />
              </motion.div>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Success!
              </h2>
              
              <p className="text-gray-600 mb-6">
                {message}
              </p>
              
              <Button onClick={handleContinue} className="w-full">
                Continue Setup
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <AlertCircle className="w-8 h-8 text-white" />
              </motion.div>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Invitation Failed
              </h2>
              
              <Alert variant="error" className="mb-6 text-left">
                <AlertCircle className="w-4 h-4" />
                {message}
              </Alert>
              
              <div className="flex space-x-3">
                <Button variant="outline" onClick={handleRetry} className="flex-1">
                  Try Again
                </Button>
                <Button onClick={handleContinue} className="flex-1">
                  Skip for Now
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function BotCallbackPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner size="lg" /></div>}>
      <BotCallbackPageContent />
    </Suspense>
  );
}