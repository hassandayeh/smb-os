// src/app/admin/tenants/[tenantId]/users/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined) {
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

export default async function TenantUsersPage({
  params,
  searchParams,
}: {
  params: { tenantId: string };
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const { tenantId } = params;

  // ---- Known modules (keep in sync with your module config) ----
  const MODULE_KEYS = ["inventory", "invoices"] as const;

  // Load tenant (for header context) + users
  const [tenant, users] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  // Load existing per-user entitlements for these users (only for our module set)
  const userIds = users.map((u) => u.id);
  const userEnts = userIds.length
    ? await prisma.userEntitlement.findMany({
        where: { tenantId, userId: { in: userIds }, moduleKey: { in: [...MODULE_KEYS] } },
        select: { userId: true, moduleKey: true, isEnabled: true },
      })
    : [];

  // Build a lookup: map[userId][moduleKey] = boolean | undefined
  const entMap = new Map<
    string,
    Record<(typeof MODULE_KEYS)[number], boolean | undefined>
  >();
  for (const u of users) {
    entMap.set(
      u.id,
      MODULE_KEYS.reduce((acc, mk) => {
        acc[mk] = undefined;
        return acc;
      }, {} as Record<(typeof MODULE_KEYS)[number], boolean | undefined>)
    );
  }
  for (const e of userEnts) {
    const row = entMap.get(e.userId);
    if (row) row[e.moduleKey as (typeof MODULE_KEYS)[number]] = e.isEnabled;
  }

  // Preserve q/sort when navigating back if present
  const sp = searchParams ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "";
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (sort) qs.set("sort", sort);
  const qsStr = qs.toString();
  const backToTenantHref = qsStr
    ? `/admin/tenants/${tenantId}?${qsStr}`
    : `/admin/tenants/${tenantId}`;
  const backToListHref = qsStr ? `/admin/tenants?${qsStr}` : `/admin/tenants`;

  // current page URL for redirect after actions
  const currentUrl = qsStr
    ? `/admin/tenants/${tenantId}/users?${qsStr}`
    : `/admin/tenants/${tenantId}/users`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Admin Console
          </Link>
          <Link
            href={backToListHref}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Back to list
          </Link>
          <Link
            href={backToTenantHref}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Manage Tenant
          </Link>
        </div>
      </div>

      {/* Create User (inline form) */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <form
            action={`/api/admin/tenants/${tenantId}/users`}
            method="POST"
            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_180px_auto] gap-3 items-end"
          >
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Name (optional)
              </label>
              <input
                name="name"
                type="text"
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Email (required)
              </label>
              <input
                name="email"
                type="email"
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Role
              </label>
              <select
                name="role"
                className="w-full rounded-md border px-3 py-2 text-sm"
                defaultValue="MEMBER"
              >
                <option value="TENANT_ADMIN">Tenant Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="MEMBER">Member</option>
              </select>
            </div>

            <input type="hidden" name="redirectTo" value={currentUrl} />

            <SubmitButton className="h-10 px-4 rounded-md border text-sm">
              Create user
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">
                <div className="flex gap-2 items-center">
                  Access
                  <span className="text-xs text-muted-foreground">
                    (per-user)
                  </span>
                </div>
              </th>
              <th className="px-3 py-2 w-64">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const row = entMap.get(u.id)!;
                const onCount = (Object.keys(row) as (typeof MODULE_KEYS)[number][])
                  .reduce((n, mk) => n + (row[mk] === true ? 1 : 0), 0);
                const total = MODULE_KEYS.length;

                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {u.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">{u.email ?? "—"}</td>
                    <td className="px-3 py-2">{String(u.role ?? "—")}</td>
                    <td className="px-3 py-2">{fmtDate(u.createdAt)}</td>

                    {/* Compact access cell */}
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
                        {onCount} / {total}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {/* Preview as */}
                        <form action="/api/dev/preview-user" method="POST">
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            type="hidden"
                            name="redirectTo"
                            value={currentUrl}
                          />
                          <button
                            type="submit"
                            className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
                            title={`Preview as ${u.name || u.email || u.id}`}
                          >
                            Preview as
                          </button>
                        </form>

                        {/* Manage page */}
                        <Link
                          href={`/admin/tenants/${tenantId}/users/${u.id}`}
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
                          title="Open user management"
                        >
                          Manage
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Clear Preview shortcut */}
      <div className="pt-2">
        <Link
          href={`/api/dev/preview-user?action=clear&redirectTo=${encodeURIComponent(
            currentUrl
          )}`}
          className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
        >
          Clear preview
        </Link>
      </div>
    </div>
  );
}
