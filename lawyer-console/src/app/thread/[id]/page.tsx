"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import SendDocsButton from "../../_components/SendDocsButton";

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------
type Contact = {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  matter_type?: string;
};

type Message = {
  id: string;
  channel: "EMAIL" | "SMS";
  direction: "INBOUND" | "OUTBOUND" | "DRAFT";
  body: string;
  created_at?: string;
};

type ThreadResponse = {
  contact?: Contact;
  messages?: Message[];
  // common error shape
  detail?: string;
};

type DocItem = {
  client_doc_id: string;
  requirement_id: string;
  code: string;
  label: string;
  description?: string | null;
  is_required: boolean;
  status: "PENDING" | "UPLOADED" | "REJECTED";
  notes?: string | null;
  uploaded_at?: string | null;
  reviewed_at?: string | null;
  source?: string;
  created_by?: string;
};

type FileRow = {
  id: string;
  requirement_id: string | null;
  storage_bucket: string;
  storage_path: string;
  bytes: number | null;
  mime_type: string | null;
  created_at: string;
};

type DocsChecklistResponse = {
  items?: DocItem[];
  files?: FileRow[];
  added?: number;
  token?: string; // magic-link token (when created)
  detail?: string;
};

const base = "/api/backend"; // proxy to FastAPI

// -------------------------------------------------------------
// Small helpers (typed JSON + message extractors)
// -------------------------------------------------------------
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const msg =
      (typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof (data as { detail?: string }).detail === "string" &&
        (data as { detail: string }).detail) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// -------------------------------------------------------------
