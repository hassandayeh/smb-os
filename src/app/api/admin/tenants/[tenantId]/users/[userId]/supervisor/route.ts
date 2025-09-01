// src/app/api/admin/tenants/[tenantId]/supervisor/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

function getRedirectTarget(req: Request, tenantId: string) {
  const url = new URL(req.url);
  const qp = url.searchParams.get("redirectTo");
  const referer = req.headers.get("referer") || undefined;
  return qp || referer || `/admin/tenants/${tenantId}/users`;
}

type Parsed = { userId: string; supervisorId: string | null };

async function parseBody(req: Request): Promise<Parsed> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const val = String(form.get("supervisorId") ?? "");
    return {
      userId: String(form.get("userId") ?? ""),
      supervisorId: val === "" ? null : val,
    };
  } else if (ct.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const val = String(b.supervisorId ?? "");
    return {
      userId: String(b.userId ?? ""),
      supervisorId: val === "" ? null : val,
    };
  }
  return { userId: "", supervisorId: null };
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

  const { userId, supervisorId } = await parseBody(req);
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // Load actor roles (platform + tenant)
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

  if (!actorIsPlatform && !actorIsL3Here) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!actorIsPlatform && actorIsL3Here && userId === actorId) {
    return NextResponse.json({ error: "Tenant Admin cannot modify self" }, { status: 403 });
  }

  // Target membership must exist and be MEMBER in this tenant
  const targetM = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId, isActive: true },
    select: { id: true, role: true },
  });
  if (!targetM) {
    return NextResponse.json({ error: "User is not a member of this tenant" }, { status: 400 });
  }
  if (targetM.role !== "MEMBER") {
    return NextResponse.json({ error: "Only Member (L5) can have a supervisor" }, { status: 400 });
  }

  // If clearing supervisor:
  if (supervisorId === null) {
    await prisma.tenantMembership.update({
      where: { id: targetM.id },
      data: { supervisorId: null },
    });
    const res = NextResponse.redirect(new URL(getRedirectTarget(req, tenantId), req.url), {
      status: 303,
    });
    return res;
  }

  // Validate supervisor is a MANAGER in the same tenant and not the same user
  if (supervisorId === userId) {
    return NextResponse.json({ error: "User cannot supervise themselves" }, { status: 400 });
  }

  const supM = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId: supervisorId, isActive: true },
    select: { id: true, role: true },
  });
  if (!supM || supM.role !== "MANAGER") {
    return NextResponse.json({ error: "Supervisor must be a Manager (L4) in this tenant" }, { status: 400 });
  }

  // Apply mapping
  await prisma.tenantMembership.update({
    where: { id: targetM.id },
    data: { supervisorId },
  });

  const res = NextResponse.redirect(new URL(getRedirectTarget(req, tenantId), req.url), {
    status: 303,
  });
  return res;
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
