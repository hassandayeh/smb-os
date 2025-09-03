// src/app/api/admin/tenants/[tenantId]/entitlements/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET: list modules + current entitlement state for a tenant
export async function GET(
  _req: Request,
  { params }: { params: { tenantId: string } }
) {
  const tenantId = params?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }

  try {
    const modules = await prisma.module.findMany({
      orderBy: { name: "asc" },
      select: { key: true, name: true, description: true },
    });

    const ents = await prisma.entitlement.findMany({
      where: { tenantId },
      select: { moduleKey: true, isEnabled: true, limitsJson: true },
    });

    const entMap = new Map(ents.map((e) => [e.moduleKey, e]));
    const rows = modules.map((m) => {
      const e = entMap.get(m.key);
      return {
        moduleKey: m.key,
        name: m.name,
        description: m.description,
        isEnabled: e?.isEnabled ?? false,
        limitsJson: e?.limitsJson ?? null,
      };
    });

    return NextResponse.json({ ok: true, items: rows }, { status: 200 });
  } catch (err) {
    console.error("GET entitlements error:", err);
    return NextResponse.json({ error: "Failed to load entitlements" }, { status: 500 });
  }
}

// PATCH: upsert entitlement and write audit log
export async function PATCH(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  const tenantId = params?.tenantId;
  try {
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    const actorUserId = await getCurrentUserId();
    if (!actorUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const moduleKey: string | undefined = body?.moduleKey;
    const isEnabled: boolean | undefined = body?.isEnabled;
    const limitsJsonInput: unknown = body?.limitsJson;

    if (!moduleKey || typeof moduleKey !== "string") {
      return NextResponse.json({ error: "moduleKey is required" }, { status: 400 });
    }

    // Parse limitsJson
    let limitsToApply: any | undefined;
    if (typeof limitsJsonInput === "undefined") {
      limitsToApply = undefined; // no change
    } else if (
      limitsJsonInput === null ||
      (typeof limitsJsonInput === "string" && limitsJsonInput.trim() === "")
    ) {
      limitsToApply = null;
    } else if (typeof limitsJsonInput === "string") {
      try {
        limitsToApply = JSON.parse(limitsJsonInput);
      } catch {
        return NextResponse.json(
          { error: "limitsJson is not valid JSON" },
          { status: 400 }
        );
      }
    } else {
      limitsToApply = limitsJsonInput;
    }

    // Before snapshot
    const before = await prisma.entitlement.findUnique({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      select: { moduleKey: true, isEnabled: true, limitsJson: true },
    });

    const updateData: any = {};
    if (typeof isEnabled === "boolean") updateData.isEnabled = isEnabled;
    if (typeof limitsToApply !== "undefined") updateData.limitsJson = limitsToApply;

    const updated = await prisma.entitlement.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      update: updateData,
      create: {
        tenantId,
        moduleKey,
        isEnabled: typeof isEnabled === "boolean" ? isEnabled : false,
        limitsJson: typeof limitsToApply === "undefined" ? null : limitsToApply,
      },
      select: { moduleKey: true, isEnabled: true, limitsJson: true },
    });

    // Audit (non-fatal)
    try {
      await writeAudit({
        tenantId,
        actorUserId,
        action: "entitlement.update",
        meta: { moduleKey, before: before ?? null, after: updated },
        req,
      });
    } catch (logErr) {
      console.warn("Audit log failed (entitlement.update):", logErr);
    }

    return NextResponse.json({ ok: true, entitlement: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH entitlements error:", err);
    return NextResponse.json({ error: "Failed to update entitlement" }, { status: 500 });
  }
}
