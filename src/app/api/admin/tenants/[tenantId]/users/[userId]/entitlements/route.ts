// src/app/api/admin/tenants/[tenantId]/users/[userId]/entitlements/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { writeAudit } from "@/lib/audit";

/**
 * Authorization:
 * - L1 (DEVELOPER) or L2 (APP_ADMIN) → allowed
 * - L3 (TENANT_ADMIN) of the target tenant → allowed
 * - Others → 403
 */
async function assertCanManageUser(actingUserId: string, tenantId: string) {
  // Platform roles?
  const roles = await prisma.appRole.findMany({
    where: { userId: actingUserId },
    select: { role: true },
  });
  const platform = new Set(roles.map((r) => r.role));
  if (platform.has("DEVELOPER") || platform.has("APP_ADMIN")) return;

  // Tenant admin of this tenant?
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: actingUserId, tenantId } },
    select: { role: true, isActive: true },
  });
  if (membership?.isActive && membership.role === "TENANT_ADMIN") return;

  const err = new Error("Forbidden");
  // @ts-expect-error custom status tag
  err.status = 403;
  throw err;
}

export async function GET(
  _req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await assertCanManageUser(userId, params.tenantId);
    const ents = await prisma.userEntitlement.findMany({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
      },
      select: { moduleKey: true, isEnabled: true },
      orderBy: { moduleKey: "asc" },
    });
    return NextResponse.json({ entitlements: ents });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message || "Server error" }, { status });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  const actingUserId = await getCurrentUserId();
  if (!actingUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertCanManageUser(actingUserId, params.tenantId);

    // Support form POST (from our Users page)
    const form = await req.formData();
    const moduleKey = String(form.get("moduleKey") || "");
    const isEnabledRaw = String(form.get("isEnabled") || "");
    const redirectTo = String(form.get("redirectTo") || "");

    if (!moduleKey) {
      return NextResponse.json({ error: "moduleKey is required" }, { status: 400 });
    }
    const isEnabled = isEnabledRaw.toLowerCase() === "true";

    // Upsert user entitlement
    await prisma.userEntitlement.upsert({
      where: {
        userId_tenantId_moduleKey: {
          userId: params.userId,
          tenantId: params.tenantId,
          moduleKey,
        },
      },
      create: {
        userId: params.userId,
        tenantId: params.tenantId,
        moduleKey,
        isEnabled,
      },
      update: { isEnabled },
    });

    // Audit (non-fatal)
    try {
      await writeAudit({
        tenantId: params.tenantId,
        actorUserId: actingUserId,
        action: "user.entitlement.update",
        meta: {
          targetUserId: params.userId,
          moduleKey,
          isEnabled,
        },
        req,
      });
    } catch (logErr) {
      console.warn("Audit log failed (user.entitlement.update):", logErr);
    }

    // Redirect back to the page the form provided if present
    if (redirectTo) {
      const url = new URL(redirectTo, new URL(req.url).origin);
      return NextResponse.redirect(url, { status: 303 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message || "Server error" }, { status });
  }
}
