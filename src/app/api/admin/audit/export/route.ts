// src/app/api/admin/audit/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * CSV columns:
 * Time | Tenant ID | Tenant Name | Action | Actor | Details
 *
 * Query params supported (match the Audit page filters):
 * - qTenant: partial, matches tenantId or tenant name
 * - qActor: partial, matches actorUserId
 * - action: exact match of action key (if provided)
 * - from: ISO date string (inclusive)
 * - to: ISO date string (inclusive; we expand to end-of-day)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const qTenant = (searchParams.get("qTenant") || "").trim();
    const qActor = (searchParams.get("qActor") || "").trim();
    const action = (searchParams.get("action") || "").trim();
    const from = (searchParams.get("from") || "").trim();
    const to = (searchParams.get("to") || "").trim();

    // Step A — resolve tenant-name filtering:
    // If qTenant is provided, we want to match EITHER:
    //  - auditLog.tenantId contains qTenant
    //  - OR tenant.name contains qTenant  → in that case we fetch matching tenant IDs first
    let tenantIdsFromName: string[] = [];
    if (qTenant) {
      const byName = await prisma.tenant.findMany({
        where: { name: { contains: qTenant } }, // SQLite case-insensitive already handled by collation; if not, adjust
        select: { id: true },
      });
      tenantIdsFromName = byName.map((t) => t.id);
    }

    // Step B — build where clause
    const where: any = {};

    // Date range
    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(+fromDate)) where.createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(+toDate)) {
          toDate.setHours(23, 59, 59, 999); // end-of-day
          where.createdAt.lte = toDate;
        }
      }
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    // Action exact match
    if (action) where.action = action;

    // qTenant — partial on tenantId OR by resolved tenant IDs from name
    if (qTenant) {
      const or: any[] = [{ tenantId: { contains: qTenant } }];
      if (tenantIdsFromName.length) {
        or.push({ tenantId: { in: tenantIdsFromName } });
      }
      where.OR = or;
    }

    // qActor — partial on actorUserId
    if (qActor) {
      // If we already created OR above, extend it; otherwise add direct filter
      if (where.OR) {
        (where.OR as any[]).push({ actorUserId: { contains: qActor } });
      } else {
        where.actorUserId = { contains: qActor };
      }
    }

    // Step C — fetch logs (no invalid includes)
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Step D — map tenantId → tenantName (for CSV column + display)
    const uniqueTenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter(Boolean)));
    const tenants =
      uniqueTenantIds.length === 0
        ? []
        : await prisma.tenant.findMany({
            where: { id: { in: uniqueTenantIds } },
            select: { id: true, name: true },
          });
    const tenantNameById = new Map(tenants.map((t) => [t.id, t.name ?? ""]));

    // Step E — compose CSV
    const header = [
      "Time",
      "Tenant ID",
      "Tenant Name",
      "Action",
      "Actor",
      "Details",
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return "";
      const s =
        typeof val === "string" ? val : typeof val === "object" ? JSON.stringify(val) : String(val);
      const needsQuotes = /[",\n]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const lines = rows.map((r) => {
      const actor = r.actorUserId ?? "";
      const tenantName = tenantNameById.get(r.tenantId) ?? "";
      return [
        r.createdAt?.toISOString() ?? "",
        r.tenantId ?? "",
        tenantName,
        r.action ?? "",
        actor,
        r.metaJson ? JSON.stringify(r.metaJson) : "",
      ]
        .map(escapeCsv)
        .join(",");
    });

    const csv = [header.join(","), ...lines].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-export.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Audit CSV export failed:", err);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}
