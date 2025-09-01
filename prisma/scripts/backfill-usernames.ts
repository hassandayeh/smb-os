// prisma/scripts/backfill-usernames.ts
// One-off script to populate User.username with a unique (tenantId, username) pair.

import { prisma } from "../../src/lib/prisma";

// slugify: lowercase, keep a-z0-9, collapse separators into '-', trim, enforce length 3..30
function normalizeUsername(input: string): string {
  const base = (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alnum → '-'
    .replace(/^-+|-+$/g, "")     // trim leading/trailing '-'
    .replace(/-+/g, "-");        // collapse multiple '-'

  // Fallback if empty after normalization
  const candidate = base.length ? base : "user";

  // clamp length to 30 (without cutting mid-suffix later)
  return candidate.slice(0, 30);
}

async function ensureUniqueInTenant(tenantId: string, desired: string): Promise<string> {
  // If desired is free, use it. Otherwise append -1, -2, ... up to a sensible cap.
  let username = desired;
  let i = 1;
  while (true) {
    const existing = await prisma.user.findFirst({
      where: { tenantId, username },
      select: { id: true },
    });
    if (!existing) return username;

    // prepare next candidate
    const suffix = `-${i++}`;
    // keep total length <= 30
    const base = desired.slice(0, Math.max(1, 30 - suffix.length));
    username = `${base}${suffix}`;
    if (i > 5000) {
      throw new Error(`Could not generate unique username for tenant ${tenantId}`);
    }
  }
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true },
  });

  for (const t of tenants) {
    const users = await prisma.user.findMany({
      where: { tenantId: t.id },
      select: { id: true, email: true, username: true },
      orderBy: { createdAt: "asc" },
    });

    for (const u of users) {
      if (u.username && u.username.trim().length >= 3) continue;

      const localPart =
        (u.email || "").includes("@") ? (u.email || "").split("@")[0] : (u.email || "");
      const base = normalizeUsername(localPart);
      const unique = await ensureUniqueInTenant(t.id, base);

      await prisma.user.update({
        where: { id: u.id },
        data: { username: unique },
      });

      console.log(`Set username for user ${u.id} (tenant ${t.id}) → ${unique}`);
    }
  }

  console.log("Backfill complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
