// src/lib/guard-page.ts
// Sphinx wrapper for server components & pages (ADMIN area).
// Delegates to the centralized helpers in src/lib/access.ts.
// No ad-hoc logic; only session plumbing.

"use server";

import { requireAdminAccess } from "./access";
import { getCurrentUserId } from "@/lib/current-user";

/**
 * Admin-area guard for pages/layouts (non-tenant context).
 * Allows only platform staff (L1/L2) via central helper.
 */
export async function requireAccess() {
  const userId = await getCurrentUserId();
  await requireAdminAccess(userId);
}
