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

  // Keystone: protect Settings at layout-level ideally; guard here as well for safety.
  await ensureModuleAccessOrRedirect(tenantId, "settings");

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      memberships: { some: { tenantId, deletedAt: null } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const userIds = users.map((u) => u.id);

  const memberships = userIds.length
    ? await prisma.tenantMembership.findMany({
        where: {
          tenantId,
          userId: { in: userIds },
          deletedAt: null, // hide soft-deleted membership rows
        },
        select: {
          userId: true,
          role: true,
          isActive: true,
        },
      })
    : [];

  const memByUser = new Map<string, (typeof memberships)[number]>();
  for (const m of memberships) memByUser.set(m.userId, m);

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Workspace Settings — Users</h1>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Username</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Role</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const m = memByUser.get(u.id);
              return (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 text-sm text-slate-700">{u.name ?? "—"}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{u.username}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{m?.role ?? "—"}</td>
                  <td className="px-4 py-2 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ring-1 ${
                        m?.isActive
                          ? "bg-green-50 text-green-700 ring-green-200"
                          : "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {m?.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <Link
                      className="text-indigo-600 hover:underline"
                      href={`/${tenantId}/settings/users/${u.id}`}
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={5}>
                  No users (non-deleted) found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
