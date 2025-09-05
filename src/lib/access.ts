// src/lib/access.ts
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";

/* ============================================================================
   Types
============================================================================ */
type PlatformRole = "DEVELOPER" | "APP_ADMIN";
type TenantMemberRole = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

export type AccessDecision = {
  allowed: boolean;
  reason:
    | "PLATFORM_OVERRIDE"          // A1/A2
    | "TENANT_TOP"                 // L1 inside tenant
    | "TENANT_ADMIN"               // (legacy)
    | "TENANT_OFF"                 // tenant disabled module
    | "USER_ENTITLEMENT_ON"        // L2+ user enabled for module
    | "USER_ENTITLEMENT_OFF"
    | "NO_USER_RULE"               // no per-user rule exists
    | "NO_MEMBERSHIP"              // not a member in tenant
    | "AUTH_REQUIRED"
    | "SETTINGS_NOT_ALLOWED"
    | "FORBIDDEN"
    | "UNKNOWN";
};

export type Level = "L1" | "L2" | "L3" | "L4" | "L5";

/* ============================================================================
   Helpers (rank-aware, DB-neutral)
============================================================================ */
function asDomain(val: unknown): "platform" | "tenant" | null {
  return val === "platform" || val === "tenant" ? val : null;
}

async function getUserCore(userId: string | null | undefined) {
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      // new model
      domain: true,        // "platform" | "tenant" | null
      rank: true,          // 1..5 | null
      active: true,
      tenantId: true,
      supervisorId: true,
    },
  });
}

/** Resolve an actor's generic level (L1..L5) for a given tenant or platform */
export async function getActorLevel(
  userId: string | null | undefined,
  tenantId: string | "platform"
): Promise<Level | null> {
  const core = await getUserCore(userId);

  // Prefer domain+rank if available
  if (core?.rank != null) {
    const domain = asDomain(core.domain);
    const r = core.rank;
    if (domain === "platform") {
      if (r <= 1) return "L1";
      if (r === 2) return "L2";
      if (r === 3) return "L3";
      if (r === 4) return "L4";
      return "L5";
    }
    if (domain === "tenant") {
      if (r === 1) return "L1";
      if (r === 2) return "L2";
      if (r === 3) return "L3";
      if (r === 4) return "L4";
      return "L5";
    }
  }

  // Fallbacks (pre-rank schema)
  // Platform roles → L1/L2
  if (userId) {
    const roles = await prisma.appRole.findMany({
      where: { userId },
      select: { role: true },
    });
    const rset = new Set(roles.map((r) => r.role as PlatformRole));
    if (rset.has("DEVELOPER")) return "L1";
    if (rset.has("APP_ADMIN")) return "L2";
  }

  // Tenant membership → L3/L4/L5
  if (userId && tenantId !== "platform") {
    const m = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } as any },
      select: { role: true, isActive: true },
    });
    if (!m || !m.isActive) return null;
    switch (m.role as TenantMemberRole) {
      case "TENANT_ADMIN": return "L3";
      case "MANAGER":      return "L4";
      default:             return "L5";
    }
  }

  return null;
}

/* ============================================================================
   Module Access (feature gates) — rank-aware
   Precedence:
   1) Platform override (A1/A2) → allow
   2) Tenant L1 → allow
   3) Tenant module off → deny
   4) Tenant L2+ require per-user entitlement (on/off/none)
   5) Legacy fallbacks (platform roles, tenant admin)
============================================================================ */
export async function hasModuleAccess(params: {
  userId: string | null | undefined;
  tenantId: string;
  moduleKey: string;
}): Promise<AccessDecision> {
  const { userId, tenantId, moduleKey } = params;

  if (!userId) return { allowed: false, reason: "AUTH_REQUIRED" };

  const core = await getUserCore(userId);

  // 1) Platform override (A1/A2)
  if (core?.rank != null && asDomain(core.domain) === "platform") {
    if (core.rank <= 2) return { allowed: true, reason: "PLATFORM_OVERRIDE" };
  } else {
    // legacy fallback to appRole if rank/domain missing
    const roles = await prisma.appRole.findMany({
      where: { userId },
      select: { role: true },
    });
    const rset = new Set(roles.map((r) => r.role as PlatformRole));
    if (rset.has("DEVELOPER") || rset.has("APP_ADMIN")) {
      return { allowed: true, reason: "PLATFORM_OVERRIDE" };
    }
  }

  // 2) Tenant L1
  if (core?.rank != null && asDomain(core.domain) === "tenant" && core.rank === 1) {
    return { allowed: true, reason: "TENANT_TOP" };
  }

  // 3) Tenant master switch
  const ent = await prisma.entitlement.findUnique({
    where: { tenantId_moduleKey: { tenantId, moduleKey } },
    select: { isEnabled: true },
  });
  if (!ent?.isEnabled) {
    return { allowed: false, reason: "TENANT_OFF" };
  }

  // 4) Tenant L2+ need per-user entitlement
  const level = await getActorLevel(userId, tenantId);
  if (level === "L4" || level === "L5" || level === "L3" /* conservative */) {
    const ue = await prisma.userEntitlement.findUnique({
      where: {
        userId_tenantId_moduleKey: { userId, tenantId, moduleKey },
      },
      select: { isEnabled: true },
    });
    if (ue?.isEnabled) return { allowed: true, reason: "USER_ENTITLEMENT_ON" };
    if (ue == null)      return { allowed: false, reason: "NO_USER_RULE" };
    return { allowed: false, reason: "USER_ENTITLEMENT_OFF" };
  }

  // 5) Legacy tenant-admin pass (if we couldn’t resolve level)
  const mem = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } as any },
    select: { role: true, isActive: true },
  });
  if (mem?.isActive && mem.role === "TENANT_ADMIN") {
    return { allowed: true, reason: "TENANT_ADMIN" };
  }

  return { allowed: false, reason: "FORBIDDEN" };
}

