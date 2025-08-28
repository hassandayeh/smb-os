import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/tenants/[tenantId]/entitlements
export async function GET(
  _req: Request,
  { params }: { params: { tenantId: string } }
) {
  const { tenantId } = params;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const modules = await prisma.module.findMany({
      orderBy: { key: "asc" },
      select: { key: true, name: true, description: true },
    });

    const entitlements = await prisma.entitlement.findMany({
      where: { tenantId },
      select: { moduleKey: true, isEnabled: true, limitsJson: true },
    });

    const items = modules.map((m) => {
      const e = entitlements.find((x) => x.moduleKey === m.key);
      return {
        moduleKey: m.key,
        name: m.name,
        description: m.description,
        isEnabled: e?.isEnabled ?? false,
        limitsJson: e?.limitsJson ?? null,
      };
    });

    return NextResponse.json({ tenant, items }, { status: 200 });
  } catch (err) {
    console.error("GET entitlements error:", err);
    return NextResponse.json({ error: "Failed to load entitlements" }, { status: 500 });
  }
}

// PATCH /api/admin/tenants/[tenantId]/entitlements
// body: { moduleKey: string; isEnabled?: boolean; limitsJsonText?: string }
export async function PATCH(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  const { tenantId } = params;

  try {
    const body = await req.json().catch(() => ({}));
    const moduleKey: string | undefined = body?.moduleKey;
    const isEnabled: boolean | undefined = body?.isEnabled;
    const limitsJsonText: string | undefined = body?.limitsJsonText;

    if (!moduleKey) {
      return NextResponse.json({ error: "moduleKey is required" }, { status: 400 });
    }

    // Parse limits JSON text (empty => null)
    let limits: any | null = null;
    if (typeof limitsJsonText === "string") {
      const trimmed = limitsJsonText.trim();
      if (trimmed.length > 0) {
        try {
          limits = JSON.parse(trimmed);
        } catch {
          return NextResponse.json({ error: "limitsJson is not valid JSON" }, { status: 400 });
        }
      } else {
        limits = null;
      }
    }

    // Use composite upsert on the unique/primary key (tenantId + moduleKey)
    const updated = await prisma.entitlement.upsert({
      where: {
        // This assumes your Prisma model has @@id([tenantId, moduleKey]) or @@unique([tenantId, moduleKey])
        tenantId_moduleKey: { tenantId, moduleKey },
      },
      update: {
        ...(typeof isEnabled === "boolean" ? { isEnabled } : {}),
        ...(typeof limits !== "undefined" ? { limitsJson: limits } : {}),
      },
      create: {
        tenantId,
        moduleKey,
        isEnabled: !!isEnabled,
        limitsJson: typeof limits === "undefined" ? null : limits,
      },
      select: { moduleKey: true, isEnabled: true, limitsJson: true },
    });

    // Audit log (non-fatal if it fails)
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: null, // replace with auth user later
          action: "entitlement.update",
          metaJson: {
            moduleKey,
            isEnabled:
              typeof isEnabled === "boolean" ? isEnabled : updated.isEnabled,
            limitsJson:
              typeof limits === "undefined" ? updated.limitsJson : limits,
          },
        },
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

export const dynamic = "force-dynamic";
