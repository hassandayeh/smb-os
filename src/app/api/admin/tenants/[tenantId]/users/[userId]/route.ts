// src/app/api/admin/tenants/[tenantId]/users/[userId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole } from "@prisma/client";

export const dynamic = "force-dynamic";

type UpdateBody = {
  // Optional edits
  name?: string;
  role?: "TENANT_ADMIN" | "MANAGER" | "MEMBER";
  isActive?: boolean;

  // Delete support
  intent?: string;   // "delete"
  delete?: string | boolean;

  // For form posts
  redirectTo?: string;
};

async function actorIsPlatformAdmin(userId: string) {
  const roles = await prisma.appRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const s = new Set(roles.map((r) => r.role));
  return s.has("DEVELOPER") || s.has("APP_ADMIN");
}

async function actorIsTenantAdmin(userId: string, tenantId: string) {
  const m = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId, isActive: true },
    select: { role: true, isActive: true },
  });
  return !!m && m.isActive && m.role === "TENANT_ADMIN";
}

function nstr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
function nbool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.toLowerCase().trim();
    if (t === "true" || t === "1" || t === "on" || t === "yes") return true;
    if (t === "false" || t === "0" || t === "off" || t === "no") return false;
  }
  return undefined;
}
function toEnumRole(v: unknown): TenantMemberRole | undefined {
  if (v === "TENANT_ADMIN") return TenantMemberRole.TENANT_ADMIN;
  if (v === "MANAGER") return TenantMemberRole.MANAGER;
  if (v === "MEMBER") return TenantMemberRole.MEMBER;
  return undefined;
}

async function readBody(req: Request): Promise<UpdateBody> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return j as UpdateBody;
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    return {
      name: nstr(form.get("name")),
      role: (nstr(form.get("role")) || undefined) as any,
      isActive: nbool(form.get("isActive")),
      redirectTo: nstr(form.get("redirectTo")) || undefined,
      intent: nstr(form.get("intent")) || undefined,
      delete: nstr(form.get("delete")) || undefined,
    };
  }
  return (await req.json().catch(() => ({}))) as UpdateBody;
}

// ---------- DELETE (JSON) ----------
export async function DELETE(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ true);
}

// ---------- PATCH / POST (form or JSON) ----------
export async function PATCH(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ false);
}
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ false);
}

async function handleDeleteOrUpdate(
  req: Request,
  params: { tenantId: string; userId: string },
  forceDelete: boolean
) {
  const tenantId = params?.tenantId;
  const userId = params?.userId;

  if (!tenantId || !userId) {
    return NextResponse.json({ error: "tenantId and userId are required" }, { status: 400 });
  }

  const actorUserId = await getCurrentUserId();
  if (!actorUserId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [isPlatform, isTenantAdmin] = await Promise.all([
    actorIsPlatformAdmin(actorUserId),
    actorIsTenantAdmin(actorUserId, tenantId),
  ]);
  if (!isPlatform && !isTenantAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await readBody(req);

  const isDelete =
    forceDelete ||
    body.intent === "delete" ||
    (typeof body.delete === "string"
      ? ["1", "true", "on", "yes"].includes(body.delete.toLowerCase())
      : !!body.delete);

  if (isDelete) {
    try {
      const [user, membership] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, tenantId: true, email: true, name: true },
        }),
        prisma.tenantMembership.findFirst({
          where: { tenantId, userId },
          select: { id: true, role: true, isActive: true },
        }),
      ]);
      if (!user || user.tenantId !== tenantId) {
        return NextResponse.json({ error: "user not found in tenant" }, { status: 404 });
      }

      // Guard: don't allow deleting the last active Tenant Admin
      const targetIsAdmin = membership?.role === TenantMemberRole.TENANT_ADMIN;
      if (targetIsAdmin) {
        const otherActiveAdmins = await prisma.tenantMembership.count({
          where: {
            tenantId,
            role: TenantMemberRole.TENANT_ADMIN,
            isActive: true,
            NOT: { userId },
          },
        });
        if (otherActiveAdmins === 0) {
          return NextResponse.json(
            { error: "Cannot delete the last active Tenant Admin" },
            { status: 400 }
          );
        }
      }

      // Delete dependents first, then user
      await prisma.$transaction([
        prisma.userEntitlement.deleteMany({ where: { tenantId, userId } }),
        prisma.tenantMembership.deleteMany({ where: { tenantId, userId } }),
        prisma.user.delete({ where: { id: userId } }),
      ]);

      // Audit log (non-fatal)
      try {
        await prisma.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "user.delete",
            metaJson: {
              targetUserId: userId,
              email: user.email,
              name: user.name,
              role: membership?.role ?? null,
            },
          },
        });
      } catch (e) {
        console.warn("Audit log failed (user.delete):", e);
      }

      if (body.redirectTo) {
        return NextResponse.redirect(new URL(body.redirectTo, req.url), { status: 303 });
      }
      return NextResponse.json({ ok: true, deleted: true }, { status: 200 });
    } catch (err) {
      console.error("DELETE user error:", err);
      return NextResponse.json({ error: "failed to delete user" }, { status: 500 });
    }
  }

  // --- Update path (role / isActive / name) ---
  const name = nstr(body.name);
  const roleEnum = toEnumRole(body.role);
  const isActive = body.isActive;

  try {
    // Fetch existing state
    const [user, membership] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, tenantId: true, name: true, email: true },
      }),
      prisma.tenantMembership.findFirst({
        where: { tenantId, userId },
        select: { id: true, role: true, isActive: true },
      }),
    ]);
    if (!user || user.tenantId !== tenantId) {
      return NextResponse.json({ error: "user not found in tenant" }, { status: 404 });
    }

    // Prepare updates
    let updatedUser = user;
    let updatedMembership = membership;

    const before = {
      user: { name: user.name },
      membership: membership ? { role: membership.role, isActive: membership.isActive } : null,
    };

    // Update name (optional)
    if (name) {
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { name },
        select: { id: true, tenantId: true, name: true, email: true },
      });
    }

    // Ensure membership exists
    let membershipId = membership?.id;
    if (!membershipId) {
      const created = await prisma.tenantMembership.create({
        data: { tenantId, userId, role: roleEnum ?? TenantMemberRole.MEMBER, isActive: true },
        select: { id: true, role: true, isActive: true },
      });
      membershipId = created.id;
      updatedMembership = created;
    }

    // Update role/isActive
    if (roleEnum !== undefined || typeof isActive === "boolean") {
      updatedMembership = await prisma.tenantMembership.update({
        where: { id: membershipId! },
        data: {
          ...(roleEnum !== undefined ? { role: roleEnum } : {}),
          ...(typeof isActive === "boolean" ? { isActive } : {}),
        },
        select: { id: true, role: true, isActive: true },
      });
    }

    const after = {
      user: { name: updatedUser.name },
      membership: updatedMembership
        ? { role: updatedMembership.role, isActive: updatedMembership.isActive }
        : null,
    };

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "user.update",
          metaJson: { targetUserId: userId, before, after },
        },
      });
    } catch (e) {
      console.warn("Audit log failed (user.update):", e);
    }

    if (body.redirectTo) {
      return NextResponse.redirect(new URL(body.redirectTo, req.url), { status: 303 });
    }
    return NextResponse.json({ ok: true, user: updatedUser, membership: updatedMembership }, { status: 200 });
  } catch (err) {
    console.error("PATCH/POST user update error:", err);
    return NextResponse.json({ error: "failed to update user" }, { status: 500 });
  }
}
