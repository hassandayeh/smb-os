// src/app/api/admin/tenants/[tenantId]/membership/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

type Role = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

function getRedirectTarget(req: Request, tenantId: string) {
  const url = new URL(req.url);
  const qp = url.searchParams.get("redirectTo");
  const referer = req.headers.get("referer") || undefined;
  return qp || referer || `/admin/tenants/${tenantId}/users`;
}

async function parseBody(req: Request): Promise<{ userId: string; role: Role | ""; }> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    return {
      userId: String(form.get("userId") ?? ""),
      role: String(form.get("role") ?? "").toUpperCase() as Role | "",
    };
  } else if (ct.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      userId: String(b.userId ?? ""),
      role: String(b.role ?? "").toUpperCase() as Role | "",
    };
  }
  return { userId: "", role: "" };
}

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

  const { userId, role } = await parseBody(req);
  if (!userId || !role || !["TENANT_ADMIN", "MANAGER", "MEMBER"].includes(role)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Fetch actor platform roles and tenant membership
  const [actorAppRoles, actorMembership] = await Promise.all([
    prisma.appRole.findMany({ where: { userId: actorId }, select: { role: true } }),
    prisma.tenantMembership.findFirst({
      where: { tenantId, userId: actorId, isActive: true },
      select: { role: true },
    }),
  ]);

  const actorIsDev = actorAppRoles.some((r) => r.role === "DEVELOPER");
  const actorIsAppAdmin = actorAppRoles.some((r) => r.role === "APP_ADMIN");
  const actorIsPlatform = actorIsDev || actorIsAppAdmin;
  const actorIsL3Here = actorMembership?.role === "TENANT_ADMIN";

  // Permission check
  if (!actorIsPlatform && !actorIsL3Here) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // L3 cannot modify self, and cannot set L3
  if (!actorIsPlatform && actorIsL3Here) {
    if (userId === actorId) {
      return NextResponse.json({ error: "Tenant Admin cannot modify self" }, { status: 403 });
    }
    if (role === "TENANT_ADMIN") {
      return NextResponse.json({ error: "Only platform can set Tenant Admin" }, { status: 403 });
    }
  }

  // Ensure target exists and belongs to this tenant
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found in this tenant" }, { status: 404 });
  }

  // Apply changes
  if (role === "TENANT_ADMIN") {
    // Platform only path — ensure single L3 per tenant:
    // demote existing L3 (if any, different from target) to MANAGER, then upsert L3 for target
    await prisma.$transaction(async (tx) => {
      const existingL3 = await tx.tenantMembership.findFirst({
        where: { tenantId, role: "TENANT_ADMIN", isActive: true, userId: { not: userId } },
        select: { id: true },
      });
      if (existingL3) {
        await tx.tenantMembership.update({
          where: { id: existingL3.id },
          data: { role: "MANAGER" },
        });
      }
      // upsert target membership to L3
      const existing = await tx.tenantMembership.findFirst({
        where: { tenantId, userId },
        select: { id: true },
      });
      if (existing) {
        await tx.tenantMembership.update({
          where: { id: existing.id },
          data: { role: "TENANT_ADMIN", isActive: true },
        });
      } else {
        await tx.tenantMembership.create({
          data: { tenantId, userId, role: "TENANT_ADMIN", isActive: true },
        });
      }
    });
  } else {
    // Set MANAGER or MEMBER
    await prisma.tenantMembership.upsert({
      where: { userId_tenantId: { userId, tenantId } as any }, // composite via @@unique([userId, tenantId])
      update: { role, isActive: true },
      create: { userId, tenantId, role, isActive: true },
    });
  }

  const res = NextResponse.redirect(new URL(getRedirectTarget(req, tenantId), req.url), {
    status: 303,
  });
  return res;
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
