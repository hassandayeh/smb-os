-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "localeOverride" TEXT,
    "domain" TEXT NOT NULL DEFAULT 'TENANT',
    "rank" INTEGER NOT NULL DEFAULT 5,
    "roleLabel" TEXT,
    "supervisorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Users_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Users" ("createdAt", "deletedAt", "email", "id", "localeOverride", "name", "passwordHash", "role", "tenantId", "updatedAt", "username") SELECT "createdAt", "deletedAt", "email", "id", "localeOverride", "name", "passwordHash", "role", "tenantId", "updatedAt", "username" FROM "Users";
DROP TABLE "Users";
ALTER TABLE "new_Users" RENAME TO "Users";
CREATE INDEX "Users_tenantId_role_idx" ON "Users"("tenantId", "role");
CREATE INDEX "Users_tenantId_domain_rank_idx" ON "Users"("tenantId", "domain", "rank");
CREATE INDEX "Users_tenantId_active_idx" ON "Users"("tenantId", "active");
CREATE INDEX "Users_tenantId_rank_idx" ON "Users"("tenantId", "rank");
CREATE INDEX "Users_supervisorId_idx" ON "Users"("supervisorId");
CREATE UNIQUE INDEX "Users_tenantId_email_key" ON "Users"("tenantId", "email");
CREATE UNIQUE INDEX "Users_tenantId_username_key" ON "Users"("tenantId", "username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
