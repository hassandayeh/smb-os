import Link from "next/link";
import AuditFilters from "./filters";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Keep page size consistent with the client comp
const PAGE_SIZE = 20;

function parseDateOnly(d?: string | null) {
  if (!d) return undefined;
  // Expecting YYYY-MM-DD from <input type="date">
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return undefined;
  return new Date(Date.UTC(y, m - 1, day));
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: {
    tenantId?: string;
    action?: string;
    from?: string; // YYYY-MM-DD
    to?: string;   // YYYY-MM-DD
    page?: string;
  };
}) {
  const tenantId = searchParams?.tenantId?.trim() || undefined;
  const action = searchParams?.action?.trim() || undefined;
  const from = parseDateOnly(searchParams?.from);
  const to = parseDateOnly(searchParams?.to);
  const page = Math.max(1, Number(searchParams?.page || "1") || 1);

  // Build Prisma where
  const where: any = {};
  // Partial match for tenantId (SQLite: case-sensitive contains)
  if (tenantId) where.tenantId = { contains: tenantId };
  if (action) where.action = { contains: action }; // SQLite: case-sensitive contains

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) {
      // include "to" day end (23:59:59.999 UTC)
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Helper to keep query params while changing page
  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (action) params.set("action", action);
    if (searchParams?.from) params.set("from", searchParams.from);
    if (searchParams?.to) params.set("to", searchParams.to);
    params.set("page", String(p));
    return `/admin/audit?${params.toString()}`;
  }

  // Build export href preserving filters (no pagination)
  const exportHref = (() => {
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (action) params.set("action", action);
    if (searchParams?.from) params.set("from", searchParams.from);
    if (searchParams?.to) params.set("to", searchParams.to);
    return `/admin/audit/export?${params.toString()}`;
  })();

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            Admin Console
          </Link>
          <a
            href={exportHref}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <AuditFilters pageSize={PAGE_SIZE} />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Tenant</th>
              <th className="px-4 py-3 text-left">Actor</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t">
                <td className="px-4 py-3 align-top">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 align-top">{log.tenantId}</td>
                <td className="px-4 py-3 align-top">{log.actorUserId ?? "—"}</td>
                <td className="px-4 py-3 align-top">{log.action}</td>
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/admin/audit/${log.id}?${new URLSearchParams({
                      ...(tenantId ? { tenantId } : {}),
                      ...(action ? { action } : {}),
                      ...(searchParams?.from ? { from: searchParams.from } : {}),
                      ...(searchParams?.to ? { to: searchParams.to } : {}),
                      page: String(page),
                    }).toString()}`}
                    className="underline hover:no-underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No audit entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          Showing {(page - 1) * PAGE_SIZE + 1}–
          {Math.min(page * PAGE_SIZE, total)} of {total}
        </div>
        <div className="flex items-center gap-2">
          <Link
            aria-disabled={page <= 1}
            className={`rounded-md border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
            href={page > 1 ? pageHref(page - 1) : "#"}
          >
            Prev
          </Link>
          <span>
            Page {page} / {totalPages}
          </span>
          <Link
            aria-disabled={page >= totalPages}
            className={`rounded-md border px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
            href={page < totalPages ? pageHref(page + 1) : "#"}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}
