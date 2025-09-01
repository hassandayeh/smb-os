// src/app/admin/tenants/[tenantId]/users/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import SubmitButton from "@/components/SubmitButton";
import { getCurrentUserId } from "@/lib/current-user";

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
    return d?.toString() ?? "—";
  }
}

// Pretty pill for tenant role (L3/L4/L5)
function TenantRolePill({ role }: { role: "TENANT_ADMIN" | "MANAGER" | "MEMBER" }) {
  const label =
    role === "TENANT_ADMIN"
      ? "Tenant Admin (L3)"
      : role === "MANAGER"
      ? "Manager (L4)"
      : "Member (L5)";
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
      {label}
    </span>
  );
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
        role: true, // kept for future use, not shown now
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  // Build user list helpers
  const userIds = users.map((u) => u.id);
  const nameMap = new Map<string, string>(
    users.map((u) => [u.id, u.name || u.email || u.id])
  );

  // Load existing per-user entitlements for these users (only for our module set)
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

  // Load tenant memberships (L3/L4/L5) for these users in this tenant — include supervisorId
  const memberships = userIds.length
    ? await prisma.tenantMembership.findMany({
        where: { tenantId, userId: { in: userIds }, isActive: true },
        select: { userId: true, role: true, supervisorId: true },
      })
    : [];
  const membershipMap = new Map<string, "TENANT_ADMIN" | "MANAGER" | "MEMBER">();
  const supervisorMap = new Map<string, string | null>();
  for (const m of memberships) {
    membershipMap.set(m.userId, m.role as any);
    supervisorMap.set(m.userId, m.supervisorId ?? null);
  }
  // Managers available as supervisors (same tenant)
  const managerIds = memberships
    .filter((m) => m.role === "MANAGER")
    .map((m) => m.userId);
  const managerOptions = managerIds.map((id) => ({
    id,
    name: nameMap.get(id) ?? id,
  }));

  // ---- Actor flags: platform? L3 here? (for UI rules) ----
  const actorUserId = await getCurrentUserId();
  let isPlatform = false;
  let actorIsL3Here = false;
  if (actorUserId) {
    const roles = await prisma.appRole.findMany({
      where: { userId: actorUserId },
      select: { role: true },
    });
    const rset = new Set(roles.map((r) => r.role));
    isPlatform = rset.has("DEVELOPER") || rset.has("APP_ADMIN");

    const m = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: actorUserId, isActive: true },
      select: { role: true, isActive: true },
    });
    actorIsL3Here = !!m && m.isActive && m.role === "TENANT_ADMIN";
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

  // helper: role options allowed for the actor
  const roleOptionsForActor = (isPlatform: boolean) =>
    isPlatform
      ? (["TENANT_ADMIN", "MANAGER", "MEMBER"] as const)
      : (["MANAGER", "MEMBER"] as const);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <div className="text-sm text-muted-foreground">
            Tenant: <span className="font-medium">{tenant?.name ?? tenantId}</span>
          </div>
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
                {isPlatform && <option value="TENANT_ADMIN">Tenant Admin</option>}
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
              <th className="px-3 py-2">Tenant role</th>
              <th className="px-3 py-2">Supervisor</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">
                <div className="flex gap-2 items-center">
                  Access
                  <span className="text-xs text-muted-foreground">
                    (per-user)
                  </span>
                </div>
              </th>
              <th className="px-3 py-2 w-[30rem]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
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

                const tenantRole = membershipMap.get(u.id) ?? null;
                const currentSupervisorId = supervisorMap.get(u.id) ?? null;
                const currentSupervisorName = currentSupervisorId
                  ? nameMap.get(currentSupervisorId) ?? currentSupervisorId
                  : null;

                const canEditRole =
                  isPlatform || (actorIsL3Here && u.id !== actorUserId);
                const roleOptions = roleOptionsForActor(isPlatform);

                const canEditSupervisor =
                  (isPlatform || actorIsL3Here) && tenantRole === "MEMBER";

                // Hide "Manage" when the actor is L3 here and this row is themselves
                const hideManage = actorIsL3Here && u.id === actorUserId;

                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{u.name ?? "—"}</td>
                    <td className="px-3 py-2">{u.email ?? "—"}</td>

                    {/* Tenant role pill + inline editor (if allowed) */}
                    <td className="px-3 py-2">
                      {tenantRole ? (
                        <TenantRolePill role={tenantRole} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}

                      {canEditRole && (
                        <form
                          method="POST"
                          action={`/api/admin/tenants/${tenantId}/membership?redirectTo=${encodeURIComponent(
                            currentUrl
                          )}`}
                          className="mt-2 flex items-center gap-2"
                        >
                          <input type="hidden" name="userId" value={u.id} />
                          <select
                            name="role"
                            defaultValue={tenantRole ?? "MEMBER"}
                            className="rounded-md border px-2 py-1 text-xs"
                          >
                            {roleOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt === "TENANT_ADMIN"
                                  ? "Tenant Admin (L3)"
                                  : opt === "MANAGER"
                                  ? "Manager (L4)"
                                  : "Member (L5)"}
                              </option>
                            ))}
                          </select>
                          <SubmitButton className="h-7 px-2 rounded-md border text-xs">
                            Save
                          </SubmitButton>
                        </form>
                      )}
                    </td>

                    {/* Supervisor column (Members only) */}
                    <td className="px-3 py-2">
                      {tenantRole === "MEMBER" ? (
                        <>
                          {currentSupervisorId ? (
                            <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
                              Supervisor: {currentSupervisorName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}

                          {canEditSupervisor && (
                            <form
                              method="POST"
                              action={`/api/admin/tenants/supervisor?redirectTo=${encodeURIComponent(
                                currentUrl
                              )}`}
                              className="mt-2 flex items-center gap-2"
                            >
                              <input type="hidden" name="tenantId" value={tenantId} /> {/* NEW */}
                              <input type="hidden" name="userId" value={u.id} />
                              <select
                                name="supervisorId"
                                defaultValue={currentSupervisorId ?? ""}
                                className="rounded-md border px-2 py-1 text-xs"
                              >
                                <option value="">{`(None)`}</option>
                                {managerOptions.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                              <SubmitButton className="h-7 px-2 rounded-md border text-xs">
                                Save
                              </SubmitButton>
                            </form>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2">{fmtDate(u.createdAt)}</td>

                    {/* Compact access cell */}
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
                        {onCount} / {total}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Preview as */}
                        <form action="/api/dev/preview-user" method="POST">
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="redirectTo" value={currentUrl} />
                          <button
                            type="submit"
                            className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
                            title={`Preview as ${u.name || u.email || u.id}`}
                          >
                            Preview as
                          </button>
                        </form>

                        {/* Manage page (hidden for actor's own row when they are L3 here) */}
                        {!hideManage && (
                          <Link
                            href={`/admin/tenants/${tenantId}/users/${u.id}`}
                            className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
                            title="Open user management"
                          >
                            Manage
                          </Link>
                        )}
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
