'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type Tenant = { id: string; name: string };
type Row = {
  moduleKey: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  limitsText: string;     // editable textarea (stringified JSON)
  saving?: boolean;
  message?: string | null;
  error?: string | null;
};

export default function ManageEntitlementsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  // ⬇️ Unwrap the promised params (Next.js 15 client components)
  const { tenantId } = use(params);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}/entitlements`, { cache: 'no-store' });
        const data = await res.json();
        if (res.ok && mounted) {
          setTenant(data.tenant);
          const mapped: Row[] = (data.items as any[]).map((it) => ({
            moduleKey: it.moduleKey,
            name: it.name,
            description: it.description ?? null,
            isEnabled: !!it.isEnabled,
            limitsText: it.limitsJson ? JSON.stringify(it.limitsJson, null, 2) : '',
          }));
          setRows(mapped);
        } else {
          throw new Error(data?.error || 'Failed to load entitlements');
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  const title = useMemo(
    () => (tenant ? `Manage Entitlements — ${tenant.name}` : 'Manage Entitlements'),
    [tenant]
  );

  async function saveRow(idx: number) {
    if (!rows) return;
    const r = rows[idx];

    // Optimistic UI
    setRows((cur) =>
      cur?.map((row, i) => (i === idx ? { ...row, saving: true, message: null, error: null } : row)) ?? null
    );

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/entitlements`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleKey: r.moduleKey,
          isEnabled: r.isEnabled,
          limitsJsonText: r.limitsText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save');

      setRows((cur) =>
        cur?.map((row, i) =>
          i === idx
            ? {
                ...row,
                saving: false,
                message: 'Saved',
                error: null,
                limitsText: data.entitlement?.limitsJson
                  ? JSON.stringify(data.entitlement.limitsJson, null, 2)
                  : '',
              }
            : row
        ) ?? null
      );
    } catch (err: any) {
      setRows((cur) =>
        cur?.map((row, i) =>
          i === idx ? { ...row, saving: false, message: null, error: err.message || 'Save failed' } : row
        ) ?? null
      );
    }
  }

  if (loading) {
    return (
      <section className="container mx-auto max-w-6xl p-4 md:p-6">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </section>
    );
  }

  if (!rows || !tenant) {
    return (
      <section className="container mx-auto max-w-6xl p-4 md:p-6">
        <div className="rounded-2xl border bg-card text-card-foreground p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Manage Entitlements</h2>
            <Button variant="outline" asChild>
              <Link href="/admin/tenants">← Back to Tenants</Link>
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">Nothing to show.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-6xl p-4 md:p-6">
      <div className="rounded-2xl border bg-card text-card-foreground p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <Button variant="outline" asChild>
            <Link href="/admin/tenants">← Back to Tenants</Link>
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm align-top">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pe-3 text-left font-medium">Module</th>
                <th className="py-2 pe-3 text-left font-medium">Enabled</th>
                <th className="py-2 pe-3 text-left font-medium">limitsJson (editable JSON)</th>
                <th className="py-2 pe-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.moduleKey} className="border-b last:border-0">
                  <td className="py-3 pe-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-muted-foreground">{row.moduleKey}</div>
                    {row.description && (
                      <div className="text-muted-foreground">{row.description}</div>
                    )}
                  </td>

                  <td className="py-3 pe-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.isEnabled}
                        onChange={(e) =>
                          setRows((cur) =>
                            cur?.map((r, i) => (i === idx ? { ...r, isEnabled: e.target.checked } : r)) ?? null
                          )
                        }
                      />
                      <span>{row.isEnabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                  </td>

                  <td className="py-3 pe-3 w-[520px]">
                    <textarea
                      className="w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                      rows={5}
                      placeholder='e.g. { "maxUsers": 3 }'
                      value={row.limitsText}
                      onChange={(e) =>
                        setRows((cur) =>
                          cur?.map((r, i) => (i === idx ? { ...r, limitsText: e.target.value } : r)) ?? null
                        )
                      }
                    />
                    <div className="mt-1 text-xs text-muted-foreground">
                      Leave empty for <code>null</code>. Must be valid JSON if provided.
                    </div>
                  </td>

                  <td className="py-3 pe-3 w-[160px]">
                    <div className="flex flex-col gap-2">
                      <Button size="sm" onClick={() => saveRow(idx)} disabled={row.saving}>
                        {row.saving ? 'Saving…' : 'Save'}
                      </Button>
                      {row.message && <div className="text-xs text-emerald-600">{row.message}</div>}
                      {row.error && <div className="text-xs text-destructive">{row.error}</div>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
