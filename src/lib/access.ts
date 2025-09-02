import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";

/**
 * Effective access rule (Pyramids):
 * A user can access module M in tenant T iff:
 * 1) TenantEntitlement(T, M) == ON, and
 * 2) Role rule:
 *    - L1 (DEVELOPER): always allowed
 *    - L2 (APP_ADMIN): allowed for support/admin contexts (we treat as allowed for now; tighten later)
 *    - L3 (TENANT_ADMIN): allowed
 *    - L4/L5 (MANAGER/MEMBER): allowed only if UserEntitlement(userId, T, M) == ON
 *
 * NOTE: We keep this helper self-contained and side-effect free.
 *       Admin editing screens will keep their own checks; this is for feature access in tenant space.
 */

type PlatformRole = "DEVELOPER" | "APP_ADMIN";
type TenantMemberRole = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

export type AccessDecision = {
  allowed: boolean;
  reason:
    | "TENANT_OFF"
    | "PLATFORM_OVERRIDE"
    | "TENANT_ADMIN"
    | "USER_ENTITLEMENT_ON"
    | "USER_ENTITLEMENT_OFF"
    | "NO_USER_RULE"
    | "NO_MEMBERSHIP";
};

export async function hasModuleAccess(params: {
  userId: string | null | undefined;
  tenantId: string;
  moduleKey: string;
}): Promise<AccessDecision> {
  const { userId, tenantId, moduleKey } = params;

  // 1) Tenant master switch
  const ent = await prisma.entitlement.findUnique({
    where: { tenantId_moduleKey: { tenantId, moduleKey } },
    select: { isEnabled: true },
  });
  if (!ent?.isEnabled) {
    return { allowed: false, reason: "TENANT_OFF" };
  }

  // If there is no user (e.g., public/unauthenticated), deny by default
  if (!userId) {
    return { allowed: false, reason: "NO_MEMBERSHIP" };
  }

  // 2) Platform roles (L1/L2)
  const appRoles = await prisma.appRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const platformSet = new Set(appRoles.map((r) => r.role as PlatformRole));
  if (platformSet.has("DEVELOPER") || platformSet.has("APP_ADMIN")) {
    // Platform override for now; we can refine contexts later.
    return { allowed: true, reason: "PLATFORM_OVERRIDE" };
  }

  // 3) Tenant membership + role
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true, isActive: true },
  });

  if (!membership || !membership.isActive) {
    return { allowed: false, reason: "NO_MEMBERSHIP" };
  }

  const role = membership.role as TenantMemberRole;

  if (role === "TENANT_ADMIN") {
    return { allowed: true, reason: "TENANT_ADMIN" };
  }

  // 4) L4/L5 must also have per-user entitlement ON
  const ue = await prisma.userEntitlement.findUnique({
    where: { userId_tenantId_moduleKey: { userId, tenantId, moduleKey } },
    select: { isEnabled: true },
  });

  if (ue?.isEnabled) {
    return { allowed: true, reason: "USER_ENTITLEMENT_ON" };
  }

  // Distinguish between missing user rule and explicit OFF
  if (ue == null) {
    return { allowed: false, reason: "NO_USER_RULE" };
  }

  return { allowed: false, reason: "USER_ENTITLEMENT_OFF" };
}

/**
 * Convenience helper to throw a 403 in route handlers when not allowed.
 * Keep this in lib to avoid duplicating logic across handlers.
 */
export async function requireAccess(params: {
  userId: string | null | undefined;
  tenantId: string;
  moduleKey: string;
}) {
  const decision = await hasModuleAccess(params);
  if (!decision.allowed) {
    const error = new Error(`Forbidden (${decision.reason})`);
    // @ts-expect-error - tag a code for route handlers to map to 403
    error.status = 403;
    // @ts-expect-error
    error.reason = decision.reason;
    throw error;
  }
  return true;
}

/**
 * Layout-first helper for tenant modules.
 * Central wrapper that reuses requireAccess() and handles redirect uniformly.
 * Pages/layouts should call ONLY this (no ad-hoc redirects or user lookups).
 */
export async function ensureModuleAccessOrRedirect(
  tenantId: string,
  moduleKey: string
): Promise<void> {
  const userId = await getCurrentUserId(); // respects impersonation cookie in your impl
  try {
    await requireAccess({ userId, tenantId, moduleKey });
  } catch (err: any) {
    const reason = (err && (err.reason as string)) || "forbidden";
    redirect(`/forbidden?reason=${encodeURIComponent(reason)}`);
  }
}

/* -------------------------------------------------------------------------- */
/*                       CENTRALIZED PYRAMIDS ROLE LOGIC                       */
/* -------------------------------------------------------------------------- */

export type Level = "L1" | "L2" | "L3" | "L4" | "L5";
export type TargetLevel = Exclude<Level, "L1">; // cannot create L1

/**
 * Resolve actor level (L1–L5) in the context of a tenant.
 * - L1 if the user has platform role DEVELOPER
 * - L2 if the user has platform role APP_ADMIN
 * - Else based on tenant membership:
 *    TENANT_ADMIN → L3, MANAGER → L4, MEMBER → L5
 * - Returns null if no platform role and no membership in tenant.
 */