// Documents Panel (with Magic Link + Approve/Reject)
// -------------------------------------------------------------
function DocumentsPanel({
  contactId,
  openBulkOnMount = false,
  autoCreateLink = false,
  onAfterBulkAdd,
}: {
  contactId: string;
  openBulkOnMount?: boolean;
  autoCreateLink?: boolean;
  onAfterBulkAdd?: () => void;
}) {
  const [items, setItems] = useState<DocItem[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Magic link
  const [creatingLink, setCreatingLink] = useState(false);
  const [magicLink, setMagicLink] = useState<string | null>(null);

  // Add one
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");
  const [required, setRequired] = useState(true);

  // Bulk add
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");

  // Reject modal
  const [showReject, setShowReject] = useState(false);
  const [rejectReqId, setRejectReqId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDraft, setRejectDraft] = useState(true);

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const j = await fetchJson<DocsChecklistResponse>(
        `${base}/docs/checklist/${contactId}`,
        { cache: "no-store" }
      );
      setItems(Array.isArray(j.items) ? j.items : []);
      setFiles(Array.isArray(j.files) ? j.files : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    if (contactId) void loadDocs();
  }, [contactId, loadDocs]);

  // Listen for “open-bulk-add” custom event (from SendDocsButton)
  useEffect(() => {
    const handler = () => setShowBulk(true);
    window.addEventListener("open-bulk-add", handler as EventListener);
    return () => window.removeEventListener("open-bulk-add", handler as EventListener);
  }, []);

  // Auto-open bulk and/or create link when arriving with ?open=bulk
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current) return;
    if (openBulkOnMount) {
      setShowBulk(true);
      if (autoCreateLink) void createMagicLink();
      didAutoOpen.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBulkOnMount, autoCreateLink]);

  async function createMagicLink() {
    try {
      setCreatingLink(true);
      setError(null);
      const j = await fetchJson<DocsChecklistResponse>(
        `${base}/docs/magic-link/${contactId}`,
        { method: "POST" }
      );
      const url =
        j?.token
          ? `${(process.env.NEXT_PUBLIC_PORTAL_BASE_URL ||
              window.location.origin)}/portal/${j.token}`
          : "";
      setMagicLink(url || null);
      setInfo("Upload link created.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingLink(false);
    }
  }

  async function addOne() {
    try {
      const j = await fetchJson<DocsChecklistResponse>(
        `${base}/docs/custom/${contactId}/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            description: desc || null,
            is_required: required,
          }),
        }
      );
      setShowAdd(false);
      setLabel("");
      setDesc("");
      setRequired(true);
      await loadDocs();
      setInfo(j?.detail ?? "Document added.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Draft the initial doc-request email (best-effort)
  async function draftInitialDocRequest() {
    try {
      // Preferred kickoff route
      let ok = true;
      try {
        await fetchJson<Record<string, unknown>>(
          `${base}/docs/kickoff/${contactId}`,
          { method: "POST" }
        );
      } catch {
        ok = false;
      }
      if (!ok) {
        await fetchJson<Record<string, unknown>>(
          `${base}/messages/draft-initial/${contactId}`,
          { method: "POST" }
        );
      }
    } catch {
      // non-fatal; user can draft manually
    }
  }

  async function bulkAdd() {
    try {
      const labels = bulkText.split("\n").map((s) => s.trim()).filter(Boolean);
      if (labels.length === 0) throw new Error("Enter at least one line.");
      const j = await fetchJson<DocsChecklistResponse>(
        `${base}/docs/custom/${contactId}/bulk-add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labels, description: null, is_required: true }),
        }
      );

      setShowBulk(false);
      setBulkText("");
      await loadDocs();
      setInfo(`Added ${j.added ?? labels.length} documents.`);

      // Make sure a client link exists
      if (!magicLink) await createMagicLink();

      // Draft the initial message listing required docs + link
      await draftInitialDocRequest();

      // Let parent refresh messages
      onAfterBulkAdd?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function approveRequirement(requirementId: string) {
    try {
      await fetchJson<Record<string, unknown>>(`${base}/docs/review/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          requirement_id: requirementId,
        }),
      });
      await loadDocs();
      setInfo("Document approved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submitReject() {
    if (!rejectReqId) return;
    try {
      await fetchJson<Record<string, unknown>>(`${base}/docs/review/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          requirement_id: rejectReqId,
          reason: rejectReason.trim(),
          create_followup_draft: rejectDraft,
        }),
      });
      setShowReject(false);
      setRejectReqId(null);
      setRejectReason("");
      setRejectDraft(true);
      void loadDocs();
      setInfo("Document rejected.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function copyLink() {
    if (!magicLink) return;
    void navigator.clipboard.writeText(magicLink).then(() => {
      setInfo("Link copied to clipboard.");
      window.setTimeout(() => setInfo(null), 1500);
    });
  }

  function fileCountFor(reqId: string) {
    return files.filter((f) => f.requirement_id === reqId).length;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Documents</h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm"
            onClick={() => setShowAdd(true)}
          >
            Add document
          </button>
          <button
            className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm"
            onClick={() => setShowBulk(true)}
          >
            Bulk add
          </button>
          <button
            className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm"
            onClick={() => void createMagicLink()}
            disabled={creatingLink}
            title="Generate a client upload link"
          >
            {creatingLink ? "Creating…" : "Create upload link"}
          </button>
        </div>
      </div>

      {magicLink && (
        <div className="border border-slate-700 rounded p-3 bg-slate-900/40 text-sm flex items-center justify-between gap-3">
          <div className="truncate">{magicLink}</div>
          <div className="flex gap-2">
            <a
              className="border border-slate-600 rounded px-2 py-1"
              href={magicLink}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
            <button
              className="border border-slate-600 rounded px-2 py-1"
              onClick={copyLink}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-slate-400">Loading…</div>}
      {error && <div className="text-sm text-rose-400">Error: {error}</div>}
      {info && <div className="text-sm text-emerald-400">{info}</div>}

      {items.length === 0 && !loading && (
        <div className="border border-slate-700 rounded p-4 bg-slate-900/40 text-slate-300">
          <div className="text-slate-100 font-medium mb-1">No documents yet</div>
          <div className="text-sm mb-3">
            Add the documents this client must provide, then send them an upload
            link.
          </div>
          <div className="flex gap-2">
            <button
              className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm"
              onClick={() => setShowAdd(true)}
            >
              Add document
            </button>
            <button
              className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm"
              onClick={() => setShowBulk(true)}
            >
              Bulk add
            </button>
            <button
              className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm"
              onClick={() => void createMagicLink()}
            >
              Create upload link
            </button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded border border-slate-800 divide-y divide-slate-800">
          {items.map((it) => (
            <div
              key={it.client_doc_id}
              className="p-3 flex items-start justify-between gap-3"
            >
              <div>
                <div className="font-medium">{it.label}</div>
                {it.description && (
                  <div className="text-sm text-slate-400">{it.description}</div>
                )}
                <div className="text-xs text-slate-500 mt-1">
                  {it.is_required ? "Required" : "Optional"} · Status: {it.status}
                  {it.uploaded_at
                    ? ` · Uploaded ${new Date(it.uploaded_at).toLocaleString()}`
                    : ""}
                  {fileCountFor(it.requirement_id) > 0
                    ? ` · Files: ${fileCountFor(it.requirement_id)}`
                    : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="border border-emerald-600 bg-emerald-900/30 hover:bg-emerald-900/50 rounded px-3 py-1 text-sm disabled:opacity-50"
                  disabled={
                    !(it.status === "UPLOADED" || it.status === "REJECTED")
                  }
                  onClick={() => void approveRequirement(it.requirement_id)}
                >
                  Approve
                </button>
                <button
                  className="border border-rose-600 bg-rose-900/30 hover:bg-rose-900/50 rounded px-3 py-1 text-sm"
                  onClick={() => {
                    setRejectReqId(it.requirement_id);
                    setShowReject(true);
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded p-4 w-full max-w-md space-y-3">
            <div className="text-lg font-semibold">Add document</div>
            <input
              className="w-full border border-slate-700 rounded p-2 bg-slate-950 text-slate-100"
              placeholder="Label (e.g., Driver’s license front)"
              value={label}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setLabel(e.target.value)
              }
            />
            <textarea
              className="w-full h-24 border border-slate-700 rounded p-2 bg-slate-950 text-slate-100"
              placeholder="Description (optional)"
              value={desc}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setDesc(e.target.value)
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={required}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRequired(e.target.checked)
                }
              />
              Required
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="border border-slate-600 rounded px-3 py-1 text-sm"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </button>
              <button
                className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm"
                onClick={() => void addOne()}
                disabled={!label.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk add modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded p-4 w-full max-w-lg space-y-3">
            <div className="text-lg font-semibold">Bulk add</div>
            <div className="text-sm text-slate-300">
              Paste one label per line. Example:
              <pre className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded text-xs">
{`Government ID (front)
Proof of address
Signed authorization
Prior-year return PDF`}
              </pre>
            </div>
            <textarea
              className="w-full h-40 border border-slate-700 rounded p-2 bg-slate-950 text-slate-100"
              placeholder="One per line…"
              value={bulkText}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setBulkText(e.target.value)
              }
            />
            <div className="flex justify-end gap-2">
              <button
                className="border border-slate-600 rounded px-3 py-1 text-sm"
                onClick={() => setShowBulk(false)}
              >
                Cancel
              </button>
              <button
                className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm"
                onClick={() => void bulkAdd()}
                disabled={bulkText.trim().length === 0}
              >
                Add all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded p-4 w-full max-w-md space-y-3">
            <div className="text-lg font-semibold">Reject document</div>
            <textarea
              className="w-full h-28 border border-slate-700 rounded p-2 bg-slate-950 text-slate-100"
              placeholder="Explain why this upload needs to be resubmitted…"
              value={rejectReason}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setRejectReason(e.target.value)
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rejectDraft}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRejectDraft(e.target.checked)
                }
              />
              Create follow-up draft email with upload link
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="border border-slate-600 rounded px-3 py-1 text-sm"
                onClick={() => setShowReject(false)}
              >
                Cancel
              </button>
              <button
                className="border border-rose-600 bg-rose-900/30 hover:bg-rose-900/50 rounded px-3 py-1 text-sm"
                onClick={() => void submitReject()}
                disabled={!rejectReqId || !rejectReason.trim()}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// -------------------------------------------------------------
// Thread Page
// -------------------------------------------------------------
export default function ThreadPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = params.id;

  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Contact panel state (value is unused; setter is used)
  const [_showContact, setShowContact] = useState(false);

  // Edit draft modal state
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const openBulk = search.get("open") === "bulk";

  useEffect(() => {
    if (openBulk) {
      // Strip the query param so refreshes don't auto-open again
      router.replace(`/thread/${id}`, { scroll: false });
    }
  }, [openBulk, id, router]);

  const loadThread = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const j = await fetchJson<ThreadResponse>(
        `${base}/messages/thread/${id}`,
        { cache: "no-store" }
      );
      setContact(j.contact ?? null);
      setMessages(Array.isArray(j.messages) ? j.messages : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void loadThread();
  }, [id, loadThread]);

  async function approveDraft(msgId: string) {
    try {
      await fetchJson<Record<string, unknown>>(
        `${base}/messages/approve/${msgId}`,
        { method: "POST" }
      );
      setInfo("Draft approved and queued to send.");
      await loadThread();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Currently unused by UI; keep for future usage. (Prefixed to silence lint)
  async function _saveDraft() {
    if (!editId) return;
    try {
      await fetchJson<Record<string, unknown>>(
        `${base}/messages/draft-update/${editId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: editBody }),
        }
      );
      const j2 = await fetchJson<ThreadResponse>(
        `${base}/messages/thread/by-message/${editId}`,
        { cache: "no-store" }
      );
      setContact(j2.contact ?? null);
      setMessages(Array.isArray(j2.messages) ? j2.messages : []);
      setEditId(null);
      setEditBody("");
      setInfo("Draft updated.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const fullName = contact
    ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
    : "";
  const subtitle = contact?.matter_type
    ? `Matter: ${contact.matter_type}`
    : contact?.email || contact?.phone || "";

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            className="text-sm text-slate-400 hover:text-slate-200"
            onClick={() => router.push("/inbox")}
            aria-label="Back to inbox"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-semibold mt-1">
            {fullName || "Thread"}
          </h1>
          {subtitle && (
            <div className="text-slate-400 text-sm mt-1">{subtitle}</div>
          )}
        </div>

        <div className="flex gap-2">
          <SendDocsButton contactId={id} />
          <button
            className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm"
            onClick={() => setShowContact(true)}
            title="View contact details"
          >
            Contact
          </button>
        </div>
      </div>

      {/* Notices */}
      {loading && <div className="text-sm text-slate-400">Loading…</div>}
      {error && <div className="text-sm text-rose-400">Error: {error}</div>}
      {info && <div className="text-sm text-emerald-400">{info}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Messages */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Message thread</h2>
          <div className="rounded border border-slate-800 divide-y divide-slate-800">
            {messages.length === 0 && (
              <div className="p-4 text-slate-400">No messages yet.</div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="p-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <div>
                    {m.channel} · {m.direction}
                  </div>
                  {m.created_at && (
                    <div>{new Date(m.created_at).toLocaleString()}</div>
                  )}
                </div>
                <div className="whitespace-pre-wrap text-slate-100">
                  {m.body}
                </div>
                {m.direction === "DRAFT" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      className="border border-emerald-600 bg-emerald-900/30 hover:bg-emerald-900/50 rounded px-3 py-1 text-sm"
                      onClick={() => void approveDraft(m.id)}
                    >
                      Approve & send
                    </button>
                    <button
                      className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm"
                      onClick={() => {
                        setEditId(m.id);
                        setEditBody(m.body);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Right: Documents */}
        <DocumentsPanel
          contactId={id}
          openBulkOnMount={openBulk}
          autoCreateLink={openBulk}
          onAfterBulkAdd={loadThread} // refresh messages after drafting initial
        />
      </div>

      {/* Contact modal & Edit draft modal: keep your existing ones here if needed */}
    </main>
  );
}
