import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getBearerFromRequest(request: NextRequest): Promise<string | null> {
  const hdr = request.headers.get('authorization');
  if (hdr && hdr.trim().toLowerCase().startsWith('bearer ')) return hdr;

  try {
    const session = await getServerSession(authOptions as any);
    const backendToken = (session as any)?.backendToken;
    if (backendToken) return `Bearer ${backendToken}`;
  } catch {}

  try {
    const { origin } = new URL(request.url);
    const cookie = request.headers.get('cookie') || '';
    const tokenResp = await fetch(`${origin}/api/auth/backend-token`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache', cookie },
      cache: 'no-store',
    });
    if (tokenResp.ok) {
      const tokenData = await tokenResp.json();
      if (tokenData?.token) return `Bearer ${tokenData.token}`;
    }
  } catch {}
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const backendUrl = `${BACKEND_URL}/api/tatum/supported`;
    const bearer = await getBearerFromRequest(request);
    if (!bearer) return NextResponse.json({ success: false, error: { code: 'NO_AUTH' } }, { status: 401 });

    const resp = await fetch(backendUrl, { headers: { Authorization: bearer } });
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch {
      return NextResponse.json({ success: false, error: { code: 'INVALID_BACKEND_RESPONSE', raw: text } }, { status: 502 });
    }
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    return NextResponse.json({ success: false, error: { code: 'PROXY_ERROR', message: 'Failed to fetch tatum supported' } }, { status: 500 });
  }
}

