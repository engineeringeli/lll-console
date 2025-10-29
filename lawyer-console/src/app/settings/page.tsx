'use client';
import { useEffect, useState } from 'react';

type OrgSettings = {
  require_approval_initial: boolean;
  autosend_confidence_threshold: number;
  business_hours_tz: string;
  business_hours_start: number; // 0-23
  business_hours_end: number;   // 0-23
  cooldown_hours: number;       // 0-72
  max_daily_sends: number;      // 0-50
  grace_minutes: number;        // 0-120

  // NEW
  outbound_from_name: string;
  include_signature: boolean;
  signature: string;
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<OrgSettings | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const showErr = async (r: Response) => {
    let msg = `HTTP ${r.status}`;
    try {
      const text = await r.text();
      if (text) msg += ` — ${text}`;
    } catch { /* noop */ }
    throw new Error(msg);
  };

  // GET via proxy
  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/backend/org/settings', { cache: 'no-store' });
      if (!r.ok) await showErr(r);
      setS(await r.json());
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // PUT via proxy (partial updates)
  const save = async (patch: Partial<OrgSettings>) => {
    if (!s) return;
    setSaving(true);
    setError(null);
    const optimistic = { ...s, ...patch } as OrgSettings;
    setS(optimistic);
    try {
      const r = await fetch('/api/backend/org/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(patch),
      });
      if (!r.ok) await showErr(r);
      const next = (await r.json()) as OrgSettings;
      setS(next);
      setLastSaved(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(String(e?.message || e));
      // revert optimistic change
      await fetchSettings();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error)   return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!s)      return <div className="p-6">No settings found.</div>;

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <h1 className="text-xl font-semibold">Firm Settings</h1>

      {/* Outreach guardrails */}
      <section className="space-y-2">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={s.require_approval_initial}
            onChange={e => save({ require_approval_initial: e.target.checked })}
            disabled={saving}
          />
          <span>Require review before initial outreach is sent</span>
        </label>
        <p className="text-sm text-gray-600">
          Turn this off to allow initial outreach to auto-send when the AI’s confidence meets your threshold and it’s within business hours.
        </p>
      </section>

      {/* Email appearance */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Email appearance</h2>

        <div>
          <label className="block text-sm mb-1">Display “From” name</label>
          <input
            type="text"
            value={s.outbound_from_name || ''}
            onChange={e => setS({ ...s, outbound_from_name: e.target.value })}
            onBlur={() => save({ outbound_from_name: s.outbound_from_name })}
            placeholder="e.g., Jane Smith, Smith Law Group, Intake Team"
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
          <p className="text-sm text-gray-600 mt-1">
            Shown as the sender display name on emails.
          </p>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={!!s.include_signature}
            onChange={e => save({ include_signature: e.target.checked })}
            disabled={saving}
          />
          <span>Append signature to outbound emails</span>
        </label>

        <div>
          <label className="block text-sm mb-1">Signature</label>
          <textarea
            value={s.signature || ''}
            onChange={e => setS({ ...s, signature: e.target.value })}
            onBlur={() => save({ signature: s.signature })}
            placeholder={`Jane Smith\nSmith Law Group\n(555) 123-4567\nreply@firm.com`}
            rows={5}
            disabled={saving || !s.include_signature}
            className="border rounded px-2 py-2 w-full font-mono"
          />
          <p className="text-sm text-gray-600 mt-1">
            Plain text is fine — line breaks are kept. The signature is added beneath the message body when enabled.
          </p>
        </div>
      </section>

      {/* Sending rules */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Autosend confidence (0.70–0.95)</label>
          <input
            type="number"
            step={0.01}
            min={0.6}
            max={0.99}
            value={s.autosend_confidence_threshold}
            onChange={e =>
              setS({ ...s, autosend_confidence_threshold: Number(e.target.value) || s.autosend_confidence_threshold })
            }
            onBlur={() => save({ autosend_confidence_threshold: s.autosend_confidence_threshold })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Business hours — Time zone</label>
          <input
            type="text"
            value={s.business_hours_tz}
            onChange={e => setS({ ...s, business_hours_tz: e.target.value })}
            onBlur={() => save({ business_hours_tz: s.business_hours_tz })}
            disabled={saving}
            placeholder="America/Los_Angeles"
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Business hours — Start (0–23)</label>
          <input
            type="number"
            min={0}
            max={23}
            value={s.business_hours_start}
            onChange={e => setS({ ...s, business_hours_start: Math.min(23, Math.max(0, Number(e.target.value))) })}
            onBlur={() => save({ business_hours_start: s.business_hours_start })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Business hours — End (0–23)</label>
          <input
            type="number"
            min={0}
            max={23}
            value={s.business_hours_end}
            onChange={e => setS({ ...s, business_hours_end: Math.min(23, Math.max(0, Number(e.target.value))) })}
            onBlur={() => save({ business_hours_end: s.business_hours_end })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Cooldown between sends (hours)</label>
          <input
            type="number"
            min={0}
            max={72}
            value={s.cooldown_hours}
            onChange={e => setS({ ...s, cooldown_hours: Math.min(72, Math.max(0, Number(e.target.value))) })}
            onBlur={() => save({ cooldown_hours: s.cooldown_hours })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Max daily sends per contact</label>
          <input
            type="number"
            min={0}
            max={50}
            value={s.max_daily_sends}
            onChange={e => setS({ ...s, max_daily_sends: Math.min(50, Math.max(0, Number(e.target.value))) })}
            onBlur={() => save({ max_daily_sends: s.max_daily_sends })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Grace minutes (send at open)</label>
          <input
            type="number"
            min={0}
            max={120}
            value={s.grace_minutes}
            onChange={e => setS({ ...s, grace_minutes: Math.min(120, Math.max(0, Number(e.target.value))) })}
            onBlur={() => save({ grace_minutes: s.grace_minutes })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>
      </section>

      <div className="text-sm text-gray-600">
        {saving ? 'Saving…' : lastSaved ? `Saved ${lastSaved}` : '—'}
      </div>
    </div>
  );
}
