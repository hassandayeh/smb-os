// src/app/api/tenants/[tenantId]/users/[userId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole } from "@prisma/client";
import {
  requireL3SettingsAccess,
  getActorLevel,
  canManageUser,
  type Level,
} from "@/lib/access";
import { writeAudit } from "@/lib/audit";

/** Map tenant membership role -> Pyramids level (L3/L4/L5) */
function levelFromRole(role: TenantMemberRole | null | undefined): Level | null {
  switch (role) {
    case "TENANT_ADMIN":
      return "L3";
    case "MANAGER":
      return "L4";
    case "MEMBER":
      return "L5";
    default:
      return null;
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  const { tenantId, userId: targetUserId } = params;
  const actorUserId = await getCurrentUserId();

  // Guard: Settings surface (L1/L2/L3)
  await requireL3SettingsAccess(tenantId, actorUserId);

  const payload = (await req.json().catch(() => ({}))) as {
    role?: TenantMemberRole;
    isActive?: boolean;
  };

  const hasRoleChange = typeof payload.role !== "undefined";
  const hasActiveToggle = typeof payload.isActive !== "undefined";
  if (!hasRoleChange && !hasActiveToggle) {
    return NextResponse.json({ error: "No-op" }, { status: 400 });
  }

  // Actor + target levels
  const actorLevel = await getActorLevel(actorUserId!, tenantId);
  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } },
    select: { role: true, isActive: true },
  });

  if (!targetMembership) {
    return NextResponse.json({ error: "Target membership not found" }, { status: 404 });
  }

  const currentTargetLevel = levelFromRole(targetMembership.role);
  const isSelf = actorUserId === targetUserId;

  // Manage permission on the current target
  if (
    !canManageUser({
      actorLevel,
      targetLevel: currentTargetLevel,
      isSelf,
      allowSelf: false,
    })
  ) {
    return NextResponse.json({ error: "Forbidden (manage.current)" }, { status: 403 });
  }

  // If role change requested, validate manage permission on the *new* target level
  let nextRole: TenantMemberRole | undefined = payload.role;
  if (hasRoleChange) {
    if (!["TENANT_ADMIN", "MANAGER", "MEMBER"].includes(String(nextRole))) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const nextLevel = levelFromRole(nextRole);
    if (
      !canManageUser({
        actorLevel,
        targetLevel: nextLevel,
        isSelf,
        allowSelf: false,
      })
    ) {
      return NextResponse.json({ error: "Forbidden (manage.target)" }, { status: 403 });
    }
  }

  // Apply update to tenant membership (role / isActive)
  const updated = await prisma.tenantMembership.update({
    where: { userId_tenantId: { userId: targetUserId, tenantId } },
    data: {
      ...(hasRoleChange ? { role: nextRole } : {}),
      ...(hasActiveToggle ? { isActive: !!payload.isActive } : {}),
    },
    select: { userId: true, tenantId: true, role: true, isActive: true },
  });

  // Audit (best-effort)
  await writeAudit({
    tenantId,
    actorUserId,
    action: "settings.user.update",
    meta: {
      targetUserId,
      before: { role: targetMembership.role, isActive: targetMembership.isActive },
      after: { role: updated.role, isActive: updated.isActive },
    },
  });

  return NextResponse.json({ ok: true, membership: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  const { tenantId, userId: targetUserId } = params;
  const actorUserId = await getCurrentUserId();

  // Guard: Settings surface (L1/L2/L3)
  await requireL3SettingsAccess(tenantId, actorUserId);

  const actorLevel = await getActorLevel(actorUserId!, tenantId);

  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } },
    select: { role: true, isActive: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Target membership not found" }, { status: 404 });
  }

  const targetLevel = levelFromRole(membership.role);
  const isSelf = actorUserId === targetUserId;

  if (
    !canManageUser({
      actorLevel,
      targetLevel,
      isSelf,
      allowSelf: false,
    })
  ) {
    return NextResponse.json({ error: "Forbidden (delete.not_allowed)" }, { status: 403 });
  }

  // "Soft delete": deactivate membership (no row drops)
  const updated = await prisma.tenantMembership.update({
    where: { userId_tenantId: { userId: targetUserId, tenantId } },
    data: { isActive: false },
    select: { userId: true, tenantId: true, role: true, isActive: true },
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: "settings.user.soft_delete",
    meta: {
      targetUserId,
      before: { role: membership.role, isActive: membership.isActive },
      after: { role: updated.role, isActive: updated.isActive },
    },
  });

  return NextResponse.json({ ok: true, membership: updated });
}
