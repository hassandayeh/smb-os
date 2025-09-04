// src/lib/db/search.ts
/**
 * Centralized, DB-neutral text search helper for Prisma where clauses.
 * - Postgres: adds `mode: "insensitive"` so filters become ILIKE.
 * - SQLite (dev): omits `mode` (SQLite doesn't support it), avoiding runtime errors.
 *
 * Usage:
 *   where: {
 *     OR: [
 *       containsInsensitive("name", q),
 *       containsInsensitive("id", q),
 *     ]
 *   }
 */
export function containsInsensitive<T extends string>(
  field: T,
  q: string
): Record<T, { contains: string } | { contains: string; mode: "insensitive" }> {
  if (!q) return {} as any;

  const url = process.env.DATABASE_URL ?? "";
  // crude but reliable detection
  const isSQLite = url.startsWith("file:") || url.startsWith("sqlite:");

  const filter = isSQLite
    ? ({ contains: q } as const) // ✅ SQLite: no `mode`
    : ({ contains: q, mode: "insensitive" } as const); // ✅ Postgres: case-insensitive

  return { [field]: filter } as any;
}
