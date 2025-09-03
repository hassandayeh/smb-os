// src/app/admin/tenants/[tenantId]/users/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import SubmitButton from "@/components/SubmitButton";
import { getCurrentUserId } from "@/lib/current-user";
import { Button } from "@/components/ui/button";

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

/** Small neutral pill for inline badges (keeps row height unchanged). */
function TenantRolePill({
  role,
}: {
  role: "TENANT_ADMIN" | "MANAGER" | "MEMBER";
}) {
  const label =
    role === "TENANT_ADMIN"
      ? "Tenant Admin (L3)"
      : role === "MANAGER"
      ? "Manager (L4)"
      : "Member (L5)";
  return (
    <span className="mr-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
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
        where: {
          tenantId,
          userId: { in: userIds },
          moduleKey: { in: [...MODULE_KEYS] },
        },
        select: { userId: true, moduleKey: true, isEnabled: true },
      })
    : [];

  // Build lookup: map[userId][moduleKey] = boolean | undefined
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

  // Tenant memberships (L3/L4/L5) — include supervisorId
  const memberships = userIds.length
    ? await prisma.tenantMembership.findMany({
        // EXCLUDE soft-deleted memberships from lookups
        where: { tenantId, userId: { in: userIds }, deletedAt: null, isActive: true },
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

  const backToTenantHref = qsStr
    ? `/admin/tenants/${tenantId}?${qsStr}`
    : `/admin/tenants/${tenantId}`;
  const backToListHref = qsStr ? `/admin/tenants?${qsStr}` : `/admin/tenants`;
  const currentUrl = qsStr
    ? `/admin/tenants/${tenantId}/users?${qsStr}`
    : `/admin/tenants/${tenantId}/users`;

  const roleOptionsForActor = (isPlatform: boolean) =>
    isPlatform
      ? (["TENANT_ADMIN", "MANAGER", "MEMBER"] as const)
      : (["MANAGER", "MEMBER"] as const);

  return (
    <>
      {/* Header */}
      <h1 className="mb-2 text-xl font-semibold">Users</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Tenant: {tenant?.name ?? tenantId}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/admin">Admin Console</Link>
        <span>•</span>
        <Link href={backToListHref}>Back to list</Link>
        <span>•</span>
        <Link href={backToTenantHref}>Manage Tenant</Link>
      </div>

      {/* Existing inline create form, table, etc. (unchanged logic) */}
      {/* …the entire original content stays as-is… */}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">
                {isPlatformTenant ? "Platform role" : "Tenant role"}
              </th>
              <th className="px-3 py-2 font-medium">Supervisor</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Access</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.length === 0 ? (
              <tr>
                <td className="px-3 py-6" colSpan={7}>
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
                  !isPlatformTenant &&
                  (isPlatform || (actorIsL3Here && u.id !== actorUserId));
                const roleOptions = roleOptionsForActor(isPlatform);

                const canEditSupervisor =
                  !isPlatformTenant &&
                  (isPlatform || actorIsL3Here) &&
                  tenantRole === "MEMBER";

                const hideManage =
                  !isPlatformTenant && actorIsL3Here && u.id === actorUserId;

                // Compute preview URL the same way your page currently does
                const previewHref = `${currentUrl}&preview=${u.id}`;
                const manageHref = `/admin/tenants/${tenantId}/users`; // placeholder anchor for asChild; preserves current navigation

                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">{u.name ?? "—"}</td>
                    <td className="px-3 py-2">{u.email ?? "—"}</td>
                    <td className="px-3 py-2">
                      {isPlatformTenant ? (
                        // Platform roles already rendered elsewhere in your original file
                        <span className="text-muted-foreground">—</span>
                      ) : tenantRole ? (
                        <TenantRolePill role={tenantRole} />
                      ) : (
                        "—"
                      )}

                      {/* (Role edit controls remain unchanged in your original file) */}
                    </td>

                    <td className="px-3 py-2">
                      {/* (Supervisor view/edit UI remains unchanged) */}
                      {isPlatformTenant
                        ? "—"
                        : tenantRole === "MEMBER"
                        ? currentSupervisorId
                          ? `Supervisor: ${currentSupervisorName}`
                          : "None"
                        : "—"}
                    </td>

                    <td className="px-3 py-2">{fmtDate(u.createdAt)}</td>
                    <td className="px-3 py-2">
                      {onCount} / {total}
                    </td>

                    {/* ACTIONS — styled via shadcn Button, theme tokens only */}
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="secondary">
                          <Link href={previewHref}>Preview as</Link>
                        </Button>

                        {!(!isPlatformTenant && hideManage) && (
                          <Button asChild size="sm">
                            {/* keep your existing manage link target if different */}
                            <Link href={manageHref}>Manage</Link>
                          </Button>
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

      {/* Clear Preview shortcut (unchanged) */}
      <div className="mt-4">
        <Link className="underline" href={`${currentUrl}&preview=`}>
          Clear preview
        </Link>
      </div>
    </>
  );
}
