"use client";

import { useState, useMemo, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import NewContactButton from "../_components/NewContactButton";

type ContactWire = {
  id: string;
  // accept both shapes
  first_name?: string | null;
  last_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
};

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

type ThreadMessage = {
  id: string;
  channel: "EMAIL" | "SMS";
  direction: "DRAFT" | "OUTBOUND" | "INBOUND";
  body: string;
  created_at: string;
  meta?: unknown;
};

const base = "/api/backend";

// Robust fetcher + console logging for visibility
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.warn("Non-JSON response from", url, text);
    throw new Error(`Expected JSON from ${url}, got text (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const detail =
      (typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof (data as any).detail === "string" &&
        (data as any).detail) || `HTTP ${res.status}`;
    console.error("Fetcher error:", url, detail, data);
    throw new Error(detail);
  }
  console.log("Fetcher OK:", url, data);
  return data as T;
}

// Normalize snake_case | camelCase → snake_case for the UI
function normalize(w: ContactWire): Contact {
  const first =
    (w.first_name ?? w.firstName ?? "") || null;
  const last =
    (w.last_name ?? w.lastName ?? "") || null;
  return {
    id: w.id,
    first_name: first,
    last_name: last,
    email: (w as any).email ?? null,
    phone: (w as any).phone ?? null,
    status: (w as any).status ?? "NEW",
  };
}

export default function InboxPage() {
  const router = useRouter();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const {
    data,
    error: swrErr,
    isLoading,
    mutate,
  } = useSWR<ContactWire[]>(`${base}/contacts`, fetcher<ContactWire[]>, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    revalidateIfStale: true,
    dedupingInterval: 2000,
  });

  const rows: Contact[] = useMemo(() => {
    const arr = Array.isArray(data) ? data : [];
    return arr.map(normalize);
  }, [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [
        r.first_name || "",
        r.last_name || "",
        r.email || "",
        r.phone || "",
        r.status || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, q]);

  function viewThread(contactId: string) {
    router.push(`/thread/${contactId}`);
  }

  function sendDocs(contactId: string) {
    router.push(`/thread/${contactId}?open=bulk`);
  }

  async function approveLatestDraft(contactId: string) {
    setInfo(null);
    setError(null);
    try {
      const tRes = await fetch(`${base}/messages/thread/${contactId}`, {
        cache: "no-store",
      });
      const tj = await tRes.json().catch(() => ({}));
      if (!tRes.ok) {
        const detail =
          (tj && typeof tj === "object" && "detail" in tj && (tj as any).detail) ||
          `Thread HTTP ${tRes.status}`;
        throw new Error(detail);
      }
      const messages: ThreadMessage[] = Array.isArray((tj as any).messages)
        ? (tj as any).messages
        : [];
      const drafts = messages.filter((m) => m.direction === "DRAFT");
      if (drafts.length === 0) {
        setInfo("No draft to approve for this contact.");
        return;
      }
      drafts.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latest = drafts[0];

      const res = await fetch(`${base}/messages/approve/${latest.id}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          (body && typeof body === "object" && "detail" in body && (body as any).detail) ||
          `Approve HTTP ${res.status}`;
        throw new Error(detail);
      }

      setInfo("Draft approved and enqueued to send.");
      await mutate();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Approve failed: ${message}`);
    }
  }

  function onSearchChange(e: ChangeEvent<HTMLInputElement>) {
    setQ(e.target.value);
  }

  return (
    <div className="p-6 space-y-4">
      {/* Tiny debug chip so we can see list state at a glance */}
      <div className="text-xs opacity-70">
        Debug — isLoading: {String(isLoading)} • error:{" "}
        {String((swrErr && (swrErr as Error).message) || "none")} • rows:{" "}
        {rows.length}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <div className="flex items-center gap-2">
          <input
            className="w-64 max-w-full border border-slate-700 rounded px-3 py-1.5 bg-slate-950 text-slate-100 text-sm"
            placeholder="Search name, email, phone, status…"
            value={q}
            onChange={onSearchChange}
          />
          <button
            onClick={() => mutate()}
            className="border border-slate-600 rounded px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700"
            title="Refresh now"
          >
            Refresh
          </button>
          <NewContactButton />
        </div>
      </div>

      {isLoading && <div>Loading…</div>}
      {(swrErr || error) && (
        <div className="text-sm text-red-500">
          Error: {String((swrErr && (swrErr as Error).message) || error)}
        </div>
      )}
      {info && <div className="text-sm text-emerald-400">{info}</div>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-sm opacity-70">No contacts found.</div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs opacity-70">
            Showing {filtered.length} contact(s)
          </div>
          {filtered.map((r) => (
            <div
              key={r.id}
              className="border border-slate-800 rounded p-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">
                  {(r.first_name || "") + " " + (r.last_name || "")}
                </div>
                <div className="text-sm opacity-70">
                  {r.email} · {r.phone}
                </div>
                <div className="text-xs mt-1">Status: {r.status}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="border rounded px-3 py-1 text-sm bg-sky-900/40 border-sky-600 hover:bg-sky-900/60"
                  onClick={() => sendDocs(r.id)}
                  title="Open the thread and bulk add the document list"
                >
                  Send Docs
                </button>
                <button
                  className="border rounded px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700"
                  onClick={() => viewThread(r.id)}
                >
                  View Thread
                </button>
                <button
                  className="border rounded px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700"
                  onClick={() => approveLatestDraft(r.id)}
                >
                  Approve &amp; Send Latest Draft
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
