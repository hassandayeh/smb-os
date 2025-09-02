// src/lib/audit.ts
import { prisma } from "@/lib/prisma";

/**
 * Best-effort audit writer.
 * Does not throw if the AuditLog table or shape changes — keeps UX resilient.
 */
export async function writeAudit(data: {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  meta?: Record<string, any>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: data.tenantId,
        actorUserId: data.actorUserId,
        action: data.action,
        // Store as JSON if column is Json, otherwise stringify:
        metaJson:
          typeof (prisma as any)._dmmf.modelMap?.AuditLog?.fields?.metaJson !== "undefined"
            ? (data.meta ?? {})
            : JSON.stringify(data.meta ?? {}),
      },
    });
  } catch {
    // swallow — audits should never break user flow
  }
}
