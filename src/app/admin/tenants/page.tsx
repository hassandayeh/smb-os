// src/app/admin/tenants/page.tsx
import CreateTenantButton from "./CreateTenantButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import SearchSortBar from "./search-sort-bar"; // ← client component, imported directly

function fmtDate(d: Date | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

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

const sortOptions = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "activated_desc", label: "Activation (latest)" },
  { value: "activated_asc", label: "Activation (earliest)" },
  { value: "name_asc", label: "Name A → Z" },
  { value: "name_desc", label: "Name Z → A" },
] as const;

export default async function TenantsAdminPage({
  searchParams,
}: {
  searchParams?: { q?: string; sort?: SortKey };
}) {
  const q = (searchParams?.q ?? "").trim();
  const sort = (searchParams?.sort as SortKey) || "created_desc";

  const tenants = await prisma.tenant.findMany({
    where: q
      ? {
          OR: [{ name: { contains: q } }, { id: { contains: q } }],
        }
      : undefined,
    orderBy: getOrder(sort),
  });

  // Build export href preserving current q/sort
  const exportHref = (() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    return `/admin/tenants/export?${params.toString()}`;
  })();

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tenants</h1>

        <div className="flex items-center gap-2">
          <SearchSortBar
            qInitial={q}
            sortInitial={sort}
            sortOptions={sortOptions as unknown as { value: string; label: string }[]}
          />
          <a
            href={exportHref}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Export CSV
          </a>
          <CreateTenantButton />
        </div>
      </header>

      <div className="mb-3 text-sm text-muted-foreground">
        {q ? (
          <>
            Showing <b>{tenants.length}</b> result{tenants.length === 1 ? "" : "s"} for “{q}”
          </>
        ) : (
          <>
            Showing <b>{tenants.length}</b> tenant{tenants.length === 1 ? "" : "s"}
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Activated Until</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  {q ? (
                    <>
                      No tenants matched “{q}”.{" "}
                      <Link href="/admin/tenants" className="underline">
                        Clear search
                      </Link>
                      .
                    </>
                  ) : (
                    "No tenants yet."
                  )}
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.id}</td>
                  <td className="px-3 py-2">{t.status}</td>
                  <td className="px-3 py-2">{fmtDate(t.activatedUntil)}</td>
                  <td className="px-3 py-2">{fmtDate(t.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="inline-flex h-8 items-center rounded-md border px-3 hover:bg-muted"
                      >
                        Manage
                      </Link>
                      <Link
                        href={`/admin/tenants/${t.id}/entitlements`}
                        className="inline-flex h-8 items-center rounded-md border px-3 hover:bg-muted"
                      >
                        Entitlements
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
