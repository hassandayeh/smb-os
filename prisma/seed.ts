// prisma/seed.ts
// SMB OS — Dev seed (idempotent)
// - Base modules, tenants (parent+child), entitlements
// - Backfill new {domain, rank, supervisorId, active} on User
// - Seed minimal “Pyramids” demo + Platform A1
// - NEW: print roleCode (A/L) in the end-of-seed table

import {
  PrismaClient,
  UserRole,
  PlatformRole,
  TenantMemberRole,
  Domain,
} from "@prisma/client";

const prisma = new PrismaClient();

/** Render "A1" / "L3" codes for display/logging */
function roleCode(domain: Domain, rank: number): string {
  const prefix = domain === Domain.PLATFORM ? "A" : "L";
  return `${prefix}${rank}`;
}

/** Ensure a Module row exists by key */
async function ensureModule(key: string, name: string, description?: string) {
  const existing = await prisma.module.findUnique({ where: { key } });
  if (existing) return existing;
  return prisma.module.create({ data: { key, name, description } });
}

/** Find by name (not unique) or create; returns the row */
async function ensureTenantByName(
  name: string,
  data: Record<string, any> = {},
) {
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
  data: Record<string, any> = {},
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

/** Generate a per-tenant unique username from a base (email local-part) */
async function uniqueUsername(tenantId: string, base: string) {
  const clean = base.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "");
  let candidate = clean || "user";
  let i = 1;
  while (
    await prisma.user.findFirst({ where: { tenantId, username: candidate } })
  ) {
    candidate = `${clean || "user"}${i++}`;
  }
  return candidate;
}

/** Ensure a user exists (unique-ish: per-tenant + email) */
async function ensureUser(
  tenantId: string,
  email: string,
  name: string,
  role: UserRole = UserRole.MEMBER,
) {
  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) return existing;

  const base = email.split("@")[0] || name.replace(/\s+/g, "").toLowerCase();
  const username = await uniqueUsername(tenantId, base);

  // NOTE: Using schema defaults for domain=TENANT, rank=5, active=true
  return prisma.user.create({
    data: {
      tenantId,
      email,
      name,
      role,
      username, // REQUIRED by schema (per-tenant unique)
      passwordHash: "dev", // Dev-only placeholder; replace with real auth later
    },
  });
}

/** Ensure a platform app role exists for a user */
async function ensureAppRole(userId: string, role: PlatformRole) {
  const existing = await prisma.appRole.findFirst({ where: { userId, role } });
  if (existing) return existing;
  return prisma.appRole.create({ data: { userId, role } });
}

