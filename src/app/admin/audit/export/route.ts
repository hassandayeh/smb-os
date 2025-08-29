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
  const tenantId = url.searchParams.get("tenantId") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const from = parseDateOnly(url.searchParams.get("from"));
  const toRaw = parseDateOnly(url.searchParams.get("to"));

  const where: any = {};
  if (tenantId) where.tenantId = tenantId;
  if (action) where.action = { contains: action }; // SQLite: case-sensitive contains

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

  // CSV header
  const header = [
    "id",
    "createdAt",
    "tenantId",
    "actorUserId",
    "action",
    "metaJson",
  ].join(",");

  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    // Escape " by doubling it; wrap in quotes if comma/quote/newline present
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
      // ensure metaJson is a single field
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
