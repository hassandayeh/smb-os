// src/lib/guard-route.ts
// Sphinx wrapper for API routes (ADMIN + tenant).
// Centralizes impersonation (preview cookie) + Keystone guard calls + error mapping.

"use server";

import { cookies } from "next/headers";
import { requireAdminAccess } from "./access";
import { getSessionUserId } from "@/lib/auth";
import { RbacError } from "@/lib/rbac/validators";

const PREVIEW_COOKIE = "previewUserId";

/**
 * Resolve the effective user for API calls:
 * - If a preview (impersonation) cookie exists, use that.
 * - Otherwise fall back to the signed-in session user id.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  // cookies() returns a Promisable store in this runtime → must await
  const c = await cookies();
  const preview = c.get(PREVIEW_COOKIE)?.value?.trim();
  if (preview) return preview;

  const sessionUserId = await getSessionUserId();
  return sessionUserId ?? null;
}

/**
 * Require platform access (A1/A2).
 * Runs against the effective user (preview if set).
 * Returns normally if allowed; otherwise triggers centralized 403/redirect in requireAdminAccess.
 */
export async function requireAccess(): Promise<void> {
  const userId = await getEffectiveUserId();
  if (!userId) {
    // Fail closed via central helper (treat as unauthorized)
    await requireAdminAccess(""); // will throw/redirect inside
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
    return jsonError({ code: "errors.auth.required" }, 401);
  }

  // Example wiring for your centralized entitlement helper (pseudo):
  // const ok = await hasModuleAccess(userId, params.tenantId, moduleKey);
  // if (!ok) {
  //   return jsonError({ code: "errors.module.forbidden" }, 403);
  // }

  return null;
}

/**
 * Standard JSON error response builder (i18n-keyed).
 */
function jsonError(
  body: { code: string; meta?: Record<string, unknown> },
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Map thrown errors to consistent API responses.
 * Usage in routes:
 *
 * try {
 *   // ... do stuff that may throw RbacError / auth errors
 * } catch (e) {
 *   return mapErrorToResponse(e);
 * }
 */
export function mapErrorToResponse(e: unknown): Response {
  // RBAC validators (Appendix) → 409 conflict with i18n code
  if (e instanceof RbacError) {
    return jsonError({ code: e.code, meta: e.meta }, 409);
  }

  // Common auth/forbidden patterns (expand as needed)
  const msg = typeof e === "object" && e && "message" in e ? String((e as any).message) : "";
  if (msg?.toLowerCase().includes("unauthorized") || msg?.toLowerCase().includes("auth")) {
    return jsonError({ code: "errors.auth.required" }, 401);
  }
  if (msg?.toLowerCase().includes("forbidden") || msg?.toLowerCase().includes("permission")) {
    return jsonError({ code: "errors.forbidden" }, 403);
  }

  // Fallback → generic server error (still keyed)
  return jsonError({ code: "errors.server" }, 500);
}
