"use client";

import { useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (contactId?: string) => void;
};

export default function NewContactModal({ isOpen, onClose, onCreated }: Props) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [matter, setMatter] = useState("general");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/backend/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          first_name: first.trim(),
          last_name: last.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          matter_type: matter.trim() || "general",
          source: "console",
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`);

      // Try to find a contact id from common shapes
      const newId =
        j?.contact_id || j?.id || j?.contact?.id || j?.created_id || undefined;

      onClose();
      onCreated?.(newId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={onBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 shadow-xl text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h2 className="text-lg font-semibold">Add Contact</h2>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white px-2 py-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-rose-400 border border-rose-700 bg-rose-950/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 text-slate-300">First name</label>
              <input
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                className="w-full border border-slate-700 rounded px-3 py-2 bg-slate-950 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring focus:ring-sky-700/40"
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-300">Last name</label>
              <input
                value={last}
                onChange={(e) => setLast(e.target.value)}
                className="w-full border border-slate-700 rounded px-3 py-2 bg-slate-950 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring focus:ring-sky-700/40"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 text-slate-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-700 rounded px-3 py-2 bg-slate-950 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring focus:ring-sky-700/40"
                placeholder="client@example.com"
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-300">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-slate-700 rounded px-3 py-2 bg-slate-950 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring focus:ring-sky-700/40"
                placeholder="+1 555 555 5555"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1 text-slate-300">Matter type</label>
            <input
              value={matter}
              onChange={(e) => setMatter(e.target.value)}
              className="w-full border border-slate-700 rounded px-3 py-2 bg-slate-950 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring focus:ring-sky-700/40"
              placeholder="general"
            />
            <div className="text-xs text-slate-400 mt-1">
              Used to pick the right document template/cadence later.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="border border-slate-600 rounded px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || (!first.trim() && !email.trim() && !phone.trim())}
            className="border border-emerald-600 bg-emerald-900/40 hover:bg-emerald-900/60 rounded px-3 py-1.5 text-sm disabled:opacity-50"
            title="Create contact"
          >
            {saving ? "Creating…" : "Create Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}