import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-utils';
import { ReactNode } from 'react';

interface ServerAuthGuardProps {
  children: ReactNode;
  redirectTo?: string;
  requireAuth?: boolean;
}

export async function ServerAuthGuard({ 
  children, 
  redirectTo = '/auth/signin',
  requireAuth = true 
}: ServerAuthGuardProps) {
  const session = await getSession();

  if (requireAuth && !session) {
    redirect(redirectTo);
  }

  if (!requireAuth && session) {
    console.log('🔄 ServerAuthGuard: Would redirect to dashboard but disabled for debugging');
    // redirect('/dashboard'); // Temporarily disabled for debugging
  }

  return <>{children}</>;
}