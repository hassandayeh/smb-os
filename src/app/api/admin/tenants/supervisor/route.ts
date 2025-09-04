// src/app/api/admin/tenants/supervisor/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getActorLevel, type Level } from "@/lib/access";
import { writeAudit } from "@/lib/audit";

/**
 * Helpers
 */
type Json = Record<string, unknown>;

function json(data: Json, status = 200) {
  return NextResponse.json(data, { status, headers: { "content-type": "application/json" } });
}

function badRequest(msg = "errors.bad_request") {
  return json({ error: msg }, 400);
}

function forbidden(msg = "errors.supervisor.forbidden") {
  return json({ error: msg }, 403);
}

function notFound(msg = "errors.user.not_found") {
  return json({ error: msg }, 404);
}

function methodNotAllowed() {
  return json({ error: "errors.http.method_not_allowed" }, 405);
}

function ensureActorCanAssign(level: Level | null) {
  // Keystone rule: L1/L2 platform allowed; L3 tenant admin allowed; L4/L5 no.
  return level === "L1" || level === "L2" || level === "L3";
}

/**
 * Parse helpers
 */
function readQuery(req: Request) {
  const url = new URL(req.url);
  return {
    tenantId: url.searchParams.get("tenantId") ?? "",
    userId: url.searchParams.get("userId") ?? "",
  };
}

async function readBody(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const f = await req.formData();
    return {
      tenantId: String(f.get("tenantId") ?? ""),
      userId: String(f.get("userId") ?? ""),
      supervisorId: (f.get("supervisorId") != null ? String(f.get("supervisorId")) : null) as string | null,
    };
  }
  if (ct.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as any;
    return {
      tenantId: String(b?.tenantId ?? ""),
      userId: String(b?.userId ?? ""),
      supervisorId: (b?.supervisorId ?? null) as string | null,
    };
  }
  return { tenantId: "", userId: "", supervisorId: null as string | null };
}

/**
 * GET /api/admin/tenants/supervisor?tenantId=...&userId=...
 * Returns current supervisorId + candidate managers (L4) for selection.
 */
export async function GET(req: Request) {
  const actorId = await getSessionUserId();
  if (!actorId) return json({ error: "errors.auth.required" }, 401);

  const { tenantId, userId: targetUserId } = readQuery(req);
  if (!tenantId || !targetUserId) return badRequest();

  const level = await getActorLevel(actorId, tenantId);
  if (!ensureActorCanAssign(level)) return forbidden();

  // Validate target membership and ensure it's not deleted
  const targetMem = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
    select: { role: true, isActive: true, deletedAt: true, supervisorId: true },
  });
  if (!targetMem || !!targetMem.deletedAt) return notFound();

  // Candidate supervisors are active MANAGER (L4) in the same tenant
  const managerMems = await prisma.tenantMembership.findMany({
    where: { tenantId, role: "MANAGER", isActive: true, deletedAt: null },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const candidates = managerMems
    .map((m) => m.user)
    .filter(Boolean)
    .map((u) => ({ id: u.id, name: u.name }));

  return json({
    supervisor: {
      currentId: targetMem.supervisorId ?? null,
      candidates,
      // UI can also infer enable state, but we include a hint:
      canAssign: ensureActorCanAssign(level),
    },
  });
}

/**
 * POST /api/admin/tenants/supervisor
 * Body: { tenantId, userId, supervisorId|null }
 * Assigns (or clears) a supervisor for a target user.
 */
export async function POST(req: Request) {
  const actorId = await getSessionUserId();
  if (!actorId) return json({ error: "errors.auth.required" }, 401);

  const { tenantId, userId: targetUserId, supervisorId } = await readBody(req);
  if (!tenantId || !targetUserId) return badRequest();

  const level = await getActorLevel(actorId, tenantId);
  if (!ensureActorCanAssign(level)) return forbidden();

  // Load target membership (must exist, active, not deleted)
  const targetMem = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
    select: { id: true, role: true, isActive: true, deletedAt: true, supervisorId: true },
  });
  if (!targetMem || !!targetMem.deletedAt) return notFound();

  // Per Keystone: mapping is for L5 members; allow platform/L3 to set for L5s.
  if (targetMem.role !== "MEMBER") {
    return forbidden("errors.supervisor.only_for_L5");
  }

  // When assigning, ensure the supervisor is an active L4 in the same tenant
  let newSupervisorId: string | null = null;
  if (supervisorId) {
    const supMem = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: supervisorId, tenantId } as any },
      select: { role: true, isActive: true, deletedAt: true, userId: true },
    });
    if (!supMem || !!supMem.deletedAt || !supMem.isActive || supMem.role !== "MANAGER") {
      return forbidden("errors.supervisor.invalid_supervisor");
    }
    newSupervisorId = supMem.userId;
  }

  const before = { supervisorId: targetMem.supervisorId ?? null };

  try {
    const updated = await prisma.tenantMembership.update({
      where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
      data: { supervisorId: newSupervisorId },
      select: { supervisorId: true },
    });

    await writeAudit({
      tenantId,
      actorUserId: actorId,
      action: "user.supervisor.changed",
      req,
      meta: {
        targetUserId,
        before,
        after: { supervisorId: updated.supervisorId ?? null },
      },
    });

    return json({ ok: true, supervisorId: updated.supervisorId ?? null });
  } catch (e) {
    console.error("supervisor.update error:", e);
    return json({ error: "errors.supervisor.update_failed" }, 500);
  }
}

/** Disallow stray verbs */
export async function PUT() {
  return methodNotAllowed();
}
export async function PATCH() {
  return methodNotAllowed();
}
export async function DELETE() {
  return methodNotAllowed();
}
