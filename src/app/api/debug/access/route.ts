// src/app/api/_debug/access/route.ts
import { NextRequest, NextResponse } from "next/server";
import { hasModuleAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * Temporary debug endpoint (remove later).
 * GET /api/_debug/access?userId=...&tenantId=...&moduleKey=...
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || undefined;
    const tenantId = url.searchParams.get("tenantId") || "";
    const moduleKey = url.searchParams.get("moduleKey") || "";

    if (!tenantId || !moduleKey) {
      return NextResponse.json(
        { error: "tenantId and moduleKey are required" },
        { status: 400 }
      );
    }

    const decision = await hasModuleAccess({ userId, tenantId, moduleKey });
    return NextResponse.json(
      { ok: true, allowed: decision.allowed, reason: decision.reason },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("DEBUG access error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error", detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}
