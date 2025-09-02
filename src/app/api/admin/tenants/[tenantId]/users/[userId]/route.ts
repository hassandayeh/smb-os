// src/app/api/admin/tenants/[tenantId]/users/[userId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole, type Prisma } from "@prisma/client";
import { requireAccess } from "@/lib/guard-route"; // Keystone admin guard (API)

export const dynamic = "force-dynamic";

type UpdateBody = {
  // Optional edits
  name?: string;
  role?: "TENANT_ADMIN" | "MANAGER" | "MEMBER";
  isActive?: boolean;
  supervisorId?: string | null; // Manager mapping for L5

  // Delete support
  intent?: string; // "delete"
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
    where: { tenantId, userId, isActive: true, deletedAt: null },
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
    const j = (await req.json().catch(() => ({}))) as any;
    return {
      name: nstr(j.name) || undefined,
      role: (nstr(j.role) || undefined) as any,
      isActive: nbool(j.isActive),
      supervisorId:
        Object.prototype.hasOwnProperty.call(j, "supervisorId")
          ? (nstr(j.supervisorId) || null)
          : undefined,
      redirectTo: nstr(j.redirectTo) || undefined,
      intent: nstr(j.intent) || undefined,
      delete: j.delete,
    };
  }
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    const form = await req.formData();
    const supRaw = form.get("supervisorId");
    return {
      name: nstr(form.get("name")),
      role: (nstr(form.get("role")) || undefined) as any,
      isActive: nbool(form.get("isActive")),
      supervisorId: supRaw === null ? undefined : (nstr(supRaw) || null),
      redirectTo: nstr(form.get("redirectTo")) || undefined,
      intent: nstr(form.get("intent")) || undefined,
      delete: nstr(form.get("delete")) || undefined,
    };
  }
  const j = (await req.json().catch(() => ({}))) as any;
  return {
    name: nstr(j.name) || undefined,
    role: (nstr(j.role) || undefined) as any,
    isActive: nbool(j.isActive),
    supervisorId: Object.prototype.hasOwnProperty.call(j, "supervisorId")
      ? (nstr(j.supervisorId) || null)
      : undefined,
    redirectTo: nstr(j.redirectTo) || undefined,
    intent: nstr(j.intent) || undefined,
    delete: j.delete,
  };
}

function redirectOrJson(
  req: Request,
  redirectTo: string | undefined,
  payload: any,
  status: number
) {
  if (redirectTo) {
    const url = new URL(redirectTo, req.url);
    if (payload?.error) {
      url.searchParams.set("error", String(payload.error));
    }
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json(payload, { status });
}

// ---------- DELETE ----------
export async function DELETE(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  await requireAccess(); // Keystone guard (admin APIs)
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ true);
}

// ---------- PATCH / POST ----------
export async function PATCH(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  await requireAccess(); // Keystone guard (admin APIs)
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ false);
}
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  await requireAccess(); // Keystone guard (admin APIs)
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ false);
}

