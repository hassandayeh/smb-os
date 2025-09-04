// src/app/admin/tenants/page.tsx
import CreateTenantButton from "./CreateTenantButton";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import SearchSortBar from "./search-sort-bar"; // client component
import { requireAccess } from "@/lib/guard-page"; // ✅ Keystone admin guard
import { Button } from "@/components/ui/button"; // ✅ Styled actions
import { getTServer } from "@/lib/i18n-server"; // ✅ Server-side i18n
import { containsInsensitive } from "@/lib/db/search"; // ✅ PG-safe text search

// ⬇️ CHANGE 1: fmtDate now receives `t` and uses the i18n fallback key
function fmtDate(
  d: Date | null,
  t: (key: string, params?: Record<string, unknown>) => string
) {
  if (!d) return t("date.fallback");
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

// NOTE: labels are i18n keys (resolved later with t())
const sortOptions = [
  { value: "created_desc", label: "tenants.sort.newestFirst" },
  { value: "created_asc", label: "tenants.sort.oldestFirst" },
  { value: "activated_desc", label: "tenants.sort.activationLatest" },
  { value: "activated_asc", label: "tenants.sort.activationEarliest" },
  { value: "name_asc", label: "tenants.sort.nameAsc" },
  { value: "name_desc", label: "tenants.sort.nameDesc" },
] as const;

/* -------------------- PAGINATION -------------------- */
const PAGE_SIZE = 20;

function getPage(sp?: Record<string, unknown>) {
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
  t,
}: {
  page: number;
  totalPages: number;
  q: string;
  sort: SortKey;
  status: string; // "" | "ACTIVE" | "SUSPENDED"
  t: (key: string, params?: Record<string, unknown>) => string;
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
    <div className="mt-6 flex items-center justify-between">
      <div className="text-sm">
        {t("pagination.pageOf", { page, totalPages })}
      </div>
      <div className="space-x-2">
        <Link className={btn} href={makeHref(1)}>
          « {t("pagination.first")}
        </Link>
        <Link className={btn} href={makeHref(prev)}>
          ‹ {t("pagination.prev")}
        </Link>
        <Link className={btn} href={makeHref(next)}>
          {t("pagination.next")} ›
        </Link>
        <Link className={btn} href={makeHref(totalPages)}>
          {t("pagination.last")} »
        </Link>
      </div>
    </div>
  );
}
/* ------------------ END PAGINATION ------------------ */

function statusLabel(raw: string, t: (k: string) => string) {
  switch (raw) {
    case "ACTIVE":
      return t("status.active");
    case "SUSPENDED":
      return t("status.suspended");
    default:
      return raw;
  }
}

export default async function TenantsAdminPage({
  searchParams,
}: {
  // In this Next.js version, searchParams is async.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ✅ Keystone compliance: guard at the very top (admin area)
  await requireAccess();

  // i18n for server
  const { t } = await getTServer();

  // ✅ Await once, then use `sp` everywhere.
  const sp = (await searchParams) ?? {};
  const q = (typeof sp.q === "string" ? sp.q : "").trim();

  const sort =
    typeof sp.sort === "string" &&
    sortOptions.some((o) => o.value === (sp.sort as SortKey))
      ? (sp.sort as SortKey)
      : "created_desc";

  // Status (accepts any case)
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const status = rawStatus.trim().toUpperCase(); // "" | "ACTIVE" | "SUSPENDED"

  // Build Prisma where (PG-ready via centralized helper)
  const where: Prisma.TenantWhereInput = {};
  if (q) {
    where.OR = [
      containsInsensitive("name", q),
      containsInsensitive("id", q),
    ] as any;
  }
  if (status === "ACTIVE" || status === "SUSPENDED") {
    where.status = status as any;
  }

  // Pagination
  const page = getPage(sp);
  const skip = (page - 1) * PAGE_SIZE;
  const take = PAGE_SIZE;

  // ✅ IMPORTANT: no stray code after the return of this function
  // Count + list
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
    label: t(o.label),
  }));

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("admin.tenants.title")}
        </h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">{t("admin.console")}</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={exportHref}>{t("actions.exportCsv")}</Link>
          </Button>
          <CreateTenantButton />
        </div>
      </div>

      {/* Search + Sort */}
      <SearchSortBar
        currentSort={sort}
        sortOptions={sortOptionsForUI as any}
        currentQ={q}
        // status filter plumbing remains as-is (read from URL)
        currentStatus={status}
      />

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {q ? (
          <>
            {t("tenants.summary.query", {
              count: tenants.length,
              suffix: tenants.length === 1 ? "" : "s",
              q,
            })}
          </>
        ) : (
          <>
            {t("tenants.summary.noQuery", {
              count: tenants.length,
              suffix: tenants.length === 1 ? "" : "s",
            })}
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
              <th>{t("table.name")}</th>
              <th>{t("table.id")}</th>
              <th>{t("table.status")}</th>
              <th>{t("table.activatedUntil")}</th>
              <th>{t("table.created")}</th>
              <th className="text-right">{t("table.actions")}</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t">
            {tenants.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  {q ? (
                    <>
                      {t("tenants.empty.query", { q })}{" "}
                      <Link href="/admin/tenants" className="underline">
                        {t("actions.clearSearch")}
                      </Link>
                      .
                    </>
                  ) : (
                    t("tenants.empty.noQuery")
                  )}
                </td>
              </tr>
            ) : (
              tenants.map((tnt) => (
                <tr key={tnt.id} className="[&>td]:px-4 [&>td]:py-2">
                  <td>{tnt.name}</td>
                  <td className="font-mono">{tnt.id}</td>
                  <td className="uppercase">{statusLabel(tnt.status, t)}</td>
                  {/* ⬇️ CHANGE 2 & 3: pass `t` to fmtDate */}
                  <td>{fmtDate(tnt.activatedUntil, t)}</td>
                  <td>{fmtDate(tnt.createdAt, t)}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/tenants/${tnt.id}`}>
                          {t("actions.manage")}
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/tenants/${tnt.id}/entitlements`}>
                          {t("actions.entitlements")}
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <PaginationFooter
        page={page}
        totalPages={totalPages}
        q={q}
        sort={sort}
        status={status}
        t={t}
      />
    </div>
  );
}
