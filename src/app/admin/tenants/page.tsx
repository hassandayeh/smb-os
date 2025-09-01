// src/app/admin/tenants/page.tsx
import CreateTenantButton from "./CreateTenantButton";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import SearchSortBar from "./search-sort-bar"; // client component
import { requireAccess } from "@/lib/guard-page"; // ✅ Keystone admin guard

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

function getOrder(sort: SortKey): Prisma.TenantOrderByWithRelationInput[] {
  switch (sort) {
    case "created_asc":
      return [{ createdAt: "asc" }];
    case "activated_desc":
      return [{ activatedUntil: "desc" }];
    case "activated_asc":
      return [{ activatedUntil: "asc" }];
    case "name_asc":
      return [{ name: "asc" }];
    case "name_desc":
      return [{ name: "desc" }];
    case "created_desc":
    default:
      return [{ createdAt: "desc" }];
  }
}

const sortOptions: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "activated_desc", label: "Activation (latest)" },
  { value: "activated_asc", label: "Activation (earliest)" },
  { value: "name_asc", label: "Name A → Z" },
  { value: "name_desc", label: "Name Z → A" },
] as const;

/* -------------------- PAGINATION -------------------- */
const PAGE_SIZE = 20;

function getPage(sp?: Record<string, string | string[] | undefined>) {
  const raw = typeof sp?.page === "string" ? sp.page : "";
  const n = Number(raw || "1");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function PaginationFooter({
  page,
  totalPages,
  q,
  sort,
  status,
}: {
  page: number;
  totalPages: number;
  q: string;
  sort: SortKey;
  status: string; // "" | "ACTIVE" | "SUSPENDED"
}) {
  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    if (status) params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const btn =
    "inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted";

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        Page <span className="font-medium">{page}</span> of{" "}
        <span className="font-medium">{totalPages}</span>
      </div>
      <div className="flex items-center gap-2">
        <Link className={btn} href={makeHref(1)} aria-disabled={page === 1}>
          « First
        </Link>
        <Link className={btn} href={makeHref(prev)} aria-disabled={page === 1}>
          ‹ Prev
        </Link>
        <Link className={btn} href={makeHref(next)} aria-disabled={page === totalPages}>
          Next ›
        </Link>
        <Link
          className={btn}
          href={makeHref(totalPages)}
          aria-disabled={page === totalPages}
        >
          Last »
        </Link>
      </div>
    </div>
  );
}
/* ------------------ END PAGINATION ------------------ */

export default async function TenantsAdminPage({
  searchParams,
}: {
  // In this Next.js version, searchParams is async.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ✅ Keystone compliance: guard at the very top (admin area)
  await requireAccess();

  // ✅ Await once, then use `sp` everywhere.
  const sp = (await searchParams) ?? {};

  const q = (typeof sp.q === "string" ? sp.q : "").trim();

  const sort =
    (typeof sp.sort === "string" &&
    sortOptions.some((o) => o.value === (sp.sort as SortKey))
      ? (sp.sort as SortKey)
      : "created_desc");

  // Status (accepts any case)
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const status = rawStatus.trim().toUpperCase(); // "" | "ACTIVE" | "SUSPENDED"

  // Build Prisma where
  const where: Prisma.TenantWhereInput = {};
  if (q) {
    where.OR = [{ name: { contains: q } }, { id: { contains: q } }];
  }
  if (status === "ACTIVE" || status === "SUSPENDED") {
    where.status = status as any;
  }

  // Pagination
  const page = getPage(sp);
  const skip = (page - 1) * PAGE_SIZE;
  const take = PAGE_SIZE;
  const totalCount = await prisma.tenant.count({ where });

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: getOrder(sort),
    skip,
    take,
    select: {
      id: true,
      name: true,
      status: true,
      activatedUntil: true,
      createdAt: true,
      defaultLocale: true,
      deletedAt: true,
      // parent/children removed from UI, no longer needed here
    },
  });

  // Export href (preserve q/sort/status)
  const exportHref = (() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    if (status) params.set("status", status);
    return `/admin/tenants/export?${params.toString()}`;
  })();

  const sortOptionsForUI = sortOptions.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tenants</h1>

        <div className="flex items-center gap-2">
          <SearchSortBar
            qInitial={q}
            sortInitial={sort}
            sortOptions={sortOptionsForUI}
          />

          <Link
            href="/admin"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bgMuted hover:bg-muted"
          >
            Admin Console
          </Link>

          <Link
            href={exportHref}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Export CSV
          </Link>
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

      <PaginationFooter
        page={page}
        totalPages={totalPages}
        q={q}
        sort={sort}
        status={status}
      />
    </div>
  );
}
