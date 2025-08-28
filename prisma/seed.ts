// prisma/seed.ts
/**
 * SMB OS — Seed script (SQLite, Prisma 6.15)
 * - Seeds core modules
 * - Creates two tenants
 * - Creates one admin user under Tenant A
 * - Grants different entitlements per tenant
 * - Adds audit log rows (via upsert — SQLite-friendly)
 *
 * Idempotent: uses upsert where appropriate.
 *
 * Local-only demo credentials:
 *   email: admin@smbos.local
 *   password: Admin123!
 */

import { PrismaClient, TenantStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // --- 1) Module Registry ---
  // Keep keys stable: lowercase-kebab
  const modules = [
    { key: 'products',  name: 'Products/Services', description: 'Catalog of items and services' },
    { key: 'customers', name: 'Customers',         description: 'Customer directory' },
    { key: 'suppliers', name: 'Suppliers',         description: 'Supplier directory' },
    { key: 'invoices',  name: 'Invoices',          description: 'Sales invoices' },
    { key: 'payments',  name: 'Payments',          description: 'Record payments (cash/bank)' },
    { key: 'expenses',  name: 'Expenses',          description: 'Track business expenses' },
    { key: 'inventory', name: 'Inventory',         description: 'Stock tracking and adjustments' },
    { key: 'reports',   name: 'Reports',           description: 'Basic analytics and exports' },
    { key: 'audit-log', name: 'Audit Log',         description: 'Changes and admin actions' },
  ];

  for (const m of modules) {
    await prisma.module.upsert({
      where: { key: m.key },
      create: m,
      update: { name: m.name, description: m.description },
    });
  }
  console.log('✅ Modules upserted');

  // --- 2) Tenants ---
  const tenantA = await prisma.tenant.upsert({
    where: { id: 'seed-tenant-a' },
    create: {
      id: 'seed-tenant-a',
      name: 'Acme Trading',
      status: TenantStatus.ACTIVE,
      defaultLocale: 'en',
      activatedUntil: addDays(new Date(), 30),
    },
    update: {
      name: 'Acme Trading',
      status: TenantStatus.ACTIVE,
      defaultLocale: 'en',
      activatedUntil: addDays(new Date(), 30),
      deletedAt: null,
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { id: 'seed-tenant-b' },
    create: {
      id: 'seed-tenant-b',
      name: 'Nile Supplies',
      status: TenantStatus.ACTIVE,
      defaultLocale: 'ar',
      activatedUntil: addDays(new Date(), 15),
    },
    update: {
      name: 'Nile Supplies',
      status: TenantStatus.ACTIVE,
      defaultLocale: 'ar',
      activatedUntil: addDays(new Date(), 15),
      deletedAt: null,
    },
  });

  console.log('✅ Tenants upserted:', tenantA.name, '|', tenantB.name);

  // --- 3) Admin User (Tenant A) ---
  const adminEmail = 'admin@smbos.local';
  const adminPasswordPlain = 'Admin123!'; // local dev only
  const passwordHash = await bcrypt.hash(adminPasswordPlain, 10);

  const adminUser = await prisma.user.upsert({
    where: { id: 'seed-admin-user-tenant-a' },
    create: {
      id: 'seed-admin-user-tenant-a',
      tenantId: tenantA.id,
      name: 'Local Admin',
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      localeOverride: null,
    },
    update: {
      name: 'Local Admin',
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      deletedAt: null,
    },
  });

  console.log('✅ Admin user upserted:', adminUser.email);

  // --- 4) Entitlements ---
  async function setEntitlement(
    tenantId: string,
    moduleKey: string,
    isEnabled: boolean,
    limitsJson?: any
  ) {
    return prisma.entitlement.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      create: { tenantId, moduleKey, isEnabled, limitsJson },
      update: { isEnabled, limitsJson },
    });
  }

  // Tenant A: enable most modules
  const tenantAEnabled = [
    'products','customers','suppliers','invoices','payments','expenses','inventory','reports','audit-log'
  ];
  for (const key of tenantAEnabled) {
    await setEntitlement(tenantA.id, key, true);
  }

  // Tenant B: minimal plan example
  await setEntitlement(tenantB.id, 'products',  true, { maxItems: 500 });
  await setEntitlement(tenantB.id, 'customers', true, { maxCustomers: 200 });
  await setEntitlement(tenantB.id, 'invoices',  true, { maxInvoicesPerMonth: 200 });
  await setEntitlement(tenantB.id, 'inventory', false);
  await setEntitlement(tenantB.id, 'reports',   false);
  await setEntitlement(tenantB.id, 'audit-log', true);

  console.log('✅ Entitlements set');

  // --- 5) Audit Logs (SQLite-safe via upsert) ---
  await prisma.auditLog.upsert({
    where: { id: 'seed-log-tenant-a' },
    create: {
      id: 'seed-log-tenant-a',
      tenantId: tenantA.id,
      actorUserId: adminUser.id,
      action: 'TENANT_CREATE',
      metaJson: { tenantName: tenantA.name },
    },
    update: {},
  });

  await prisma.auditLog.upsert({
    where: { id: 'seed-log-tenant-b' },
    create: {
      id: 'seed-log-tenant-b',
      tenantId: tenantB.id,
      actorUserId: adminUser.id,
      action: 'TENANT_CREATE',
      metaJson: { tenantName: tenantB.name },
    },
    update: {},
  });

  await prisma.auditLog.upsert({
    where: { id: 'seed-log-entitlements-a' },
    create: {
      id: 'seed-log-entitlements-a',
      tenantId: tenantA.id,
      actorUserId: adminUser.id,
      action: 'ENTITLEMENT_TOGGLE',
      metaJson: { modules: tenantAEnabled, enabled: true },
    },
    update: {},
  });

  console.log('✅ Audit logs written');
  console.log('🌟 Seed complete');
}

// --- utils ---
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// --- runner ---
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
