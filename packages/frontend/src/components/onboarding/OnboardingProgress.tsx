'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export type OnboardingStep = 'welcome' | 'invite' | 'template' | 'config' | 'complete';

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
  completedSteps?: OnboardingStep[];
}

const steps = [
  { id: 'welcome', label: 'Welcome', description: 'Getting started' },
  { id: 'invite', label: 'Invite Bot', description: 'Add bot to server' },
  { id: 'template', label: 'Choose Template', description: 'Select setup template' },
  { id: 'config', label: 'Configure', description: 'Customize your bot' },
  { id: 'complete', label: 'Complete', description: 'All done!' }
] as const;

export function OnboardingProgress({ currentStep, completedSteps = [] }: OnboardingProgressProps) {
  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  
  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < currentStepIndex || completedSteps.includes(steps[stepIndex].id)) {
      return 'completed';
    } else if (stepIndex === currentStepIndex) {
      return 'current';
    } else {
      return 'upcoming';
    }
  };

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          const isLast = index === steps.length - 1;
          
          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                    ${status === 'completed' 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : status === 'current'
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                    }
                  `}
                >
                  {status === 'completed' ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, delay: 0.2 }}
                    >
                      <Check className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </motion.div>
                
                <div className="mt-2 text-center">
                  <div className={`text-sm font-medium ${
                    status === 'current' ? 'text-blue-600' : 
                    status === 'completed' ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-gray-400 hidden sm:block">
                    {step.description}
                  </div>
                </div>
              </div>
              
              {!isLast && (
                <div className="flex-1 mx-4">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: status === 'completed' ? 1 : 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
                    className="h-0.5 bg-green-500 origin-left"
                  />
                  <div className={`h-0.5 ${status === 'completed' ? 'bg-transparent' : 'bg-gray-300'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}