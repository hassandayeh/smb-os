-- CreateTable
CREATE TABLE "AppRoles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppRoles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantMemberships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supervisorId" TEXT,
    "grantableModules" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantMemberships_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantMemberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TenantMemberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserEntitlements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserEntitlements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserEntitlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserEntitlements_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "Modules" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AppRoles_role_idx" ON "AppRoles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "AppRoles_userId_role_key" ON "AppRoles"("userId", "role");

-- CreateIndex
CREATE INDEX "TenantMemberships_tenantId_role_idx" ON "TenantMemberships"("tenantId", "role");

-- CreateIndex
CREATE INDEX "TenantMemberships_supervisorId_idx" ON "TenantMemberships"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMemberships_userId_tenantId_key" ON "TenantMemberships"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "UserEntitlements_tenantId_idx" ON "UserEntitlements"("tenantId");

-- CreateIndex
CREATE INDEX "UserEntitlements_moduleKey_idx" ON "UserEntitlements"("moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserEntitlements_userId_tenantId_moduleKey_key" ON "UserEntitlements"("userId", "tenantId", "moduleKey");
