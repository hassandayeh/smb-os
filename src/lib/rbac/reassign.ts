// src/lib/rbac/reassign.ts
// Centralized reassignment helper (Appendix — Supervisor fallback)
// Reassigns all active reports of `supervisorId` inside `tenantId`
// to the supervisor's own manager, or falls back to the tenant L1.

import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

type ReassignInput = {
  tenantId: string;
  supervisorUserId: string;
};

export async function reassignOnSupervisorDeactivation(
  input: ReassignInput
): Promise<{ count: number; fallbackUserId: string | null }> {
  const { tenantId, supervisorUserId } = input;

  // 1) Load the (soon-to-be) inactive/demoted supervisor membership
  const sup = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId: supervisorUserId },
    select: { userId: true, supervisorId: true },
  });

  // If no membership, nothing to do.
  if (!sup) return { count: 0, fallbackUserId: null };

  // 2) Preferred reassignment target = supervisor's own manager if exists and is still valid
  let targetSupervisorId: string | null = sup.supervisorId ?? null;
  if (targetSupervisorId) {
    const valid = await prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId: targetSupervisorId,
        isActive: true,
        deletedAt: null,
      },
      select: { userId: true },
    });
    if (!valid) {
      targetSupervisorId = null;
    }
  }

  // 3) Fallback to L1 (exactly one active TENANT_ADMIN)
  if (!targetSupervisorId) {
    const l1 = await prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        role: "TENANT_ADMIN",
        isActive: true,
        deletedAt: null,
      },
      select: { userId: true },
    });
    targetSupervisorId = l1?.userId ?? null;
  }

  // If we still don't have a target, bail safely (shouldn't happen if single-L1 enforced)
  if (!targetSupervisorId) {
    return { count: 0, fallbackUserId: null };
  }

  // 4) Bulk reassign active reports that currently point to this supervisor
  const { count } = await prisma.tenantMembership.updateMany({
    where: {
      tenantId,
      supervisorId: supervisorUserId,
      isActive: true,
      deletedAt: null,
    },
    data: {
      supervisorId: targetSupervisorId,
    },
  });

  // 5) Audit — use the supervisor's id as actor to satisfy string type
  try {
    await writeAudit({
      tenantId,
      actorUserId: supervisorUserId, // must be string (no null)
      action: "user.supervisor.reassigned_on_deactivate",
      req: undefined, // system-triggered
      meta: {
        deactivatedSupervisorId: supervisorUserId,
        reassignedTo: targetSupervisorId,
        count,
      },
    });
  } catch (err) {
    console.warn("Audit failed (reassignOnSupervisorDeactivation):", err);
  }

  return { count, fallbackUserId: targetSupervisorId };
}
