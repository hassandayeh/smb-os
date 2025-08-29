import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ToggleTenantEntitlement from "./toggle-tenant-entitlement";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
};

// Note: folder is [modulekey] (lowercase). Next will pass params.modulekey.
// We also accept params.moduleKey just in case the folder is renamed later.
type RouteParams = { modulekey?: string; moduleKey?: string };

export default async function ModuleEntitlementsPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams?: SearchParams;
}) {
  const moduleKeyRaw = params.moduleKey ?? params.modulekey ?? "";
  const moduleKey = decodeURIComponent(moduleKeyRaw);
  const q = (searchParams?.q ?? "").trim();

  if (!moduleKey) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Module key missing</h1>
          <Link
            href="/admin/entitlements"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            Back to Modules
          </Link>
        </div>
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          This page requires a module key in the URL.
        </div>
      </div>
    );
  }

  // Load module, tenants, and entitlements for this module
  const [mod, tenants, entRows] = await Promise.all([
    prisma.module.findUnique({ where: { key: moduleKey } }),
    prisma.tenant.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { id: { contains: q } },
            ],
          }
        : undefined,
      orderBy: [{ name: "asc" }],
    }),
    prisma.entitlement.findMany({ where: { moduleKey } }),
  ]);

  if (!mod) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Module not found</h1>
          <Link
            href="/admin/entitlements"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            Back to Modules
          </Link>
        </div>
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No module exists with key <b>{moduleKey}</b>.
        </div>
      </div>
    );
  }

  // Map: tenantId -> entitlement row
  const entMap = new Map(entRows.map((e) => [e.tenantId, e]));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {mod.name ?? mod.key} — <span className="text-muted-foreground">Entitlements</span>
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">Key: {mod.key}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            Admin Console
          </Link>
          <Link
            href="/admin/entitlements"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            Back to Modules
          </Link>
        </div>
      </div>

      {/* Search */}
      <form className="mb-4 flex items-end gap-2" method="get">
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-muted-foreground">Search Tenants</label>
        <input
            name="q"
            defaultValue={q}
            placeholder="Name or ID"
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
            href={`/admin/entitlements/${encodeURIComponent(moduleKey)}`}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted/40"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {/* Tenants table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Tenant ID</th>
              <th className="px-3 py-2">Enabled</th>
              <th className="px-3 py-2">Limits</th>
              <th className="px-3 py-2 text-right">Manage</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No tenants{q ? ` found for “${q}”` : ""}.
                </td>
              </tr>
            ) : (
              tenants.map((t) => {
                const cur = entMap.get(t.id);
                const enabled = cur?.isEnabled ?? false;
                const limits = cur?.limitsJson ?? null;

                return (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.id}</td>
                    <td className="px-3 py-2">
                      <ToggleTenantEntitlement
                        tenantId={t.id}
                        moduleKey={moduleKey}
                        initialEnabled={enabled}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <pre className="text-xs bg-gray-50 border rounded p-2 max-w-[40ch] overflow-x-auto">
                        {limits ? JSON.stringify(limits) : "—"}
                      </pre>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/tenants/${t.id}/entitlements`}
                        className="inline-flex h-8 items-center rounded-md border px-3 hover:bg-muted"
                      >
                        View Tenant
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
