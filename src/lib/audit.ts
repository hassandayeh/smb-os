// src/lib/audit.ts
import { prisma } from "@/lib/prisma";     // only the prisma instance is exported
import { Prisma } from "@prisma/client";   // Prisma as a VALUE (for DbNull) + types

/**
 * Central audit writer. Keeps actions consistent & Keystone-compliant.
 * If `tx` is provided, writes inside the same transaction.
 */
export async function writeAudit(params: {
  tenantId: string;
  actorUserId: string;
  action:
    | "user.delete"
    | "user.status.changed"
    | "user.role.changed"
    | (string & {}); // allow future string actions
  meta?: Prisma.InputJsonValue | null;
  tx?: Prisma.TransactionClient | null;
}) {
  const { tenantId, actorUserId, action, meta = null, tx = null } = params;
  const client = tx ?? prisma;

  await client.auditLog.create({
    data: {
      tenantId,
      actorUserId,
      action,
      metaJson: meta ?? Prisma.DbNull, // store DB NULL when meta is absent
    },
  });
}
