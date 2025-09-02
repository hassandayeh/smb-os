// src/lib/guard-tenant-settings.ts
// Keystone wrapper for the **Business Settings (L3)** surface.
// Allowed: L1/L2 (any tenant) OR L3 who is TENANT_ADMIN of this tenant.
// Blocks: L4/L5/anon. Centralized to avoid ad-hoc page logic.

import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { getActorLevel } from "@/lib/access";
import { TenantMemberRole } from "@prisma/client";

export type LevelKind = "L1" | "L2" | "L3" | "L4" | "L5";

export interface L3SettingsGateResult {
  level: LevelKind; // for UI nuances if needed
}

export async function ensureL3SettingsAccessOrRedirect(
  tenantId: string
): Promise<L3SettingsGateResult> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) notFound();

  // NOTE: your getActorLevel takes (userId, tenantId)
  const rawLevel = await getActorLevel(userId, tenantId);
  const level = (typeof rawLevel === "string" ? rawLevel : String(rawLevel)) as LevelKind;

  if (level === "L1" || level === "L2") {
    return { level };
  }

  if (level === "L3") {
    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId, role: TenantMemberRole.TENANT_ADMIN },
      select: { id: true },
    });
    if (!membership) redirect("/403");
    return { level };
  }

  redirect("/403");
}
