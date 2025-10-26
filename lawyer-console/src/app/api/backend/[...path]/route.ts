// app/api/backend/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";            // ensure Node runtime
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||  // fallback if you only set the public one
  "http://localhost:8000";                 // dev default

function joinUrl(base: string, path: string[], search: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.join("/").replace(/^\/+/, "");
  return `${b}/${p}${search ? `?${search}` : ""}`;
}

async function passthrough(
  req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  if (!API_BASE) {
    return new Response("API_BASE_URL env not set", { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const url = joinUrl(API_BASE, ctx.params.path ?? [], searchParams.toString());

  // Copy headers and remove hop-by-hop / confusing headers
  const out = new Headers(req.headers);
  out.delete("host");
  out.delete("connection");
  out.delete("transfer-encoding");
  out.delete("accept-encoding");
  out.delete("content-length");

  const init: RequestInit = {
    method: req.method,
    headers: out,
    // pass body for non-GET/HEAD
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
    cache: "no-store",
    // keep cookies flowing to upstream if you ever auth via cookies
    credentials: "include",
  };

  try {
    const upstream = await fetch(url, init);

    // Create a streamed response with upstream status & headers
    const res = new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
    });

    // Copy headers back (but skip hop-by-hop)
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (
        lk === "connection" ||
        lk === "transfer-encoding" ||
        lk === "content-length"
      )
        return;
      res.headers.set(k, v);
    });

    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Proxy error: ${msg}`, { status: 502 });
  }
}

export const GET = passthrough;
export const POST = passthrough;
export const PUT = passthrough;
export const PATCH = passthrough;
export const DELETE = passthrough;
// (OPTIONS rarely hit this because Next handles CORS automatically, but expose it anyway)
export const OPTIONS = passthrough;
