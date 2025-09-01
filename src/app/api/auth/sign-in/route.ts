// src/app/api/auth/sign-in/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";

// Simple normalization: lowercase + trim
function normalizeUsername(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function redirectToSignIn(req: Request, params: Record<string, string | undefined>) {
  const url = new URL("/sign-in", req.url);
  const error = params.error ?? "invalid";
  const redirectTo = params.redirectTo ?? "/";
  const tenantId = params.tenantId;
  const username = params.username;

  url.searchParams.set("error", error);
  url.searchParams.set("redirectTo", redirectTo);
  if (tenantId) url.searchParams.set("tenantId", tenantId);
  if (username) url.searchParams.set("username", username);

  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  const isForm = ct.includes("application/x-www-form-urlencoded");
  const isJson = ct.includes("application/json");

  let username = "";
  let password = "";
  let tenantId: string | null = null;
  let redirectTo = "/";
  // NEW: track whether tenantId was provided by the user (vs inferred)
  let providedTenantId = false;

  if (isForm) {
    const form = await req.formData();
    username = normalizeUsername(form.get("username"));
    password = String(form.get("password") ?? "");
    if (form.get("tenantId")) {
      tenantId = String(form.get("tenantId"));
      providedTenantId = true; // user supplied it
    }
    redirectTo = String(form.get("redirectTo") ?? redirectTo);
  } else if (isJson) {
    const body = await req.json().catch(() => ({}));
    username = normalizeUsername((body as any).username);
    password = String((body as any).password ?? "");
    if ((body as any).tenantId) {
      tenantId = String((body as any).tenantId);
      providedTenantId = true; // client supplied it
    }
    redirectTo = String((body as any).redirectTo ?? redirectTo);
  } else {
    return NextResponse.json({ error: "Unsupported content-type" }, { status: 415 });
  }

  if (!username || !password) {
    if (isForm) {
      return redirectToSignIn(req, {
        error: "missing",
        redirectTo,
        // only echo tenantId back if the user provided it
        tenantId: providedTenantId ? tenantId ?? undefined : undefined,
        username,
      });
    }
    return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
  }

  // Find user (scoped to tenant if provided)
  let user: { id: string; passwordHash: string; tenantId?: string | null } | null = null;

  if (tenantId) {
    user = await prisma.user.findFirst({
      where: { username, tenantId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
  } else {
    const users = await prisma.user.findMany({
      where: { username, deletedAt: null },
      select: { id: true, passwordHash: true, tenantId: true },
    });
    if (users.length === 0) {
      if (isForm) {
        return redirectToSignIn(req, {
          error: "invalid",
          redirectTo,
          // do not leak/infer tenantId
          username,
        });
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (users.length > 1) {
      if (isForm) {
        return redirectToSignIn(req, {
          error: "ambiguous",
          redirectTo,
          // user must provide tenantId; don't prefill it
          username,
        });
      }
      return NextResponse.json({ error: "Ambiguous username; provide tenantId" }, { status: 409 });
    }
    // Exactly one match: we can proceed using its tenantId internally,
    // BUT we still don't echo it back unless the user originally provided one.
    user = users[0];
    tenantId = users[0].tenantId ?? null;
  }

  if (!user) {
    if (isForm) {
      return redirectToSignIn(req, {
        error: "invalid",
        redirectTo,
        tenantId: providedTenantId ? tenantId ?? undefined : undefined,
        username,
      });
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    if (isForm) {
      return redirectToSignIn(req, {
        error: "invalid",
        redirectTo,
        // Key fix: only echo tenantId if the user supplied it
        tenantId: providedTenantId ? tenantId ?? undefined : undefined,
        username,
      });
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Success → create session and set cookie
  const { token } = await createSession(user.id);
  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  setSessionCookie(res, token);

  // Clear preview cookie (avoid impersonation overriding real login)
  res.cookies.set("previewUserId", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
