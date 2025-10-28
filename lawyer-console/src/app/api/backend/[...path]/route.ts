// app/api/backend/[...path]/route.ts
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "";

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
  if (!h.has("accept")) h.set("accept", "application/json, */*;q=0.1");
  return h;
}

async function handler(req: NextRequest, ctx: { params: { path: string[] } }) {
  if (!API_BASE) {
    return Response.json({ detail: "API_BASE_URL env not set" }, { status: 500 });
  }

  const urlObj = new URL(req.url);
  const dbg = urlObj.searchParams.get("__dbg") === "1";
  urlObj.searchParams.delete("__dbg");

  const target = buildUpstreamUrl(API_BASE, ctx.params.path, urlObj.searchParams.toString());
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const timeoutMs = isWrite ? 45000 : 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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

    // Buffer so we can safely set headers and coerce on error
    const buf = await upstream.arrayBuffer();
    const textPeek = new TextDecoder().decode(buf.slice(0, 200));
    const upstreamType = upstream.headers.get("content-type") || "";

    if (dbg) {
      return Response.json(
        {
          proxy: {
            target,
            method: req.method,
            status: upstream.status,
            statusText: upstream.statusText,
            contentType: upstreamType,
            headers: Object.fromEntries(upstream.headers.entries()),
            bodyPreview: textPeek,
          },
        },
        { status: upstream.status, headers: { "x-proxy-target": target } }
      );
    }

    // If upstream OK, stream through as-is (keeping JSON/content-type if present)
    if (upstream.ok) {
      const headers = new Headers();
      upstream.headers.forEach((v, k) => {
        const lk = k.toLowerCase();
        if (lk === "connection" || lk === "transfer-encoding" || lk === "content-length") return;
        headers.set(k, v);
      });
      headers.set("x-proxy-target", target);
      // Ensure a sensible content-type fallback
      if (!headers.has("content-type")) {
        const t = textPeek.trim();
        headers.set(
          "content-type",
          t.startsWith("{") || t.startsWith("[")
            ? "application/json; charset=utf-8"
            : "text/plain; charset=utf-8"
        );
      }
      return new Response(buf, { status: upstream.status, statusText: upstream.statusText, headers });
    }

    // Non-OK: coerce to JSON so the client fetcher can always .json()
    let payload: any;
    try {
      payload = upstreamType.includes("application/json")
        ? JSON.parse(new TextDecoder().decode(buf))
        : { detail: new TextDecoder().decode(buf) || upstream.statusText || "Upstream error" };
    } catch {
      payload = { detail: "Upstream returned an unreadable body" };
    }

    return Response.json(
      {
        proxy: {
          target,
          method: req.method,
          status: upstream.status,
          statusText: upstream.statusText,
        },
        ...payload,
      },
      { status: upstream.status, headers: { "x-proxy-target": target } }
    );
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { detail: `Proxy error to ${target}: ${msg}` },
      { status: 502, headers: { "x-proxy-target": target } }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
