// src/app/admin/audit/export/route.ts
import { prisma } from "@/lib/prisma";

// Parse YYYY-MM-DD (UTC date only) into a Date at 00:00:00Z
function parseDateOnly(d?: string | null) {
  if (!d) return undefined;
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return undefined;
  return new Date(Date.UTC(y, m - 1, day));
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // NEW: tenant = id or name (partial)
  const tenant = url.searchParams.get("tenant") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const from = parseDateOnly(url.searchParams.get("from"));
  const toRaw = parseDateOnly(url.searchParams.get("to"));

  const where: any = {
    ...(tenant
      ? {
          OR: [
            { tenantId: { contains: tenant } },        // partial ID
            { tenant: { name: { contains: tenant } } }, // partial name (SQLite contains is case-sensitive)
          ],
        }
      : {}),
    ...(action ? { action: { contains: action } } : {}),
  };

  if (from || toRaw) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (toRaw) {
      const end = new Date(toRaw);
      end.setUTCHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  // Safety cap (adjust later if needed)
  const LIMIT = 5000;
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: LIMIT,
  });

  // CSV header (kept as-is)
  const header = ["id", "createdAt", "tenantId", "actorUserId", "action", "metaJson"].join(",");

  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    const needsQuotes = /[",\n]/.test(s);
    const out = s.replace(/"/g, '""');
    return needsQuotes ? `"${out}"` : out;
  };

  const rows = logs.map((l) =>
    [
      escape(l.id),
      escape(l.createdAt.toISOString()),
      escape(l.tenantId),
      escape(l.actorUserId ?? ""),
      escape(l.action),
      escape(typeof l.metaJson === "string" ? l.metaJson : JSON.stringify(l.metaJson)),
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-export.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
