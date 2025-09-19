import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function authHeader(req: NextRequest): Promise<string | null> {
  const hdr = req.headers.get('authorization');
  if (hdr && hdr.trim().toLowerCase().startsWith('bearer ')) return hdr;
  try {
    const session = await getServerSession(authOptions as any);
    const token = (session as any)?.backendToken;
    if (token) return `Bearer ${token}`;
  } catch {}
  try {
    const { origin } = new URL(req.url);
    const cookie = req.headers.get('cookie') || '';
    const resp = await fetch(`${origin}/api/auth/backend-token`, { headers: { cookie } });
    if (resp.ok) {
      const j = await resp.json();
      if (j?.token) return `Bearer ${j.token}`;
    }
  } catch {}
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const bearer = await authHeader(request);
    if (!bearer) return NextResponse.json({ success: false, error: { code: 'NO_AUTH' } }, { status: 401 });
    const body = await request.text();
    const url = `${BACKEND_URL}/api/tatum/simulate-payment`;
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: bearer }, body });
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_BACKEND_RESPONSE', raw: text } }, { status: 502 }); }
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    return NextResponse.json({ success: false, error: { code: 'PROXY_ERROR', message: 'Failed to simulate payment' } }, { status: 500 });
  }
}

