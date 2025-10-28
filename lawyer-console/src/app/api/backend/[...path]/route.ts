import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL!; // e.g. https://www.api.legalleadliaison.com

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

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function handler(req: NextRequest, ctx: { params: { path: string[] } }) {
  if (!API_BASE) return new Response("API_BASE_URL env not set", { status: 500 });

  const urlObj = new URL(req.url);
  const dbg = urlObj.searchParams.get("__dbg") === "1";
  urlObj.searchParams.delete("__dbg");

  const target = buildUpstreamUrl(API_BASE, ctx.params.path, urlObj.searchParams.toString());

  const method = req.method.toUpperCase();
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(method);

  const ct = req.headers.get("content-type") || "";
  const isMultipart = ct.startsWith("multipart/form-data");
  const isJson = ct.startsWith("application/json");

  // Timeouts: give uploads and writes more time
  const timeoutMs = isMultipart ? 90_000 : isWrite ? 45_000 : 30_000;

  const init: RequestInit = {
    method,
    headers: pickHeaders(req),
    body: ["GET", "HEAD"].includes(method) ? undefined : await req.arrayBuffer(),
    redirect: "follow",
    cache: "no-store",
  };

  try {
    // one quick retry if we aborted once
    let upstream: Response;
    try {
      upstream = await fetchWithTimeout(target, init, timeoutMs);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        upstream = await fetchWithTimeout(target, init, Math.min(timeoutMs + 30_000, 120_000));
      } else {
        throw e;
      }
    }

    // Buffer so we can set correct headers (esp. strip content-encoding)
    const buf = await upstream.arrayBuffer();
    const textPeek = new TextDecoder().decode(buf.slice(0, 200));
    const upstreamType = upstream.headers.get("content-type") || "";

    if (dbg) {
      return Response.json(
        {
          proxy: {
            target,
            method,
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

    const headers = new Headers();
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (
        lk === "connection" ||
        lk === "transfer-encoding" ||
        lk === "content-length" ||
        lk === "content-encoding"
      ) return;
      headers.set(k, v);
    });
    headers.set("x-proxy-target", target);

    if (!headers.has("content-type")) {
      const t = textPeek.trim();
      headers.set(
        "content-type",
        t.startsWith("{") || t.startsWith("[")
          ? "application/json; charset=utf-8"
          : "text/plain; charset=utf-8"
      );
    }

    // If non-OK, coerce to JSON so client can .json()
    if (!upstream.ok) {
      let payload: any;
      try {
        payload = upstreamType.includes("application/json")
          ? JSON.parse(new TextDecoder().decode(buf))
          : { detail: new TextDecoder().decode(buf) || upstream.statusText || "Upstream error" };
      } catch {
        payload = { detail: "Upstream returned an unreadable body" };
      }
      return Response.json(
        { proxy: { target, method, status: upstream.status, statusText: upstream.statusText }, ...payload },
        { status: upstream.status, headers }
      );
    }

    return new Response(buf, { status: upstream.status, statusText: upstream.statusText, headers });
  } catch (e: any) {
    return Response.json(
      { detail: `Proxy error to ${target}: ${e?.message || String(e)}` },
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
