// src/app/api/admin/tenants/supervisor/route.ts
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getActorLevel } from "@/lib/access";

/**
 * HOTFIX: compile-safe stub.
 * We’ll wire real supervisor mapping after you share the permalinks/schema.
 */
export async function POST(req: Request) {
  const actorId = await getSessionUserId();
  if (!actorId) {
    return NextResponse.json({ error: "errors.auth.required" }, { status: 401 });
  }

  let tenantId = "";
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const f = await req.formData();
      tenantId = String(f.get("tenantId") ?? "");
    } else {
      const j = (await req.json().catch(() => ({}))) as any;
      tenantId = String(j.tenantId ?? "");
    }
  } catch {
    /* no-op */
  }

  if (!tenantId) {
    return NextResponse.json({ error: "errors.bad_request" }, { status: 400 });
  }

  const level = await getActorLevel(actorId, tenantId);
  const can = level === "L1" || level === "L2" || level === "L3";
  if (!can) {
    return NextResponse.json({ error: "errors.supervisor.forbidden" }, { status: 403 });
  }

  // Not implemented against current schema until we receive permalinks
  return NextResponse.json({ error: "errors.supervisor.not_implemented" }, { status: 501 });
}

export async function GET() {
  return NextResponse.json({ error: "errors.http.method_not_allowed" }, { status: 405 });
}
