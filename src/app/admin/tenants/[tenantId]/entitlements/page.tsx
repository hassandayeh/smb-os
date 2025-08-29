"use client";

import { useEffect, useState } from "react";
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
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (sort) qs.set("sort", sort);
  const qsStr = qs.toString();
  const backToListHref = qsStr ? `/admin/tenants?${qsStr}` : `/admin/tenants`;
  const viewTenantHref = qsStr
    ? `/admin/tenants/${tenantId}?${qsStr}`
    : `/admin/tenants/${tenantId}`;

  const [rows, setRows] = useState<EntRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(tid: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tid}/entitlements`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage Entitlements</h1>

        <div className="flex items-center gap-2">
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
                rows.map((r) => (
                  <tr key={r.moduleKey} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {r.name}{" "}
                      <span className="text-muted-foreground">
                        ({r.moduleKey})
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.description || "—"}</td>
                    <td className="px-3 py-2">{r.isEnabled ? "On" : "Off"}</td>
                    <td className="px-3 py-2">
                      <pre className="text-xs bg-gray-50 border rounded p-2 max-w-[40ch] overflow-x-auto">
                        {r.limitsJson ? JSON.stringify(r.limitsJson) : "—"}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
