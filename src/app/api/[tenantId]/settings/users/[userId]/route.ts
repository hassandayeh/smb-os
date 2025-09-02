// src/app/api/[tenantId]/settings/users/[userId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole, type Prisma } from "@prisma/client";
import { guardTenantModule } from "@/lib/guard-route"; // ⬅️ Keystone tenant guard

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
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
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

function redirectOrJson(req: Request, redirectTo: string | undefined, payload: any, status: number) {
  if (redirectTo) {
    const url = new URL(redirectTo, req.url);
    if (payload?.error) url.searchParams.set("error", String(payload.error));
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json(payload, { status });
}

// --- helper: who is platform / L3 here? ---
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

// --- username suffixing (ISO date) ---
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
    return NextResponse.json({ error: "tenantId and userId are required" }, { status: 400 });

  const actorUserId = await getCurrentUserId();
  if (!actorUserId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [isPlatform, isL3Here] = await Promise.all([
    actorIsPlatformAdmin(actorUserId),
    actorIsTenantAdmin(actorUserId, tenantId),
  ]);

  const body = await readBody(req);
  const isDelete =
    forceDelete ||
    body.intent === "delete" ||
    (typeof body.delete === "string"
      ? ["1", "true", "on", "yes"].includes(body.delete.toLowerCase())
      : !!body.delete);

  // L3 cannot delete themselves (platform can)
  if (!isPlatform && isL3Here && isDelete && actorUserId === userId) {
    return redirectOrJson(
      req,
      body.redirectTo,
      { error: "Tenant Admin cannot delete themselves" },
      400
    );
  }

  if (isDelete) {
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
        return NextResponse.json({ error: "user not found in tenant" }, { status: 404 });

      if (!membership || membership.deletedAt) {
        return redirectOrJson(
          req,
          body.redirectTo,
          { error: "membership not found or already deleted" },
          400
        );
      }

      // Guard: not the last active L3
      if (membership.role === TenantMemberRole.TENANT_ADMIN) {
        const others = await prisma.tenantMembership.count({
          where: {
            tenantId,
            role: TenantMemberRole.TENANT_ADMIN,
            isActive: true,
            deletedAt: null,
            NOT: { userId },
          },
        });
        if (others === 0) {
          return redirectOrJson(
            req,
            body.redirectTo,
            { error: "Cannot delete the last active Tenant Admin" },
            400
          );
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        const oldUsername = user.username;
        const newUsername = await buildUniqueDeletedUsername(tenantId, oldUsername, tx);

        await tx.user.update({
          where: { id: userId },
          data: { username: newUsername },
          select: { id: true },
        });

        await tx.tenantMembership.updateMany({
          where: { tenantId, userId, deletedAt: null }, // ⬅️ ensure soft-delete only once
          data: {
            deletedAt: new Date(),
            deletedByUserId: actorUserId,
            isActive: false,
          },
        });

        await tx.userEntitlement.deleteMany({
          where: { tenantId, userId },
        });

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
        return NextResponse.redirect(new URL(body.redirectTo, req.url), { status: 303 });
      }
      return NextResponse.json({ ok: true, deleted: true, ...result }, { status: 200 });
    } catch (err) {
      console.error("DELETE user error:", err);
      return NextResponse.json({ error: "failed to delete user" }, { status: 500 });
    }
  }

  // (Optional PATCH support for role/status could go here.)
  return NextResponse.json({ ok: true }, { status: 200 });
}
