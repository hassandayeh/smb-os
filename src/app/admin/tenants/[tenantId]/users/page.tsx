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
    <span className="mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset">
      {label}
    </span>
  );
}

/** Safely append a query param to any URL, handling ? vs &. */
function appendQuery(base: string, key: string, value: string | number) {
  return `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(
    String(value)
  )}`;
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

  // Tenant memberships (L3/L4/L5) — include supervisorId and exclude soft-deleted
  const memberships = userIds.length
    ? await prisma.tenantMembership.findMany({
        where: {
          tenantId,
          userId: { in: userIds },
          deletedAt: null,
          isActive: true,
        },
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
      <div className="mb-4">
        <h1 className="text-xl font-semibold"># Users</h1>
        <p className="text-sm opacity-80">
          Tenant: <span className="font-medium">{tenant?.name ?? tenantId}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={backToListHref} className="underline">
            Admin Console • Back to list
          </Link>
          <span>•</span>
          <Link href={backToTenantHref} className="underline">
            Manage Tenant
          </Link>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="p-6 text-sm">No users yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="h-10 border-b">
                    <th className="px-3 text-left">Name</th>
                    <th className="px-3 text-left">Email</th>
                    <th className="px-3 text-left">
                      {isPlatformTenant ? "Platform role" : "Tenant role"}
                    </th>
                    <th className="px-3 text-left">Supervisor</th>
                    <th className="px-3 text-left">Created</th>
                    <th className="px-3 text-left">Access</th>
                    <th className="px-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const row = entMap.get(u.id)!;
                    const onCount = (
                      Object.keys(row) as (typeof MODULE_KEYS)[number][]
                    ).reduce((n, mk) => n + (row[mk] === true ? 1 : 0), 0);
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

                    // Build links safely
                    // (We keep these for back/forward consistency, but actions below are forms)
                    const previewAction = "/api/dev/preview-user";
                    const clearPreviewHref = appendQuery(
                      "/api/dev/preview-user",
                      "action",
                      "clear"
                    );

                    // Admin list → tenant-side Manage screen (existing surface)
                    const manageHref = `/${tenantId}/settings/users/${u.id}`;

                    return (
                      <tr key={u.id} className="h-12 border-b align-middle">
                        <td className="px-3">{u.name ?? "—"}</td>
                        <td className="px-3">{u.email ?? "—"}</td>
                        <td className="px-3">
                          {isPlatformTenant ? (
                            "—"
                          ) : tenantRole ? (
                            <TenantRolePill role={tenantRole} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3">
                          {isPlatformTenant
                            ? "—"
                            : tenantRole === "MEMBER"
                            ? currentSupervisorId
                              ? `Supervisor: ${currentSupervisorName}`
                              : "None"
                            : "—"}
                        </td>
                        <td className="px-3">{fmtDate(u.createdAt)}</td>
                        <td className="px-3">
                          {onCount} / {total}
                        </td>
                        <td className="px-3">
                          <div className="flex flex-wrap gap-2">
                            {/* Preview as (POST to set preview cookie) */}
                            <form
                              action={previewAction}
                              method="POST"
                              className="inline-block"
                            >
                              <input type="hidden" name="userId" value={u.id} />
                              <input
                                type="hidden"
                                name="redirectTo"
                                value="auto"
                              />
                              <SubmitButton size="sm" variant="secondary">
                                Preview as
                              </SubmitButton>
                            </form>

                            {/* Clear preview (GET with action=clear) */}
                            <Link
                              href={appendQuery(
                                clearPreviewHref,
                                "redirectTo",
                                currentUrl
                              )}
                              className="underline"
                            >
                              Clear preview
                            </Link>

                            {/* Manage link */}
                            {!(!isPlatformTenant && hideManage) && (
                              <Link href={manageHref}>
                                <Button size="sm" variant="default">
                                  Manage
                                </Button>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
