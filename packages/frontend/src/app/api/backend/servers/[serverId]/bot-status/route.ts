import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  request: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const serverId = params.serverId;
    // Prefer client-provided Authorization header
    let bearer = request.headers.get('authorization');

    // Try NextAuth session backend token first
    if (!bearer) {
      try {
        const session = await getServerSession(authOptions as any);
        const backendToken = (session as any)?.backendToken;
        if (backendToken) {
          bearer = `Bearer ${backendToken}`;
        }
      } catch {
        // ignore
      }
    }

    // Fallback: acquire backend token server-side by calling internal endpoint, forwarding cookies
    if (!bearer) {
      const { origin } = new URL(request.url);
      const cookie = request.headers.get('cookie') || '';
      try {
        const tokenResponse = await fetch(`${origin}/api/auth/backend-token`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            cookie,
          },
          cache: 'no-store',
        });
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          if (tokenData?.token) {
            bearer = `Bearer ${tokenData.token}`;
          }
        }
      } catch {
        // fall through; will return 401 if still no bearer
      }
    }

    if (!bearer) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_AUTH', message: 'Authorization required' } },
        { status: 401 }
      );
    }

    const backendResp = await fetch(`${BACKEND_URL}/api/servers/${serverId}/bot-status`, {
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json',
      },
    });

    const text = await backendResp.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = {
        success: false,
        error: { code: 'INVALID_BACKEND_RESPONSE', message: 'Backend returned non-JSON' },
      };
    }

    return NextResponse.json(json, { status: backendResp.status });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('bot-status route error:', error);
    }
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      },
      { status: 500 }
    );
  }
}