/** Throwing guard used in API routes for module access */
export async function requireAccess(params: {
  userId: string | null | undefined;
  tenantId: string;
  moduleKey: string;
}): Promise<true> {
  const decision = await hasModuleAccess(params);
  if (!decision.allowed) {
    const err: any = new Error(`Forbidden (${decision.reason})`);
    err.status = 403;
    err.reason = decision.reason;
    throw err;
  }
  return true;
}

/** Layout-friendly guard: module access → redirect to /forbidden */
export async function ensureModuleAccessOrRedirect(
  tenantId: string,
  moduleKey: string
): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    await requireAccess({ userId, tenantId, moduleKey });
  } catch (err: any) {
    const reason = err?.reason ?? "FORBIDDEN";
    redirect(`/forbidden?reason=${encodeURIComponent(reason)}`);
  }
}

/* ============================================================================
   Settings guards (L1/L2/L3 allowed)
   Used by Settings pages & their APIs (e.g., create tenant user).
============================================================================ */
export async function requireL3SettingsAccess(
  tenantId: string | "platform",
  userId: string | null | undefined
): Promise<true> {
  if (!userId) {
    const err: any = new Error("Forbidden (AUTH_REQUIRED)");
    err.status = 403;
    throw err;
  }
  const level = await getActorLevel(userId, tenantId);
  if (level === "L1" || level === "L2" || level === "L3") return true;

  const err: any = new Error("Forbidden (SETTINGS_NOT_ALLOWED)");
  err.status = 403;
  throw err;
}

export async function ensureL3SettingsAccessOrRedirect(
  tenantId: string | "platform"
): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    await requireL3SettingsAccess(tenantId, userId);
  } catch {
    redirect("/forbidden?reason=SETTINGS_NOT_ALLOWED");
  }
}

/* ============================================================================
   Admin area guards (legacy pages expect these names)
   Admin pages should be reachable by Platform L1/L2 (Developer/App admin).
============================================================================ */
export async function hasAdminAccess(
  userId: string | null | undefined
): Promise<AccessDecision> {
  if (!userId) return { allowed: false, reason: "AUTH_REQUIRED" };

  const core = await getUserCore(userId);
  if (core?.rank != null && asDomain(core.domain) === "platform" && core.rank <= 2) {
    return { allowed: true, reason: "PLATFORM_OVERRIDE" };
  }

  // fallback to appRole check
  const roles = await prisma.appRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const rset = new Set(roles.map((r) => r.role as PlatformRole));
  if (rset.has("DEVELOPER") || rset.has("APP_ADMIN")) {
    return { allowed: true, reason: "PLATFORM_OVERRIDE" };
  }

  return { allowed: false, reason: "FORBIDDEN" };
}

export async function requireAdminAccess(
  userId: string | null | undefined
): Promise<true> {
  const d = await hasAdminAccess(userId);
  if (!d.allowed) {
    const err: any = new Error(`Forbidden (${d.reason})`);
    err.status = 403;
    throw err;
  }
  return true;
}

export async function ensureAdminAccessOrRedirect(): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    await requireAdminAccess(userId);
  } catch {
    redirect("/forbidden?reason=FORBIDDEN");
  }
}
