// src/app/api/[tenantId]/settings/users/[userId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole, type Prisma } from "@prisma/client";
import { guardTenantModule } from "@/lib/guard-route"; // Keystone tenant guard
import {
  canDeleteUser,
  canManageUserGeneral,
  assertNotLastActiveL3,
  assertNotDemotingLastActiveL3,
} from "@/lib/access"; // centralized guards/assertions
import { writeAudit } from "@/lib/audit"; // centralized audit

export const dynamic = "force-dynamic";

type UpdateBody = {
  name?: string;
  role?: "TENANT_ADMIN" | "MANAGER" | "MEMBER";
  isActive?: boolean;
  supervisorId?: string | null;
  intent?: string;
  delete?: string | boolean;
  redirectTo?: string;
};

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
      supervisorId: Object.prototype.hasOwnProperty.call(j, "supervisorId")
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
    if (payload?.error) url.searchParams.set("error", String(payload.error));
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json(payload, { status });
}

// --- username suffixing (UTC YYYYMMDD) ---
function yyyymmddUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}${m}${day}`;
}
async function buildUniqueDeletedUsername(
  tenantId: string,
  baseUsername: string,
  tx: Prisma.TransactionClient
) {
  const ISO = yyyymmddUTC();
  const MAX = 64;
  const reserve = 1 + 8; // "-" + date

  let core = baseUsername.trim();
  if (core.length + reserve > MAX) core = core.slice(0, MAX - reserve);

  let candidate = `${core}-${ISO}`;
  let n = 2;

  while (
    await tx.user.findFirst({
      where: { tenantId, username: candidate },
      select: { id: true },
    })
  ) {
    const extra = 1 + String(n).length; // "-" + digits
    const allowed = Math.max(1, MAX - reserve - extra);
    const c = core.length > allowed ? core.slice(0, allowed) : core;
    candidate = `${c}-${ISO}-${n}`;
    n++;
    if (n > 99) break;
  }
  return candidate;
}

// ---------- DELETE ----------
export async function DELETE(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  // Keystone tenant guard (Settings)
  const guard = await guardTenantModule(req, params, "settings");
  if (guard) return guard;
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ true);
}

// ---------- PATCH/POST ----------
export async function PATCH(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  const guard = await guardTenantModule(req, params, "settings");
  if (guard) return guard;
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ false);
}
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string; userId: string } }
) {
  const guard = await guardTenantModule(req, params, "settings");
  if (guard) return guard;
  return handleDeleteOrUpdate(req, params, /*forceDelete*/ false);
}

async function handleDeleteOrUpdate(
  req: Request,
  params: { tenantId: string; userId: string },
  forceDelete: boolean
) {
  const { tenantId, userId } = params || {};
  if (!tenantId || !userId)
    return NextResponse.json({ error: "errors.params.required" }, { status: 400 });

  const actorUserId = await getCurrentUserId();
  if (!actorUserId) return NextResponse.json({ error: "errors.auth" }, { status: 403 });

  const body = await readBody(req);
  const isDelete =
    forceDelete ||
    body.intent === "delete" ||
    (typeof body.delete === "string"
      ? ["1", "true", "on", "yes"].includes(body.delete.toLowerCase())
      : !!body.delete);

  // ----------------- Soft delete -----------------
  if (isDelete) {
    // No self delete (even for platform staff)
    if (actorUserId === userId) {
      return redirectOrJson(req, body.redirectTo, { error: "errors.self_delete" }, 400);
    }

    const { allowed, reason } = await canDeleteUser({
      tenantId,
      actorUserId,
      targetUserId: userId,
    });
    if (!allowed) {
      return redirectOrJson(
        req,
        body.redirectTo,
        { error: `Forbidden (${reason ?? "delete.not_allowed"})` },
        403
      );
    }

    try {
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
      if (!user || user.tenantId !== tenantId)
        return NextResponse.json({ error: "errors.user.not_found_in_tenant" }, { status: 404 });

      if (!membership || membership.deletedAt) {
        return redirectOrJson(
          req,
          body.redirectTo,
          { error: "errors.membership.not_found_or_deleted" },
          400
        );
      }

      // Protect last active L3 (delete case)
      await assertNotLastActiveL3({ tenantId, targetUserId: userId });

      const result = await prisma.$transaction(async (tx) => {
        const oldUsername = user.username;
        const newUsername = await buildUniqueDeletedUsername(tenantId, oldUsername, tx);

        await tx.user.update({
          where: { id: userId },
          data: { username: newUsername },
          select: { id: true },
        });

        // Soft-delete membership
        await tx.tenantMembership.updateMany({
          where: { tenantId, userId, deletedAt: null as any },
          data: { deletedAt: new Date(), deletedByUserId: actorUserId, isActive: false },
        });

        // Cleanup per-user entitlements
        await tx.userEntitlement.deleteMany({ where: { tenantId, userId } });

        // Audit inside tx
        await writeAudit({
          tenantId,
          actorUserId,
          action: "user.delete",
          meta: {
            targetUserId: userId,
            email: user.email,
            name: user.name,
            oldUsername,
            newUsername,
            membershipRole: membership.role ?? null,
            softDeleted: true,
          },
          tx,
          req,
        });

        return { oldUsername, newUsername };
      });

      if (body.redirectTo) {
        return NextResponse.redirect(new URL(body.redirectTo, req.url), { status: 303 });
      }
      return NextResponse.json({ ok: true, deleted: true, ...result }, { status: 200 });
    } catch (err) {
      console.error("DELETE user error:", err);
      return NextResponse.json({ error: "errors.user.delete_failed" }, { status: 500 });
    }
  }

  // ----------------- Status toggle / set -----------------
  const decisionStatus = await canManageUserGeneral({
    tenantId,
    actorUserId,
    targetUserId: userId,
    intent: "status",
  });
  if (!decisionStatus.allowed) {
    return redirectOrJson(
      req,
      body.redirectTo,
      { error: `Forbidden (${decisionStatus.reason ?? "status.denied"})` },
      403
    );
  }

  // Load current membership
  const prev = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId, deletedAt: null as any },
    select: { id: true, role: true, isActive: true },
  });
  if (!prev) {
    return redirectOrJson(req, body.redirectTo, { error: "errors.membership.not_found" }, 404);
  }

  // Determine the next isActive
  const nextIsActive =
    typeof body.isActive === "boolean" ? body.isActive : !prev.isActive;

  // Prevent deactivating the last active L3
  if (prev.role === "TENANT_ADMIN" && nextIsActive === false) {
    await assertNotLastActiveL3({ tenantId, targetUserId: userId });
  }

  // Apply status change
  await prisma.tenantMembership.update({
    where: { id: prev.id },
    data: { isActive: nextIsActive },
  });

  // Audit (post-commit)
  await writeAudit({
    tenantId,
    actorUserId,
    action: "user.status.changed",
    meta: {
      targetUserId: userId,
      before: { isActive: prev.isActive, role: prev.role },
      after: { isActive: nextIsActive, role: prev.role },
    },
    req,
  });

  // ----------------- Role update (optional) -----------------
  const nextRole = toEnumRole(body.role);
  if (nextRole && nextRole !== prev.role) {
    // Intent guard
    const decisionRole = await canManageUserGeneral({
      tenantId,
      actorUserId,
      targetUserId: userId,
      intent: "role",
    });
    if (!decisionRole.allowed) {
      return redirectOrJson(
        req,
        body.redirectTo,
        { error: `Forbidden (${decisionRole.reason ?? "role.denied"})` },
        403
      );
    }

    // Safety: block demoting the last active L3
    await assertNotDemotingLastActiveL3({
      tenantId,
      targetUserId: userId,
      nextRole,
    });

    const updated = await prisma.tenantMembership.update({
      where: { id: prev.id },
      data: { role: nextRole },
      select: { role: true, isActive: true },
    });

    await writeAudit({
      tenantId,
      actorUserId,
      action: "user.role.changed",
      meta: {
        targetUserId: userId,
        before: { role: prev.role },
        after: { role: updated.role },
      },
      req,
    });

    return redirectOrJson(
      req,
      body.redirectTo,
      { ok: true, isActive: nextIsActive, role: updated.role },
      200
    );
  }

  return redirectOrJson(req, body.redirectTo, { ok: true, isActive: nextIsActive }, 200);
}
