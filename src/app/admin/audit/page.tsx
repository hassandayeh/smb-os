// src/app/admin/audit/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type Search = {
  tenantId?: string;
  action?: string;
  from?: string; // yyyy-mm-dd
  to?: string;   // yyyy-mm-dd
};

function fmtDate(d: Date | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

function friendlyAction(action: string) {
  const map: Record<string, string> = {
    "entitlement.update": "Entitlement updated",
    "tenant.create": "Tenant created",
    "tenant.update": "Tenant updated",
    "tenant.activate": "Activation extended",
  };
  return map[action] ?? action;
}

function parseDateBoundaries(from?: string, to?: string) {
  const where: any = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
  }
  return where;
}

async function getData(searchParams: Search) {
  const { tenantId, action, from, to } = searchParams;

  const where: any = {
    ...(tenantId ? { tenantId } : {}),
    ...(action ? { action: { contains: action } } : {}),
    ...parseDateBoundaries(from, to),
  };

  // 1) Fetch audit log rows (no includes to keep schema-agnostic)
  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // 2) Batch-load tenants for names
  const tenantIds = Array.from(new Set(entries.map((e) => e.tenantId))).filter(
    Boolean
  );
  const tenants =
    tenantIds.length > 0
      ? await prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name ?? "—"]));

  // 3) Batch-load users for actor display
  const actorIds = Array.from(
    new Set(entries.map((e) => e.actorUserId).filter(Boolean) as string[])
  );
  const users =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const userMap = new Map(
    users.map((u) => [u.id, u.name || u.email || "—"])
  );

  return { entries, tenantMap, userMap };
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { entries, tenantMap, userMap } = await getData(searchParams);
  const q = searchParams || {};

  const query = new URLSearchParams();
  if (q.tenantId) query.set("tenantId", q.tenantId);
  if (q.action) query.set("action", q.action);
  if (q.from) query.set("from", q.from);
  if (q.to) query.set("to", q.to);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <div className="flex gap-2">
          <Link href="/admin">
            <Button variant="secondary">Admin Console</Button>
          </Link>
          <Link href={`/admin/audit/export?${query.toString()}`}>
            <Button variant="secondary">Export CSV</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <form className="grid grid-cols-1 sm:grid-cols-5 gap-3" method="GET">
        <div className="flex flex-col">
          <label className="text-sm text-muted-foreground">Tenant ID</label>
          <input
            name="tenantId"
            defaultValue={q.tenantId ?? ""}
            className="border rounded px-3 py-2"
            placeholder="Exact tenantId"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-muted-foreground">Action</label>
          <input
            name="action"
            defaultValue={q.action ?? ""}
            className="border rounded px-3 py-2"
            placeholder='e.g. "entitlement.update"'
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-muted-foreground">From (UTC)</label>
          <input
            type="date"
            name="from"
            defaultValue={q.from ?? ""}
            className="border rounded px-3 py-2"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-muted-foreground">To (UTC)</label>
          <input
            type="date"
            name="to"
            defaultValue={q.to ?? ""}
            className="border rounded px-3 py-2"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Link href="/admin/audit">
            <Button type="button" variant="secondary">
              Clear
            </Button>
          </Link>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="[&>th]:text-left [&>th]:px-4 [&>th]:py-2">
              <th>Time</th>
              <th>Tenant ID</th>
              <th>Tenant Name</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-2">
            {entries.map((e) => {
              const tenantName = tenantMap.get(e.tenantId) ?? "—";
              const actor =
                (e.actorUserId ? userMap.get(e.actorUserId) : undefined) ?? "—";
              return (
                <tr key={e.id} className="border-t">
                  <td className="whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                  <td className="font-mono">{e.tenantId}</td>
                  <td>{tenantName}</td>
                  <td>{friendlyAction(e.action)}</td>
                  <td className="whitespace-nowrap">{actor}</td>
                  <td>
                    <Link
                      className="underline"
                      href={`/admin/audit/${e.id}${query.toString() ? `?${query.toString()}` : ""}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  No audit entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
