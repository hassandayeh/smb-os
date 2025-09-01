// src/lib/current-user.ts
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { getSessionUserId } from "@/lib/auth";

/**
 * Resolve the current user in this order:
 * 1) Auth session cookie "sid" (server-side session in AuthSessions)
 * 2) Preview/impersonation cookie "previewUserId" (QA tool)
 * 3) No fallback: return null when unauthenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  // 1) Real login session
  const sessionUserId = await getSessionUserId();
  if (sessionUserId) return sessionUserId;

  // 2) Preview-as cookie (QA)
  const cookieStore = await cookies();
  const preview = cookieStore.get("previewUserId")?.value;
  if (preview) {
    const u = await prisma.user.findUnique({
      where: { id: preview },
      select: { id: true },
    });
    if (u) return u.id;
  }

  // 3) No dev fallback anymore
  return null;
}
