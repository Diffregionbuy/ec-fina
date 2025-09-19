import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Cache for backend tokens to prevent excessive requests
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getFreshBackendToken(session: any): Promise<string | null> {
  try {
    const discord = (session as any).discordTokens;
    if (!discord?.discordId) {
      console.warn('backend-token: No discordTokens on session; cannot refresh backend token');
      return null;
    }

    const expiresIn = Math.max(
      0,
      Math.floor((((discord.discordExpiresAt as number) || 0) * 1000 - Date.now()) / 1000)
    );

    const resp = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'nextauth_integration',
        discordUser: {
          id: discord.discordId,
          username: discord.discordUsername,
          avatar: discord.discordAvatar,
          email: discord.discordEmail,
        },
        discordTokens: {
          accessToken: discord.discordAccessToken,
          refreshToken: discord.discordRefreshToken,
          expiresIn,
        },
      }),
      cache: 'no-store',
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error('backend-token: backend /auth/login failed', resp.status, body);
      return null;
    }

    const data = await resp.json();
    const token = data?.data?.token || data?.token;
    if (!token) {
      console.error('backend-token: /auth/login response missing token field');
      return null;
    }

    return token as string;
  } catch (err) {
    console.error('backend-token: error refreshing backend token', err);
    return null;
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 });
    }

    const userId = (session as any).user?.id || (session as any).discordTokens?.discordId || 'unknown';
    const cacheKey = `token-${userId}`;
    
    // Check cache first
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ token: cached.token });
    }

    // Try session token first
    const existing = (session as any).backendToken as string | undefined;
    if (existing) {
      // Cache the existing token
      tokenCache.set(cacheKey, {
        token: existing,
        expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes cache
      });
      return NextResponse.json({ token: existing });
    }

    // Fallback: refresh from backend using Discord credentials carried in session
    const fresh = await getFreshBackendToken(session);
    if (fresh) {
      // Cache the fresh token
      tokenCache.set(cacheKey, {
        token: fresh,
        expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes cache
      });
      return NextResponse.json({ token: fresh });
    }

    return NextResponse.json({ error: 'No backend token found in session' }, { status: 401 });
  } catch (error) {
    console.error('Error getting backend token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of tokenCache.entries()) {
    if (value.expiresAt <= now) {
      tokenCache.delete(key);
    }
  }
}, 60000); // Clean up every minute