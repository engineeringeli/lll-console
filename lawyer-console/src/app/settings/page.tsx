"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import SendDocsButton from "../../_components/SendDocsButton"
import { useRef } from "react"

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------
type Contact = {
  id: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  matter_type?: string
}

type Message = {
  id: string
  channel: "EMAIL" | "SMS"
  direction: "INBOUND" | "OUTBOUND" | "DRAFT"
  body: string
  created_at?: string
}

type ThreadResponse = {
  contact?: Contact
  messages?: Message[]
}

type DocItem = {
  client_doc_id: string
  requirement_id: string
  code: string
  label: string
  description?: string | null
  is_required: boolean
  status: "PENDING" | "UPLOADED" | "REJECTED"
  notes?: string | null
  uploaded_at?: string | null
  reviewed_at?: string | null
  source?: string
  created_by?: string
}

type FileRow = {
  id: string
  requirement_id: string | null
  storage_bucket: string
  storage_path: string
  bytes: number | null
  mime_type: string | null
  created_at: string
}

const base = "/api/backend" // proxy to FastAPI

// -------------------------------------------------------------
// Documents Panel (with Magic Link + Approve/Reject)
// -------------------------------------------------------------
function DocumentsPanel({
  contactId,
  openBulkOnMount = false,
  autoCreateLink = false,
  onAfterBulkAdd, // NEW: let parent (thread) refresh messages and/or show toasts
}: {
  contactId: string
  openBulkOnMount?: boolean
  autoCreateLink?: boolean
  onAfterBulkAdd?: () => void
}) {
  const [items, setItems] = useState<DocItem[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Magic link
  const [creatingLink, setCreatingLink] = useState(false)
  const [magicLink, setMagicLink] = useState<string | null>(null)

  // Add one
  const [showAdd, setShowAdd] = useState(false)
  const [label, setLabel] = useState("")
  const [desc, setDesc] = useState("")
  const [required, setRequired] = useState(true)

  // Bulk add
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState("")

  // Reject modal
  const [showReject, setShowReject] = useState(false)
  const [rejectReqId, setRejectReqId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectDraft, setRejectDraft] = useState(true)

  async function loadDocs() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${base}/docs/checklist/${contactId}`, { cache: "no-store" })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`)
      setItems(j.items || [])
      setFiles(j.files || [])
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (contactId) loadDocs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  // Listen for “open-bulk-add” custom event (from SendDocsButton)
  useEffect(() => {
    const handler = () => setShowBulk(true)
    window.addEventListener("open-bulk-add", handler)
    return () => window.removeEventListener("open-bulk-add", handler)
  }, [])

  // Auto-open bulk and/or create link when arriving with ?open=bulk
    const didAutoOpen = useRef(false)

  useEffect(() => {
  if (didAutoOpen.current) return
  if (openBulkOnMount) {
    setShowBulk(true)
    if (autoCreateLink) createMagicLink()
    didAutoOpen.current = true
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [openBulkOnMount, autoCreateLink])

  async function createMagicLink() {
    try {
      setCreatingLink(true)
      setError(null)
      const res = await fetch(`${base}/docs/magic-link/${contactId}`, { method: "POST" })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.detail || `MagicLink HTTP ${res.status}`)
      const url = j?.token
        ? `${(process.env.NEXT_PUBLIC_PORTAL_BASE_URL || window.location.origin)}/portal/${j.token}`
        : ""
      setMagicLink(url || null)
      setInfo("Upload link created.")
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setCreatingLink(false)
    }
  }

  async function addOne() {
    try {
      const res = await fetch(`${base}/docs/custom/${contactId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          description: desc || null,
          is_required: required,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.detail || `Add HTTP ${res.status}`)
      setShowAdd(false)
      setLabel("")
      setDesc("")
      setRequired(true)
      await loadDocs()
      setInfo("Document added.")
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  // After bulk add, draft the initial doc-request email.
  // Tries a dedicated kickoff route; if missing, falls back to older draft-initial route.
  async function draftInitialDocRequest() {
    try {
      // Preferred: backend route that composes a doc-specific initial draft
      let r = await fetch(`${base}/docs/kickoff/${contactId}`, { method: "POST" })
      if (!r.ok) {
        // Fallback to your existing initial draft route if kickoff not present
        r = await fetch(`${base}/messages/draft-initial/${contactId}`, { method: "POST" })
      }
      await r.json().catch(() => ({}))
    } catch {
      // non-fatal — user can still draft manually
    }
  }

  async function bulkAdd() {
    try {
      const labels = bulkText.split("\n").map(s => s.trim()).filter(Boolean)
      if (labels.length === 0) throw new Error("Enter at least one line.")
      const res = await fetch(`${base}/docs/custom/${contactId}/bulk-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels, description: null, is_required: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.detail || `Bulk add HTTP ${res.status}`)

      setShowBulk(false); setBulkText("")
      await loadDocs()
      setInfo(`Added ${j.added ?? labels.length} documents.`)

      // Make sure there is a client link available
      if (!magicLink) await createMagicLink()

      // Draft the initial message that lists the required docs + link
      await draftInitialDocRequest()

      // Let the parent (thread) refresh messages panel
      onAfterBulkAdd?.()
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  async function approveRequirement(requirementId: string) {
    try {
      const res = await fetch(`${base}/docs/review/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, requirement_id: requirementId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.detail || `Approve HTTP ${res.status}`)
      await loadDocs()
      setInfo("Document approved.")
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  async function submitReject() {
    if (!rejectReqId) return
    try {
      const res = await fetch(`${base}/docs/review/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          requirement_id: rejectReqId,
          reason: rejectReason.trim(),
          create_followup_draft: rejectDraft,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.detail || `Reject HTTP ${res.status}`)
      setShowReject(false)
      setRejectReqId(null)
      setRejectReason("")
      setRejectDraft(true)
      await loadDocs()
      setInfo("Document rejected.")
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  function copyLink() {
    if (!magicLink) return
    navigator.clipboard.writeText(magicLink).then(() => {
      setInfo("Link copied to clipboard.")
      setTimeout(() => setInfo(null), 1500)
    })
  }

  function fileCountFor(reqId: string) {
    return files.filter(f => f.requirement_id === reqId).length
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
            onClick={createMagicLink}
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
            <a className="border border-slate-600 rounded px-2 py-1" href={magicLink} target="_blank" rel="noreferrer">Open</a>
            <button className="border border-slate-600 rounded px-2 py-1" onClick={copyLink}>Copy</button>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-slate-400">Loading…</div>}
      {error && <div className="text-sm text-rose-400">Error: {error}</div>}
      {info && <div className="text-sm text-emerald-400">{info}</div>}

      {items.length === 0 && !loading && (
        <div className="border border-slate-700 rounded p-4 bg-slate-900/40 text-slate-300">
          <div className="text-slate-100 font-medium mb-1">No documents yet</div>
          <div className="text-sm mb-3">Add the documents this client must provide, then send them an upload link.</div>
          <div className="flex gap-2">
            <button className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm" onClick={() => setShowAdd(true)}>Add document</button>
            <button className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm" onClick={() => setShowBulk(true)}>Bulk add</button>
            <button className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm" onClick={createMagicLink}>Create upload link</button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded border border-slate-800 divide-y divide-slate-800">
          {items.map((it) => (
            <div key={it.client_doc_id} className="p-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{it.label}</div>
                {it.description && <div className="text-sm text-slate-400">{it.description}</div>}
                <div className="text-xs text-slate-500 mt-1">
                  {it.is_required ? "Required" : "Optional"} · Status: {it.status}
                  {it.uploaded_at ? ` · Uploaded ${new Date(it.uploaded_at).toLocaleString()}` : ""}
                  {fileCountFor(it.requirement_id) > 0 ? ` · Files: ${fileCountFor(it.requirement_id)}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="border border-emerald-600 bg-emerald-900/30 hover:bg-emerald-900/50 rounded px-3 py-1 text-sm disabled:opacity-50"
                  disabled={!(it.status === "UPLOADED" || it.status === "REJECTED")}
                  onClick={() => approveRequirement(it.requirement_id)}
                >
                  Approve
                </button>
                <button
                  className="border border-rose-600 bg-rose-900/30 hover:bg-rose-900/50 rounded px-3 py-1 text-sm"
                  onClick={() => { setRejectReqId(it.requirement_id); setShowReject(true); }}
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
            <input className="w-full border border-slate-700 rounded p-2 bg-slate-950 text-slate-100" placeholder="Label (e.g., Driver’s license front)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <textarea className="w-full h-24 border border-slate-700 rounded p-2 bg-slate-950 text-slate-100" placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Required
            </label>
            <div className="flex justify-end gap-2">
              <button className="border border-slate-600 rounded px-3 py-1 text-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm" onClick={addOne} disabled={!label.trim()}>Add</button>
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
            <textarea className="w-full h-40 border border-slate-700 rounded p-2 bg-slate-950 text-slate-100" placeholder="One per line…" value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="border border-slate-600 rounded px-3 py-1 text-sm" onClick={() => setShowBulk(false)}>Cancel</button>
              <button className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm" onClick={bulkAdd} disabled={bulkText.trim().length === 0}>Add all</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded p-4 w-full max-w-md space-y-3">
            <div className="text-lg font-semibold">Reject document</div>
            <textarea className="w-full h-28 border border-slate-700 rounded p-2 bg-slate-950 text-slate-100" placeholder="Explain why this upload needs to be resubmitted…" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rejectDraft} onChange={(e) => setRejectDraft(e.target.checked)} />
              Create follow-up draft email with upload link
            </label>
            <div className="flex justify-end gap-2">
              <button className="border border-slate-600 rounded px-3 py-1 text-sm" onClick={() => setShowReject(false)}>Cancel</button>
              <button className="border border-rose-600 bg-rose-900/30 hover:bg-rose-900/50 rounded px-3 py-1 text-sm" onClick={submitReject} disabled={!rejectReqId || !rejectReason.trim()}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// -------------------------------------------------------------
// Thread Page
// -------------------------------------------------------------
export default function ThreadPage() {
  const params = useParams()
  const search = useSearchParams()
  const router = useRouter()
  const id = params?.id as string

  const [contact, setContact] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Contact panel state
  const [showContact, setShowContact] = useState(false)

  // Edit draft modal state
  const [editId, setEditId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")

  const openBulk = search?.get("open") === "bulk"

  useEffect(() => {
  if (openBulk) {
    // Strip the query param so refreshes don't auto-open again
    router.replace(`/thread/${id}`, { scroll: false })
  }
}, [openBulk, id, router])

  async function loadThread() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${base}/messages/thread/${id}`, { cache: "no-store" })
      const j: ThreadResponse = await res.json()
      if (!res.ok) throw new Error((j as any)?.detail || `HTTP ${res.status}`)
      setContact(j.contact ?? null)
      setMessages(j.messages ?? [])
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) loadThread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function approveDraft(msgId: string) {
    try {
      const res = await fetch(`${base}/messages/approve/${msgId}`, { method: "POST" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.detail || `Approve HTTP ${res.status}`)
      setInfo("Draft approved and queued to send.")
      await loadThread()
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  async function saveDraft() {
    if (!editId) return
    try {
      const res = await fetch(`${base}/messages/draft-update/${editId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.detail || `Save HTTP ${res.status}`)
      const res2 = await fetch(`${base}/messages/thread/by-message/${editId}`, { cache: "no-store" })
      const j2 = await res2.json()
      if (!res2.ok) throw new Error(j2?.detail || `Reload HTTP ${res2.status}`)
      setContact(j2.contact ?? null)
      setMessages(j2.messages ?? [])
      setEditId(null)
      setEditBody("")
      setInfo("Draft updated.")
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  const fullName = contact ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() : ""
  const subtitle = contact?.matter_type ? `Matter: ${contact.matter_type}` : contact?.email || contact?.phone || ""

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
          <h1 className="text-2xl font-semibold mt-1">{fullName || "Thread"}</h1>
          {subtitle && <div className="text-slate-400 text-sm mt-1">{subtitle}</div>}
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
            {messages.length === 0 && <div className="p-4 text-slate-400">No messages yet.</div>}
            {messages.map((m) => (
              <div key={m.id} className="p-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <div>{m.channel} · {m.direction}</div>
                  {m.created_at && <div>{new Date(m.created_at).toLocaleString()}</div>}
                </div>
                <div className="whitespace-pre-wrap text-slate-100">{m.body}</div>
                {m.direction === "DRAFT" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      className="border border-emerald-600 bg-emerald-900/30 hover:bg-emerald-900/50 rounded px-3 py-1 text-sm"
                      onClick={() => approveDraft(m.id)}
                    >
                      Approve & send
                    </button>
                    <button
                      className="border border-slate-600 bg-slate-800 hover:bg-slate-700 rounded px-3 py-1 text-sm"
                      onClick={() => { setEditId(m.id); setEditBody(m.body) }}
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
          onAfterBulkAdd={loadThread}   // <-- refresh messages after drafting initial
        />
      </div>

      {/* Contact modal & Edit draft modal (unchanged) */}
      {/* ... keep your existing modals below if you had them previously ... */}
    </main>
  )
}
