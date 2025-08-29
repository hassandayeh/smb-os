import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ModulesIndex({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const q = (searchParams?.q ?? "").trim();

  // Server-side search: partial match on name OR key (SQLite contains = case-sensitive)
  const where = q
    ? {
        OR: [{ name: { contains: q } }, { key: { contains: q } }],
      }
    : undefined;

  const modules = await prisma.module.findMany({
    where,
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Modules</h1>
        <Link
          href="/admin"
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
        >
          Admin Console
        </Link>
      </div>

      {/* Search */}
      <form className="mb-4 flex items-end gap-2" method="get">
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-muted-foreground">Search</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Name or key"
            className="h-9 w-[260px] rounded-md border px-3"
            inputMode="text"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md border px-3 text-sm hover:bg-muted/40"
        >
          Apply
        </button>
        {q ? (
          <Link
            href="/admin/entitlements"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted/40"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {/* Modules grid */}
      {modules.length === 0 ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          No modules found{q ? ` for “${q}”` : ""}.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Link
              key={m.key}
              href={`/admin/entitlements/${m.key}`}
              className="rounded-xl border p-4 transition-colors hover:bg-muted/40"
            >
              <div className="mb-1 text-sm text-muted-foreground">Module</div>
              <div className="text-base font-medium">{m.name ?? m.key}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {m.description ?? m.key}
              </p>
              <div className="mt-3 text-xs text-muted-foreground">
                Key: {m.key}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
