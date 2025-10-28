// app/api/backend/[...path]/route.ts
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL; // e.g. https://api.legalleadliaison.com

function buildUpstreamUrl(base: string, segs: string[] = [], search: string) {
  const b = base.replace(/\/+$/, "");
  const p = segs.map(encodeURIComponent).join("/");
  return `${b}/${p}${search ? `?${search}` : ""}`;
}

function pickHeaders(req: NextRequest): Headers {
  const h = new Headers();
  const allow = new Set([
    "authorization",
    "content-type",
    "accept",
    "cookie",
    "x-requested-with",
    "x-api-key",
    "user-agent",
    "accept-language",
    "origin",
    "referer",
  ]);
  req.headers.forEach((v, k) => {
    if (allow.has(k.toLowerCase())) h.set(k, v);
  });
  // Ensure we tell upstream we want JSON if available
  if (!h.has("accept")) h.set("accept", "application/json, */*;q=0.1");
  return h;
}

async function handler(req: NextRequest, ctx: { params: { path: string[] } }) {
  if (!API_BASE) return new Response("API_BASE_URL env not set", { status: 500 });

  const urlObj = new URL(req.url);
  const dbg = urlObj.searchParams.get("__dbg") === "1"; // debug mode
  urlObj.searchParams.delete("__dbg");

  const target = buildUpstreamUrl(API_BASE, ctx.params.path, urlObj.searchParams.toString());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

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
    clearTimeout(timer);

    const buf = await upstream.arrayBuffer();
    const textPeek = new TextDecoder().decode(buf.slice(0, 200));
    const contentType = upstream.headers.get("content-type") || "";

    // For normal mode, mirror upstream as closely as possible.
    if (!dbg) {
      // Make sure content-type is set so browsers don’t “blank page” on JSON
      const headers = new Headers();
      upstream.headers.forEach((v, k) => {
        const lk = k.toLowerCase();
        if (lk === "connection" || lk === "transfer-encoding" || lk === "content-length") return;
        headers.set(k, v);
      });
      if (!headers.has("content-type")) {
        if (textPeek.trim().startsWith("{") || textPeek.trim().startsWith("[")) {
          headers.set("content-type", "application/json; charset=utf-8");
        } else {
          headers.set("content-type", "text/plain; charset=utf-8");
        }
      }
      headers.set("x-proxy-target", target);
      return new Response(buf, { status: upstream.status, statusText: upstream.statusText, headers });
    }

    // Debug mode: wrap the upstream in a JSON envelope so you can see what's happening.
    const debugPayload = {
      proxy: {
        target,
        method: req.method,
        status: upstream.status,
        statusText: upstream.statusText,
        contentType,
        headers: Object.fromEntries(upstream.headers.entries()),
        bodyPreview: textPeek, // first 200 chars
      },
    };
    return Response.json(debugPayload, { status: upstream.status, headers: { "x-proxy-target": target } });

  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Proxy error to ${target}: ${msg}`, { status: 502, headers: { "x-proxy-target": target } });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
