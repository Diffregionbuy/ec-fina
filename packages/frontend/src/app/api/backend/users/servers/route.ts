import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'No session found', 
            code: 'NO_SESSION' 
          } 
        },
        { status: 401 }
      );
    }
    
    const discordTokens = (session as any).discordTokens;
    
    if (!discordTokens) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'No Discord tokens in session', 
            code: 'NO_DISCORD_TOKENS' 
          } 
        },
        { status: 401 }
      );
    }
    
    // Get backend token first
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
    const authResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authPayload),
    });

    if (!authResponse.ok) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Backend authentication failed', 
            code: 'AUTH_FAILED' 
          } 
        },
        { status: 401 }
      );
    }

    const authData = await authResponse.json();
    if (!authData.success || !authData.data.token) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Backend authentication failed', 
            code: 'AUTH_FAILED' 
          } 
        },
        { status: 401 }
      );
    }

    // Now make the actual API call to get servers
    const serversResponse = await fetch(`${BACKEND_URL}/api/users/servers`, {
      headers: {
        'Authorization': `Bearer ${authData.data.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!serversResponse.ok) {
      const errorText = await serversResponse.text();
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: errorText || 'Failed to fetch servers', 
            code: 'SERVERS_FETCH_FAILED' 
          } 
        },
        { status: serversResponse.status }
      );
    }

    const serversData = await serversResponse.json();
    return NextResponse.json(serversData);

  } catch (error) {
    console.error('API proxy error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          message: 'Internal server error', 
          code: 'INTERNAL_ERROR'
        } 
      },
      { status: 500 }
    );
  }
}