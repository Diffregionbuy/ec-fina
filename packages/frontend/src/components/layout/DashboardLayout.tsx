'use client';

import { ReactNode } from 'react';
import { DashboardHeader } from './DashboardHeader';
import { UnifiedSidebar } from './UnifiedSidebar';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simplified Header */}
      <DashboardHeader />
      
      <div className="flex">
        {/* Unified Sidebar with Server Selection + Navigation */}
        <UnifiedSidebar />
        
        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <main className="h-full overflow-y-auto p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}