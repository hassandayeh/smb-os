import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';

type TenantRow = {
  id: string;
  name: string;
  status: string | null;
  activatedUntil: Date | null;
  createdAt: Date;
};

function formatDate(d: Date | null) {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

async function TenantsTable() {
  const tenants = (await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, activatedUntil: true, createdAt: true },
  })) as TenantRow[];

  if (!tenants.length) {
    return (
      <div className="rounded-2xl border bg-card text-card-foreground p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Tenants</h2>
            <p className="text-sm text-muted-foreground">No tenants yet. Create the first one to get started.</p>
          </div>
          <Button asChild>
            <Link href="/admin/tenants/new">New Tenant</Link>
          </Button>
        </div>
        <div className="mt-6 text-sm">
          This page lists all customer companies (tenants). Each tenant can have different modules enabled.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card text-card-foreground p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tenants</h2>
        <Button asChild>
          <Link href="/admin/tenants/new">New Tenant</Link>
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-2 pe-3 text-left font-medium">Name</th>
              <th className="py-2 pe-3 text-left font-medium">Status</th>
              <th className="py-2 pe-3 text-left font-medium">Activated Until</th>
              <th className="py-2 pe-3 text-left font-medium">Created</th>
              <th className="py-2 pe-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="py-2 pe-3">{t.name}</td>
                <td className="py-2 pe-3">
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                    {t.status ?? '—'}
                  </span>
                </td>
                <td className="py-2 pe-3">{formatDate(t.activatedUntil)}</td>
                <td className="py-2 pe-3">{formatDate(t.createdAt)}</td>
                <td className="py-2 pe-3">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/tenants/${t.id}/entitlements`}>Manage Entitlements</Link>
                    </Button>
                    {/* More actions later: Edit, Deactivate, etc. */}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function Page() {
  // This is a protected Admin page in our design (we'll add auth later).
  // For now it’s server-rendered for simplicity and speed.
  return (
    <section className="container mx-auto max-w-5xl p-4 md:p-6">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading tenants…</div>}>
      {/* @ts-ignore Async Server Component */}
      <TenantsTable />

      </Suspense>
    </section>
  );
}
