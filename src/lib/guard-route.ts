// src/lib/guard-route.ts
// Sphinx wrapper for API routes (ADMIN + tenant).
// Centralizes impersonation (preview cookie) + Keystone guard calls.

"use server";

import { cookies } from "next/headers";
import { requireAdminAccess } from "./access";
import { getSessionUserId } from "@/lib/auth";
import { getActorLevel } from "@/lib/access";

const PREVIEW_COOKIE = "previewUserId";

/**
 * Resolve the effective user for API calls:
 * - If a preview (impersonation) cookie exists, use that.
 * - Otherwise fall back to the signed-in session user id.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  // FIX: cookies() must be awaited in this runtime
  const c = await cookies();
  const preview = c.get(PREVIEW_COOKIE)?.value?.trim();
  if (preview) return preview;

  const sessionUserId = await getSessionUserId();
  return sessionUserId ?? null;
}

/**
 * Require platform access (L1/L2).
 * Runs against the effective user (preview if set).
 * Returns normally if allowed; otherwise triggers your centralized 403/redirect.
 */
export async function requireAccess() {
  const userId = await getEffectiveUserId();
  if (!userId) {
    await requireAdminAccess(""); // fail closed via central helper
    return;
  }
  await requireAdminAccess(userId);
}

/**
 * Tenant module guard example.
 * Use from /api/tenants/[tenantId]/... routes to enforce entitlement.
 * Return `null` if allowed; otherwise return a Response with an error.
 */
export async function guardTenantModule(
  req: Request,
  params: { tenantId: string },
  moduleKey: string
): Promise<Response | null> {
  const userId = await getEffectiveUserId();
  if (!userId) {
    return new Response(JSON.stringify({ error: "errors.auth.required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Example wiring for your centralized entitlement helper (pseudo):
  // const ok = await hasModuleAccess(userId, params.tenantId, moduleKey);
  // if (!ok) {
  //   return new Response(JSON.stringify({ error: "errors.module.forbidden" }), {
  //     status: 403,
  //     headers: { "content-type": "application/json" },
  //   });
  // }

  return null;
}
