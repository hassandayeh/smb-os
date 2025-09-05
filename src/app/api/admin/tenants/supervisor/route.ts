// src/app/api/admin/tenants/supervisor/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

// Keystone/Sphinx centralized guard + Appendix validators
import { requireAccess } from "@/lib/access";
import { validateSupervisorRule, RbacError } from "@/lib/rbac/validators";

/** Helpers */
type Json = Record<string, unknown>;
function json(data: Json, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "content-type": "application/json" },
  });
}
function badRequest(msg = "errors.params.required") {
  return json({ error: msg }, 400);
}
function forbidden(msg = "errors.module.forbidden") {
  return json({ error: msg }, 403);
}
function notFound(msg = "errors.user.not_found_in_tenant") {
  return json({ error: msg }, 404);
}
function methodNotAllowed() {
  return json({ error: "errors.http.method_not_allowed" }, 405);
}

/** Parse helpers */
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
      supervisorId: (f.get("supervisorId") != null
        ? String(f.get("supervisorId"))
        : null) as string | null,
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
 * Returns current supervisorId + candidate managers for selection.
 */
export async function GET(req: Request) {
  const actorId = await getSessionUserId();
  if (!actorId) return json({ error: "errors.auth.required" }, 401);

  const { tenantId, userId: targetUserId } = readQuery(req);
  if (!tenantId || !targetUserId) return badRequest();

  // Centralized module guard (Keystone/Sphinx)
  try {
    await requireAccess({ userId: actorId, tenantId, moduleKey: "admin" });
  } catch {
    return forbidden();
  }

  // Validate target membership and ensure it's not deleted
  const targetMem = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
    select: {
      isActive: true,
      deletedAt: true,
      supervisorId: true,
      role: true,
    },
  });

  if (!targetMem || !!targetMem.deletedAt) return notFound();

  // Candidates: active managers in same tenant (kept role filter for now)
  const managerMems = await prisma.tenantMembership.findMany({
    where: {
      tenantId,
      role: "MANAGER",
      isActive: true,
      deletedAt: null,
    },
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

  // Centralized module guard (Keystone/Sphinx)
  try {
    await requireAccess({ userId: actorId, tenantId, moduleKey: "admin" });
  } catch {
    return forbidden();
  }

  // Target membership must exist and be active (include role for validator)
  const targetMem = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
    select: {
      id: true,
      isActive: true,
      deletedAt: true,
      supervisorId: true,
      role: true, // <-- needed for validateSupervisorRule signature
    },
  });
  if (!targetMem || !!targetMem.deletedAt) return notFound();

  // Run Appendix validator (domain/rank rules, same-tenant, higher-rank, no cycles, etc.)
  try {
    await validateSupervisorRule({
      tenantId,
      userId: targetUserId,
      role: targetMem.role ?? null,
      supervisorId: supervisorId ?? null,
    });
  } catch (e: unknown) {
    // Standardized i18n error surface
    const err = e as RbacError;
    // Most supervisor rule violations are 400 (validation). Keep i18n key only.
    return json({ error: err.code, meta: (err as any).meta ?? undefined }, 400);
  }

  const before = { supervisorId: targetMem.supervisorId ?? null };

  try {
    const updated = await prisma.tenantMembership.update({
      where: { userId_tenantId: { userId: targetUserId, tenantId } as any },
      data: { supervisorId: supervisorId ?? null },
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
    return json({ error: "errors.server" }, 500);
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
