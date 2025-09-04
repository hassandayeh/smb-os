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

/**
 * POST: set preview (impersonation) cookie after Keystone rule check.
 * Accepts JSON or form-encoded body:
 *  - userId: string (required)
 *  - redirectTo?: string
 */
export async function POST(req: Request) {
  const actorId = await getSessionUserId();
  if (!actorId) {
    return NextResponse.json({ error: "errors.auth.required" }, { status: 401 });
  }

  const ct = req.headers.get("content-type") || "";
  let userId = "";
  let redirectTo = "/admin";

  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    userId = String(form.get("userId") ?? "");
    redirectTo = String(form.get("redirectTo") ?? getRedirect(req));
  } else if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    userId = String(body["userId"] ?? "");
    redirectTo = String(body["redirectTo"] ?? getRedirect(req));
  }

  if (!userId) {
    return NextResponse.json({ error: "errors.impersonation.missing_user" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    // NOTE: keep schema-safe (no supervisorId assumption)
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

  // Set the preview cookie and redirect.
  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  res.cookies.set(COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Audit with string tenantId (DB-neutral; i18n-keyed)
  await writeAudit({
    tenantId: target.tenantId ?? "",
    actorUserId: actorId,
    action: "impersonation.set",
    req,
    meta: { targetUserId: target.id, reason: decision.reason },
  });

  return res;
}

/**
 * DELETE: clear preview cookie.
 * Accepts optional ?redirectTo=… or uses Referer, else /admin.
 */
export async function DELETE(req: Request) {
  const actorId = await getSessionUserId();
  if (!actorId) {
    return NextResponse.json({ error: "errors.auth.required" }, { status: 401 });
  }

  const redirectTo = getRedirect(req, "/admin");
  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  res.cookies.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  // Audit with empty string tenantId (no specific tenant context here)
  await writeAudit({
    tenantId: "",
    actorUserId: actorId,
    action: "impersonation.clear",
    req,
  });

  return res;
}

/**
 * GET: convenience handler to clear via link (?action=clear).
 * Otherwise responds 405 (method not allowed).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  if (action !== "clear") {
    return NextResponse.json({ error: "errors.http.method_not_allowed" }, { status: 405 });
  }
  return DELETE(req);
}
