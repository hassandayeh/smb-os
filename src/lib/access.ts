// src/lib/access.ts
// Centralized access helpers (Keystone/Sphinx).
// Appendix-aligned: prefer {domain, rank} when present; gracefully fall back to legacy tables.
// DB-neutral (SQLite now, Postgres later).

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type PlatformRole = "DEVELOPER" | "APP_ADMIN";
type TenantMemberRole = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

export type AccessDecision = {
  allowed: boolean;
  reason:
    | "TENANT_OFF"
    | "PLATFORM_OVERRIDE"
    | "TENANT_TOP"
    | "TENANT_ADMIN"
    | "USER_ENTITLEMENT_ON"
    | "USER_ENTITLEMENT_OFF"
    | "NO_USER_RULE"
    | "NO_MEMBERSHIP"
    | "actor.level.unknown"
    | "target.not_found_or_deleted"
    | "peer.manage.forbidden"
    | "self.manage.forbidden"
    | "self.delete.forbidden"
    | "L3.can_only_manage_L4_L5_or_forbidden";
};

export type Level = "L1" | "L2" | "L3" | "L4" | "L5";
export type TargetLevel = Exclude<Level, "L1">; // cannot create L1

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function asDomain(val: unknown): "platform" | "tenant" | null {
  return val === "platform" || val === "tenant" ? val : null;
}

async function getUserCore(userId: string) {
  // Prefer new columns if present (from Appendix migration): {domain, rank, active, tenantId}
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      domain: true, // string | null (narrow via asDomain)
      rank: true, // number | null
      active: true,
      tenantId: true,
      supervisorId: true,
    },
  });
  return u;
}

/* -------------------------------------------------------------------------- */
/* Module access (tenant feature gates)                                       */
/* -------------------------------------------------------------------------- */

/**
 * A user can access module M in tenant T iff:
 * 1) TenantEntitlement(T, M) == ON, and
 * 2) Role rule (Appendix-aligned):
 *    - Platform domain rank 1–2 (A1/A2) → allowed (support/admin context)
 *    - Tenant domain rank 1 (L1) → allowed
 *    - Others require per-user entitlement ON
 */
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

  // 2) No user → no access
  if (!userId) {
    return { allowed: false, reason: "NO_MEMBERSHIP" };
  }

  // 3) Appendix-first decision using {domain, rank}
  const core = await getUserCore(userId);
  if (core) {
    const domain = asDomain(core.domain);
    const rank = core.rank ?? null;

    if (domain === "platform") {
      if (rank !== null && rank <= 2) {
        return { allowed: true, reason: "PLATFORM_OVERRIDE" };
      }
    } else if (domain === "tenant") {
      if (rank === 1) {
        return { allowed: true, reason: "TENANT_TOP" }; // tenant L1
      }
      // For L2+ require per-user entitlement ON
      const ue = await prisma.userEntitlement.findUnique({
        where: {
          userId_tenantId_moduleKey: { userId, tenantId, moduleKey },
        },
        select: { isEnabled: true },
      });
      if (ue?.isEnabled) {
        return { allowed: true, reason: "USER_ENTITLEMENT_ON" };
      }
      if (ue == null) {
        return { allowed: false, reason: "NO_USER_RULE" };
      }
      return { allowed: false, reason: "USER_ENTITLEMENT_OFF" };
    }
  }

  // 4) Legacy fallback (keeps current app stable during transition)
  const appRoles = await prisma.appRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const platformSet = new Set(appRoles.map((r) => r.role as PlatformRole));
  if (platformSet.has("DEVELOPER") || platformSet.has("APP_ADMIN")) {
    return { allowed: true, reason: "PLATFORM_OVERRIDE" };
  }

  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } as any },
    select: { role: true, isActive: true },
  });
  if (!membership || !membership.isActive) {
    return { allowed: false, reason: "NO_MEMBERSHIP" };
  }
  const role = membership.role as TenantMemberRole;
  if (role === "TENANT_ADMIN") {
    return { allowed: true, reason: "TENANT_ADMIN" };
  }

  const ue = await prisma.userEntitlement.findUnique({
    where: {
      userId_tenantId_moduleKey: { userId, tenantId, moduleKey },
    },
    select: { isEnabled: true },
  });
  if (ue?.isEnabled) return { allowed: true, reason: "USER_ENTITLEMENT_ON" };
  if (ue == null) return { allowed: false, reason: "NO_USER_RULE" };
  return { allowed: false, reason: "USER_ENTITLEMENT_OFF" };
}