export async function getActorLevel(userId: string, tenantId: string): Promise<Level | null> {
  // Platform roles take precedence (L1/L2)
  const platform = await prisma.appRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const pset = new Set(platform.map((r) => r.role as PlatformRole));
  if (pset.has("DEVELOPER")) return "L1";
  if (pset.has("APP_ADMIN")) return "L2";

  // Tenant-scoped roles (L3/L4/L5)
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true, isActive: true },
  });
  if (!membership || !membership.isActive) return null;

  switch (membership.role as TenantMemberRole) {
    case "TENANT_ADMIN":
      return "L3";
    case "MANAGER":
      return "L4";
    case "MEMBER":
    default:
      return "L5";
  }
}

/**
 * Allowed creation targets for each actor level.
 * Project Pyramids rule:
 *   L1 → L2, L3, L4, L5
 *   L2 → L3, L4, L5
 *   L3 → L4, L5
 *   L4 → L5
 *   L5 → (none)
 */
export function getCreatableRolesFor(level: Level | null): TargetLevel[] {
  switch (level) {
    case "L1":
      return ["L2", "L3", "L4", "L5"];
    case "L2":
      return ["L3", "L4", "L5"];
    case "L3":
      return ["L4", "L5"];
    case "L4":
      return ["L5"];
    default:
      return [];
  }
}

/**
 * Generic manage guard (edit/delete/etc).
 * By default, self-management is not allowed (allowSelf = false).
 * - L1 manages all.
 * - L2 manages L3–L5, but not L1/L2 (including self when allowSelf=false).
 * - L3 manages L4–L5 (not self).
 * - L4 manages L5 (not self).
 * - L5 manages none.
 */
export function canManageUser(params: {
  actorLevel: Level | null;
  targetLevel: Level | null;
  allowSelf?: boolean;
  isSelf?: boolean;
}): boolean {
  const { actorLevel, targetLevel, allowSelf = false, isSelf = false } = params;
  if (!actorLevel || !targetLevel) return false;
  if (isSelf && !allowSelf) return false;

  if (actorLevel === "L1") return true;

  if (actorLevel === "L2") {
    return targetLevel === "L3" || targetLevel === "L4" || targetLevel === "L5";
  }

  if (actorLevel === "L3") {
    return targetLevel === "L4" || targetLevel === "L5";
  }

  if (actorLevel === "L4") {
    return targetLevel === "L5";
  }

  return false;
}

/**
 * Server-side assertion for create-user operations.
 * Throws an error with status=403 if disallowed.
 */
export function assertCanCreateRole(params: {
  actorLevel: Level | null;
  requestedLevel: TargetLevel | null;
}) {
  const { actorLevel, requestedLevel } = params;
  const allowed = getCreatableRolesFor(actorLevel).includes((requestedLevel ?? "") as TargetLevel);
  if (!allowed) {
    const error = new Error("Forbidden (role.create.not_allowed)");
    // @ts-expect-error status tag for routes
    error.status = 403;
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                  NEW: Platform Admin (non-tenant) guard                     */
/* -------------------------------------------------------------------------- */

/**
 * For ADMIN area pages/layouts (non-tenant context).
 * Allows only platform staff (L1/L2). Throws 403 otherwise.
 * Keeps all logic centralized here per Keystone rules.
 */
export async function requireAdminAccess(userId?: string | null) {
  if (!userId) {
    const err = new Error("Forbidden (AUTH)");
    // @ts-expect-error status tag used by route/page error mappers
    err.status = 403;
    throw err;
  }

  // Reuse central level resolution; tenantId is irrelevant for platform roles.
  const level = await getActorLevel(userId, "platform");
  if (level === "L1" || level === "L2") return true;

  const err = new Error("Forbidden (ADMIN_ONLY)");
  // @ts-expect-error status tag used by route/page error mappers
  err.status = 403;
  throw err;
}

/* -------------------------------------------------------------------------- */
/*             NEW: Settings (control plane) guard for L1/L2/L3               */
/* -------------------------------------------------------------------------- */

/**
 * Settings is a tenant control surface, not a feature module.
 * It should be accessible to L1/L2 (platform) and L3 (tenant admin),
 * without requiring a tenant entitlement switch.
 */
export async function ensureL3SettingsAccessOrRedirect(tenantId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/forbidden?reason=AUTH");
  }
  const level = await getActorLevel(userId, tenantId);
  if (level === "L1" || level === "L2" || level === "L3") {
    return;
  }
  redirect("/forbidden?reason=SETTINGS_NOT_ALLOWED");
}


// API helper: throws 403 instead of redirecting (for route handlers)
export async function requireL3SettingsAccess(tenantId: string, userId: string | null | undefined) {
  if (!userId) {
    const err = new Error("Forbidden (AUTH)");
    // @ts-expect-error tag for route handlers
    err.status = 403;
    throw err;
  }
  const level = await getActorLevel(userId, tenantId);
  if (level === "L1" || level === "L2" || level === "L3") return true;

  const err = new Error("Forbidden (SETTINGS_NOT_ALLOWED)");
  // @ts-expect-error tag for route handlers
  err.status = 403;
  throw err;
}
