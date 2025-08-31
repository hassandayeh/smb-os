// src/app/api/admin/tenants/[tenantId]/users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole } from "@prisma/client";

export const dynamic = "force-dynamic";

type CreateUserBody = {
  name?: string;
  email?: string;
  role?: "TENANT_ADMIN" | "MANAGER" | "MEMBER";
  redirectTo?: string;
};

// --- Helpers ---------------------------------------------------------------

async function actorIsPlatformAdmin(userId: string) {
  const roles = await prisma.appRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const s = new Set(roles.map((r) => r.role));
  return s.has("DEVELOPER") || s.has("APP_ADMIN");
}

async function actorIsTenantAdmin(userId: string, tenantId: string) {
  const m = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId, isActive: true },
    select: { role: true, isActive: true },
  });
  return !!m && m.isActive && m.role === "TENANT_ADMIN";
}

function normalizeEmail(v: unknown) {
  if (typeof v !== "string") return "";
  return v.trim().toLowerCase();
}

function normalizeName(v: unknown) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length ? t : "";
}

function isValidRole(v: unknown): v is CreateUserBody["role"] {
  return v === "TENANT_ADMIN" || v === "MANAGER" || v === "MEMBER";
}

function toEnumRole(v: CreateUserBody["role"]): TenantMemberRole {
  switch (v) {
    case "TENANT_ADMIN":
      return TenantMemberRole.TENANT_ADMIN;
    case "MANAGER":
      return TenantMemberRole.MANAGER;
    case "MEMBER":
    default:
      return TenantMemberRole.MEMBER;
  }
}

async function readBody(req: Request): Promise<CreateUserBody> {
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return j as CreateUserBody;
  }
  if (ctype.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    return {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      role: (form.get("role") as any) ?? undefined,
      redirectTo: String(form.get("redirectTo") ?? ""),
    };
  }
  return (await req.json().catch(() => ({}))) as CreateUserBody;
}

// --- POST /api/admin/tenants/[tenantId]/users -----------------------------

export async function POST(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  const tenantId = params?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }

  // Resolve actor
  const actorUserId = await getCurrentUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Authorization: platform (L1/L2) OR tenant admin (L3)
  const [isPlatform, isTenantAdmin] = await Promise.all([
    actorIsPlatformAdmin(actorUserId),
    actorIsTenantAdmin(actorUserId, tenantId),
  ]);
  if (!isPlatform && !isTenantAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Read input
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const inputName = normalizeName(body.name);
  const role = body.role;

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!isValidRole(role)) {
    return NextResponse.json(
      { error: "role must be TENANT_ADMIN | MANAGER | MEMBER" },
      { status: 400 }
    );
  }
  const roleEnum = toEnumRole(role);

  // Always provide a non-empty name when creating
  const derivedName =
    inputName ||
    (email.includes("@") ? email.split("@")[0] : "") ||
    "User";

  try {
    // Find or create User by composite unique (tenantId + email)
    let user = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId,
          email,
          name: derivedName,                // <= guaranteed string
          passwordHash: "__dev_placeholder__", // TEMP until real auth
        },
        select: { id: true, email: true, name: true, createdAt: true },
      });
    } else if (inputName && !user.name) {
      // Backfill name only if currently empty
      user = await prisma.user.update({
        where: { tenantId_email: { tenantId, email } },
        data: { name: inputName },
        select: { id: true, email: true, name: true, createdAt: true },
      });
    }

    // Create or update TenantMembership
    const existingMembership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: user.id },
      select: { id: true, isActive: true, role: true },
    });

    let membership;
    if (existingMembership) {
      membership = await prisma.tenantMembership.update({
        where: { id: existingMembership.id },
        data: { role: roleEnum, isActive: true },
        select: { id: true, tenantId: true, userId: true, role: true, isActive: true },
      });
    } else {
      membership = await prisma.tenantMembership.create({
        data: { tenantId, userId: user.id, role: roleEnum, isActive: true },
        select: { id: true, tenantId: true, userId: true, role: true, isActive: true },
      });
    }

    // Audit log (non-fatal)
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "user.create",
          metaJson: {
            targetUserId: user.id,
            email: user.email,
            role: membership.role,
          },
        },
      });
    } catch (logErr) {
      console.warn("Audit log failed (user.create):", logErr);
    }

    if (body.redirectTo && typeof body.redirectTo === "string" && body.redirectTo.trim()) {
      return NextResponse.redirect(new URL(body.redirectTo, req.url), { status: 303 });
    }

    return NextResponse.json({ ok: true, user, membership }, { status: 201 });
  } catch (err) {
    console.error("POST /tenants/[tenantId]/users error:", err);
    return NextResponse.json({ error: "failed to create user" }, { status: 500 });
  }
}
