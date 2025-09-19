'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { SetupWizardStep } from '@/components/onboarding/SetupWizardStep';
import { BotConfigurationStep } from '@/components/onboarding/steps/BotConfigurationStep';
import { ProductSetupStep } from '@/components/onboarding/steps/ProductSetupStep';
import { PaymentSetupStep } from '@/components/onboarding/steps/PaymentSetupStep';
import { ReviewStep } from '@/components/onboarding/steps/ReviewStep';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react';

type WizardStep = 'bot-config' | 'products' | 'payments' | 'review';

const wizardSteps = [
  {
    id: 'bot-config' as WizardStep,
    title: 'Bot Configuration',
    description: 'Customize your bot\'s appearance and behavior'
  },
  {
    id: 'products' as WizardStep,
    title: 'Products & Categories',
    description: 'Set up your initial products and categories'
  },
  {
    id: 'payments' as WizardStep,
    title: 'Payment Setup',
    description: 'Configure your wallet and payment settings'
  },
  {
    id: 'review' as WizardStep,
    title: 'Review & Launch',
    description: 'Review your settings and launch your bot'
  }
];

export default function SetupWizardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>('bot-config');
  const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
  const [wizardData, setWizardData] = useState({
    botConfig: {},
    products: [],
    categories: [],
    paymentConfig: {}
  });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/signin');
    }
  }, [user, isLoading, router]);

  const currentStepIndex = wizardSteps.findIndex(step => step.id === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === wizardSteps.length - 1;

  const handleStepComplete = (stepId: WizardStep, data: any) => {
    setWizardData(prev => ({
      ...prev,
      [stepId === 'bot-config' ? 'botConfig' : 
        stepId === 'products' ? 'products' : 
        stepId === 'payments' ? 'paymentConfig' : 'review']: data
    }));

    if (!completedSteps.includes(stepId)) {
      setCompletedSteps(prev => [...prev, stepId]);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      const nextStep = wizardSteps[currentStepIndex + 1];
      setCurrentStep(nextStep.id);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      const prevStep = wizardSteps[currentStepIndex - 1];
      setCurrentStep(prevStep.id);
    }
  };

  const handleFinish = async () => {
    setIsProcessing(true);
    try {
      // This will be implemented when we have the API client
      // await apiClient.post('/onboarding/complete', wizardData);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      router.push('/onboarding/complete');
    } catch (error) {
      console.error('Failed to complete setup:', error);
      setIsProcessing(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'bot-config':
        return (
          <BotConfigurationStep
            initialData={wizardData.botConfig}
            onComplete={(data) => handleStepComplete('bot-config', data)}
            onNext={handleNext}
          />
        );
      case 'products':
        return (
          <ProductSetupStep
            initialData={{ products: wizardData.products, categories: wizardData.categories }}
            onComplete={(data) => handleStepComplete('products', data)}
            onNext={handleNext}
          />
        );
      case 'payments':
        return (
          <PaymentSetupStep
            initialData={wizardData.paymentConfig}
            onComplete={(data) => handleStepComplete('payments', data)}
            onNext={handleNext}
          />
        );
      case 'review':
        return (
          <ReviewStep
            wizardData={wizardData}
            onFinish={handleFinish}
            isProcessing={isProcessing}
          />
        );
      default:
        return null;
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
      <OnboardingProgress currentStep="config" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Settings className="w-8 h-8 text-white" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Setup Wizard
        </h1>
        
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Let's configure your bot step by step. You can always change these settings later.
        </p>
      </motion.div>

      {/* Step Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {wizardSteps.map((step, index) => {
            const isCompleted = completedSteps.includes(step.id);
            const isCurrent = step.id === currentStep;
            const isAccessible = index <= currentStepIndex || isCompleted;
            
            return (
              <div key={step.id} className="flex items-center flex-1">
                <button
                  onClick={() => isAccessible && setCurrentStep(step.id)}
                  disabled={!isAccessible}
                  className={`
                    flex flex-col items-center transition-all duration-200
                    ${isAccessible ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                  `}
                >
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                    ${isCompleted 
                      ? 'bg-green-500 text-white' 
                      : isCurrent
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                    }
                  `}>
                    {index + 1}
                  </div>
                  <div className="mt-2 text-center">
                    <div className={`text-xs font-medium ${
                      isCurrent ? 'text-indigo-600' : 
                      isCompleted ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {step.title}
                    </div>
                  </div>
                </button>
                
                {index < wizardSteps.length - 1 && (
                  <div className="flex-1 mx-4">
                    <div className={`h-0.5 ${
                      completedSteps.includes(step.id) ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <SetupWizardStep
            title={wizardSteps[currentStepIndex].title}
            description={wizardSteps[currentStepIndex].description}
          >
            {renderStepContent()}
          </SetupWizardStep>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {currentStep !== 'review' && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={isFirstStep}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          <Button
            variant="outline"
            onClick={() => router.push('/onboarding/templates')}
          >
            Back to Templates
          </Button>
        </div>
      )}
    </div>
  );
}