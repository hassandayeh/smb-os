import { prisma } from "@/lib/prisma";

// Keep sort keys aligned with the page
type SortKey =
  | "created_desc"
  | "created_asc"
  | "activated_desc"
  | "activated_asc"
  | "name_asc"
  | "name_desc";

function getOrder(sort: SortKey) {
  switch (sort) {
    case "created_asc":
      return [{ createdAt: "asc" as const }];
    case "activated_desc":
      return [{ activatedUntil: "desc" as const }];
    case "activated_asc":
      return [{ activatedUntil: "asc" as const }];
    case "name_asc":
      return [{ name: "asc" as const }];
    case "name_desc":
      return [{ name: "desc" as const }];
    case "created_desc":
    default:
      return [{ createdAt: "desc" as const }];
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const sort = (url.searchParams.get("sort") as SortKey) || "created_desc";

  const where = q
    ? {
        OR: [{ name: { contains: q } }, { id: { contains: q } }], // SQLite: case-sensitive contains
      }
    : undefined;

  // Safety cap; adjust if you expect more rows
  const LIMIT = 5000;

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: getOrder(sort),
    take: LIMIT,
  });

  // Build CSV
  const header = ["id", "name", "status", "activatedUntil", "createdAt"].join(",");

  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    const needsQuotes = /[",\n]/.test(s);
    const out = s.replace(/"/g, '""');
    return needsQuotes ? `"${out}"` : out;
    };

  const rows = tenants.map((t) =>
    [
      escape(t.id),
      escape(t.name),
      escape(t.status),
      escape(t.activatedUntil ? t.activatedUntil.toISOString() : ""),
      escape(t.createdAt ? t.createdAt.toISOString() : ""),
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tenants-export.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
