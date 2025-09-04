// src/lib/current-user.ts
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { getSessionUserId } from "@/lib/auth";

/**
 * Resolve the effective "current user" for pages/layouts:
 * 1) Preview/impersonation cookie "previewUserId" (if valid)
 * 2) Auth session cookie "sid" (server-side session in AuthSessions)
 * 3) null if unauthenticated
 *
 * Keystone rule: impersonation must override the real session identity.
 */
export async function getCurrentUserId(): Promise<string | null> {
  // 1) Preview-as cookie (QA / impersonation)
  const jar = await cookies();
  const preview = jar.get("previewUserId")?.value?.trim();
  if (preview) {
    const u = await prisma.user.findUnique({
      where: { id: preview },
      select: { id: true },
    });
    if (u?.id) return u.id;
  }

  // 2) Real login session
  const sessionUserId = await getSessionUserId();
  if (sessionUserId) return sessionUserId;

  // 3) No fallback
  return null;
}
