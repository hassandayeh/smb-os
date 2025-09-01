// src/lib/guard-route.ts
// Sphinx wrapper for ADMIN API routes.
// Converts access failures into JSON 403 and delegates to central helpers.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { requireAdminAccess } from "./access";

export type GuardResult = NextResponse | null;

/**
 * Call at the very top of every ADMIN API route.
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
