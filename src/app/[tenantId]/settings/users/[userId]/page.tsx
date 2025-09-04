// src/app/[tenantId]/settings/users/[userId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import ManageUserClient from "./ManageUserClient";
import {
  getActorLevel,
  canManageUserGeneral,
  getCreatableRolesFor,
  type Level,
} from "@/lib/access";

type TenantRole = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

export const dynamic = "force-dynamic";

function mapRoleToLevel(role: TenantRole | null | undefined): Level {
  if (role === "TENANT_ADMIN") return "L3";
  if (role === "MANAGER") return "L4";
  return "L5";
}

function toTenantRoles(levels: Array<"L3" | "L4" | "L5">): TenantRole[] {
  const out: TenantRole[] = [];
  if (levels.includes("L3")) out.push("TENANT_ADMIN");
  if (levels.includes("L4")) out.push("MANAGER");
  if (levels.includes("L5")) out.push("MEMBER");
  return out;
}

/**
 * Compute UI-allowed role options from actor level and peer/self rules.
 * Mirrors server policy:
 * - L1 can assign L3/L4/L5 here (tenant UI).
 * - L2 can assign L3/L4/L5.
 * - L3 can assign L4/L5 only.
 * - Only L1 may self-manage (role). Peer block: no same-level edits (except L1 self).
 */
function computeAllowedRolesUI(
  actorLevel: Level | null,
  targetLevel: Level | null,
  isSelf: boolean
): TenantRole[] {
  if (!actorLevel || !targetLevel) return [];
  if (isSelf && actorLevel !== "L1") return []; // only L1 may self-manage (role)
  if (!isSelf && actorLevel === targetLevel) return []; // peer block

  const creatable = getCreatableRolesFor(actorLevel);
  const tenantTargets = creatable.filter(
    (lv) => lv === "L3" || lv === "L4" || lv === "L5"
  ) as Array<"L3" | "L4" | "L5">;

  return toTenantRoles(tenantTargets);
}

export default async function ManageUserPage({
  params,
}: {
  params: { tenantId: string; userId: string };
}) {
  const { tenantId, userId: targetUserId } = params;

  // Actor
  const actorUserId = await getCurrentUserId();
  if (!actorUserId) {
    redirect(`/sign-in?redirectTo=/${tenantId}/settings/users/${targetUserId}`);
  }

  // Load target user (must exist in this tenant)
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
    select: { id: true, name: true, username: true },
  });
  if (!target) notFound();

  // Load membership directly (no relation on User type)
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
    select: { role: true, isActive: true, deletedAt: true },
  });
  if (!membership || membership.deletedAt) {
    notFound(); // soft-deleted or no membership
  }

  const initialRole = (membership.role ?? "MEMBER") as TenantRole;
  const initialActive = !!membership.isActive;

  // Resolve levels + guard decisions
  const [actorLevel, roleDecision, statusDecision, deleteDecision] =
    await Promise.all([
      getActorLevel(actorUserId!, tenantId), // L1–L5 or null
      canManageUserGeneral({
        tenantId,
        actorUserId: actorUserId!,
        targetUserId,
        intent: "role",
      }),
      canManageUserGeneral({
        tenantId,
        actorUserId: actorUserId!,
        targetUserId,
        intent: "status",
      }),
      canManageUserGeneral({
        tenantId,
        actorUserId: actorUserId!,
        targetUserId,
        intent: "delete",
      }),
    ]);

  const isSelf = actorUserId === targetUserId;
  const targetLevel = roleDecision.targetLevel ?? mapRoleToLevel(initialRole);

  // UI permissions
  const allowedRoles = computeAllowedRolesUI(actorLevel, targetLevel, isSelf);
  const disableRoleChange = !roleDecision.allowed;
  const canToggleStatus = statusDecision.allowed;
  const canDeleteUser = deleteDecision.allowed;

  return (
    <div className="space-y-8">
      <ManageUserClient
        tenantId={tenantId}
        userId={targetUserId}
        initialRole={initialRole}
        initialActive={initialActive}
        allowedRoles={allowedRoles}
        disableRoleChange={disableRoleChange}
        canToggleStatus={canToggleStatus}
        canDeleteUser={canDeleteUser}
      />
    </div>
  );
}
