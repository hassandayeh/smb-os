/* eslint-disable no-console */
// prisma/seed.ts — Minimal “Platform-only” seed

import {
  PrismaClient,
  Domain,
  PlatformRole,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 0) Nuke everything in FK-safe order
  await prisma.$transaction([
    prisma.authSession.deleteMany({}),        // sessions
    prisma.userEntitlement.deleteMany({}),    // per-user module flags
    prisma.tenantMembership.deleteMany({}),   // tenant memberships / supervisors
    prisma.appRole.deleteMany({}),            // platform roles
    prisma.auditLog.deleteMany({}),           // audit
    prisma.entitlement.deleteMany({}),        // tenant-module entitlements
    prisma.user.deleteMany({}),               // users
    prisma.module.deleteMany({}),             // modules
    prisma.tenant.deleteMany({}),             // tenants
  ]);

  // 1) Create the single Platform tenant (stable id)
  const PLATFORM_ID = "platform";
  await prisma.tenant.create({
    data: {
      id: PLATFORM_ID,           // schema: String @id (cuid by default) → we set a fixed id
      name: "Platform",
      // status/defaultLocale have schema defaults; nothing else required
    },
  });

  // 2) Create the single platform user (A1)
  //    NOTE: schema requires tenantId, even for PLATFORM users.
  //    We attach to PLATFORM tenant, but we DO NOT create any TenantMembership row.
  const devUser = await prisma.user.create({
    data: {
      tenantId: PLATFORM_ID,
      username: "Dev",
      email: "dev@platform.local",
      name: "Developer",
      passwordHash: "dev",     // see src/lib/auth.ts → verifyPassword accepts "dev"
      domain: Domain.PLATFORM, // PLATFORM domain
      rank: 1,                 // A1
    },
  });

  // 3) Tag as A1 in the platform roles table (used by your Admin UI checks)
  await prisma.appRole.create({
    data: {
      userId: devUser.id,
      role: PlatformRole.DEVELOPER, // A1
    },
  });

  console.log("✅ Seed complete.");
  console.log("Tenant:", { id: PLATFORM_ID, name: "Platform" });
  console.log("User (A1):", {
    username: "Dev",
    password: "dev",
    email: "dev@platform.local",
    domain: "PLATFORM",
    rank: 1,
  });
  console.log("Login with username 'Dev' and password 'dev'.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
