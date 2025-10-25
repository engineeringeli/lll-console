'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LeadFormPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    matter_type: 'tax',
    source: 'web',
    honeypot: '' // hidden bot trap
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError(null); setOk(null)
    try {
      const res = await fetch('/api/backend/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`)
      setOk('Thanks! We’ll reach out shortly.')
      // Optional: navigate operator straight to the new thread
      // router.push(`/thread/${data.contact_id}`)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form className="w-full max-w-md space-y-3 border rounded-xl p-4" onSubmit={submit}>
        <h1 className="text-xl font-semibold">Request a quick consult</h1>

        <div className="grid grid-cols-2 gap-2">
          <input className="border rounded p-2" name="first_name" placeholder="First name" value={form.first_name} onChange={onChange} />
          <input className="border rounded p-2" name="last_name" placeholder="Last name" value={form.last_name} onChange={onChange} />
        </div>

        <input className="border rounded p-2 w-full" name="email" placeholder="Email" value={form.email} onChange={onChange} />
        <input className="border rounded p-2 w-full" name="phone" placeholder="Phone" value={form.phone} onChange={onChange} />

        <select className="border rounded p-2 w-full" name="matter_type" value={form.matter_type} onChange={onChange}>
          <option value="tax">Tax issue</option>
          <option value="family">Family</option>
          <option value="criminal">Criminal</option>
          <option value="immigration">Immigration</option>
          <option value="general">General</option>
        </select>

        {/* Honeypot: hidden field (bots fill it; humans don't) */}
        <input className="hidden" name="honeypot" value={form.honeypot} onChange={onChange} autoComplete="off" />

        <button
          type="submit"
          disabled={submitting}
          className="border rounded px-3 py-2 w-full"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>

        {ok && <div className="text-green-700 text-sm">{ok}</div>}
        {error && <div className="text-red-600 text-sm">Error: {error}</div>}
      </form>
    </div>
  )
}
