// src/app/[tenantId]/settings/users/[userId]/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import ManageUserClient from "./ManageUserClient";
import { getCurrentUserId } from "@/lib/current-user";
import { getActorLevel, type Level } from "@/lib/access";

export const dynamic = "force-dynamic";

type TenantRole = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

function levelFromRole(role: TenantRole | null | undefined): Level | null {
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

export default async function ManageUserPage({
  params,
}: {
  params: { tenantId: string; userId: string };
}) {
  const { tenantId, userId } = params;

  // Who is acting?
  const actorUserId = await getCurrentUserId();
  const actorLevel = actorUserId ? await getActorLevel(actorUserId, tenantId) : null;

  // Fetch user & membership within this tenant
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, email: true },
  });

  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true, isActive: true },
  });

  if (!user || !membership) {
    return (
      <div className="p-6 space-y-4">
        <div className="text-sm text-muted-foreground">User or membership not found.</div>
        <Link href={`/${tenantId}/settings`} className="text-blue-600 hover:underline">
          ← Back to Settings
        </Link>
      </div>
    );
  }

  const targetRole = membership.role as TenantRole;
  const targetLevel = levelFromRole(targetRole);
  const isSelf = actorUserId === userId;

  // Allowed role options for the actor (server-authoritative)
  let allowedRoles: TenantRole[] = [];
  if (actorLevel === "L1" || actorLevel === "L2") {
    allowedRoles = ["TENANT_ADMIN", "MANAGER", "MEMBER"];
  } else if (actorLevel === "L3") {
    // L3 cannot assign/see TENANT_ADMIN
    allowedRoles = ["MANAGER", "MEMBER"];
  } else {
    allowedRoles = [];
  }

  // Disable role change UI if actor cannot manage the target's current level or is self
  const disableRoleChange =
    isSelf ||
    (actorLevel === "L3" && targetLevel === "L3") ||
    (actorLevel === "L4" && (targetLevel === "L4" || targetLevel === "L3")) ||
    actorLevel === null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage user</h1>
        <Link href={`/${tenantId}/settings`} className="text-blue-600 hover:underline">
          ← Back to Settings
        </Link>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Name</div>
              <div className="text-sm">{user.name || "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Username</div>
              <div className="text-sm">{user.username}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Email</div>
              <div className="text-sm">{user.email || "—"}</div>
            </div>
          </div>

          <ManageUserClient
            tenantId={tenantId}
            userId={userId}
            initialRole={targetRole}
            initialActive={membership.isActive}
            allowedRoles={allowedRoles}
            disableRoleChange={disableRoleChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
