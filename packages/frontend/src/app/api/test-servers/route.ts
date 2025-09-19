import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    console.log('🧪 Test servers API called');
    
    const session = await getServerSession(authOptions);
    console.log('🧪 Session:', session ? 'Found' : 'Not found');
    
    if (session) {
      console.log('🧪 Session user:', session.user);
      console.log('🧪 Discord tokens:', (session as any).discordTokens ? 'Found' : 'Not found');
    }
    
    return NextResponse.json({
      success: true,
      data: {
        hasSession: !!session,
        hasUser: !!session?.user,
        hasDiscordTokens: !!((session as any)?.discordTokens),
        sessionData: session ? {
          user: session.user,
          discordTokens: (session as any).discordTokens
        } : null
      }
    });
  } catch (error) {
    console.error('🧪 Test servers error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}