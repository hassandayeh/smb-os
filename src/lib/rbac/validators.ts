// src/lib/rbac/validators.ts
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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

/** Helpers */
async function findActiveL1(tx: Tx, tenantId: string) {
  // L1 = numeric rank 1 (Appendix). Platform users have no tenant chain.
  return tx.user.findFirst({
    where: { tenantId, rank: 1, active: true },
    select: { id: true, tenantId: true, rank: true, supervisorId: true },
  });
}

async function countActiveL1(tx: Tx, tenantId: string) {
  return tx.user.count({ where: { tenantId, rank: 1, active: true } });
}

async function getUser(tx: Tx, userId: string) {
  return tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tenantId: true,
      rank: true,
      active: true,
      supervisorId: true,
    },
  });
}

/**
 * Enforce: exactly one active tenant L1 (rank=1) per tenant.
 * Throws RbacError('roles.singleL1Violation') if count !== 1.
 */
export async function assertSingleTenantL1(
  tenantId: string,
  tx: Tx = prisma
): Promise<void> {
  const count = await countActiveL1(tx, tenantId);
  if (count !== 1) {
    throw new RbacError("roles.singleL1Violation", { tenantId, count });
  }
}

/**
 * Validate supervisor invariants for a user draft (create/update).
 * - For tenant users with rank >= 2, supervisor is REQUIRED.
 * - Supervisor must be same tenant and higher authority (lower rank number).
 * - No cycles in the chain (walk up supervisors).
 *
 * Pass the "draft" values that will be persisted (not necessarily what is currently in DB).
 * If userId is provided, cycle detection ensures we don't point (directly/indirectly) to self.
 */
export async function validateSupervisorRule(
  draft: {
    userId?: string | null;
    tenantId: string | null;
    rank: number | null;
    supervisorId: string | null;
    active?: boolean | null;
  },
  tx: Tx = prisma
): Promise<void> {
  const tenantId = draft.tenantId ?? null;
  const rank = draft.rank ?? null;
  const supervisorId = draft.supervisorId ?? null;

  // Platform users (no tenantId) are excluded from supervisor logic.
  if (!tenantId) return;

  // L2+ must have a supervisor.
  if (rank !== null && rank >= 2 && !supervisorId) {
    throw new RbacError("roles.supervisorRequired", { tenantId, rank });
  }

  if (!supervisorId) return; // No supervisor to validate (allowed for L1).

  const sup = await getUser(tx, supervisorId);
  if (!sup) {
    // Treat missing supervisor as "not same tenant" to avoid leaking existence info.
    throw new RbacError("roles.supervisorSameTenant", { tenantId });
  }

  if (sup.tenantId !== tenantId) {
    throw new RbacError("roles.supervisorSameTenant", { tenantId });
  }

  // Supervisor must be higher authority (lower rank number).
  if (rank !== null && sup.rank >= rank) {
    throw new RbacError("roles.supervisorMustBeHigher", {
      supervisorId,
      supervisorRank: sup.rank,
      rank,
    });
  }

  // No cycles: walk up the chain from supervisor → ... → must not hit userId
  if (draft.userId) {
    let cursor: string | null | undefined = supervisorId;
    const seen = new Set<string>([draft.userId]);
    // Hard stop guard (depth limit) to avoid infinite loops on corrupted data
    for (let i = 0; i < 50 && cursor; i++) {
      if (seen.has(cursor)) {
        throw new RbacError("roles.supervisorNoCycles", { atUserId: cursor });
      }
      seen.add(cursor);
      const u = await getUser(tx, cursor);
      if (!u) break;
      cursor = u.supervisorId;
    }
  }
}

/**
 * Reassign reports on supervisor deactivation.
 * - If the supervisor has a manager → reassign reports to that manager.
 * - Else → reassign reports to the tenant's active L1.
 * Returns number of affected users.
 *
 * Throws:
 * - roles.tenantL1Missing → if no fallback L1 can be found.
 * - roles.singleL1Violation → if tenant has broken L1 invariant.
 */
export async function reassignOnSupervisorDeactivation(
  supervisorId: string,
  tx: Tx = prisma
): Promise<{ reassignedCount: number }> {
  const sup = await getUser(tx, supervisorId);
  if (!sup || !sup.tenantId) {
    // Nothing to do for platform or non-existent users.
    return { reassignedCount: 0 };
  }

  // Determine fallback: supervisor's manager or the L1 of the tenant.
  let fallbackManagerId = sup.supervisorId ?? null;

  if (!fallbackManagerId) {
    // Use tenant L1 as fallback
    const l1 = await findActiveL1(tx, sup.tenantId);
    if (!l1) {
      throw new RbacError("roles.tenantL1Missing", { tenantId: sup.tenantId });
    }
    fallbackManagerId = l1.id;
  }

  const result = await tx.user.updateMany({
    where: { supervisorId: sup.id, tenantId: sup.tenantId },
    data: { supervisorId: fallbackManagerId },
  });

  // Sanity check: keep the single L1 invariant healthy
  await assertSingleTenantL1(sup.tenantId, tx);

  return { reassignedCount: result.count };
}
