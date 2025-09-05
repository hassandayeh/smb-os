// src/app/admin/tenants/[tenantId]/users/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SubmitButton from "@/components/SubmitButton";
import { getCurrentUserId } from "@/lib/current-user";
import { en } from "@/messages/en";
import { ar } from "@/messages/ar";

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
      ? "Tenant Admin (L1)"
      : role === "MANAGER"
      ? "Manager (L2+)"
      : "Member (L2+)";
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
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
  // i18n (flat catalogs)
  const jar = await cookies();
  const locale = jar.get("ui.locale")?.value === "ar" ? "ar" : "en";
  const t = locale === "ar" ? ar : en;

  const { tenantId } = params;

  // Which modules do we surface access for in this list view
  const MODULE_KEYS = ["inventory", "invoices"] as const;

  const [tenant, users] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        tenantId,
        // visible users are those with any non-deleted membership in this tenant
        memberships: { some: { tenantId, deletedAt: null } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true, // (legacy platform field if present)
        createdAt: true,
        username: true,
        appRoles: { select: { role: true } }, // DEVELOPER/APP_ADMIN, etc.
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  // Platform tenant = name or id "platform" (case-insensitive)
  const isPlatformTenant =
    (tenant?.id ?? "").toLowerCase() === "platform" ||
    (tenant?.name ?? "").toLowerCase() === "platform";

  // Quick lookup maps
  const userIds = users.map((u) => u.id);
  const nameMap = new Map(users.map((u) => [u.id, u.name || u.email || u.id]));

  // Per-user module entitlements snapshot
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

  // Memberships (role/supervisor) for display
  const memberships = userIds.length
    ? await prisma.tenantMembership.findMany({
        where: { tenantId, userId: { in: userIds }, deletedAt: null, isActive: true },
        select: { userId: true, role: true, supervisorId: true },
      })
    : [];

  const membershipMap = new Map<string, "TENANT_ADMIN" | "MANAGER" | "MEMBER" | null>();
  const supervisorMap = new Map<string, string | null>();
  for (const m of memberships) {
    membershipMap.set(m.userId, (m.role as any) ?? null);
    supervisorMap.set(m.userId, m.supervisorId ?? null);
  }

  // Build manager options list (for reference / future inline actions if re-enabled)
  const managerIds = memberships.filter((m) => m.role === "MANAGER").map((m) => m.userId);
  const managerOptions = managerIds.map((id) => ({
    id,
    name: nameMap.get(id) ?? id,
  }));

  // Who's viewing? (for UX controls)
  const actorUserId = await getCurrentUserId();
  let isPlatform = false;
  let actorIsL1Here = false; // top rank inside tenant
  if (actorUserId) {
    const roles = await prisma.appRole.findMany({
      where: { userId: actorUserId },
      select: { role: true },
    });
    const rset = new Set(roles.map((r) => r.role));
    isPlatform = rset.has("DEVELOPER") || rset.has("APP_ADMIN");

    const m = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: actorUserId, deletedAt: null, isActive: true },
      select: { role: true, isActive: true },
    });
    // Treat TENANT_ADMIN as top-rank in this UI
    actorIsL1Here = !!m && m.isActive && m.role === "TENANT_ADMIN";
  }

  // Preserve incoming q/sort to bounce back correctly
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

  // Centralized role options (UI only; server still enforces Appendix rules)
  const roleOptionsForActor = (platform: boolean) =>
    platform ? (["TENANT_ADMIN", "MANAGER", "MEMBER"] as const) : (["MANAGER", "MEMBER"] as const);

  // Destination for creation flow (lives in tenant settings)
  const createUserHref = qsStr
    ? `/${tenantId}/settings/users#create?${qsStr}`
    : `/${tenantId}/settings/users#create`;

  return (
    <div className="space-y-4">
      {/* Title + action bar */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Tenant: {tenant?.name ?? tenantId}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={backToTenantHref} className="underline">
            Admin Console
          </Link>
          <span>•</span>
          <Link href={backToTenantHref} className="underline">
            Manage Tenant
          </Link>
          {/* NEW: Create user entry point */}
          <Button asChild className="ml-4">
            <Link href={createUserHref}>Create user</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Table header */}
          <div className="grid grid-cols-7 gap-4 px-4 py-3 text-sm font-medium">
            <div>Name</div>
            <div>Email</div>
            <div>{isPlatformTenant ? "Platform role" : "Tenant role"}</div>
            <div>Supervisor</div>
            <div>Created</div>
            <div>Access</div>
            <div>Actions</div>
          </div>
          <div className="border-t" />

          {/* Empty state */}
          {users.length === 0 ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">
              <div>No users yet.</div>
              <div className="mt-3">
                <Link href={createUserHref} className="underline">
                  Create your first user
                </Link>
              </div>
            </div>
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
                !isPlatformTenant && (isPlatform || (actorIsL1Here && u.id !== actorUserId));
              const roleOptions = roleOptionsForActor(isPlatform);

              const canEditSupervisor =
                !isPlatformTenant && (isPlatform || actorIsL1Here) && tenantRole === "MEMBER";

              // L1 should not get "Manage" link on themselves (use Manage in workspace instead)
              const hideManage = !isPlatformTenant && actorIsL1Here && u.id === actorUserId;

              // Impersonation endpoints (honor centralized dev route)
              const previewAction = "/api/dev/preview-user";
              const clearPreviewHref = appendQuery("/api/dev/preview-user", "action", "clear");

              // Unified Manage destination (existing screen)
              const manageHref = `/${tenantId}/settings/users/${u.id}`;

              return (
                <div
                  key={u.id}
                  className="grid grid-cols-7 items-center gap-4 px-4 py-3 text-sm"
                >
                  <div className="truncate">{u.name ?? "—"}</div>
                  <div className="truncate">{u.email ?? "—"}</div>
                  <div>
                    {isPlatformTenant ? (
                      "—"
                    ) : tenantRole ? (
                      <TenantRolePill role={tenantRole} />
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="truncate">
                    {isPlatformTenant
                      ? "—"
                      : tenantRole === "MEMBER"
                      ? currentSupervisorId
                        ? `Supervisor: ${currentSupervisorName}`
                        : "None"
                      : "—"}
                  </div>
                  <div>{fmtDate(u.createdAt)}</div>
                  <div>
                    {onCount} / {total}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Preview as (POST to set preview cookie) */}
                    <form action={previewAction} method="POST">
                      <input type="hidden" name="userId" value={u.id} />
                      <SubmitButton>{t["actions.preview"]}</SubmitButton>
                    </form>

                    {/* Clear preview */}
                    <Link href={clearPreviewHref} className="underline">
                      {t["actions.clearPreview"]}
                    </Link>

                    {/* Manage link */}
                    {!(!isPlatformTenant && hideManage) && (
                      <Link href={manageHref} className="underline">
                        Manage
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
