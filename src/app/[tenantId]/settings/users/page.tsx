// src/app/[tenantId]/settings/users/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureModuleAccessOrRedirect } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function TenantSettingsUsersPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { tenantId } = params;

  // Keystone guard (ideally enforced again at /[tenantId]/settings layout)
  await ensureModuleAccessOrRedirect(tenantId, "settings");

  // ✅ Always exclude soft-deleted memberships
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId, deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ user: { createdAt: "desc" } }],
  });

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Workspace Settings — Users</h1>

      {memberships.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No users found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => {
                const u = m.user;
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">{u.name ?? "—"}</td>
                    <td className="px-3 py-2">{u.username}</td>
                    <td className="px-3 py-2">{m.role ?? "—"}</td>
                    <td className="px-3 py-2">{m.isActive ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/${tenantId}/settings/users/${u.id}`}
                        className="underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
