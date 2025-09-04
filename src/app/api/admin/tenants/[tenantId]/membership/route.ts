// src/app/api/admin/tenants/[tenantId]/membership/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canManageUserGeneral, assertNotLastActiveL3 } from "@/lib/access";
import { writeAudit } from "@/lib/audit";

type Role = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

function getRedirectTarget(req: Request, tenantId: string) {
  const url = new URL(req.url);
  const qp = url.searchParams.get("redirectTo");
  const referer = req.headers.get("referer") || undefined;
  return qp || referer || `/admin/tenants/${tenantId}/users`;
}

async function parseBody(req: Request): Promise<{ userId: string; role: Role | "" }> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    return {
      userId: String(form.get("userId") ?? ""),
      role: String(form.get("role") ?? "").toUpperCase() as Role | "",
    };
  }
  if (ct.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      userId: String((b as any).userId ?? ""),
      role: String((b as any).role ?? "").toUpperCase() as Role | "",
    };
  }
  return { userId: "", role: "" };
}

/**
 * POST /api/admin/tenants/[tenantId]/membership
 * Updates a user's TenantMembership role within a tenant.
 * Keystone rules via canManageUserGeneral(..., intent: "role"):
 * - Only L1 may self-manage (no self-delete).
 * - No peer management (same-level edits blocked).
 * - L3 cannot set L3; only platform (L1/L2) may promote/demote to TENANT_ADMIN.
 * - Prevent demoting the last active L3 (central helper).
 */
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  const tenantId = params.tenantId;
  const actorId = await getSessionUserId();
  if (!actorId) {
    return NextResponse.redirect(
      new URL(`/sign-in?redirectTo=/admin/tenants/${tenantId}/users`, req.url),
      { status: 303 }
    );
  }

  const { userId: targetUserId, role } = await parseBody(req);
  if (!targetUserId || !role || !["TENANT_ADMIN", "MANAGER", "MEMBER"].includes(role)) {
    return NextResponse.json({ error: "errors.bad_request" }, { status: 400 });
  }

  // Ensure the target user belongs to this tenant.
  const targetExists = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
    select: { id: true },
  });
  if (!targetExists) {
    return NextResponse.json({ error: "errors.user.not_found" }, { status: 404 });
  }

  // Keystone central guard: peer-blocking + self-management rule (intent: "role")
  const decision = await canManageUserGeneral({
    tenantId,
    actorUserId: actorId,
    targetUserId,
    intent: "role",
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "errors.membership.forbidden", reason: decision.reason ?? "role.denied" },
      { status: 403 }
    );
  }

  // Only platform (L1/L2) may set TENANT_ADMIN
  const actorAppRoles = await prisma.appRole.findMany({
    where: { userId: actorId },
    select: { role: true },
  });
  const actorIsPlatform = actorAppRoles.some((r) => r.role === "DEVELOPER" || r.role === "APP_ADMIN");
  if (role === "TENANT_ADMIN" && !actorIsPlatform) {
    return NextResponse.json({ error: "errors.membership.only_platform_sets_L3" }, { status: 403 });
  }

  // If demoting from L3 (changing away from TENANT_ADMIN), block removing the last active L3
  if (role !== "TENANT_ADMIN") {
    await assertNotLastActiveL3({ tenantId, targetUserId });
  }

  const previous = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
    select: { role: true, isActive: true },
  });

  try {
    if (role === "TENANT_ADMIN") {
      // Platform path to set L3: ensure single L3 by demoting any other active L3 first.
      await prisma.$transaction(async (tx) => {
        const existingL3 = await tx.tenantMembership.findFirst({
          where: {
            tenantId,
            role: "TENANT_ADMIN",
            isActive: true,
            userId: { not: targetUserId },
          },
          select: { id: true },
        });
        if (existingL3) {
          await tx.tenantMembership.update({
            where: { id: existingL3.id },
            data: { role: "MANAGER" },
          });
        }

        const existing = await tx.tenantMembership.findFirst({
          where: { tenantId, userId: targetUserId },
          select: { id: true, role: true, isActive: true },
        });
        if (existing) {
          await tx.tenantMembership.update({
            where: { id: existing.id },
            data: { role: "TENANT_ADMIN", isActive: true },
          });
        } else {
          await tx.tenantMembership.create({
            data: { tenantId, userId: targetUserId, role: "TENANT_ADMIN", isActive: true },
          });
        }

        await writeAudit({
          tenantId,
          actorUserId: actorId,
          action: "user.role.changed",
          req,
          tx,
          meta: { targetUserId, before: previous ?? null, after: { role: "TENANT_ADMIN", isActive: true } },
        });
      });
    } else {
      const updated = await prisma.tenantMembership.upsert({
        where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
        update: { role, isActive: true },
        create: { userId: targetUserId, tenantId, role, isActive: true },
        select: { role: true, isActive: true },
      });

      await writeAudit({
        tenantId,
        actorUserId: actorId,
        action: "user.role.changed",
        req,
        meta: { targetUserId, before: previous ?? null, after: updated },
      });
    }
  } catch (e) {
    console.error("membership.update error:", e);
    return NextResponse.json({ error: "errors.membership.update_failed" }, { status: 500 });
  }

  return NextResponse.redirect(new URL(getRedirectTarget(req, tenantId), req.url), { status: 303 });
}

export async function GET() {
  return NextResponse.json({ error: "errors.http.method_not_allowed" }, { status: 405 });
}
