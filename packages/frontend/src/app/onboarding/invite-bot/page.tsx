'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert } from '@/components/ui/Alert';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { BotInviteButton } from '@/components/onboarding/BotInviteButton';
import { ServerSelector } from '@/components/onboarding/ServerSelector';
import { Bot, Shield, Settings, MessageSquare, AlertCircle } from 'lucide-react';

const requiredPermissions = [
  {
    icon: MessageSquare,
    name: 'Send Messages',
    description: 'Send product listings and order confirmations'
  },
  {
    icon: Settings,
    name: 'Manage Messages',
    description: 'Edit and delete bot messages for updates'
  },
  {
    icon: Shield,
    name: 'Use Slash Commands',
    description: 'Provide interactive shop commands'
  },
  {
    icon: Bot,
    name: 'Embed Links',
    description: 'Display rich product information'
  }
];

export default function InviteBotPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<'checking' | 'invited' | 'not-invited'>('checking');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('🎯 InviteBotPage: Auth state changed', { user: !!user, isLoading, userName: user?.name });
    if (!isLoading && !user) {
      console.log('🎯 InviteBotPage: Redirecting to signin');
      router.push('/auth/signin');
    } else if (user) {
      console.log('🎯 InviteBotPage: User authenticated, ready to load servers');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (selectedServer) {
      checkBotStatus(selectedServer);
    }
  }, [selectedServer]);

  const checkBotStatus = async (serverId: string) => {
    setBotStatus('checking');
    try {
      console.log('🤖 Checking initial bot status for server:', serverId);
      
      const response = await fetch(`/api/backend/servers/${serverId}/bot-status`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to check bot status: ${response.status}`);
      }

      const data = await response.json();
      console.log('🤖 Initial bot status response:', data);
      
      if (data.success && data.data.botStatus) {
        const isInvited = data.data.botStatus.invited;
        setBotStatus(isInvited ? 'invited' : 'not-invited');
        console.log('🤖 Bot status determined:', isInvited ? 'invited' : 'not-invited');
      } else {
        setBotStatus('not-invited');
      }
    } catch (error) {
      console.error('🤖 Failed to check bot status:', error);
      setError('Failed to check bot status. Please try again.');
      setBotStatus('not-invited');
    }
  };

  const handleBotInvited = () => {
    setBotStatus('invited');
    setError(null);
    // Auto-advance after a short delay
    setTimeout(() => {
      router.push('/onboarding/templates');
    }, 2000);
  };

  const handleSkip = () => {
    router.push('/onboarding/templates');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <OnboardingProgress currentStep="invite" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Bot className="w-8 h-8 text-white" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Invite EcBot to Your Server
        </h1>
        
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Choose your Discord server and invite the bot with the required permissions.
        </p>
      </motion.div>

      {error && (
        <Alert variant="error" className="mb-6">
          <AlertCircle className="w-4 h-4" />
          {error}
        </Alert>
      )}

      {/* Debug info */}
      <div className="bg-yellow-100 p-4 rounded mb-4 text-sm">
        <p><strong>Debug:</strong> User: {user?.name || 'None'}, Loading: {isLoading.toString()}</p>
        <p><strong>Selected Server:</strong> {selectedServer || 'None'}</p>
        <p><strong>Bot Status:</strong> {botStatus}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Select Your Server
            </h2>
            
            <ServerSelector
              onServerSelect={setSelectedServer}
              selectedServer={selectedServer}
            />
            
            {selectedServer && (
              <div className="mt-6">
                {botStatus === 'checking' && (
                  <div className="flex items-center justify-center py-4">
                    <LoadingSpinner size="sm" className="mr-2" />
                    <span className="text-gray-600">Checking bot status...</span>
                  </div>
                )}
                
                {botStatus === 'not-invited' && (
                  <BotInviteButton
                    serverId={selectedServer}
                    onSuccess={handleBotInvited}
                    onError={setError}
                    isInviting={isInviting}
                    setIsInviting={setIsInviting}
                  />
                )}
                
                {botStatus === 'invited' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-4"
                  >
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Bot className="w-6 h-6 text-green-600" />
                    </div>
                    <p className="text-green-600 font-medium">
                      Bot successfully invited!
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Proceeding to template selection...
                    </p>
                  </motion.div>
                )}
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Required Permissions
            </h2>
            
            <p className="text-gray-600 mb-4">
              The bot needs these permissions to function properly:
            </p>
            
            <div className="space-y-3">
              {requiredPermissions.map((permission, index) => (
                <motion.div
                  key={permission.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="flex items-start space-x-3"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <permission.icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {permission.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {permission.description}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> You can modify these permissions later in your Discord server settings.
              </p>
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => router.push('/onboarding/welcome')}
        >
          Back
        </Button>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              console.log('🧪 Testing API...');
              try {
                const response = await fetch('/api/test-servers');
                const data = await response.json();
                console.log('🧪 Test API result:', data);
                alert('Check console for test results');
              } catch (error) {
                console.error('🧪 Test API error:', error);
                alert('Test failed - check console');
              }
            }}
          >
            Test API
          </Button>
          
          <Button
            variant="outline"
            onClick={handleSkip}
            disabled={isInviting}
          >
            Skip for Now
          </Button>
        </div>
      </div>
    </div>
  );
}