// src/lib/guard-route.ts
// Sphinx wrappers for API routes (ADMIN + tenant modules).
// Converts access failures into JSON 403 and delegates to central helpers.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  requireAdminAccess,
  // alias to avoid name collision with this file's requireAccess()
  requireAccess as requireModuleAccess,
  requireL3SettingsAccess,
} from "./access";

export type GuardResult = NextResponse | null;

/**
 * ADMIN API guard (platform area).
 * Usage:
 *   const guard = await requireAccess();
 *   if (guard) return guard; // guard is a 403 JSON response
 */
export async function requireAccess(): Promise<GuardResult> {
  try {
    const userId = await getCurrentUserId();
    await requireAdminAccess(userId);
    return null;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    const message = err?.message || "Forbidden";
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * TENANT MODULE API guard (tenant-scoped).
 * Call at the top of any tenant API route.
 * - For moduleKey === "settings": allow L1/L2/L3 via requireL3SettingsAccess()
 * - For other modules: use module entitlement gate via requireModuleAccess()
 *
 * Usage:
 *   const guard = await guardTenantModule(req, params, "settings" | "<moduleKey>");
 *   if (guard) return guard;
 */
export async function guardTenantModule(
  _req: Request,
  params: { tenantId: string },
  moduleKey: string
): Promise<GuardResult> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      const err = new Error("Forbidden (AUTH)");
      // @ts-expect-error tag for route handlers
      err.status = 403;
      throw err;
    }

    if (moduleKey === "settings") {
      await requireL3SettingsAccess(params.tenantId, userId);
    } else {
      await requireModuleAccess({
        userId,
        tenantId: params.tenantId,
        moduleKey,
      });
    }
    return null;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    const message = err?.message || "Forbidden";
    return NextResponse.json({ error: message }, { status });
  }
}
