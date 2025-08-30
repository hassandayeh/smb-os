// prisma/seed.ts
// SMB OS — Dev seed: modules, tenants (parent+child), entitlements
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/** Ensure a Module row exists by key */
async function ensureModule(key: string, name: string, description?: string) {
  const existing = await prisma.module.findUnique({ where: { key } });
  if (existing) return existing;
  return prisma.module.create({ data: { key, name, description } });
}

/** Find by name (not unique) or create; returns the row */
async function ensureTenantByName(name: string, data: Record<string, any> = {}) {
  const existing = await prisma.tenant.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.tenant.create({
    data: {
      name,
      status: "ACTIVE",
      defaultLocale: "en",
      ...data,
    },
  });
}

/** Ensure Entitlement exists (composite PK) */
async function ensureEntitlement(
  tenantId: string,
  moduleKey: string,
  data: Record<string, any> = {}
) {
  const existing = await prisma.entitlement.findUnique({
    where: { tenantId_moduleKey: { tenantId, moduleKey } },
  });
  if (existing) return existing;
  return prisma.entitlement.create({
    data: {
      tenantId,
      moduleKey,
      isEnabled: true,
      ...data,
    },
  });
}

async function main() {
  console.log("Seeding…");

  // 1) Base modules (minimal set we currently use)
  await ensureModule("inventory", "Inventory", "Stock, batches, picking");
  await ensureModule("invoices", "Invoices", "Billing and invoicing");
  await ensureModule("subtenants", "Sub-tenants", "Limit number of child tenants");

  // 2) Tenants: parent + child (hierarchy)
  const parent = await ensureTenantByName("ParentCo Holdings", {
    industry: "services",
  });

  const child = await ensureTenantByName("ChildCo Trading", {
    parentTenantId: parent.id,
    industry: "services",
  });

  // 3) Entitlements
  await ensureEntitlement(parent.id, "inventory");
  await ensureEntitlement(parent.id, "invoices");
  await ensureEntitlement(parent.id, "subtenants", {
    limitsJson: { max: 3 }, // demo limit so we can test canCreateSubtenant()
  });

  await ensureEntitlement(child.id, "inventory");
  await ensureEntitlement(child.id, "invoices");

  // Fetch rows for logging (avoid strict selects so TS doesn't complain about new fields)
  const parentRow = await prisma.tenant.findUnique({ where: { id: parent.id } });
  const childRow = await prisma.tenant.findUnique({ where: { id: child.id } });

  console.log("Seed complete.");
  console.table([
    {
      label: "Parent tenant",
      id: parentRow?.id,
      name: parentRow?.name,
      // cast to any to read newly added field even if local types are stale
      parentTenantId: (parentRow as any)?.parentTenantId ?? null,
    },
    {
      label: "Child tenant",
      id: childRow?.id,
      name: childRow?.name,
      parentTenantId: (childRow as any)?.parentTenantId ?? null,
    },
  ]);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
