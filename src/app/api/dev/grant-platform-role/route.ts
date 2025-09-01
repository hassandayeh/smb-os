// src/app/api/dev/grant-platform-role/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

function getRedirectTarget(req: Request) {
  const url = new URL(req.url);
  const qp = url.searchParams.get("redirectTo");
  const referer = req.headers.get("referer") || undefined;
  return qp || referer || "/admin";
}

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    // Not logged in → go sign in
    return NextResponse.redirect(new URL("/sign-in?redirectTo=/admin", req.url), {
      status: 303,
    });
  }

  const url = new URL(req.url);
  const roleParam = (url.searchParams.get("role") || "DEVELOPER").toUpperCase();
  const role = roleParam === "APP_ADMIN" ? "APP_ADMIN" : "DEVELOPER";

  // Ensure the user exists
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Idempotent grant: unique on (userId, role)
  await prisma.appRole.upsert({
    where: { userId_role: { userId, role } },
    update: {},
    create: { userId, role: role as any },
  });

  const res = NextResponse.redirect(new URL(getRedirectTarget(req), req.url), {
    status: 303,
  });
  return res;
}

export async function POST(req: Request) {
  // Support POST the same as GET
  return GET(req);
}
