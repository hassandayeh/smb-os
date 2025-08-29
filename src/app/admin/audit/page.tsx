// src/app/admin/audit/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAuditAction } from "./actionFormatter";
import Filters from "./filters";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function getParam(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function toSearchString(sp: Record<string, string | string[] | undefined>) {
  const usp = new URLSearchParams();
  Object.entries(sp).forEach(([k, v]) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach((x) => x && usp.append(k, x));
    } else if (String(v).trim() !== "") {
      usp.set(k, String(v));
    }
  });
  return usp.toString();
}

function notNull<T>(v: T | null | undefined): v is T {
  return v != null;
}

export default async function AuditListPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const initial = {
    tenant: getParam(searchParams, "tenant") || "",
    q: getParam(searchParams, "q") || "",
    from: getParam(searchParams, "from") || "",
    to: getParam(searchParams, "to") || "",
    action: getParam(searchParams, "action") || "",
  };

  const q = initial.q.trim();
  const tenantInput = initial.tenant.trim();
  const from = initial.from.trim();
  const to = initial.to.trim();
  const actionKey = initial.action.trim();

  const baseWhere: any = {};

  if (q) {
    baseWhere.OR = [
      { action: { contains: q } }, // removed mode
      { id: { contains: q } },
    ];
  }

  // Action dropdown — use contains (no mode)
  if (actionKey) {
    baseWhere.action = { contains: actionKey };
  }

  if (from || to) {
    baseWhere.createdAt = {};
    if (from) baseWhere.createdAt.gte = new Date(from);
    if (to) baseWhere.createdAt.lte = new Date(to);
  }

  // Resolve tenant by name *or* id (no mode)
  let tenantIdsFilter: string[] | null = null;
  if (tenantInput) {
    const matchTenants = await prisma.tenant.findMany({
      where: {
        OR: [
          { name: { contains: tenantInput } }, // removed mode
          { id: { contains: tenantInput } },
        ],
      },
      select: { id: true },
      take: 200,
    });
    tenantIdsFilter = Array.from(new Set(matchTenants.map((t) => t.id))).filter(notNull);
    if (tenantIdsFilter.length === 0) {
      return (
        <div className="p-6 space-y-4">
          <Header searchParams={searchParams} />
          <Filters initial={initial} />
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                  <th>Time</th>
                  <th>Tenant ID</th>
                  <th>Tenant Name</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No audit entries found.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }

  const where = {
    ...baseWhere,
    ...(tenantIdsFilter ? { tenantId: { in: tenantIdsFilter } } : {}),
  };

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      metaJson: true,
      createdAt: true,
      tenantId: true,
      actorUserId: true,
    },
  });

  const tenantIds: string[] = Array.from(
    new Set(entries.map((e) => e.tenantId).filter(notNull))
  );
  const userIds: string[] = Array.from(
    new Set(entries.map((e) => e.actorUserId).filter(notNull))
  );

  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const tenantNameById = new Map(tenants.map((t) => [t.id, t.name]));
  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="p-6 space-y-4">
      <Header searchParams={searchParams} />

      <Filters initial={initial} />

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
              <th>Time</th>
              <th>Tenant ID</th>
              <th>Tenant Name</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const tenantName = tenantNameById.get(e.tenantId) ?? "—";
              const actorName = e.actorUserId ? userNameById.get(e.actorUserId) ?? e.actorUserId : "—";

              return (
                <tr key={e.id} className="border-t [&>td]:px-3 [&>td]:py-2">
                  <td className="whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                  <td className="font-mono text-xs">{e.tenantId}</td>
                  <td className="text-xs">{tenantName}</td>
                  <td>{formatAuditAction(e.action, e.metaJson)}</td>
                  <td className="text-xs">{actorName}</td>
                  <td>
                    <Link
                      href={`/admin/audit/${e.id}`}
                      className="inline-flex items-center rounded-xl border px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}

            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
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

function Header({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // Legacy export removed; keep a clean header with Back to Admin only.
  return (
    <div className="flex items-center justify-between gap-2">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <Link
        href="/admin"
        className="inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Back to Admin
      </Link>
    </div>
  );
}
