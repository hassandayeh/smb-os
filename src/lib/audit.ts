// src/lib/audit.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Central audit writer. Keeps actions consistent & Keystone-compliant.
 * If `tx` is provided, writes inside the same transaction.
 *
 * Conventions:
 * - `tenantId` is REQUIRED (tenant-scoped logs).
 * - `actorUserId` is REQUIRED (who did it).
 * - `action` is a normalized string:
 *    - "user.create"
 *    - "user.role.changed"
 *    - "user.status.changed"
 *    - "user.delete" (soft)
 *    - "user.supervisor.set" | "user.supervisor.unset"
 *    - "entitlement.update"
 * - `meta` may include { targetUserId, before, after, note, ... }.
 * - If a `Request` is passed, we best-effort capture { ip, userAgent } into meta.
 */

export type AuditAction =
  | "user.create"
  | "user.role.changed"
  | "user.status.changed"
  | "user.delete"
  | "user.supervisor.set"
  | "user.supervisor.unset"
  | "entitlement.update"
  | (string & {}); // forward compat

type Jsonish = Prisma.InputJsonValue | Prisma.NullTypes.DbNull;

function withRequestMeta(
  meta: Record<string, unknown> | null | undefined,
  req?: Request | null
) {
  const base = meta ?? {};
  if (!req) return base;

  const ip =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    null;
  const userAgent = req.headers.get("user-agent") ?? null;

  return {
    ...base,
    _req: { ip, userAgent },
  };
}

export async function writeAudit(params: {
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  /** Optional meta payload; stored as JSON, or DB NULL when absent. */
  meta?: Prisma.InputJsonValue | null;
  /** Optional Request to enrich meta with ip/ua. */
  req?: Request | null;
  /** Optional transaction client to keep writes atomic with caller. */
  tx?: Prisma.TransactionClient | null;
}) {
  const { tenantId, actorUserId, action, meta = null, req = null, tx = null } = params;
  const client = tx ?? prisma;

  // IMPORTANT: widen type so DbNull is allowed alongside InputJsonValue.
  const metaJson: Jsonish =
    meta === null || meta === undefined
      ? Prisma.DbNull
      : (withRequestMeta(meta as Record<string, unknown>, req) as Prisma.InputJsonValue);

  await client.auditLog.create({
    data: {
      tenantId,
      actorUserId,
      action,
      metaJson,
    },
  });
}