// Build an ISO date suffix once per request (UTC)
function yyyymmddUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}${m}${day}`;
}

// Ensure the suffixed username is unique per-tenant. Optional length cap.
async function buildUniqueDeletedUsername(
  tenantId: string,
  baseUsername: string,
  tx: Prisma.TransactionClient
) {
  const ISO = yyyymmddUTC();
  const MAX = 64; // conservative cap; adjust if you add a DB length constraint later
  const baseTrimmed = baseUsername.trim();
  // Reserve space for "-YYYYMMDD" and optional "-N"
  const reserve = 1 + 8; // "-" + date
  let core = baseTrimmed;
  if (core.length + reserve > MAX) {
    core = core.slice(0, MAX - reserve);
  }

  let candidate = `${core}-${ISO}`;
  let n = 2;
  // Check collisions; append "-2", "-3", ... if needed
  while (
    await tx.user.findFirst({
      where: { tenantId, username: candidate },
      select: { id: true },
    })
  ) {
    const extra = 1 + String(n).length; // "-" + digits
    const allowedCoreLen = Math.max(1, MAX - reserve - extra);
    const coreAlt =
      core.length > allowedCoreLen ? core.slice(0, allowedCoreLen) : core;
    candidate = `${coreAlt}-${ISO}-${n}`;
    n++;
    if (n > 99) break; // safety valve
  }
  return candidate;
}

async function handleDeleteOrUpdate(
  req: Request,
  params: { tenantId: string; userId: string },
  forceDelete: boolean
) {
  const tenantId = params?.tenantId;
  const userId = params?.userId;

  if (!tenantId || !userId) {
    return NextResponse.json(
      { error: "tenantId and userId are required" },
      { status: 400 }
    );
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

  // NEW: L3 cannot self-manage (delete themselves)
  if (!isPlatform && isTenantAdmin && isDelete && actorUserId === userId) {
    return redirectOrJson(
      req,
      body.redirectTo,
      { error: "Tenant Admin cannot delete themselves" },
      400
    );
  }

  if (isDelete) {
    try {
      // Fetch essential state
      const [user, membership] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, tenantId: true, email: true, name: true, username: true },
        }),
        prisma.tenantMembership.findFirst({
          where: { tenantId, userId },
          select: { id: true, role: true, isActive: true, deletedAt: true },
        }),
      ]);
      if (!user || user.tenantId !== tenantId) {
        return NextResponse.json({ error: "user not found in tenant" }, { status: 404 });
      }
      if (!membership || membership.deletedAt) {
        return redirectOrJson(req, body.redirectTo, { error: "membership not found or already deleted" }, 400);
      }

      // Guard: don't allow deleting the last active Tenant Admin
      const targetIsAdmin = membership.role === TenantMemberRole.TENANT_ADMIN;
      if (targetIsAdmin) {
        const otherActiveAdmins = await prisma.tenantMembership.count({
          where: {
            tenantId,
            role: TenantMemberRole.TENANT_ADMIN,
            isActive: true,
            deletedAt: null,
            NOT: { userId },
          },
        });
        if (otherActiveAdmins === 0) {
          return redirectOrJson(
            req,
            body.redirectTo,
            { error: "Cannot delete the last active Tenant Admin" },
            400
          );
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1) Username suffix (free the handle)
        const oldUsername = user.username;
        const newUsername = await buildUniqueDeletedUsername(
          tenantId,
          oldUsername,
          tx
        );

        await tx.user.update({
          where: { id: userId },
          data: { username: newUsername },
          select: { id: true },
        });

        // 2) Mark membership soft-deleted and inactive
        await tx.tenantMembership.updateMany({
          where: { tenantId, userId, deletedAt: null },
          data: {
            deletedAt: new Date(),
            deletedByUserId: actorUserId,
            isActive: false,
          },
        });

        // 3) Remove per-user overrides (as per UI copy)
        await tx.userEntitlement.deleteMany({ where: { tenantId, userId } });

        // 4) Audit
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "user.delete",
            metaJson: {
              targetUserId: userId,
              email: user.email,
              name: user.name,
              oldUsername,
              newUsername,
              membershipRole: membership.role ?? null,
              softDeleted: true,
            },
          },
        });

        return { oldUsername, newUsername };
      });

      if (body.redirectTo) {
        return NextResponse.redirect(new URL(body.redirectTo, req.url), {
          status: 303,
        });
      }
      return NextResponse.json({ ok: true, deleted: true, ...result }, { status: 200 });
    } catch (err) {
      console.error("DELETE user error:", err);
      return NextResponse.json(
        { error: "failed to delete user" },
        { status: 500 }
      );
    }
  }

  // --- Update path (name / role / isActive / supervisorId) ---
  const name = nstr(body.name);
  const roleEnum = toEnumRole(body.role);
  const isActive = body.isActive;
  const supervisorIdProvided = Object.prototype.hasOwnProperty.call(
    body,
    "supervisorId"
  );
  const supervisorId = body.supervisorId ?? null; // null = unassign manager

  try {
    // Fetch existing state
    const [user, membership] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, tenantId: true, name: true, email: true, username: true },
      }),
      prisma.tenantMembership.findFirst({
        where: { tenantId, userId, deletedAt: null },
        select: {
          id: true,
          role: true,
          isActive: true,
          supervisorId: true,
        },
      }),
    ]);
    if (!user || user.tenantId !== tenantId) {
      return NextResponse.json({ error: "user not found in tenant" }, { status: 404 });
    }

    // NEW: self-management guard for L3 (no role/isActive changes)
    if (
      !isPlatform &&
      isTenantAdmin &&
      actorUserId === userId &&
      (roleEnum !== undefined || typeof isActive === "boolean")
    ) {
      return redirectOrJson(
        req,
        body.redirectTo,
        { error: "Tenant Admin cannot change their own role or status" },
        400
      );
    }

    let updatedUser = user;
    let updatedMembership = membership;

    const before = {
      user: { name: user.name },
      membership: membership
        ? {
            role: membership.role,
            isActive: membership.isActive,
            supervisorId: membership.supervisorId ?? null,
          }
        : null,
    };

    // Update name (optional)
    if (name) {
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { name },
        select: { id: true, tenantId: true, name: true, email: true, username: true },
      });
    }

    // Ensure membership exists
    let membershipId = membership?.id;
    if (!membershipId) {
      const created = await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId,
          role: roleEnum ?? TenantMemberRole.MEMBER,
          isActive: true,
        },
        select: {
          id: true,
          role: true,
          isActive: true,
          supervisorId: true,
        },
      });
      membershipId = created.id;
      updatedMembership = created;
    }

    // compute change-intent for L3 role transitions
    const wasL3 = updatedMembership?.role === TenantMemberRole.TENANT_ADMIN;
    const toL3 = roleEnum === TenantMemberRole.TENANT_ADMIN && !wasL3;
    const fromL3 =
      wasL3 && roleEnum !== undefined && roleEnum !== TenantMemberRole.TENANT_ADMIN;

    // only platform can assign/remove L3
    if ((toL3 || fromL3) && !isPlatform) {
      return redirectOrJson(
        req,
        body.redirectTo,
        { error: "Only platform admins can assign or remove Tenant Admin" },
        403
      );
    }

    // uniqueness — only one L3 per tenant
    if (toL3) {
      const otherAdmins = await prisma.tenantMembership.count({
        where: {
          tenantId,
          role: TenantMemberRole.TENANT_ADMIN,
          NOT: { userId },
          deletedAt: null,
        },
      });
      if (otherAdmins > 0) {
        return redirectOrJson(
          req,
          body.redirectTo,
          { error: "Only one Tenant Admin is allowed per tenant" },
          400
        );
      }
    }

    // Update role/isActive (if provided)
    if (roleEnum !== undefined || typeof isActive === "boolean") {
      // last active L3 guard (demote or deactivate)
      if (fromL3 || (wasL3 && typeof isActive === "boolean" && isActive === false)) {
        const otherActiveAdmins = await prisma.tenantMembership.count({
          where: {
            tenantId,
            role: TenantMemberRole.TENANT_ADMIN,
            isActive: true,
            deletedAt: null,
            NOT: { userId },
          },
        });
        if (otherActiveAdmins === 0) {
          return redirectOrJson(
            req,
            body.redirectTo,
            { error: "Cannot demote/deactivate the last active Tenant Admin" },
            400
          );
        }
      }

      updatedMembership = await prisma.tenantMembership.update({
        where: { id: membershipId! },
        data: {
          ...(roleEnum !== undefined ? { role: roleEnum } : {}),
          ...(typeof isActive === "boolean" ? { isActive } : {}),
        },
        select: {
          id: true,
          role: true,
          isActive: true,
          supervisorId: true,
        },
      });
    }

    // Update supervisorId (Manager mapping) — only if supplied
    if (supervisorIdProvided) {
      // Only platform admins or tenant admins can change mapping
      if (!isPlatform && !isTenantAdmin) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      // Only MEMBERS can have a manager
      const roleNow =
        updatedMembership?.role ?? roleEnum ?? TenantMemberRole.MEMBER;
      if (roleNow !== TenantMemberRole.MEMBER) {
        return redirectOrJson(
          req,
          body.redirectTo,
          { error: "Only Members can be assigned a Manager" },
          400
        );
      }
      // Prevent self-manager
      if (supervisorId && supervisorId === userId) {
        return redirectOrJson(
          req,
          body.redirectTo,
          { error: "A user cannot be their own manager" },
          400
        );
      }

      // If assigning (not clearing), validate manager is active MANAGER in same tenant
      if (supervisorId) {
        const mgr = await prisma.tenantMembership.findFirst({
          where: {
            tenantId,
            userId: supervisorId,
            role: TenantMemberRole.MANAGER,
            isActive: true,
            deletedAt: null,
          },
          select: { userId: true },
        });
        if (!mgr) {
          return redirectOrJson(
            req,
            body.redirectTo,
            { error: "Selected manager is not an active Manager in this tenant" },
            400
          );
        }
      }

      updatedMembership = await prisma.tenantMembership.update({
        where: { id: membershipId! },
        data: { supervisorId },
        select: {
          id: true,
          role: true,
          isActive: true,
          supervisorId: true,
        },
      });
    }

    const after = {
      user: { name: updatedUser.name },
      membership: updatedMembership
        ? {
            role: updatedMembership.role,
            isActive: updatedMembership.isActive,
            supervisorId: updatedMembership.supervisorId ?? null,
          }
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
      return NextResponse.redirect(new URL(body.redirectTo, req.url), {
        status: 303,
      });
    }
    return NextResponse.json(
      { ok: true, user: updatedUser, membership: updatedMembership },
      { status: 200 }
    );
  } catch (err) {
    console.error("PATCH/POST user update error:", err);
    return NextResponse.json(
      { error: "failed to update user" },
      { status: 500 }
    );
  }
}
