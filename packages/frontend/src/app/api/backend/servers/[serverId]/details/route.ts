import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: { serverId: string } }
) {
  console.log('🔥🔥🔥 SERVER DETAILS ROUTE HIT - serverId:', params.serverId);
  console.log('🔥🔥🔥 Request URL:', request.url);
  console.log('🔥🔥🔥 Request method:', request.method);
  
  try {
    console.log('🎯 Getting session...');
    const session = await getServerSession(authOptions);
    
    if (!session) {
      console.log('🎯 No session found');
      return NextResponse.json(
        { success: false, error: { message: 'No session found', code: 'NO_SESSION' } },
        { status: 401 }
      );
    }
    
    console.log('🎯 Session found, checking Discord tokens...');
    const discordTokens = (session as any).discordTokens;
    
    if (!discordTokens) {
      console.log('🎯 No Discord tokens in session');
      return NextResponse.json(
        { success: false, error: { message: 'No Discord tokens in session', code: 'NO_DISCORD_TOKENS' } },
        { status: 401 }
      );
    }
    
    console.log('🎯 Discord tokens found, making backend request...');
    // Create auth payload
    const authPayload = {
      code: 'nextauth_integration',
      discordUser: {
        id: discordTokens.discordId,
        username: discordTokens.discordUsername,
        avatar: discordTokens.discordAvatar,
        email: discordTokens.discordEmail,
      },
      discordTokens: {
        accessToken: discordTokens.discordAccessToken,
        refreshToken: discordTokens.discordRefreshToken,
        expiresIn: discordTokens.discordExpiresAt ? (discordTokens.discordExpiresAt - Math.floor(Date.now() / 1000)) : 3600,
      },
    };
    
    // Authenticate with backend
    console.log('🎯 Authenticating with backend...');
    const authResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authPayload),
    });

    if (!authResponse.ok) {
      console.log('🎯 Backend authentication failed:', authResponse.status);
      return NextResponse.json(
        { success: false, error: { message: 'Backend authentication failed', code: 'AUTH_FAILED' } },
        { status: 401 }
      );
    }

    const authData = await authResponse.json();
    if (!authData.success || !authData.data.token) {
      console.log('🎯 Backend authentication failed - no token');
      return NextResponse.json(
        { success: false, error: { message: 'Backend authentication failed', code: 'AUTH_FAILED' } },
        { status: 401 }
      );
    }

    const backendToken = authData.data.token;
    console.log('🎯 Auth successful, getting server details...');

    // Get server details from backend
    const response = await fetch(`${BACKEND_URL}/api/servers/${params.serverId}/details`, {
      headers: {
        'Authorization': `Bearer ${backendToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('🎯 Backend response:', response.status, data.success ? 'success' : 'failed');
    
    if (!response.ok) {
      console.log('🎯 Backend error details:', JSON.stringify(data, null, 2));
    }
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('🎯 Server details proxy error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString()
        } 
      },
      { status: 500 }
    );
  }
}