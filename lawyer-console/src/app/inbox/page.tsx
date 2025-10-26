"use client";

import { useState, useMemo, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import NewContactButton from "../_components/NewContactButton"; // ← relative import

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
  created_at: string; // ISO string
  meta?: unknown;
};

const base = "/api/backend";

// Generic, typed fetcher that never throws a non-Error
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  let data: unknown = undefined;
  try {
    data = await res.json();
  } catch {
    // ignore non-JSON
  }
  if (!res.ok) {
    const detail =
      (typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof (data as { detail?: string }).detail === "string" &&
        (data as { detail: string }).detail) ||
      `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return data as T;
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
  } = useSWR<Contact[]>(`${base}/contacts`, fetcher<Contact[]>, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    revalidateIfStale: true,
    dedupingInterval: 2000,
  });

  const rows: Contact[] = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data]
  );

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

  // Open thread with bulk add modal; backend will create the draft on bulk-add
  function sendDocs(contactId: string) {
    router.push(`/thread/${contactId}?open=bulk`);
  }

  async function approveLatestDraft(contactId: string) {
    setInfo(null);
    setError(null);
    try {
      // 1) fetch thread to find the newest draft
      const tRes = await fetch(`${base}/messages/thread/${contactId}`, {
        cache: "no-store",
      });
      let tj: unknown = undefined;
      try {
        tj = await tRes.json();
      } catch {
        // ignore
      }
      if (!tRes.ok) {
        const detail =
          (typeof tj === "object" &&
            tj !== null &&
            "detail" in tj &&
            typeof (tj as { detail?: string }).detail === "string" &&
            (tj as { detail: string }).detail) ||
          `Thread HTTP ${tRes.status}`;
        throw new Error(detail);
      }

      const messages: ThreadMessage[] =
        (typeof tj === "object" &&
          tj !== null &&
          "messages" in tj &&
          Array.isArray((tj as { messages: unknown }).messages) &&
          ((tj as { messages: unknown[] }).messages as ThreadMessage[])) ||
        [];

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

      // 2) approve & send
      const res = await fetch(`${base}/messages/approve/${latest.id}`, {
        method: "POST",
      });
      let body: unknown = undefined;
      try {
        body = await res.json();
      } catch {
        // ignore
      }
      if (!res.ok) {
        const detail =
          (typeof body === "object" &&
            body !== null &&
            "detail" in body &&
            typeof (body as { detail?: string }).detail === "string" &&
            (body as { detail: string }).detail) ||
          `Approve HTTP ${res.status}`;
        throw new Error(detail);
      }

      setInfo("Draft approved and enqueued to send.");
      void mutate();
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
          {/* New contact (opens your modal/page, depending on your component) */}
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
