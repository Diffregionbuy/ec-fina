'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { Bot, Zap, Shield, Coins } from 'lucide-react';

const features = [
  {
    icon: Bot,
    title: 'Discord Bot Integration',
    description: 'Seamlessly integrate with your Discord server'
  },
  {
    icon: Zap,
    title: 'Easy Setup',
    description: 'Get started in minutes with our guided setup'
  },
  {
    icon: Shield,
    title: 'Secure Payments',
    description: 'Process payments safely with OKX integration'
  },
  {
    icon: Coins,
    title: 'Monetize Your Server',
    description: 'Start earning from your community today'
  }
];

export default function WelcomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/signin');
    }
  }, [user, isLoading, router]);

  const handleGetStarted = async () => {
    setIsStarting(true);
    // Initialize onboarding progress
    try {
      // This will be implemented when we have the API client
      // await initializeOnboarding();
      router.push('/onboarding/invite-bot');
    } catch (error) {
      console.error('Failed to initialize onboarding:', error);
      setIsStarting(false);
    }
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
      <OnboardingProgress currentStep="welcome" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <Bot className="w-10 h-10 text-white" />
        </motion.div>
        
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to EcBot, {user.name}!
        </h1>
        
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Transform your Discord server into a thriving marketplace. 
          Let's get your bot set up in just a few simple steps.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-6 mb-12">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
          >
            <Card className="p-6 h-full hover:shadow-lg transition-shadow">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <feature.icon className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">
                    {feature.description}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="text-center"
      >
        <Button
          onClick={handleGetStarted}
          disabled={isStarting}
          size="lg"
          className="px-8 py-4 text-lg"
        >
          {isStarting ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Getting Started...
            </>
          ) : (
            'Get Started'
          )}
        </Button>
        
        <p className="text-sm text-gray-500 mt-4">
          This will take about 3-5 minutes to complete
        </p>
      </motion.div>
    </div>
  );
}