/** Throw a 403 in route handlers when not allowed. */
export async function requireAccess(params: {
  userId: string | null | undefined;
  tenantId: string;
  moduleKey: string;
}): Promise<true> {
  const decision = await hasModuleAccess(params);
  if (!decision.allowed) {
    const error: any = new Error(`Forbidden (${decision.reason})`);
    error.status = 403;
    error.reason = decision.reason;
    throw error;
  }
  return true;
}

/* Layout-first helper for tenant modules: redirects uniformly on forbid */
export async function ensureModuleAccessOrRedirect(
  tenantId: string,
  moduleKey: string
): Promise<void> {
  const userId = await getCurrentUserId(); // your impl should respect preview cookie
  try {
    await requireAccess({ userId, tenantId, moduleKey });
  } catch (err: any) {
    const reason = (err && (err.reason as string)) || "forbidden";
    redirect(`/forbidden?reason=${encodeURIComponent(reason)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Role resolution & creation matrix                                           */
/* -------------------------------------------------------------------------- */

/**
 * Resolve actor level (L1–L5) in the context of a tenant.
 * - L1 if platform role DEVELOPER or platform rank=1
 * - L2 if platform role APP_ADMIN or platform rank=2
 * - Else based on tenant membership (or tenant ranks if present):
 *   TENANT_ADMIN → L3, MANAGER → L4, MEMBER → L5
 * - Returns null if no platform role and no membership in tenant.
 */
export async function getActorLevel(
  userId: string,
  tenantId: string | "platform"
): Promise<Level | null> {
  // Appendix-first
  const core = await getUserCore(userId);
  if (core?.rank != null) {
    const domain = asDomain(core.domain);
    const rank = core.rank;
    if (domain === "platform") {
      if (rank <= 1) return "L1";
      if (rank === 2) return "L2";
      if (rank === 3) return "L3";
      if (rank === 4) return "L4";
      return "L5";
    }
    if (domain === "tenant") {
      if (rank === 1) return "L1";
      if (rank === 2) return "L2";
      if (rank === 3) return "L3";
      if (rank === 4) return "L4";
      return "L5";
    }
  }

  // Legacy platform roles
  const platform = await prisma.appRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const pset = new Set(platform.map((r) => r.role as PlatformRole));
  if (pset.has("DEVELOPER")) return "L1";
  if (pset.has("APP_ADMIN")) return "L2";

  // Legacy tenant membership
  if (tenantId !== "platform") {
    const membership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } as any },
      select: { role: true, isActive: true },
    });
    if (!membership || !membership.isActive) return null;
    switch (membership.role as TenantMemberRole) {
      case "TENANT_ADMIN":
        return "L3";
      case "MANAGER":
        return "L4";
      default:
        return "L5";
    }
  }

  return null;
}

/**
 * Allowed creation targets for each actor level.
 * L1 → L2, L3, L4, L5
 * L2 → L3, L4, L5
 * L3 → L4, L5
 * L4 → L5
 * L5 → (none)
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

/** Throws 403 if actor cannot create requested role level. */
export function assertCanCreateRole(params: {
  actorLevel: Level | null;
  requestedLevel: TargetLevel | null;
}): void {
  const { actorLevel, requestedLevel } = params;
  const allowed = getCreatableRolesFor(actorLevel).includes(
    (requestedLevel ?? "") as TargetLevel
  );
  if (!allowed) {
    const error: any = new Error("Forbidden (role.create.not_allowed)");
    error.status = 403;
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Platform Admin (non-tenant) guard                                           */
/* -------------------------------------------------------------------------- */

/**
 * For ADMIN area pages/layouts (non-tenant context).
 * Allows only platform staff (L1/L2). Throws 403 otherwise.
 */
export async function requireAdminAccess(
  userId?: string | null
): Promise<true> {
  if (!userId) {
    const err: any = new Error("Forbidden (AUTH)");
    err.status = 403;
    throw err;
  }
  const level = await getActorLevel(userId, "platform");
  if (level === "L1" || level === "L2") return true;

  const err: any = new Error("Forbidden (ADMIN_ONLY)");
  err.status = 403;
  throw err;
}

/* -------------------------------------------------------------------------- */
/* Settings (control plane) guard for L1/L2/L3                                 */
/* -------------------------------------------------------------------------- */

/**
 * Settings is a tenant control surface, not a feature module.
 * Accessible to L1/L2 (platform) and L3 (tenant admin).
 */
export async function ensureL3SettingsAccessOrRedirect(
  tenantId: string
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/forbidden?reason=AUTH");
  }
  const level = await getActorLevel(userId!, tenantId);
  if (level === "L1" || level === "L2" || level === "L3") {
    return;
  }
  redirect("/forbidden?reason=SETTINGS_NOT_ALLOWED");
}

/** API helper: throws 403 instead of redirecting (for route handlers). */
export async function requireL3SettingsAccess(
  tenantId: string,
  userId: string | null | undefined
): Promise<true> {
  if (!userId) {
    const err: any = new Error("Forbidden (AUTH)");
    err.status = 403;
    throw err;
  }
  const level = await getActorLevel(userId, tenantId);
  if (level === "L1" || level === "L2" || level === "L3") return true;

  const err: any = new Error("Forbidden (SETTINGS_NOT_ALLOWED)");
  err.status = 403;
  throw err;
}

/* -------------------------------------------------------------------------- */
/* Manage rules (hierarchy + self/peer)                                        */
/* -------------------------------------------------------------------------- */

/** Map legacy membership role → level (used in delete/manage fallbacks). */
function legacyRoleToLevel(role: TenantMemberRole): Level {
  if (role === "TENANT_ADMIN") return "L3";
  if (role === "MANAGER") return "L4";
  return "L5";
}

/** Hierarchical manage rule (kept for compatibility in UI). */
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

export type ManageIntent = "view" | "edit" | "status" | "role" | "delete";

/**
 * canManageUserGeneral:
 * - Blocks self-delete for everyone.
 * - Only L1 may self-manage (view/edit/status/role). L1 self-delete still blocked.
 * - Peer-blocking: no same-level management (including L1→L1), except L1 self-manage.
 * - Then applies the existing hierarchical rules via canManageUser().
 */
export async function canManageUserGeneral(params: {
  tenantId: string;
  actorUserId: string;
  targetUserId: string;
  intent: ManageIntent;
}): Promise<{
  allowed: boolean;
  reason?: string;
  actorLevel?: Level | null;
  targetLevel?: Level | null;
}> {
  const { tenantId, actorUserId, targetUserId, intent } = params;

  // Resolve levels
  const [actorLevel, targetMembership] = await Promise.all([
    getActorLevel(actorUserId, tenantId),
    prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
      select: { role: true, isActive: true, deletedAt: true },
    }),
  ]);

  if (!actorLevel)
    return {
      allowed: false,
      reason: "actor.level.unknown",
      actorLevel: null,
      targetLevel: null,
    };

  if (!targetMembership || !!targetMembership.deletedAt)
    return {
      allowed: false,
      reason: "target.not_found_or_deleted",
      actorLevel,
      targetLevel: null,
    };

  const targetRole = (targetMembership.role ?? "MEMBER") as TenantMemberRole;
  const targetLevel: Level = legacyRoleToLevel(targetRole);
  const isSelf = actorUserId === targetUserId;

  // 1) No self-delete for anyone
  if (intent === "delete" && isSelf) {
    return {
      allowed: false,
      reason: "self.delete.forbidden",
      actorLevel,
      targetLevel,
    };
  }

  // 2) Only L1 may self-manage (but still cannot self-delete)
  if (isSelf && actorLevel !== "L1") {
    return {
      allowed: false,
      reason: "self.manage.forbidden",
      actorLevel,
      targetLevel,
    };
  }

  // 3) Peer-blocking (no same-level management), except L1 self-manage
  if (!isSelf && actorLevel === targetLevel) {
    return {
      allowed: false,
      reason: "peer.manage.forbidden",
      actorLevel,
      targetLevel,
    };
  }

  // 4) Hierarchical rule
  const allowed = canManageUser({ actorLevel, targetLevel, isSelf /* allowSelf=false */ });
  if (!allowed) {
    return {
      allowed: false,
      reason: "L3.can_only_manage_L4_L5_or_forbidden",
      actorLevel,
      targetLevel,
    };
  }

  return { allowed: true, actorLevel, targetLevel };
}
