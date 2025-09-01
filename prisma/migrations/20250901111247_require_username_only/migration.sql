/*
  Warnings:

  - Made the column `username` on table `Users` required. This step will fail if there are existing NULL values in that column.

*/
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
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Users" ("createdAt", "deletedAt", "email", "id", "localeOverride", "name", "passwordHash", "role", "tenantId", "updatedAt", "username") SELECT "createdAt", "deletedAt", "email", "id", "localeOverride", "name", "passwordHash", "role", "tenantId", "updatedAt", "username" FROM "Users";
DROP TABLE "Users";
ALTER TABLE "new_Users" RENAME TO "Users";
CREATE INDEX "Users_tenantId_role_idx" ON "Users"("tenantId", "role");
CREATE UNIQUE INDEX "Users_tenantId_email_key" ON "Users"("tenantId", "email");
CREATE UNIQUE INDEX "Users_tenantId_username_key" ON "Users"("tenantId", "username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
