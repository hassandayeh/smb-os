/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,username]` on the table `Users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Users" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Users_tenantId_username_key" ON "Users"("tenantId", "username");
