// src/app/api/admin/platform-roles/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

function redirectTarget(req: Request) {
  const url = new URL(req.url);
  const qp = url.searchParams.get("redirectTo");
  const referer = req.headers.get("referer") || undefined;
  return qp || referer || "/admin/platform-roles";
}

type ParsedBody = {
  userId: string;
  role: "DEVELOPER" | "APP_ADMIN" | "";
  action: "grant" | "revoke" | "";
};

const parseBody = async (req: Request): Promise<ParsedBody> => {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    return {
      userId: String(form.get("userId") ?? ""),
      role: String(form.get("role") ?? "").toUpperCase() as ParsedBody["role"],
      action: String(form.get("action") ?? "").toLowerCase() as ParsedBody["action"], // "grant" | "revoke"
    };
  } else if (ct.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      userId: String(b.userId ?? ""),
      role: String(b.role ?? "").toUpperCase() as ParsedBody["role"],
      action: String(b.action ?? "").toLowerCase() as ParsedBody["action"],
    };
  }
  return { userId: "", role: "", action: "" };
};

export async function POST(req: Request) {
  const actorId = await getSessionUserId();
  if (!actorId) {
    return NextResponse.redirect(
      new URL("/sign-in?redirectTo=/admin/platform-roles", req.url),
      { status: 303 }
    );
  }

  // Load actor's platform roles
  const actorRoles = await prisma.appRole.findMany({
    where: { userId: actorId },
    select: { role: true },
  });
  const isDev = actorRoles.some((r) => r.role === "DEVELOPER");
  const isAppAdmin = actorRoles.some((r) => r.role === "APP_ADMIN");
  const isPlatform = isDev || isAppAdmin;

  if (!isPlatform) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, role, action } = await parseBody(req);

  if (!userId || !role || !["grant", "revoke"].includes(action)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (role !== "DEVELOPER" && role !== "APP_ADMIN") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Permission matrix:
  // - Only DEVELOPER can manage DEVELOPER.
  // - DEVELOPER or APP_ADMIN can manage APP_ADMIN.
  if (role === "DEVELOPER" && !isDev) {
    return NextResponse.json({ error: "Developer role required" }, { status: 403 });
  }
  if (role === "APP_ADMIN" && !(isDev || isAppAdmin)) {
    return NextResponse.json({ error: "Platform role required" }, { status: 403 });
  }

  // Ensure target exists
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Execute
  if (action === "grant") {
    await prisma.appRole.upsert({
      where: { userId_role: { userId, role } },
      update: {},
      create: { userId, role: role as any },
    });
  } else {
    // revoke
    await prisma.appRole.deleteMany({
      where: { userId, role },
    });
  }

  // Redirect back
  const res = NextResponse.redirect(new URL(redirectTarget(req), req.url), {
    status: 303,
  });
  return res;
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
