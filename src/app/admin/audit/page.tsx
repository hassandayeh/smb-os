// src/app/admin/audit/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAuditAction } from "./actionFormatter";
import Filters from "./filters"; // requires { initial }

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

// Build Prisma where-clause from URL params (server-side filtering).
function buildWhere(searchParams: Record<string, string | string[] | undefined>) {
  const q = getParam(searchParams, "q")?.trim();
  const tenant = getParam(searchParams, "tenant")?.trim();
  const from = getParam(searchParams, "from")?.trim();
  const to = getParam(searchParams, "to")?.trim();

  const where: any = {};

  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { id: { contains: q } },
    ];
  }

  if (tenant) {
    // Server-side search already supports partial ID (and you added name on server previously)
    where.tenantId = { contains: tenant };
  }

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  return where;
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

export default async function AuditListPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // ✅ Provide initial values for the Filters component from URL params
  const initial = {
    tenant: getParam(searchParams, "tenant") || "",
    q: getParam(searchParams, "q") || "",
    from: getParam(searchParams, "from") || "",
    to: getParam(searchParams, "to") || "",
  };

  // Server-side filters
  const where = buildWhere(searchParams);

  // Query — include metaJson for ON/OFF formatting
  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      metaJson: true, // needed by formatter
      createdAt: true,
      tenantId: true,
      actorUserId: true,
    },
  });

  // Preserve filters in CSV export
  const qs = toSearchString(searchParams);
  const exportHref = `/api/admin/audit/export${qs ? `?${qs}` : ""}`;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Audit Log</h1>

        <div className="flex items-center gap-2">
          <Link
            href={exportHref}
            className="inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Export CSV (filtered)
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to Admin
          </Link>
        </div>
      </div>

      {/* ✅ Keep existing filter UI, now with required prop */}
      <Filters initial={initial} />

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
              <th>Time</th>
              <th>Tenant ID</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t [&>td]:px-3 [&>td]:py-2">
                <td className="whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                <td className="font-mono text-xs">{e.tenantId}</td>
                <td>{formatAuditAction(e.action, e.metaJson)}</td>
                <td className="font-mono text-xs">{e.actorUserId ?? "—"}</td>
                <td>
                  <Link
                    href={`/admin/audit/${e.id}`}
                    className="inline-flex items-center rounded-xl border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}

            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
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
