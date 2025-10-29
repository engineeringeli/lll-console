// app/api/backend/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Point this at your FastAPI base URL
// In dev: http://localhost:8000
// When tunneling: your NGROK URL (e.g., https://abc123.ngrok-free.app)
const BACKEND = process.env.API_BASE_URL || 'https://api.legalleadliaison.com';

async function passthrough(req: NextRequest, ctx: { params: { path: string[] } }) {
  const { search } = new URL(req.url);
  const path = '/' + (ctx.params.path?.join('/') ?? '');
  const url = `${BACKEND}${path}${search}`;

  // Forward body verbatim
  const body =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();

  // Copy headers but remove hop-by-hop / compression headers
  const outHeaders = new Headers(req.headers);
  outHeaders.delete('accept-encoding');
  outHeaders.delete('content-length');

  const resp = await fetch(url, {
    method: req.method,
    headers: outHeaders,
    body,
    cache: 'no-store',
  });

  // Stream response back, preserving headers & status
  const proxied = new NextResponse(resp.body, { status: resp.status });
  resp.headers.forEach((v, k) => proxied.headers.set(k, v));
  return proxied;
}

export const GET = passthrough;
export const POST = passthrough;
export const PUT = passthrough;
export const PATCH = passthrough;
export const DELETE = passthrough;
