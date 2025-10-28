// app/api/backend/[...path]/route.ts
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL; // server-only; set in Vercel

function buildUpstreamUrl(base: string, pathSegs: string[] = [], search: string) {
  const b = base.replace(/\/+$/, "");
  const p = pathSegs.map(encodeURIComponent).join("/");
  return `${b}/${p}${search ? `?${search}` : ""}`;
}

function pickHeaders(req: NextRequest): Headers {
  const h = new Headers();
  // allow-list only what you truly need upstream
  const allow = new Set([
    "authorization",
    "content-type",
    "accept",
    "x-requested-with",
    "x-api-key",
    "cookie",            // include if your backend uses cookies/sessions
    "user-agent",
    "accept-language",
    "origin",
    "referer",
  ]);
  req.headers.forEach((v, k) => {
    if (allow.has(k.toLowerCase())) h.set(k, v);
  });
  return h;
}

async function handler(req: NextRequest, ctx: { params: { path: string[] } }) {
  if (!API_BASE) {
    return new Response("API_BASE_URL env not set", { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const target = buildUpstreamUrl(API_BASE, ctx.params.path, searchParams.toString());

  // Keep lambdas from hanging forever
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);

  const init: RequestInit = {
    method: req.method,
    headers: pickHeaders(req),
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    redirect: "follow",
    cache: "no-store",
    signal: controller.signal,
  };

  try {
    const upstream = await fetch(target, init);
    clearTimeout(t);

    // Buffer upstream body to avoid streaming quirks
    const body = await upstream.arrayBuffer();

    // Copy headers back (skip hop-by-hop)
    const headers = new Headers();
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (lk === "connection" || lk === "transfer-encoding" || lk === "content-length") return;
      headers.set(k, v);
    });

    // Optional: helpful for debugging in Network tab
    headers.set("x-proxy-target", target);

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Proxy error to ${target}: ${msg}`, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