/** Ensure a tenant membership exists for a user */
async function ensureMembership(
  userId: string,
  tenantId: string,
  role: TenantMemberRole,
  opts: { supervisorId?: string | null; grantableModules?: any } = {},
) {
  const existing = await prisma.tenantMembership.findFirst({
    where: { userId, tenantId },
  });
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

/** Ensure per-user entitlement exists */
async function ensureUserEntitlement(
  userId: string,
  tenantId: string,
  moduleKey: string,
  isEnabled = true,
) {
  const existing = await prisma.userEntitlement.findUnique({
    where: { userId_tenantId_moduleKey: { userId, tenantId, moduleKey } },
  });
  if (existing) return existing;
  return prisma.userEntitlement.create({
    data: { userId, tenantId, moduleKey, isEnabled },
  });
}

/** ---- Backfill helpers for new hierarchy fields ---- */

/** Promote exactly one L1 (rank=1) TENANT user per tenant; demote others */
async function ensureExactlyOneTenantL1(tenantId: string) {
  // Exclude PLATFORM users from L1 election
  const tenantUsers = await prisma.user.findMany({
    where: { tenantId, domain: Domain.TENANT, deletedAt: null },
    select: { id: true, role: true, rank: true },
    orderBy: [{ createdAt: "asc" }],
  });

  if (tenantUsers.length === 0) return;

  // First, pick an ADMIN to be L1 if possible; otherwise first user.
  const admin = tenantUsers.find((u) => u.role === UserRole.ADMIN);
  const l1Id = admin?.id ?? tenantUsers[0].id;

  // Set chosen L1 to rank=1 and active
  await prisma.user.update({
    where: { id: l1Id },
    data: { domain: Domain.TENANT, rank: 1, active: true },
  });

  // All other TENANT users must not be rank 1
  await prisma.user.updateMany({
    where: { tenantId, domain: Domain.TENANT, id: { not: l1Id }, rank: 1 },
    data: { rank: 2 }, // demote to next rank if they were 1
  });
}

/** Assign supervisors: rank ≥2 must have a supervisor of smaller rank in same tenant */
async function backfillSupervisors(tenantId: string) {
  // Find L1 (rank=1)
  const l1 = await prisma.user.findFirst({
    where: {
      tenantId,
      domain: Domain.TENANT,
      rank: 1,
      active: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!l1) return;

  // Prefer a manager (rank 3..4) to supervise members (rank 5)
  const managers = await prisma.user.findMany({
    where: {
      tenantId,
      domain: Domain.TENANT,
      rank: { gte: 2, lte: 4 },
      active: true,
      deletedAt: null,
    },
    select: { id: true, rank: true },
    orderBy: [{ rank: "asc" }],
  });
  const manager = managers[0];

  // All rank=2..4 (non-L1) should report to L1 unless already supervised
  await prisma.user.updateMany({
    where: {
      tenantId,
      domain: Domain.TENANT,
      rank: { gte: 2, lte: 4 },
      supervisorId: null,
      deletedAt: null,
    },
    data: { supervisorId: l1.id },
  });

  // Members (rank>=5) should report to a manager if present, else to L1
  await prisma.user.updateMany({
    where: {
      tenantId,
      domain: Domain.TENANT,
      rank: { gte: 5 },
      supervisorId: null,
      deletedAt: null,
    },
    data: { supervisorId: manager ? manager.id : l1.id },
  });
}

/** Map legacy role → starting rank (safe defaults) */
function rankFor(userRole: UserRole): number {
  if (userRole === UserRole.ADMIN) return 2; // will promote one ADMIN to 1 later
  return 5; // members default to 5
}

async function main() {
  console.log("Seeding…");

  // 1) Base modules
  await ensureModule("inventory", "Inventory", "Stock, batches, picking");
  await ensureModule("invoices", "Invoices", "Billing and invoicing");
  await ensureModule("subtenants", "Sub-tenants", "Limit number of child tenants");

  // 2) Tenants: parent + child hierarchy
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
    limitsJson: { max: 3 },
  });
  await ensureEntitlement(child.id, "inventory");
  await ensureEntitlement(child.id, "invoices");

  // ===== Minimal Pyramids + Hierarchy backfill =====

  // Tenant users (TENANT domain by default via schema)
  const owner = await ensureUser(
    parent.id,
    "owner@parentco.test",
    "Parent Owner",
    UserRole.ADMIN,
  );
  const manager = await ensureUser(
    parent.id,
    "manager@parentco.test",
    "Manager One",
    UserRole.MEMBER,
  );
  const member = await ensureUser(
    parent.id,
    "member@parentco.test",
    "Member One",
    UserRole.MEMBER,
  );

  // Backfill domain & rank for the three TENANT users (idempotent)
  await prisma.user.update({
    where: { id: owner.id },
    data: { domain: Domain.TENANT, rank: rankFor(UserRole.ADMIN), active: true },
  });
  await prisma.user.update({
    where: { id: manager.id },
    data: { domain: Domain.TENANT, rank: rankFor(UserRole.MEMBER), active: true },
  });
  await prisma.user.update({
    where: { id: member.id },
    data: { domain: Domain.TENANT, rank: rankFor(UserRole.MEMBER), active: true },
  });

  // Platform A1 — separate via Domain.PLATFORM + AppRole
  const dev = await ensureUser(
    parent.id, // still attached to a tenant (schema requires tenantId)
    "dev@example.com",
    "Dev User",
    UserRole.ADMIN,
  );
  await prisma.user.update({
    where: { id: dev.id },
    data: {
      domain: Domain.PLATFORM,
      rank: 1, // A1 (platform)
      active: true,
    },
  });
  await ensureAppRole(dev.id, PlatformRole.DEVELOPER);

  // Tenant memberships (orthogonal demo to Users.domain/rank)
  await ensureMembership(owner.id, parent.id, TenantMemberRole.TENANT_ADMIN);
  await ensureMembership(manager.id, parent.id, TenantMemberRole.MANAGER, {
    grantableModules: { allow: ["inventory", "invoices"] },
  });
  await ensureMembership(member.id, parent.id, TenantMemberRole.MEMBER, {
    supervisorId: manager.id,
  });

  // Give the member explicit module access (demo)
  await ensureUserEntitlement(member.id, parent.id, "inventory", true);

  // ---- Enforce hierarchy invariants for TENANT users ----
  await ensureExactlyOneTenantL1(parent.id);
  await backfillSupervisors(parent.id);

  // Log overview (with roleCode)
  const parentUsersRaw: {
    id: string;
    email: string;
    username: string | null;
    domain: Domain;
    rank: number;
    active: boolean;
    supervisorId: string | null;
  }[] = await prisma.user.findMany({
    where: { tenantId: parent.id },
    select: {
      id: true,
      email: true,
      username: true,
      domain: true,
      rank: true,
      active: true,
      supervisorId: true,
    },
    orderBy: [{ domain: "asc" }, { rank: "asc" }],
  });

  const parentUsers = parentUsersRaw.map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    domain: u.domain,
    rank: u.rank,
    roleCode: roleCode(u.domain, u.rank), // NEW
    active: u.active,
    supervisorId: u.supervisorId,
  }));

  console.log("Seed complete. Users (ParentCo):");
  console.table(parentUsers);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
