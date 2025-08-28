// src/lib/entitlements.ts
import { PrismaClient } from '@prisma/client';
import { redirect } from 'next/navigation';

let prisma: PrismaClient;
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) global.__prisma = new PrismaClient();
  prisma = global.__prisma;
}

// Returns true if a tenant has the module enabled.
export async function hasEntitlement(tenantId: string, moduleKey: string): Promise<boolean> {
  if (!tenantId || !moduleKey) return false;

  // Your model likely has a composite key and no `id` column.
  // We filter by isEnabled: true and only select that field (typesafe).
  const ent = await prisma.entitlement.findFirst({
    where: { tenantId, moduleKey, isEnabled: true },
    select: { isEnabled: true },
  });

  return !!ent?.isEnabled;
}

// Use in Server Components/pages: redirect to /forbidden on fail (friendly 403).
export async function requireEntitlement(tenantId: string, moduleKey: string): Promise<void> {
  const ok = await hasEntitlement(tenantId, moduleKey);
  if (!ok) redirect('/forbidden');
}

// Use in API routes: throw an error you can catch and return 403.
export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function assertEntitlementOrThrow(tenantId: string, moduleKey: string): Promise<void> {
  const ok = await hasEntitlement(tenantId, moduleKey);
  if (!ok) throw new ForbiddenError();
}
