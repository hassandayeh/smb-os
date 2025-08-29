"use client";

import { useState } from "react";

type Props = {
  tenantId: string;
  moduleKey: string;
  initialEnabled: boolean;
};

export default function ToggleTenantEntitlement({
  tenantId,
  moduleKey,
  initialEnabled,
}: Props) {
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setError(null);
    setSaved(false);
    setSaving(true);

    // optimistic
    setEnabled(next);

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/entitlements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey, isEnabled: next }),
      });

      if (!res.ok) {
        const msg = await safeText(res);
        throw new Error(msg || `Failed to update ${moduleKey}`);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e: any) {
      // rollback
      setEnabled(!next);
      setError(e?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={enabled}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
          aria-label={`Toggle ${moduleKey} for tenant`}
        />
        <div className="peer h-5 w-9 rounded-full bg-gray-300 transition peer-checked:bg-green-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2" />
        <div className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
      </label>
      {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
      {saved && !saving && !error && (
        <span className="text-xs text-green-600">Saved</span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

async function safeText(res: Response) {
  try {
    const t = await res.text();
    return t?.slice(0, 200);
  } catch {
    return null;
  }
}
