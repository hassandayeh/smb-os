// src/app/api/auth/sign-in/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  let email = "";
  let password = "";
  let tenantId: string | null = null;
  let redirectTo = "/";

  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    email = String(form.get("email") ?? "");
    password = String(form.get("password") ?? "");
    tenantId = form.get("tenantId") ? String(form.get("tenantId")) : null;
    redirectTo = String(form.get("redirectTo") ?? redirectTo);
  } else if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    email = String(body.email ?? "");
    password = String(body.password ?? "");
    tenantId = body.tenantId ? String(body.tenantId) : null;
    redirectTo = String(body.redirectTo ?? redirectTo);
  } else {
    return NextResponse.json({ error: "Unsupported content-type" }, { status: 415 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }

  // Find user (scoped to tenant if provided)
  let user:
    | { id: string; passwordHash: string; tenantId?: string | null }
    | null = null;

  if (tenantId) {
    user = await prisma.user.findFirst({
      where: { email, tenantId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
  } else {
    const users = await prisma.user.findMany({
      where: { email, deletedAt: null },
      select: { id: true, passwordHash: true, tenantId: true },
    });
    if (users.length === 0) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (users.length > 1) {
      return NextResponse.json(
        { error: "Ambiguous email; provide tenantId" },
        { status: 409 }
      );
    }
    user = users[0];
    tenantId = users[0].tenantId;
  }

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Create session and set cookie
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
