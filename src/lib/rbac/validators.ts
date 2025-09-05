// src/lib/rbac/validators.ts
import { prisma } from "@/lib/prisma";
import type { Prisma, TenantMemberRole } from "@prisma/client";

/**
 * RBAC error codes map 1:1 to i18n keys.
 * Callers should translate as: t(err.code, err.meta)
 */
export type RbacErrorCode =
  | "roles.singleL1Violation"
  | "roles.tenantL1Missing"
  | "roles.supervisorRequired"
  | "roles.supervisorSameTenant"
  | "roles.supervisorMustBeHigher"
  | "roles.supervisorNoCycles"
  | "roles.reassignmentComplete";

export class RbacError extends Error {
  code: RbacErrorCode;
  meta?: Record<string, unknown>;
  constructor(code: RbacErrorCode, meta?: Record<string, unknown>) {
    super(code);
    this.name = "RbacError";
    this.code = code;
    this.meta = meta;
  }
}

type Tx = Prisma.TransactionClient | typeof prisma;

/* =====================================================================================
   Schema-aware helpers (current DB model)
   - “L1” (top tenant rank) == TENANT_ADMIN in TenantMembership
   - Supervisor mapping is stored on TenantMembership.supervisorId (userId of an L4 manager)
   ===================================================================================== */

async function countActiveTenantAdmins(tx: Tx, tenantId: string): Promise<number> {
  return tx.tenantMembership.count({
    where: {
      tenantId,
      role: "TENANT_ADMIN",
      isActive: true,
      deletedAt: null,
    },
  });
}

async function getMembershipByUserTenant(
  tx: Tx,
  userId: string,
  tenantId: string
): Promise<
  | {
      userId: string;
      tenantId: string;
      role: TenantMemberRole;
      isActive: boolean;
      deletedAt: Date | null;
      supervisorId: string | null;
    }
  | null
> {
  return tx.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } as any },
    select: {
      userId: true,
      tenantId: true,
      role: true,
      isActive: true,
      deletedAt: true,
      supervisorId: true,
    },
  });
}

async function getActiveManagerUserIds(tx: Tx, tenantId: string): Promise<string[]> {
  const rows = await tx.tenantMembership.findMany({
    where: {
      tenantId,
      role: "MANAGER",
      isActive: true,
      deletedAt: null,
    },
    select: { userId: true },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => r.userId);
}

/* =====================================================================================
   Validators
   ===================================================================================== */

/**
 * Enforce: exactly one active tenant L1 (TENANT_ADMIN) per tenant.
 * Throws RbacError('roles.singleL1Violation') if count !== 1.
 */
export async function assertSingleTenantL1(
  tenantId: string,
  tx: Tx = prisma
): Promise<void> {
  const count = await countActiveTenantAdmins(tx, tenantId);
  if (count !== 1) {
    throw new RbacError("roles.singleL1Violation", { tenantId, count });
  }
}

/**
 * Validate supervisor invariants for a user draft (create/update) against current schema.
 * - Supervisor mapping applies to MEMBERS (L5). Managers/Admins must not point to supervisors.
 * - When provided, supervisor must be an active MANAGER in the same tenant.
 * - No self-reference and no cycles (walk up supervisor chain defensively).
 *
 * Pass the values that will be persisted (not necessarily current DB state).
 */
export async function validateSupervisorRule(
  draft: {
    tenantId: string;
    userId?: string | null; // for cycle checks (updates)
    role: TenantMemberRole | null; // role to be saved
    supervisorId: string | null; // userId of supervisor (MANAGER) or null
  },
  tx: Tx = prisma
): Promise<void> {
  const { tenantId, userId, role, supervisorId } = draft;

  // Only MEMBERS can/should have a supervisor
  if (role && role !== "MEMBER" && supervisorId) {
    throw new RbacError("roles.supervisorMustBeHigher", {
      // Using this key to indicate “not allowed to have a supervisor at this rank”
      supervisorRank: "MANAGER",
      rank: role,
    });
  }

  // For MEMBERS: supervisor is required
  if (role === "MEMBER" && !supervisorId) {
    throw new RbacError("roles.supervisorRequired", { tenantId, role });
  }

  // If no supervisor to validate, we're done
  if (!supervisorId) return;

  // Validate supervisor membership
  const supMem = await getMembershipByUserTenant(tx, supervisorId, tenantId);
  if (!supMem) {
    // Avoid leaking cross-tenant existence → treat as same-tenant violation
    throw new RbacError("roles.supervisorSameTenant", { tenantId });
  }
  if (supMem.tenantId !== tenantId) {
    throw new RbacError("roles.supervisorSameTenant", { tenantId });
  }
  // Supervisor must be an active MANAGER
  if (!supMem.isActive || supMem.deletedAt || supMem.role !== "MANAGER") {
    throw new RbacError("roles.supervisorMustBeHigher", {
      supervisorId,
      supervisorRole: supMem.role,
      required: "MANAGER",
    });
  }

  // No self-reference / cycles (defensive; chain depth is tiny in current model)
  if (userId) {
    let cursor: string | null | undefined = supervisorId;
    const seen = new Set<string>([userId]); // if we touch the target → cycle
    for (let i = 0; i < 20 && cursor; i++) {
      if (seen.has(cursor)) {
        throw new RbacError("roles.supervisorNoCycles", { atUserId: cursor });
      }
      seen.add(cursor);
      const u = await getMembershipByUserTenant(tx, cursor, tenantId);
      if (!u) break;
      cursor = u.supervisorId;
    }
  }
}

/**
 * Reassign reports when a MANAGER (supervisor) is deactivated.
 * - Prefer another active MANAGER in the same tenant.
 * - If none exist, clear supervisor (UI should prompt to reassign later).
 * Returns: { reassignedCount }
 */
export async function reassignOnSupervisorDeactivation(
  supervisorUserId: string,
  tenantId: string,
  tx: Tx = prisma
): Promise<{ reassignedCount: number }> {
  // Find a fallback MANAGER in the same tenant (excluding the deactivated one)
  const candidates = (await getActiveManagerUserIds(tx, tenantId)).filter(
    (id) => id !== supervisorUserId
  );

  const fallbackId: string | null = candidates.length > 0 ? candidates[0] : null;

  const result = await tx.tenantMembership.updateMany({
    where: {
      tenantId,
      supervisorId: supervisorUserId,
      deletedAt: null,
    },
    data: { supervisorId: fallbackId },
  });

  // Note: We don’t enforce single-L1 here; this function is manager-focused.
  // Callers performing L1 demotion/deactivation should enforce assertSingleTenantL1 separately.

  // Provide a success code to surface a toast later
  if (result.count > 0) {
    throw new RbacError("roles.reassignmentComplete", {
      reassignedCount: result.count,
      fallbackUsed: fallbackId ? "manager" : "none",
    });
  }

  return { reassignedCount: result.count };
}
