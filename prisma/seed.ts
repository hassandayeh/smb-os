// prisma/seed.ts
// SMB OS — Dev seed: modules, tenants (parent+child), entitlements + minimal Pyramids demo
import { PrismaClient, UserRole, PlatformRole, TenantMemberRole } from "@prisma/client";
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

/** NEW — Ensure a user exists (unique by tenantId+email) */
async function ensureUser(tenantId: string, email: string, name: string, role: UserRole = UserRole.MEMBER) {
  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      tenantId,
      email,
      name,
      role,
      // Dev-only placeholder. Replace with real hashes when auth lands.
      passwordHash: "dev",
    },
  });
}

/** NEW — Ensure a platform app role exists for a user */
async function ensureAppRole(userId: string, role: PlatformRole) {
  const existing = await prisma.appRole.findFirst({ where: { userId, role } });
  if (existing) return existing;
  return prisma.appRole.create({ data: { userId, role } });
}

/** NEW — Ensure a tenant membership exists for a user */
async function ensureMembership(
  userId: string,
  tenantId: string,
  role: TenantMemberRole,
  opts: { supervisorId?: string | null; grantableModules?: any } = {}
) {
  const existing = await prisma.tenantMembership.findFirst({ where: { userId, tenantId } });
  if (existing) return existing;
  return prisma.tenantMembership.create({
    data: {
      userId,
      tenantId,
      role,
      isActive: true,
      supervisorId: opts.supervisorId ?? null,
      grantableModules: opts.grantableModules ?? null,
    },
  });
}

/** NEW — Ensure per-user entitlement exists */
async function ensureUserEntitlement(
  userId: string,
  tenantId: string,
  moduleKey: string,
  isEnabled = true
) {
  const existing = await prisma.userEntitlement.findUnique({
    where: { userId_tenantId_moduleKey: { userId, tenantId, moduleKey } },
  });
  if (existing) return existing;
  return prisma.userEntitlement.create({
    data: { userId, tenantId, moduleKey, isEnabled },
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

  // ===== NEW: Minimal Pyramids seed (idempotent) =====

  // Users in the Parent tenant
  const dev = await ensureUser(parent.id, "dev@example.com", "Dev User", UserRole.ADMIN);
  const owner = await ensureUser(parent.id, "owner@parentco.test", "Parent Owner", UserRole.ADMIN); // L3
  const manager = await ensureUser(parent.id, "manager@parentco.test", "Manager One");
  const member = await ensureUser(parent.id, "member@parentco.test", "Member One");

  // AppRole: make 'dev' a platform DEVELOPER (L1)
  await ensureAppRole(dev.id, PlatformRole.DEVELOPER);

  // Tenant memberships (L3/L4/L5)
  await ensureMembership(owner.id, parent.id, TenantMemberRole.TENANT_ADMIN);
  await ensureMembership(manager.id, parent.id, TenantMemberRole.MANAGER, {
    grantableModules: { allow: ["inventory", "invoices"] },
  });
  await ensureMembership(member.id, parent.id, TenantMemberRole.MEMBER, {
    supervisorId: manager.id,
  });

  // Per-user access: give the member access to Inventory (since tenant-level is ON)
  await ensureUserEntitlement(member.id, parent.id, "inventory", true);

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
