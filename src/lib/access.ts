// src/lib/access.ts
import { prisma } from "@/lib/prisma";

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
