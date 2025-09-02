-- AlterTable
ALTER TABLE "TenantMemberships" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "TenantMemberships" ADD COLUMN "deletedByUserId" TEXT;
