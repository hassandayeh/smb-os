// src/lib/guard-page.ts
// Sphinx wrapper for server components & pages (ADMIN area).
// Delegates to centralized helpers in src/lib/access.ts.
// Handles impersonation (preview cookie) → effective user identity.

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "./access";
import { getCurrentUserId } from "@/lib/current-user";

const PREVIEW_COOKIE = "previewUserId";

/**
 * Resolve the effective user for authorization:
 * - If a preview (impersonation) cookie exists, use that user id.
 * - Otherwise fall back to the signed-in session user id.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  const c = await cookies(); // cookies() is async in your setup
  const preview = c.get(PREVIEW_COOKIE)?.value?.trim();
  if (preview) return preview;

  const sessionUserId = await getCurrentUserId();
  return sessionUserId ?? null;
}

/** Redirect an L3–L5 actor to their workspace home (first active tenant). */
async function redirectToActorHome(actorUserId: string) {
  const mem = await prisma.tenantMembership.findFirst({
    where: { userId: actorUserId, isActive: true, deletedAt: null },
    select: { tenantId: true },
    orderBy: { createdAt: "asc" },
  });

  if (mem?.tenantId) redirect(`/${mem.tenantId}`);
  redirect("/workspace");
}

/**
 * Admin-area guard for pages/layouts (non-tenant context).
 * Allows only platform staff (L1/L2) via central helper.
 * Runs against the EFFECTIVE user (preview if set).
 *
 * On ADMIN_ONLY (i.e., impersonated L3–L5), redirect to workspace instead of 403.
 * On AUTH (no user), redirect to /sign-in.
 */
export async function requireAccess() {
  const userId = await getEffectiveUserId();

  try {
    // IMPORTANT: pass the effective user id (this is what was missing)
    await requireAdminAccess(userId);
    return;
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "";

    if (msg.includes("AUTH")) {
      redirect("/sign-in");
    }

    if (msg.includes("ADMIN_ONLY")) {
      if (!userId) redirect("/sign-in");
      await redirectToActorHome(userId);
      return; // unreachable after redirect
    }

    // Not our case — bubble up the original error
    throw err;
  }
}
