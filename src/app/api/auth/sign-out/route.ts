// src/app/api/auth/sign-out/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { deleteSession, clearSessionCookie, SESSION_COOKIE } from "@/lib/auth";

function getRedirectTarget(req: Request) {
  const url = new URL(req.url);
  const qp = url.searchParams.get("redirectTo");
  if (qp) return qp;

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      // Only trust same-origin referers
      if (refUrl.origin === url.origin) return refUrl.pathname + refUrl.search;
    } catch {
      /* ignore malformed referer */
    }
  }
  return "/sign-in";
}

async function doSignOut(req: Request) {
  try {
    // Revoke any existing session (best-effort)
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
      ?.split("=")[1];

    await deleteSession(token);

    const location = getRedirectTarget(req);
    const res = NextResponse.redirect(new URL(location, req.url), { status: 303 });

    // Clear session cookie
    clearSessionCookie(res);

    // Also clear preview/impersonation cookie
    res.cookies.set("previewUserId", "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch {
    // Fall back to sign-in on any error
    const res = NextResponse.redirect(new URL("/sign-in", req.url), { status: 303 });
    clearSessionCookie(res);
    res.cookies.set("previewUserId", "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  }
}

export async function GET(req: Request) {
  return doSignOut(req);
}

export async function POST(req: Request) {
  return doSignOut(req);
}
