// src/app/admin/tenants/[tenantId]/users/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";

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
  // For now, we list the two tenant-space modules you already have wired.
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

      <div className="text-sm text-muted-foreground">
        Tenant:{" "}
        <span className="font-medium">{tenant?.name ?? tenantId}</span>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Created</th>
              {/* New column for per-user module toggles */}
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
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {u.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">{u.email ?? "—"}</td>
                    <td className="px-3 py-2">{String(u.role ?? "—")}</td>
                    <td className="px-3 py-2">{fmtDate(u.createdAt)}</td>

                    {/* Per-user toggles cell */}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {MODULE_KEYS.map((mk) => {
                          const current = row?.[mk]; // true | false | undefined (undefined = NO_USER_RULE)
                          const label =
                            mk.charAt(0).toUpperCase() + mk.slice(1);
                          const isOn = current === true;
                          // We send the next intended state in the form:
                          const nextState = !isOn;

                          return (
                            <form
                              key={mk}
                              action={`/api/admin/tenants/${tenantId}/users/${u.id}/entitlements`}
                              method="POST"
                              className="inline-flex"
                            >
                              <input type="hidden" name="moduleKey" value={mk} />
                              <input
                                type="hidden"
                                name="isEnabled"
                                value={String(nextState)}
                              />
                              <input
                                type="hidden"
                                name="redirectTo"
                                value={currentUrl}
                              />
                              <button
                                type="submit"
                                className={[
                                  "inline-flex h-7 items-center rounded-md border px-2 text-xs",
                                  isOn
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                                    : "hover:bg-muted",
                                ].join(" ")}
                                title={
                                  isOn
                                    ? `Disable ${label} for this user`
                                    : `Enable ${label} for this user`
                                }
                              >
                                {label}: {current === undefined ? "—" : isOn ? "ON" : "OFF"}
                              </button>
                            </form>
                          );
                        })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {/* Preview as: posts to API, sets cookie, redirects back */}
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

                        {/* Placeholder for future edit */}
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted cursor-not-allowed opacity-50"
                          title="Edit (coming soon)"
                          disabled
                        >
                          Edit
                        </button>
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
