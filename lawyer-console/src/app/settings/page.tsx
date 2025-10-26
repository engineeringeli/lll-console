"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

type OrgSettings = {
  require_approval_initial: boolean;
  autosend_confidence_threshold: number;
  business_hours_tz: string;
  business_hours_start: number; // 0-23
  business_hours_end: number; // 0-23
  cooldown_hours: number; // 0-72
  max_daily_sends: number; // 0-50
  grace_minutes: number; // 0-120

  // Email appearance
  outbound_from_name: string;
  include_signature: boolean;
  outbound_signature: string; // <-- use this (matches backend)
};

type ApiError = { detail?: string };

const BASE = "/api/backend";

// Generic JSON fetcher with typed return and friendly error messages
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const detail =
      (typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof (data as ApiError).detail === "string" &&
        (data as ApiError).detail) || `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return data as T;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<OrgSettings | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // GET via proxy
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<OrgSettings>(`${BASE}/org/settings`, {
        cache: "no-store",
      });
      setS(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // PUT via proxy (partial updates)
  const save = useCallback(
    async (patch: Partial<OrgSettings>) => {
      if (!s) return;
      setSaving(true);
      setError(null);

      // optimistic update
      const optimistic: OrgSettings = { ...s, ...patch };
      setS(optimistic);

      try {
        const next = await fetchJson<OrgSettings>(`${BASE}/org/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(patch),
        });
        setS(next);
        setLastSaved(new Date().toLocaleTimeString());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        // revert
        await fetchSettings();
      } finally {
        setSaving(false);
      }
    },
    [s, fetchSettings]
  );

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!s) return <div className="p-6">No settings found.</div>;

  // Typed change helpers
  const onText =
    (key: keyof OrgSettings) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setS((prev) => (prev ? { ...prev, [key]: value } as OrgSettings : prev));
    };

  const onNumber =
    (key: keyof OrgSettings, min: number, max: number) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
      setS((prev) =>
        prev ? ({ ...prev, [key]: clamped } as OrgSettings) : prev
      );
    };

  const onCheckbox =
    (key: keyof OrgSettings) => (e: ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      setS((prev) =>
        prev ? ({ ...prev, [key]: checked } as OrgSettings) : prev
      );
      void save({ [key]: checked } as Partial<OrgSettings>);
    };

  // Submit handler not strictly needed here, but typed example if you add a <form>
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <h1 className="text-xl font-semibold">Firm Settings</h1>

      {/* Outreach guardrails */}
      <section className="space-y-2">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={s.require_approval_initial}
            onChange={onCheckbox("require_approval_initial")}
            disabled={saving}
          />
          <span>Require review before initial outreach is sent</span>
        </label>
        <p className="text-sm text-gray-600">
          Turn this off to allow initial outreach to auto-send when the AI’s
          confidence meets your threshold and it’s within business hours.
        </p>
      </section>

      {/* Email appearance */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Email appearance</h2>

        <div>
          <label className="block text-sm mb-1">Display “From” name</label>
          <input
            type="text"
            value={s.outbound_from_name || ""}
            onChange={onText("outbound_from_name")}
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
            onChange={onCheckbox("include_signature")}
            disabled={saving}
          />
          <span>Append signature to outbound emails</span>
        </label>

        <div>
          <label className="block text-sm mb-1">Signature</label>
          <textarea
            value={s.outbound_signature || ""}
            onChange={onText("outbound_signature")}
            onBlur={() => save({ outbound_signature: s.outbound_signature })}
            placeholder={`Jane Smith\nSmith Law Group\n(555) 123-4567\nreply@firm.com`}
            rows={5}
            disabled={saving || !s.include_signature}
            className="border rounded px-2 py-2 w-full font-mono"
          />
          <p className="text-sm text-gray-600 mt-1">
            Plain text is fine — line breaks are kept. The signature is added
            beneath the message body when enabled.
          </p>
        </div>
      </section>

      {/* Sending rules */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">
            Autosend confidence (0.70–0.95)
          </label>
          <input
            type="number"
            step={0.01}
            min={0.6}
            max={0.99}
            value={s.autosend_confidence_threshold}
            onChange={onNumber("autosend_confidence_threshold", 0.6, 0.99)}
            onBlur={() =>
              save({
                autosend_confidence_threshold:
                  s.autosend_confidence_threshold,
              })
            }
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">
            Business hours — Time zone
          </label>
          <input
            type="text"
            value={s.business_hours_tz}
            onChange={onText("business_hours_tz")}
            onBlur={() => save({ business_hours_tz: s.business_hours_tz })}
            disabled={saving}
            placeholder="America/Los_Angeles"
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">
            Business hours — Start (0–23)
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={s.business_hours_start}
            onChange={onNumber("business_hours_start", 0, 23)}
            onBlur={() => save({ business_hours_start: s.business_hours_start })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">
            Business hours — End (0–23)
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={s.business_hours_end}
            onChange={onNumber("business_hours_end", 0, 23)}
            onBlur={() => save({ business_hours_end: s.business_hours_end })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">
            Cooldown between sends (hours)
          </label>
          <input
            type="number"
            min={0}
            max={72}
            value={s.cooldown_hours}
            onChange={onNumber("cooldown_hours", 0, 72)}
            onBlur={() => save({ cooldown_hours: s.cooldown_hours })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">
            Max daily sends per contact
          </label>
          <input
            type="number"
            min={0}
            max={50}
            value={s.max_daily_sends}
            onChange={onNumber("max_daily_sends", 0, 50)}
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
            onChange={onNumber("grace_minutes", 0, 120)}
            onBlur={() => save({ grace_minutes: s.grace_minutes })}
            disabled={saving}
            className="border rounded px-2 py-1 w-full"
          />
        </div>
      </section>

      <div className="text-sm text-gray-600">
        {saving ? "Saving…" : lastSaved ? `Saved ${lastSaved}` : "—"}
      </div>
    </div>
  );
}
