"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

type EntRow = {
  moduleKey: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  limitsJson: any | null;
};

export default function ManageEntitlementsPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = String(params.tenantId);
  const sp = useSearchParams();

  // preserve q/sort if present
  const q = sp.get("q") ?? "";
  const sort = sp.get("sort") ?? "";
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sort) p.set("sort", sort);
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort]);
  const qsStr = qs.toString();
  const backToListHref = qsStr ? `/admin/tenants?${qsStr}` : `/admin/tenants`;
  const viewTenantHref = qsStr
    ? `/admin/tenants/${tenantId}?${qsStr}`
    : `/admin/tenants/${tenantId}`;

  const [rows, setRows] = useState<EntRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // per-row transient UI state
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [rowSaved, setRowSaved] = useState<Record<string, boolean>>({});

  async function load(tid: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tid}/entitlements`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({} as any));

      const items: unknown = Array.isArray((data as any)?.items)
        ? (data as any).items
        : Array.isArray((data as any)?.rows)
        ? (data as any).rows
        : null;

      if (!res.ok || !Array.isArray(items)) {
        throw new Error(
          (data as any)?.error ||
            `Failed to load entitlements (status ${res.status})`
        );
      }

      const mapped: EntRow[] = (items as any[]).map((m) => ({
        moduleKey: String(m.moduleKey),
        name: String(m.name ?? m.moduleKey),
        description: m.description ?? null,
        isEnabled: !!m.isEnabled,
        limitsJson: m.limitsJson ?? null,
      }));

      setRows(mapped);
      setRowErrors({});
    } catch (err: any) {
      setError(err?.message || "Failed to load entitlements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    load(tenantId);
  }, [tenantId]);

  const btnClass =
    "inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted";

  async function toggle(moduleKey: string, next: boolean) {
    // optimistic update
    setRows((prev) =>
      prev.map((r) =>
        r.moduleKey === moduleKey ? { ...r, isEnabled: next } : r
      )
    );
    setRowErrors((prev) => ({ ...prev, [moduleKey]: null }));
    setRowSaved((prev) => ({ ...prev, [moduleKey]: false }));
    setSavingKeys((prev) => new Set(prev).add(moduleKey));

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

      // mark as saved (show brief success) and refresh from server to ensure truth
      setRowSaved((prev) => ({ ...prev, [moduleKey]: true }));
      // auto-hide "Saved" after 1.5s
      setTimeout(() => {
        setRowSaved((prev) => ({ ...prev, [moduleKey]: false }));
      }, 1500);

      // soft refresh rows to reflect authoritative server state
      load(tenantId);
    } catch (e: any) {
      // rollback
      setRows((prev) =>
        prev.map((r) =>
          r.moduleKey === moduleKey ? { ...r, isEnabled: !next } : r
        )
      );
      setRowErrors((prev) => ({
        ...prev,
        [moduleKey]: e?.message || "Failed to update",
      }));
    } finally {
      setSavingKeys((prev) => {
        const n = new Set(prev);
        n.delete(moduleKey);
        return n;
      });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage Entitlements</h1>

        <div className="flex items-center gap-2">
          <Link href="/admin" className={btnClass}>
            Admin Console
          </Link>
          <Link href={backToListHref} className={btnClass}>
            Back to list
          </Link>
          <Link href={viewTenantHref} className={btnClass}>
            View Tenant
          </Link>
        </div>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && (
        <div className="rounded-md border p-3 text-sm bg-red-50 border-red-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Module</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Enabled</th>
                <th className="px-3 py-2">Limits</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No modules found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const saving = savingKeys.has(r.moduleKey);
                  const rowError = rowErrors[r.moduleKey] ?? null;
                  const saved = rowSaved[r.moduleKey] ?? false;

                  return (
                    <tr key={r.moduleKey} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        {r.name}{" "}
                        <span className="text-muted-foreground">
                          ({r.moduleKey})
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.description || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              className="peer sr-only"
                              checked={r.isEnabled}
                              disabled={saving}
                              onChange={(e) =>
                                toggle(r.moduleKey, e.target.checked)
                              }
                              aria-label={`Toggle ${r.moduleKey}`}
                            />
                            <div className="peer h-5 w-9 rounded-full bg-gray-300 transition peer-checked:bg-green-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2" />
                            <div className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                          </label>
                          {saving && (
                            <span className="text-xs text-muted-foreground">
                              Saving…
                            </span>
                          )}
                          {saved && !saving && !rowError && (
                            <span className="text-xs text-green-600">
                              Saved
                            </span>
                          )}
                          {rowError && (
                            <span className="text-xs text-red-600">
                              {rowError}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <pre className="text-xs bg-gray-50 border rounded p-2 max-w-[40ch] overflow-x-auto">
                          {r.limitsJson ? JSON.stringify(r.limitsJson) : "—"}
                        </pre>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
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
