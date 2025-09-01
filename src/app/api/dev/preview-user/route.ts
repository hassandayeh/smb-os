// src/app/api/dev/preview-user/route.ts
import { NextResponse } from "next/server";

const COOKIE = "previewUserId";

// POST: set preview user cookie
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  let redirectTo = "/admin"; // default fallback
  let userId = "";

  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    userId = String(form.get("userId") ?? "");
    redirectTo = String(form.get("redirectTo") ?? redirectTo);
  } else if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    userId = String(body.userId ?? "");
    redirectTo = String(body.redirectTo ?? redirectTo);
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  res.cookies.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}

// DELETE: clear preview user cookie (fallback to referer)
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const referer = req.headers.get("referer") || undefined;
  const redirectTo = searchParams.get("redirectTo") || referer || "/admin";

  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

// GET: clear via link (?action=clear) — with referer fallback
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const referer = req.headers.get("referer") || undefined;
  const redirectTo = searchParams.get("redirectTo") || referer || "/admin";

  if (action !== "clear") {
    return NextResponse.json(
      { error: "Use POST to set preview user, GET?action=clear to clear, or DELETE." },
      { status: 405 }
    );
  }

  const res = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
