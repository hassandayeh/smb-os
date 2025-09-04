// src/app/admin/tenants/page.tsx
import CreateTenantButton from "./CreateTenantButton";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import SearchSortBar from "./search-sort-bar";
import { requireAccess } from "@/lib/guard-page";
import { Button } from "@/components/ui/button";
import { containsInsensitive } from "@/lib/db/search";
import { cookies } from "next/headers";

// Server i18n via catalogs (matches layout cookie contract)
import { en } from "@/messages/en";
import { ar } from "@/messages/ar";

type TFunc = (key: string, params?: Record<string, unknown>) => string;

const getServerT = async (): Promise<{ t: TFunc }> => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("ui.locale")?.value;
  const locale = cookieLocale === "ar" ? "ar" : "en";
  const messages = locale === "ar" ? ar : en;

  const t: TFunc = (key, params) => {
    const msg = (messages as any)[key];
    if (msg == null) return key; // dev-friendly fallback
    if (!params) return msg as string;
    return Object.keys(params).reduce((acc, k) => {
      return acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(params[k]));
    }, msg as string);
  };

  return { t };
};

function fmtDate(d: Date | null, t: TFunc) {
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

const sortOptions = [
  { value: "created_desc", label: "tenants.sort.newestFirst" },
  { value: "created_asc", label: "tenants.sort.oldestFirst" },
  { value: "activated_desc", label: "tenants.sort.activationLatest" },
  { value: "activated_asc", label: "tenants.sort.activationEarliest" },
  { value: "name_asc", label: "tenants.sort.nameAsc" },
  { value: "name_desc", label: "tenants.sort.nameDesc" },
] as const;

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
  status: string;
  t: TFunc;
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
      <div className="flex items-center gap-2">
        <Link className={btn} href={makeHref(1)} aria-label={t("pagination.first")}>
          « {t("pagination.first")}
        </Link>
        <Link className={btn} href={makeHref(prev)} aria-label={t("pagination.prev")}>
          ‹ {t("pagination.prev")}
        </Link>
        <Link className={btn} href={makeHref(next)} aria-label={t("pagination.next")}>
          {t("pagination.next")} ›
        </Link>
        <Link className={btn} href={makeHref(totalPages)} aria-label={t("pagination.last")}>
          {t("pagination.last")} »
        </Link>
      </div>
    </div>
  );
}

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
  searchParams?: Promise<Record<string, unknown>>;
}) {
  await requireAccess();

  const { t } = await getServerT();

  const sp = (await searchParams) ?? {};
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const sort =
    typeof sp.sort === "string" &&
    sortOptions.some((o) => o.value === (sp.sort as SortKey))
      ? (sp.sort as SortKey)
      : "created_desc";

  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const status = rawStatus.trim().toUpperCase();

  const where: Prisma.TenantWhereInput = {};
  if (q) {
    where.OR = [containsInsensitive("name", q), containsInsensitive("id", q)] as any;
  }
  if (status === "ACTIVE" || status === "SUSPENDED") {
    where.status = status as any;
  }

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
    },
  });

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
    <main className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("admin.tenants.title")}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={exportHref}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bgMuted hover:bg-muted"
          >
            {t("actions.exportCsv")}
          </Link>
          <CreateTenantButton />
        </div>
      </div>

      <div className="mb-3">
        <SearchSortBar qInitial={q} sortInitial={sort} sortOptions={sortOptionsForUI} />
      </div>

      <div className="mb-3 text-sm text-muted-foreground">
        {q
          ? t("tenants.summary.query", { count: tenants.length, q })
          : t("tenants.summary.noQuery", { count: tenants.length })}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        {tenants.length === 0 ? (
          <div className="p-6 text-sm">
            {q ? (
              <>
                {t("tenants.empty.query", { q })}{" "}
                <Link href="?q=" className="underline underline-offset-2">
                  {t("actions.clearSearch")}
                </Link>
                .
              </>
            ) : (
              t("tenants.empty.noQuery")
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left">
              <tr>
                <th className="px-3 py-2">{t("table.name")}</th>
                <th className="px-3 py-2">{t("table.id")}</th>
                <th className="px-3 py-2">{t("table.status")}</th>
                <th className="px-3 py-2">{t("table.activatedUntil")}</th>
                <th className="px-3 py-2">{t("table.created")}</th>
                <th className="px-3 py-2">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tnt) => (
                <tr key={tnt.id} className="border-t">
                  <td className="px-3 py-2">{tnt.name}</td>
                  <td className="px-3 py-2">{tnt.id}</td>
                  <td className="px-3 py-2">{statusLabel(tnt.status, t)}</td>
                  <td className="px-3 py-2">{fmtDate(tnt.activatedUntil, t)}</td>
                  <td className="px-3 py-2">{fmtDate(tnt.createdAt, t)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/tenants/${tnt.id}`}>{t("actions.manage")}</Link>
                      </Button>
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/admin/tenants/${tnt.id}/entitlements`}>
                          {t("actions.entitlements")}
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaginationFooter
        page={page}
        totalPages={totalPages}
        q={q}
        sort={sort}
        status={status}
        t={t}
      />
    </main>
  );
}
