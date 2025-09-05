// src/app/api/admin/tenants/[tenantId]/users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { requireAccess } from "@/lib/access";
import type { TenantMemberRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// --- Dev-only password hash (replace with bcrypt/argon2 from your auth lib) ---
async function hashPasswordDev(pw: string) {
  return pw;
}

type Body = {
  name?: string;
  email?: string;
  username?: string;
  role?: "TENANT_ADMIN" | "MANAGER" | "MEMBER" | "APP_ADMIN";
  supervisorId?: string | null;
  redirectTo?: string;
};

// --------- Normalize helpers (DB-neutral) ----------
function normName(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s || "";
}
function normLower(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
function normUsername(v: unknown) {
  if (typeof v !== "string") return "";
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

// Accept both JSON and classic form posts
async function readBody(req: Request): Promise<Body> {
  const c = req.headers.get("content-type") || "";
  if (c.includes("application/x-www-form-urlencoded")) {
    const f = await req.formData();
    return {
      name: String(f.get("name") ?? ""),
      email: String(f.get("email") ?? ""),
      username: String(f.get("username") ?? ""),
      role: (f.get("role") as any) ?? undefined,
      supervisorId:
        f.get("supervisorId") != null ? String(f.get("supervisorId")) : null,
      redirectTo: String(f.get("redirectTo") ?? ""),
    };
  }
  if (c.includes("application/json")) {
    try {
      return (await req.json()) as Body;
    } catch {
      return {};
    }
  }
  return {};
}

// --------- POST /api/admin/tenants/[tenantId]/users ----------
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  try {
    const tenantId = params?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "errors.tenant.required" }, { status: 400 });
    }

    // Actor must be signed-in
    const actorUserId = await getCurrentUserId();
    if (!actorUserId) {
      return NextResponse.json({ error: "errors.auth.required" }, { status: 401 });
    }

    // Centralized admin-module access (our access.ts already fast-paths A1/A2 + L1)
    try {
      await requireAccess({ userId: actorUserId, tenantId, moduleKey: "admin" });
    } catch {
      return NextResponse.json({ error: "errors.forbidden" }, { status: 403 });
    }

    // Parse + validate
    const body = await readBody(req);
    const name = normName(body.name);
    const email = normLower(body.email);
    const username = normUsername(body.username);
    const role = body.role;
    const supervisorId =
      body.supervisorId === undefined ? null : (body.supervisorId as string | null);

    if (!name) return NextResponse.json({ error: "errors.user.name_required" }, { status: 400 });
    if (!username)
      return NextResponse.json({ error: "errors.user.username_required" }, { status: 400 });

    // Username unique within tenant
    const taken = await prisma.user.findFirst({
      where: { tenantId, username },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: "errors.username.conflict.tenant" }, { status: 409 });
    }

    // Compute email (placeholder if blank)
    const hasRealEmail = !!email && !/@(?:^|\.)local$/i.test(email);
    const emailToSave = hasRealEmail ? email : `${username}@${tenantId}.local`;

    // Create user
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: emailToSave,
        name,
        username,
        passwordHash: await hashPasswordDev("123"),
      },
      select: { id: true, email: true, name: true, username: true, createdAt: true },
    });

    // Role application
    if (role === "APP_ADMIN") {
      // Platform role upsert
      await prisma.appRole.upsert({
        where: { userId_role: { userId: user.id, role: "APP_ADMIN" } },
        update: {},
        create: { userId: user.id, role: "APP_ADMIN" },
      });
    } else if (role === "TENANT_ADMIN" || role === "MANAGER" || role === "MEMBER") {
      const roleEnum: TenantMemberRole =
        role === "TENANT_ADMIN" ? "TENANT_ADMIN" : role === "MANAGER" ? "MANAGER" : "MEMBER";

      await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          role: roleEnum,
          isActive: true,
          supervisorId: roleEnum === "MEMBER" ? supervisorId ?? null : null,
        },
      });

      // Enforce single active L1 (TENANT_ADMIN)
      if (roleEnum === "TENANT_ADMIN") {
        const l1Active = await prisma.tenantMembership.count({
          where: { tenantId, role: "TENANT_ADMIN", isActive: true, deletedAt: null },
        });
        if (l1Active > 1) {
          return NextResponse.json({ error: "roles.singleL1Violation" }, { status: 409 });
        }
      }
    } else {
      return NextResponse.json({ error: "errors.role.invalid" }, { status: 400 });
    }

    // --------- SAFE REDIRECT (never redirect to /api) ----------
    let redirectTo =
      typeof body.redirectTo === "string" ? body.redirectTo.trim() : "";
    const fallback = `/${tenantId}/settings/users`;
    if (!redirectTo || redirectTo.startsWith("/api/")) {
      redirectTo = fallback;
    }
    return NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  } catch (err) {
    console.error("POST /admin/tenants/[tenantId]/users failed:", err);
    return NextResponse.json({ error: "errors.user.create_failed" }, { status: 500 });
  }
}
