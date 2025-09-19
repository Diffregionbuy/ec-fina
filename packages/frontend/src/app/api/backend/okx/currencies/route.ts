import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getBearerFromRequest(request: NextRequest): Promise<string | null> {
  // 1) Client-provided Authorization header (if any)
  const hdr = request.headers.get('authorization');
  if (hdr && hdr.trim().toLowerCase().startsWith('bearer ')) {
    return hdr;
  }

  // 2) NextAuth session backendToken
  try {
    const session = await getServerSession(authOptions as any);
    const backendToken = (session as any)?.backendToken;
    if (backendToken) {
      return `Bearer ${backendToken}`;
    }
  } catch {
    // ignore and continue to fallback
  }

  // 3) Fallback: call internal backend-token route with cookies
  try {
    const { origin } = new URL(request.url);
    const cookie = request.headers.get('cookie') || '';
    const tokenResp = await fetch(`${origin}/api/auth/backend-token`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        cookie,
      },
      cache: 'no-store',
    });
    if (tokenResp.ok) {
      const tokenData = await tokenResp.json();
      if (tokenData?.token) {
        return `Bearer ${tokenData.token}`;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export async function GET(request: NextRequest) {
  console.log('🔗 API Proxy: Received request for OKX currencies');
  console.log('🔗 API Proxy: Backend URL:', BACKEND_URL);

  try {
    const url = new URL(request.url);
    const search = url.search ? url.search : '';
    const backendUrl = `${BACKEND_URL}/api/okx/currencies${search}`;
    console.log('🔗 API Proxy: Forwarding to backend:', backendUrl);

    const bearer = await getBearerFromRequest(request);
    if (!bearer) {
      console.warn('🔗 API Proxy: Missing Authorization for OKX currencies');
      return NextResponse.json(
        { success: false, error: { code: 'NO_AUTH', message: 'Authorization required' } },
        { status: 401 }
      );
    }

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: bearer,
      },
    });

    console.log('🔗 API Proxy: Backend response status:', response.status, response.statusText);

    const text = await response.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_BACKEND_RESPONSE', message: 'Non-JSON from backend', raw: text } },
        { status: 502 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(data || { success: false, error: { message: 'Backend error' } }, { status: response.status });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('❌ API Proxy: Failed to proxy OKX currencies request:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'PROXY_ERROR', message: 'Failed to fetch currencies from backend', timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}