// src/lib/config/moduleConfig.ts
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PRESETS, type IndustryKey } from "@/industry/presets";

// Safe local defaults that always exist even if no preset/limits are found
const DEFAULTS: Record<string, any> = {
  inventory: { requireBatches: false, pickingPolicy: "FIFO", bomEnabled: false },
  invoices: { taxMode: "none", rounding: "none" },
  subtenants: { max: 1 },
};

// tiny deep merge (source wins)
function merge(a: any, b: any) {
  if (b == null) return a;
  if (Array.isArray(a) || Array.isArray(b) || typeof a !== "object" || typeof b !== "object") {
    return b;
  }
  const out: any = { ...a };
  for (const k of Object.keys(b)) out[k] = merge(a?.[k], b[k]);
  return out;
}

// Merge order: defaults → industry preset → tenant limitsJson
export async function getModuleConfig(tenantId: string, moduleKey: string) {
  const [industry, limits] = await Promise.all([
    getIndustry(tenantId),
    getTenantLimits(tenantId),
  ]);

  const preset = industry ? PRESETS[industry as IndustryKey]?.[moduleKey] : undefined;
  const fromDefaults = DEFAULTS[moduleKey];
  const fromLimits = limits?.[moduleKey];

  return merge(merge(fromDefaults, preset), fromLimits);
}

// Returns a merged map of all module limits for a tenant, keyed by moduleKey
export async function getTenantLimits(tenantId: string): Promise<Record<string, any>> {
  // We assume an Entitlement model exists; this is read-only and safe.
  const ents = await prisma.entitlement.findMany({
    where: { tenantId },
    select: { moduleKey: true, limitsJson: true } as Prisma.EntitlementSelect,
  } as any); // cast to any to avoid compile issues if the select type differs slightly

  const out: Record<string, any> = {};
  for (const e of ents) {
    if (e?.moduleKey && e?.limitsJson) out[e.moduleKey] = e.limitsJson;
  }
  return out;
}

// Reads tenant.industry if present; returns null if the field isn't in the schema yet.
// This avoids breaking the build before we run the migration in Step 2.
export async function getIndustry(tenantId: string): Promise<string | null> {
  const t = (await prisma.tenant.findUnique({
    where: { id: tenantId },
  })) as any;
  return t?.industry ?? null;
}
