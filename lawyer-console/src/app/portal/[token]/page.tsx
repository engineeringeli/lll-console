"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

type PortalItem = {
  client_doc_id: string
  requirement_id: string
  label: string
  description?: string | null
  status: "PENDING" | "UPLOADED" | "REJECTED"
}

type PortalPayload = {
  contact: { id: string; first_name?: string; last_name?: string; email?: string; phone?: string; matter_type?: string }
  items: PortalItem[]
  expires_at?: string | null
}

const base = "/api/backend" // ← your existing proxy to FastAPI

export default function PortalPage() {
  const { token } = useParams() as { token: string }
  const [data, setData] = useState<PortalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`${base}/docs/portal/${token}`, { cache: "no-store" })
        if (!res.ok) {
          const text = await res.text()
          try {
            const maybe = JSON.parse(text)
            throw new Error(maybe?.detail || `HTTP ${res.status}`)
          } catch {
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
          }
        }

        const j = await res.json()
        setData(j)
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  if (loading) return <main className="p-4">Loading…</main>
  if (error)   return <main className="p-4 text-rose-400">Error: {error}</main>
  if (!data)   return <main className="p-4">No data.</main>

  const name = `${data.contact.first_name ?? ""} ${data.contact.last_name ?? ""}`.trim()

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Upload documents {name && `for ${name}`}</h1>
      {data.expires_at && (
        <div className="text-sm text-slate-400">
          Link expires: {new Date(data.expires_at).toLocaleString()}
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="text-slate-300">Your attorney hasn’t requested any documents yet.</div>
      ) : (
        <ul className="space-y-2">
          {data.items.map((it) => (
            <li key={it.client_doc_id} className="border border-slate-700 rounded p-3">
              <div className="font-medium">{it.label}</div>
              {it.description && <div className="text-sm text-slate-400">{it.description}</div>}
              <div className="text-xs text-slate-500 mt-1">Status: {it.status}</div>

              {/* Placeholder upload button (wire to your actual upload flow later) */}
              <button
                className="mt-2 border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm"
                onClick={async () => {
                  try {
                    // Example: pretend we already uploaded a file to storage and have its path
                    const fakePath = `uploads/${data.contact.id}/${it.requirement_id}/${Date.now()}-demo.txt`
                    const resp = await fetch(`${base}/docs/portal/${token}/upload`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        requirement_id: it.requirement_id,
                        storage_path: fakePath,
                        bytes: 123,
                        mime_type: "text/plain",
                      }),
                    })
                    const txt = await resp.text()
                    if (!resp.ok) {
                      try {
                        const maybe = JSON.parse(txt)
                        throw new Error(maybe?.detail || `HTTP ${resp.status}`)
                      } catch {
                        throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`)
                      }
                    }
                    alert("Upload recorded! (Demo)")
                    // Re-fetch to reflect new status
                    location.reload()
                  } catch (e: any) {
                    alert(`Upload error: ${e?.message || String(e)}`)
                  }
                }}
              >
                Upload (demo)
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
