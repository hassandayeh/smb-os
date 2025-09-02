// src/app/[tenantId]/settings/page.tsx
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureL3SettingsAccessOrRedirect } from "@/lib/guard-tenant-settings";
import { Card, CardContent } from "@/components/ui/card";
import { TenantMemberRole } from "@prisma/client";
import Link from "next/link";
import { hashPassword } from "@/lib/auth"; // ⬅️ use proper hashing

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** Tiny neutral pill for inline status. */
function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger" | "success";
}) {
  const toneClasses =
    tone === "danger"
      ? "bg-red-50 text-red-700 ring-red-200"
      : tone === "success"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses}`}>
      {children}
    </span>
  );
}

/**
 * Server action: create user (Keystone-guarded for Business Settings)
 * - L1/L2: can create TENANT_ADMIN/MANAGER/MEMBER
 * - L3 (tenant admin): can create MANAGER/MEMBER only
 * - Enforces optional users cap
 * - Username uniqueness per tenant (case-insensitive)
 * - REQUIRED by schema: name, email, passwordHash, tenant relation
 * - Default password: now hashed via hashPassword("123")
 */
export async function createTenantUser(formData: FormData) {
  "use server";
  const tenantId = String(formData.get("tenantId") ?? "");
  const rawUsername = String(formData.get("username") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim();
  const rawRole = String(formData.get("role") ?? "").trim();

  if (!tenantId) throw new Error("Missing tenantId");
  if (!rawUsername) throw new Error("Username is required");

  // Centralized access guard (L1/L2 OR L3 tenant admin)
  const gate = await ensureL3SettingsAccessOrRedirect(tenantId);

  const requestedRole = (
    rawRole === "TENANT_ADMIN" || rawRole === "MANAGER" || rawRole === "MEMBER" ? rawRole : "MEMBER"
  ) as TenantMemberRole;

  // L3 cannot create TENANT_ADMIN
  if (gate.level === "L3" && requestedRole === "TENANT_ADMIN") {
    throw new Error("Only platform staff can create a Tenant Admin.");
  }

  // User cap (optional) — count only NON-DELETED memberships
  const [capEnt, currentCount] = await Promise.all([
    prisma.entitlement.findUnique({
      where: { tenantId_moduleKey: { tenantId, moduleKey: "users" } },
      select: { limitsJson: true },
    }),
    prisma.tenantMembership.count({
      where: { tenantId, deletedAt: null }, // ✅ exclude soft-deleted
    }),
  ]);

  let userCap: number | null = null;
  if (capEnt?.limitsJson && typeof capEnt.limitsJson === "object") {
    const obj = capEnt.limitsJson as Record<string, unknown>;
    const a = Number((obj as any).maxUsers);
    const b = Number((obj as any).maxCount);
    userCap = Number.isFinite(a) && a >= 0 ? a : Number.isFinite(b) && b >= 0 ? b : null;
  }
  if (userCap !== null && currentCount >= userCap) {
    throw new Error(`User cap reached (${currentCount} / ${userCap}).`);
  }

  // Prevent duplicate username within the same tenant (deleted users get renamed anyway)
  const normalizedUsername = rawUsername.toLowerCase();
  const existingMembership = await prisma.tenantMembership.findFirst({
    where: {
      tenantId,
      deletedAt: null, // ✅ consider only active (non-deleted) memberships
      user: { username: normalizedUsername },
    },
    select: { id: true },
  });
  if (existingMembership) {
    throw new Error("A user with this username already exists in this tenant.");
  }

  // ✅ Hash the default password "123"
  const defaultPasswordHash = await hashPassword("123");

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: normalizedUsername,
        name: rawName || normalizedUsername,
        email: rawEmail,
        // REQUIRED by schema (optional in UX but column exists)
        passwordHash: defaultPasswordHash,
        // REQUIRED relation
        tenant: { connect: { id: tenantId } },
      },
      select: { id: true },
    });

    await tx.tenantMembership.create({
      data: {
        tenantId,
        userId: user.id,
        role: requestedRole,
        isActive: true,
      },
    });

    // Best-effort audit
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        action: "settings.createUser",
        metaJson: {
          idCreated: user.id,
          username: normalizedUsername,
          name: rawName || normalizedUsername,
          email: rawEmail,
          role: requestedRole,
          origin: "tenant-settings",
        },
      },
    });
  });

  revalidatePath(`/${tenantId}/settings`);
  redirect(`/${tenantId}/settings?saved=1`);
}

export default async function TenantL3SettingsPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { tenantId } = params;

  // Keystone compliance: guard FIRST (L1/L2 OR L3 tenant admin)
  const gate = await ensureL3SettingsAccessOrRedirect(tenantId);

  // Load tenant + NON-DELETED members + optional users cap
  const [tenant, members, userCapEnt, memberCount] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    }),
    prisma.tenantMembership.findMany({
      where: { tenantId, deletedAt: null }, // ✅ exclude soft-deleted from the table
      select: {
        id: true,
        role: true,
        isActive: true, // ⬅️ status chip
        user: { select: { id: true, username: true, email: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.entitlement.findUnique({
      where: { tenantId_moduleKey: { tenantId, moduleKey: "users" } },
      select: { limitsJson: true },
    }),
    prisma.tenantMembership.count({
      where: { tenantId, deletedAt: null }, // ✅ exclude soft-deleted from the header count
    }),
  ]);

  if (!tenant) notFound();

  let userCap: number | null = null;
  if (userCapEnt?.limitsJson && typeof userCapEnt.limitsJson === "object") {
    const obj = userCapEnt.limitsJson as Record<string, unknown>;
    const a = Number((obj as any).maxUsers);
    const b = Number((obj as any).maxCount);
    userCap = Number.isFinite(a) && a >= 0 ? a : Number.isFinite(b) && b >= 0 ? b : null;
  }

  const roleOptions: Array<{ value: TenantMemberRole; label: string }> =
    gate.level === "L1" || gate.level === "L2"
      ? [
          { value: "TENANT_ADMIN", label: "Tenant Admin" },
          { value: "MANAGER", label: "Manager" },
          { value: "MEMBER", label: "Member" },
        ]
      : [
          { value: "MANAGER", label: "Manager" },
          { value: "MEMBER", label: "Member" },
        ];

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">
        Workspace Settings — {tenant.name}
      </h1>

      <div className="mb-2 text-sm text-muted-foreground">
        Users: {memberCount} {" / "} {userCap ?? "∞"}
        <span className="ml-4 text-xs">Level: {gate.level}</span>
      </div>

      {/* Create user */}
      <Card className="mb-6">
        <CardContent className="space-y-3 p-4">
          <form action={createTenantUser} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input type="hidden" name="tenantId" value={tenantId} />
            <input
              name="username"
              placeholder="e.g. jdoe"
              className="rounded-md border px-3 py-2"
            />
            <input
              name="name"
              placeholder="e.g. Jane Doe"
              className="rounded-md border px-3 py-2"
            />
            <input
              name="email"
              placeholder="name@company.com"
              className="rounded-md border px-3 py-2"
            />
            <select name="role" className="rounded-md border px-3 py-2">
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="md:col-span-4">
              <button className="rounded-md border px-3 py-2">
                Create (default password: 123)
              </button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground">
            L3 can create Managers and Members. Only L1/L2 can create a Tenant Admin. Caps are enforced when set.
          </p>
        </CardContent>
      </Card>

      {/* Users table (ID, Name, Username, Role, Status, Manage) */}
      <Card>
        <CardContent className="p-0">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user.id} className="border-t">
                  <td className="px-3 py-2">{m.user.id}</td>
                  <td className="px-3 py-2">{m.user.name}</td>
                  <td className="px-3 py-2">{m.user.username}</td>
                  <td className="px-3 py-2">{m.role}</td>
                  <td className="px-3 py-2">
                    {m.isActive ? (
                      <Chip tone="success">Active</Chip>
                    ) : (
                      <Chip tone="danger">Inactive</Chip>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/${tenantId}/settings/users/${m.user.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}

              {members.length === 0 && (
                <tr className="border-t">
                  <td className="px-3 py-8" colSpan={6}>
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="px-3 pb-3 pt-1 text-xs text-muted-foreground">
            Inline manage: open a user to adjust role, activate/deactivate, or soft-delete.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
