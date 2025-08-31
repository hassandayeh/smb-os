// prisma/seed-pyramids-demo.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 1) Pick the first tenant (your screenshots show all users share one tenant)
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) throw new Error("No tenant found. Run db:seed first.");

  // 2) Ensure the module exists (inventory)
  const mod = await prisma.module.findUnique({ where: { key: "inventory" } });
  if (!mod) throw new Error('Module "inventory" not found. Seed modules first.');

  // 3) Ensure tenant entitlement is ON for inventory (master switch must be true)
  await prisma.entitlement.upsert({
    where: { tenantId_moduleKey: { tenantId: tenant.id, moduleKey: "inventory" } },
    update: { isEnabled: true },
    create: { tenantId: tenant.id, moduleKey: "inventory", isEnabled: true },
  });

  // 4) Create Manager (L4) + Member (L5)
  const l4 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "manager@demo" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Demo Manager",
      email: "manager@demo",
      passwordHash: "dev",
    },
    select: { id: true },
  });

  const l5 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "member@demo" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Demo Member",
      email: "member@demo",
      passwordHash: "dev",
    },
    select: { id: true },
  });

  // 5) Memberships
  await prisma.tenantMembership.upsert({
    where: { userId_tenantId: { userId: l4.id, tenantId: tenant.id } },
    update: { role: "MANAGER", isActive: true },
    create: { userId: l4.id, tenantId: tenant.id, role: "MANAGER", isActive: true },
  });

  await prisma.tenantMembership.upsert({
    where: { userId_tenantId: { userId: l5.id, tenantId: tenant.id } },
    update: { role: "MEMBER", isActive: true, supervisorId: l4.id },
    create: { userId: l5.id, tenantId: tenant.id, role: "MEMBER", isActive: true, supervisorId: l4.id },
  });

  // 6) Give the L5 a per-user entitlement ON (so we can flip to see both outcomes)
  await prisma.userEntitlement.upsert({
    where: {
      userId_tenantId_moduleKey: { userId: l5.id, tenantId: tenant.id, moduleKey: "inventory" },
    },
    update: { isEnabled: true },
    create: { userId: l5.id, tenantId: tenant.id, moduleKey: "inventory", isEnabled: true },
  });

  console.log("Seeded L4/L5 + per-user entitlement for inventory.");
  console.log({ tenantId: tenant.id, managerId: l4.id, memberId: l5.id, moduleKey: "inventory" });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
