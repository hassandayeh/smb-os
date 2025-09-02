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
    role === "TENANT_ADMIN" ? "Tenant Admin (L3)" : role === "MANAGER" ? "Manager (L4)" : "Member (L5)";
  return (
    <span className="mr-2 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground ring-1 ring-inset ring-border">
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
      // SHOW ONLY users who still have a non-deleted membership in this tenant
      where: {
        tenantId,
        memberships: { some: { tenantId, deletedAt: null } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        username: true,
        appRoles: { select: { role: true } }, // Platform role column
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  // Is this the Platform tenant?
  const isPlatformTenant =
    (tenant?.id ?? "").toLowerCase() === "platform" ||
    (tenant?.name ?? "").toLowerCase() === "platform";

  // Build user list helpers
  const userIds = users.map((u) => u.id);
  const nameMap = new Map(users.map((u) => [u.id, u.name || u.email || u.id]));

  // Per-user entitlements (only for our module set)
  const userEnts = userIds.length
    ? await prisma.userEntitlement.findMany({
        where: { tenantId, userId: { in: userIds }, moduleKey: { in: [...MODULE_KEYS] } },
        select: { userId: true, moduleKey: true, isEnabled: true },
      })
    : [];

  // Build lookup: map[userId][moduleKey] = boolean | undefined
  const entMap = new Map<string, Record<(typeof MODULE_KEYS)[number], boolean | undefined>>();
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

  // Tenant memberships (L3/L4/L5) — include supervisorId
  const memberships = userIds.length
    ? await prisma.tenantMembership.findMany({
        // EXCLUDE soft-deleted memberships from lookups
        where: { tenantId, userId: { in: userIds }, deletedAt: null, isActive: true },
        select: { userId: true, role: true, supervisorId: true },
      })
    : [];

  const membershipMap = new Map<string, "TENANT_ADMIN" | "MANAGER" | "MEMBER" | null>();
  const supervisorMap = new Map<string, string | null>();
  for (const m of memberships) {
    membershipMap.set(m.userId, m.role as any);
    supervisorMap.set(m.userId, m.supervisorId ?? null);
  }

  // Managers available as supervisors (same tenant)
  const managerIds = memberships.filter((m) => m.role === "MANAGER").map((m) => m.userId);
  const managerOptions = managerIds.map((id) => ({ id, name: nameMap.get(id) ?? id }));

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
      // ignore soft-deleted rows for actor’s membership
      where: { tenantId, userId: actorUserId, deletedAt: null, isActive: true },
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

  const backToTenantHref = qsStr ? `/admin/tenants/${tenantId}?${qsStr}` : `/admin/tenants/${tenantId}`;
  const backToListHref = qsStr ? `/admin/tenants?${qsStr}` : `/admin/tenants`;
  const currentUrl = qsStr ? `/admin/tenants/${tenantId}/users?${qsStr}` : `/admin/tenants/${tenantId}/users`;

  const roleOptionsForActor = (isPlatform: boolean) =>
    isPlatform ? (["TENANT_ADMIN", "MANAGER", "MEMBER"] as const) : (["MANAGER", "MEMBER"] as const);

  return (
    <main className="bg-background">
      <div className="container mx-auto max-w-6xl p-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Users</h1>
            <p className="text-sm text-muted-foreground">Tenant: {tenant?.name ?? tenantId}</p>
          </div>
          <div className="flex gap-3">
            <Link href={backToTenantHref} className="text-primary hover:text-primary/80">
              Admin Console
            </Link>
            <Link href={backToListHref} className="text-primary hover:text-primary/80">
              Back to list
            </Link>
            <Link href={`/admin/tenants/${tenantId}`} className="text-primary hover:text-primary/80">
              Manage Tenant
            </Link>
          </div>
        </div>

        {/* Create User (inline form) */}
        <Card className="mb-6 border-border bg-card text-card-foreground shadow">
          <CardContent className="p-4">
            <form
              action={`/api/admin/tenants/${tenantId}/users`}
              method="post"
              className="grid grid-cols-1 gap-3 md:grid-cols-5"
            >
              <input className="rounded-md border border-input bg-background p-2" name="name" placeholder="Name (required)" required />
              <input className="rounded-md border border-input bg-background p-2" name="username" placeholder="Username (required)" required />
              <input className="rounded-md border border-input bg-background p-2" name="email" placeholder="Email (optional)" />
              <div className="flex items-center gap-2">
                <select className="rounded-md border border-input bg-background p-2" name="role" defaultValue="MANAGER">
                  {isPlatformTenant && <option value="APP_ADMIN">App Admin</option>}
                  <option value="TENANT_ADMIN" disabled={!isPlatform}>
                    Tenant Admin
                  </option>
                  <option value="MANAGER">Manager</option>
                  <option value="MEMBER">Member</option>
                </select>
              </div>
              <SubmitButton className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Create user</SubmitButton>
            </form>
          </CardContent>
        </Card>

        {/* Users Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Email</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                  {isPlatformTenant ? "Platform role" : "Tenant role"}
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Supervisor</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Created</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Access</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={7}>
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const row = entMap.get(u.id)!;
                  const onCount = (Object.keys(row) as (typeof MODULE_KEYS)[number][]).reduce(
                    (n, mk) => n + (row[mk] === true ? 1 : 0),
                    0
                  );
                  const total = MODULE_KEYS.length;

                  const tenantRole = membershipMap.get(u.id) ?? null;
                  const currentSupervisorId = supervisorMap.get(u.id) ?? null;
                  const currentSupervisorName = currentSupervisorId
                    ? nameMap.get(currentSupervisorId) ?? currentSupervisorId
                    : null;

                  const canEditRole =
                    !isPlatformTenant && (isPlatform || (actorIsL3Here && u.id !== actorUserId));
                  const roleOptions = roleOptionsForActor(isPlatform);

                  const canEditSupervisor =
                    !isPlatformTenant && (isPlatform || actorIsL3Here) && tenantRole === "MEMBER";

                  const hideManage = !isPlatformTenant && actorIsL3Here && u.id === actorUserId;

                  let platformRoleLabel: string | null = null;
                  if (isPlatformTenant) {
                    const rset = new Set((u.appRoles ?? []).map((r) => r.role));
                    platformRoleLabel = rset.has("DEVELOPER")
                      ? "Developer (L1)"
                      : rset.has("APP_ADMIN")
                      ? "App Admin (L2)"
                      : "—";
                  }

                  return (
                    <tr key={u.id} className="hover:bg-muted/50">
                      <td className="px-4 py-2 text-sm text-foreground">{u.name ?? "—"}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{u.email ?? "—"}</td>

                      <td className="px-4 py-2 text-sm text-foreground">
                        {isPlatformTenant ? (
                          <span>{platformRoleLabel}</span>
                        ) : tenantRole ? (
                          <TenantRolePill role={tenantRole} />
                        ) : (
                          "—"
                        )}

                        {!isPlatformTenant && canEditRole && (
                          <form
                            action={`/api/admin/tenants/${tenantId}/users/${u.id}`}
                            method="post"
                            className="mt-2 flex items-center gap-2"
                          >
                            <input type="hidden" name="redirectTo" value={currentUrl} />
                            <select
                              name="role"
                              defaultValue={tenantRole ?? "MEMBER"}
                              className="rounded-md border border-input bg-background p-1 text-xs"
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
                            <SubmitButton className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
                              Save
                            </SubmitButton>
                          </form>
                        )}
                      </td>

                      <td className="px-4 py-2 text-sm text-foreground">
                        {isPlatformTenant ? (
                          "—"
                        ) : tenantRole === "MEMBER" ? (
                          <>
                            {currentSupervisorId ? (
                              <span className="text-foreground">Supervisor: {currentSupervisorName}</span>
                            ) : (
                              <span className="text-muted-foreground">None</span>
                            )}
                            {canEditSupervisor && (
                              <form
                                action={`/api/admin/tenants/${tenantId}/users/${u.id}`}
                                method="post"
                                className="mt-2 flex items-center gap-2"
                              >
                                <input type="hidden" name="redirectTo" value={currentUrl} />
                                <select
                                  name="supervisorId"
                                  defaultValue={currentSupervisorId ?? ""}
                                  className="rounded-md border border-input bg-background p-1 text-xs"
                                >
                                  <option value="">{`(None)`}</option>
                                  {managerOptions.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                                <SubmitButton className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
                                  Save
                                </SubmitButton>
                              </form>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="px-4 py-2 text-sm text-foreground">{fmtDate(u.createdAt)}</td>

                      <td className="px-4 py-2 text-sm text-foreground">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground ring-1 ring-inset ring-border">
                          {onCount} / {total}
                        </span>
                      </td>

                      <td className="px-4 py-2 text-sm">
                        <form action={`/api/admin/preview-as`} method="post" className="mb-2 inline">
                          <input type="hidden" name="tenantId" value={tenantId} />
                          <input type="hidden" name="userId" value={u.id} />
                          <SubmitButton className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
                            Preview as
                          </SubmitButton>
                        </form>

                        {!(!isPlatformTenant && hideManage) && (
                          <Link
                            href={`/admin/tenants/${tenantId}/users/${u.id}`}
                            className="ml-2 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                          >
                            Manage
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Clear Preview shortcut */}
        <form action={`/api/admin/preview-as/clear`} method="post" className="mt-4">
          <SubmitButton className="rounded-md bg-secondary px-3 py-1.5 text-sm text-secondary-foreground ring-1 ring-inset ring-border">
            Clear preview
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
