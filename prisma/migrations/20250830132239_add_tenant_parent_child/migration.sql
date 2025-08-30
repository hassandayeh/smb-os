-- CreateTable
CREATE TABLE "Tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "activatedUntil" DATETIME,
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "industry" TEXT,
    "parentTenantId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tenants_parentTenantId_fkey" FOREIGN KEY ("parentTenantId") REFERENCES "Tenants" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "localeOverride" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Modules" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Entitlements" (
    "tenantId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "limitsJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("tenantId", "moduleKey"),
    CONSTRAINT "Entitlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entitlements_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "Modules" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "metaJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "Users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Tenants_status_idx" ON "Tenants"("status");

-- CreateIndex
CREATE INDEX "Tenants_activatedUntil_idx" ON "Tenants"("activatedUntil");

-- CreateIndex
CREATE INDEX "Tenants_parentTenantId_idx" ON "Tenants"("parentTenantId");

-- CreateIndex
CREATE INDEX "Users_tenantId_role_idx" ON "Users"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Users_tenantId_email_key" ON "Users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Entitlements_tenantId_idx" ON "Entitlements"("tenantId");

-- CreateIndex
CREATE INDEX "Entitlements_moduleKey_idx" ON "Entitlements"("moduleKey");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
