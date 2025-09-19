'use client';

import { Card } from '@/components/ui/Card';

interface SetupWizardStepProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function SetupWizardStep({ title, description, children }: SetupWizardStepProps) {
  return (
    <Card className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {title}
        </h2>
        <p className="text-gray-600">
          {description}
        </p>
      </div>
      
      {children}
    </Card>
  );
}