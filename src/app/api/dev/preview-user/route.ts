// src/app/api/dev/preview-user/route.ts
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canImpersonate } from "@/lib/access";
import { writeAudit } from "@/lib/audit";

const COOKIE = "previewUserId";

/** Choose a redirect target, preserving context for form submits and links. */
function getRedirect(req: Request, fallback = "/admin") {
  const url = new URL(req.url);
  const qp = url.searchParams.get("redirectTo");
  const referer = req.headers.get("referer") || undefined;
  return qp || referer || fallback;
}

/** Decide the "home" for the impersonated user. */
async function resolveAutoRedirect(targetUserId: string) {
  // Platform roles? → /admin
  const platform = await prisma.appRole.findMany({
    where: { userId: targetUserId },
    select: { role: true },
  });
  const pset = new Set(platform.map((r) => r.role));
  if (pset.has("DEVELOPER") || pset.has("APP_ADMIN")) return "/admin";

  // Otherwise pick their active tenant (any) and send to workspace root
  const m = await prisma.tenantMembership.findFirst({
    where: { userId: targetUserId, isActive: true, deletedAt: null },
    select: { tenantId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (m?.tenantId) return `/${m.tenantId}`;

  // Fallback
  return "/admin";
}

/** POST: set preview user cookie (impersonate) */
export async function POST(req: Request) {
  const actorId = await getSessionUserId();
  if (!actorId) {
    return NextResponse.json({ error: "errors.auth.required" }, { status: 401 });
  }

  const ct = req.headers.get("content-type") || "";
  let userId = "";
  let redirectTo: string | "auto" = "/admin";

  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    userId = String(form.get("userId") ?? "");
    redirectTo = (String(form.get("redirectTo") ?? getRedirect(req)) as any) || "/admin";
  } else if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    userId = String(body["userId"] ?? "");
    redirectTo = (String(body["redirectTo"] ?? getRedirect(req)) as any) || "/admin";
  }

  if (!userId) {
    return NextResponse.json({ error: "errors.impersonation.missing_user" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true },
  });
  if (!target) {
    if (ct.includes("application/x-www-form-urlencoded")) {
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=errors.user.not_found`, req.url),
        { status: 303 }
      );
    }
    return NextResponse.json({ error: "errors.user.not_found" }, { status: 404 });
  }

  const decision = await canImpersonate(actorId, target.id);
  if (!decision.allowed) {
    if (ct.includes("application/x-www-form-urlencoded")) {
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=errors.impersonation.forbidden`, req.url),
        { status: 303 }
      );
    }
    return NextResponse.json(
      { error: "errors.impersonation.forbidden", reason: decision.reason },
      { status: 403 }
    );
  }

  // If caller asked for auto, compute the role-aware home
  if (redirectTo === "auto") {
    redirectTo = await resolveAutoRedirect(target.id);
  }

  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  res.cookies.set(COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  await writeAudit({
    tenantId: target.tenantId ?? "",
    actorUserId: actorId,
    action: "impersonation.set",
    req,
    meta: { targetUserId: target.id, reason: decision.reason },
  });

  return res;
}

/** DELETE: clear preview user cookie */
export async function DELETE(req: Request) {
  // Make clearing robust even if session is missing.
  const actorId = (await getSessionUserId()) || "";

  const redirectTo = getRedirect(req, "/admin");
  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  // Audit best-effort
  try {
    await writeAudit({
      tenantId: "",
      actorUserId: actorId,
      action: "impersonation.clear",
      req,
    });
  } catch {
    // Swallow to ensure clear never 500s
  }

  return res;
}

/** GET: clear via link (?action=clear) — handle inline (no call to DELETE) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  if (action !== "clear") {
    return NextResponse.json({ error: "errors.http.method_not_allowed" }, { status: 405 });
  }

  const actorId = (await getSessionUserId()) || "";
  const redirectTo = getRedirect(req, "/admin");
  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  try {
    await writeAudit({
      tenantId: "",
      actorUserId: actorId,
      action: "impersonation.clear",
      req,
    });
  } catch {
    // no-op
  }

  return res;
}
