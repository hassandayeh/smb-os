// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client for Next.js (prevents too many connections in dev).
 * - In dev, attach to globalThis to persist across HMR reloads.
 * - In prod, create a fresh instance.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
