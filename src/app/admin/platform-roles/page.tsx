// src/app/admin/platform-roles/page.tsx
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionUserId } from "@/lib/auth";

export const metadata = { title: "Platform roles" };

function RoleBadge({ role }: { role: "DEVELOPER" | "APP_ADMIN" }) {
  const label = role === "DEVELOPER" ? "Developer" : "App admin";
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
      {label}
    </span>
  );
}

function ManageButtons({
  userId,
  hasDev,
  hasAppAdmin,
  canManageDev,
  canManageAppAdmin,
}: {
  userId: string;
  hasDev: boolean;
  hasAppAdmin: boolean;
  canManageDev: boolean;
  canManageAppAdmin: boolean;
}) {
  const btn = "inline-flex h-7 items-center rounded-md border px-2 text-xs hover:bg-muted";
  const formAction = "/api/admin/platform-roles?redirectTo=/admin/platform-roles";
  return (
    <div className="flex flex-wrap gap-2">
      {canManageDev && (
        <form method="POST" action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="role" value="DEVELOPER" />
          <input type="hidden" name="action" value={hasDev ? "revoke" : "grant"} />
          <button type="submit" className={btn}>
            {hasDev ? "Revoke Developer" : "Grant Developer"}
          </button>
        </form>
      )}
      {canManageAppAdmin && (
        <form method="POST" action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="role" value="APP_ADMIN" />
          <input type="hidden" name="action" value={hasAppAdmin ? "revoke" : "grant"} />
          <button type="submit" className={btn}>
            {hasAppAdmin ? "Revoke App admin" : "Grant App admin"}
          </button>
        </form>
      )}
    </div>
  );
}

export default async function PlatformRolesPage() {
  // Who is acting?
  const actorId = await getSessionUserId();
  const actorRoles = actorId
    ? await prisma.appRole.findMany({ where: { userId: actorId }, select: { role: true } })
    : [];
  const actorIsDev = actorRoles.some((r) => r.role === "DEVELOPER");
  const actorIsAppAdmin = actorRoles.some((r) => r.role === "APP_ADMIN");

  // Fetch all users with their tenant and platform roles
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      tenant: { select: { name: true, id: true } },
      appRoles: { select: { role: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  const total = users.length;
  const devCount = users.filter((u) => u.appRoles.some((r) => r.role === "DEVELOPER")).length;
  const appAdminCount = users.filter((u) =>
    u.appRoles.some((r) => r.role === "APP_ADMIN")
  ).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform roles</h1>
        <p className="text-sm text-muted-foreground">
          Manage platform-level roles (L1/L2). Only <strong>Developer</strong> can manage Developer;
          Developer or App admin can manage App admin.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
            <span>
              Total users: <strong className="text-foreground">{total}</strong>
            </span>
            <span>
              Developers: <strong className="text-foreground">{devCount}</strong>
            </span>
            <span>
              App admins: <strong className="text-foreground">{appAdminCount}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Roles</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Manage</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const hasDev = u.appRoles.some((r) => r.role === "DEVELOPER");
                  const hasAppAdmin = u.appRoles.some((r) => r.role === "APP_ADMIN");
                  return (
                    <tr key={u.id} className="border-b last:border-b-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{u.name || "User"}</div>
                        <div className="text-xs text-muted-foreground">ID: {u.id}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium">{u.tenant?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.tenant?.id ?? ""}</div>
                      </td>
                      <td className="py-3 pr-4">
                        {u.appRoles.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {u.appRoles.map((r, i) => (
                              <RoleBadge key={i} role={r.role as "DEVELOPER" | "APP_ADMIN"} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-muted-foreground">{u.email || "—"}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <ManageButtons
                          userId={u.id}
                          hasDev={hasDev}
                          hasAppAdmin={hasAppAdmin}
                          canManageDev={actorIsDev}
                          canManageAppAdmin={actorIsDev || actorIsAppAdmin}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Tip: While signed in, you can also open{" "}
        <code>/api/dev/grant-platform-role?role=DEVELOPER</code> or{" "}
        <code>?role=APP_ADMIN</code> to grant yourself quickly.
      </div>
    </div>
  );
}
