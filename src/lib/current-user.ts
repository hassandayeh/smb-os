// src/lib/current-user.ts
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

/** Dev-only current user resolution (uses previewUserId cookie if set). */
export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const preview = cookieStore.get("previewUserId")?.value;

  if (preview) {
    const u = await prisma.user.findUnique({ where: { id: preview }, select: { id: true } });
    if (u) return u.id;
  }

  const first = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}
