// app/api/backend/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"; // dev

function buildUpstreamUrl(base: string, pathSegs: string[], search: string) {
  const b = base.replace(/\/+$/, "");
  const p = (pathSegs ?? []).map(encodeURIComponent).join("/");
  return `${b}/${p}${search ? `?${search}` : ""}`;
}

function pickHeaders(req: NextRequest): Headers {
  const h = new Headers();
  // Allow-list only what the upstream actually needs
  const allow = new Set([
    "authorization",
    "content-type",
    "accept",
    "x-requested-with",
    "x-api-key",
  ]);
  req.headers.forEach((v, k) => {
    if (allow.has(k.toLowerCase())) h.set(k, v);
  });
  return h;
}

async function passthrough(req: NextRequest, ctx: { params: { path: string[] } }) {
  if (!API_BASE) {
    return new Response("API_BASE_URL env not set", { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const url = buildUpstreamUrl(API_BASE, ctx.params.path, searchParams.toString());

  // Time out slow upstreams so Vercel doesn't hold the lambda forever
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000); // 15s

  const init: RequestInit = {
    method: req.method,
    headers: pickHeaders(req),
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    // follow 301 from api -> www.api, etc.
    redirect: "follow",
    cache: "no-store",
    signal: controller.signal,
  };

  try {
    const upstream = await fetch(url, init);
    clearTimeout(timer);

    // Stream through status and body
    const res = new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
    });

    // Copy response headers back, skip hop-by-hop
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (lk === "connection" || lk === "transfer-encoding" || lk === "content-length") return;
      res.headers.set(k, v);
    });

    return res;
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    // Include target URL to make Vercel logs immediately actionable
    return new Response(`Proxy error to ${url}: ${msg}`, { status: 502 });
  }
}

// Same handler for all methods
export const GET = passthrough;
export const POST = passthrough;
export const PUT = passthrough;
export const PATCH = passthrough;
export const DELETE = passthrough;
export const OPTIONS = passthrough;
