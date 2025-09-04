// src/lib/guard-page.ts
// Sphinx wrapper for server components & pages (ADMIN area).
// Delegates to centralized helpers in src/lib/access.ts.
// Handles impersonation (preview cookie) → effective user identity.

"use server";

import { cookies } from "next/headers";
import { requireAdminAccess } from "./access";
import { getCurrentUserId } from "@/lib/current-user";

const PREVIEW_COOKIE = "previewUserId";

/**
 * Resolve the effective user for authorization:
 * - If a preview (impersonation) cookie exists, use that user id.
 * - Otherwise fall back to the signed-in session user id.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  // FIX: cookies() returns a Promise in your setup → must await
  const c = await cookies();
  const preview = c.get(PREVIEW_COOKIE)?.value?.trim();
  if (preview) return preview;

  const sessionUserId = await getCurrentUserId();
  return sessionUserId ?? null;
}

/**
 * Admin-area guard for pages/layouts (non-tenant context).
 * Allows only platform staff (L1/L2) via central helper.
 * Runs against the EFFECTIVE user (preview if set).
 */
export async function requireAccess() {
  const userId = await getEffectiveUserId();
  // If no user at all, behave like "not authorized"
  if (!userId) {
    // requireAdminAccess will 403/redirect based on your existing helper
    await requireAdminAccess(""); // empty will fail closed
    return;
  }
  await requireAdminAccess(userId);
}
