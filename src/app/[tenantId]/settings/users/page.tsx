// src/app/[tenantId]/settings/users/page.tsx
import { prisma } from "@/lib/prisma";
import { ensureL3SettingsAccessOrRedirect } from "@/lib/access";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: { tenantId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

/** Simple yyyy-mm-dd formatter without extra deps */
function fmtDate(d?: Date | null) {
  if (!d) return "-";
  return d.toISOString().slice(0, 10);
}

export default async function SettingsUsersPage({ params }: PageProps) {
  const tenantId = params.tenantId;

  // Guard: allows platform L1/L2 and tenant L3
  await ensureL3SettingsAccessOrRedirect(tenantId);

  // Tenant header
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });

  // Memberships (flat)
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      supervisorId: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  // Resolve users (members + supervisors) in one query
  const userIds = new Set<string>();
  for (const m of memberships) {
    if (m.userId) userIds.add(m.userId);
    if (m.supervisorId) userIds.add(m.supervisorId);
  }
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, name: true, email: true, username: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const rows = memberships.map((m) => {
    const u = userMap.get(m.userId);
    const sup = m.supervisorId ? userMap.get(m.supervisorId) : null;
    return {
      id: m.userId,
      name: u?.name || "(no name)",
      email: u?.email || "",
      username: u?.username || "",
      role: m.role,
      supervisorName: sup?.name || "",
      createdAt: m.createdAt,
      isActive: m.isActive,
    };
  });

  // Managers for MEMBER supervisor select
  const managerUserIds = memberships
    .filter((m) => m.isActive && m.role === "MANAGER")
    .map((m) => m.userId);
  const managers =
    managerUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: managerUserIds } },
          select: { id: true, name: true },
        })
      : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Tenant: {tenant?.name ?? tenantId}
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/admin/tenants/${tenantId}/users`}>Admin Users</Link>
        </Button>
      </div>

      {/* Create User */}
      <section id="create" className="rounded-2xl border p-4 space-y-4">
        <h2 className="text-lg font-medium">Create user</h2>
        <p className="text-sm text-muted-foreground">
          TENANT_ADMIN is the top tenant role (L1). L2+ roles require a valid supervisor.
        </p>

        <form
          method="post"
          encType="application/x-www-form-urlencoded"
          action={`/api/admin/tenants/${tenantId}/users`}
          className="grid gap-4 md:grid-cols-2"
        >
          {/* name */}
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Full name
            </label>
            <input
              id="name"
              name="name"
              required
              className="h-9 rounded-md border px-3"
              placeholder="Jane Doe"
            />
          </div>

          {/* email */}
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="h-9 rounded-md border px-3"
              placeholder="jane@example.com"
            />
            <p className="text-xs text-muted-foreground">
              If left blank, a placeholder like username@{tenantId}.local will be used.
            </p>
          </div>

          {/* username */}
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              name="username"
              required
              className="h-9 rounded-md border px-3"
              placeholder="jane"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits, and hyphens (3–30 chars).
            </p>
          </div>

          {/* role */}
          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-sm font-medium">
              Role
            </label>
            <select id="role" name="role" className="h-9 rounded-md border px-3">
              <option value="TENANT_ADMIN">TENANT_ADMIN (L1)</option>
              <option value="MANAGER">MANAGER (L4)</option>
              <option value="MEMBER">MEMBER (L5)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Only one active TENANT_ADMIN (L1) is allowed per tenant. Creating a second should return 409.
            </p>
          </div>

          {/* supervisor (used when role = MEMBER) */}
          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="supervisorId" className="text-sm font-medium">
              Supervisor (required for MEMBER)
            </label>
            <select id="supervisorId" name="supervisorId" className="h-9 rounded-md border px-3">
              <option value="">— Select supervisor —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              If left empty and role is MEMBER, the server may reject; for other roles, this value is ignored.
            </p>
          </div>

          {/* redirect destination (absolute app path) */}
          <input type="hidden" name="redirectTo" value={`/${tenantId}/settings/users`} />

          {/* IMPORTANT: native button guarantees POST */}
          <div className="md:col-span-2">
            <button
              type="submit"
              className="h-9 rounded-md border px-3 font-medium"
            >
              Create user
            </button>
          </div>
        </form>
      </section>

      {/* Existing users */}
      <section className="rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Username</th>
              <th className="p-3">Supervisor</th>
              <th className="p-3">Created</th>
              <th className="p-3">Access</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={7}>
                  No users yet.
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.email || "-"}</td>
                  <td className="p-3">{u.username || "-"}</td>
                  <td className="p-3">{u.supervisorName || "-"}</td>
                  <td className="p-3">{fmtDate(u.createdAt)}</td>
                  <td className="p-3">{u.isActive ? "Active" : "Inactive"}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/admin/tenants/${tenantId}/users/${u.id}`}>
                          Manage
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
