// src/app/api/admin/tenants/[tenantId]/users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole } from "@prisma/client";
import { getActorLevel, assertCanCreateRole, type Level } from "@/lib/access";
import { hashPassword } from "@/lib/auth";

// --- Local dev hasher -------------------------------------------------------
// TODO: Replace with your real password hasher (bcrypt/argon) when available.
async function hashPasswordDev(password: string) {
  return password;
}

export const dynamic = "force-dynamic";

type CreateUserBody = {
  name?: string;        // REQUIRED (server-side)
  email?: string;       // OPTIONAL (schema requires non-null, we fill a unique placeholder when blank)
  username?: string;    // REQUIRED
  role?: "APP_ADMIN" | "TENANT_ADMIN" | "MANAGER" | "MEMBER";
  redirectTo?: string;
};

// --- Helpers ---------------------------------------------------------------

function normalizeEmail(v: unknown) {
  if (typeof v !== "string") return "";
  return v.trim().toLowerCase();
}

function normalizeName(v: unknown) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length ? t : "";
}

// username rules: lowercase, digits, hyphen, 3..30 chars
function normalizeUsername(v: unknown) {
  if (typeof v !== "string") return "";
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function isValidTenantRole(v: unknown): v is Exclude<CreateUserBody["role"], "APP_ADMIN"> {
  return v === "TENANT_ADMIN" || v === "MANAGER" || v === "MEMBER";
}

function toEnumRole(v: Exclude<CreateUserBody["role"], "APP_ADMIN">): TenantMemberRole {
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
      username: String(form.get("username") ?? ""),
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

  // Centralized level resolution (L1–L5)
  const actorLevel: Level | null = await getActorLevel(actorUserId, tenantId);
  if (!actorLevel) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Read & validate input
  const body = await readBody(req);
  const name = normalizeName(body.name);
  const email = normalizeEmail(body.email);
  const usernameRaw = normalizeUsername(body.username);
  const role = body.role;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!usernameRaw) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  // Map role value to target level for centralized create guard
  const requestedLevel =
    role === "APP_ADMIN"
      ? ("L2" as const)
      : isValidTenantRole(role)
      ? (role === "TENANT_ADMIN" ? "L3" : role === "MANAGER" ? "L4" : "L5")
      : null;

  // Enforce Pyramids create rule
  try {
    assertCanCreateRole({ actorLevel, requestedLevel });
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    // 1) Username must be unique within tenant
    const taken = await prisma.user.findFirst({
      where: { tenantId, username: usernameRaw },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: "username already taken in this tenant" }, { status: 409 });
    }

    // 2) If a real email is provided, check for an existing user by (tenantId,email)
    const hasRealEmail = !!email && !/@(?:^|\.)local$/i.test(email);
    let user =
      hasRealEmail
        ? await prisma.user.findUnique({
            where: { tenantId_email: { tenantId, email } },
            select: { id: true, email: true, name: true, username: true, createdAt: true },
          })
        : null;

    // 3) Compute email to save
    //    If blank, use a unique placeholder to satisfy @@unique([tenantId,email]).
    const emailToSave = hasRealEmail ? email : `${usernameRaw}@${tenantId}.local`;

    // Default password = "123" (dev)
    const defaultPasswordHash = await hashPasswordDev("123");

    if (!user) {
      // Create new user with supplied username
      try {
        user = await prisma.user.create({
          data: {
            tenantId,
            email: emailToSave,
            name,
            username: usernameRaw,
            passwordHash: defaultPasswordHash,
          },
          select: { id: true, email: true, name: true, username: true, createdAt: true },
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(",") : "unique field";
          return NextResponse.json({ error: `conflict on ${target}` }, { status: 409 });
        }
        throw e;
      }
    } else {
      // Existing user under same tenant/email — set username and default password
      try {
        user = await prisma.user.update({
          where: { tenantId_email: { tenantId, email } },
          data: {
            name: user.name || name,
            username: usernameRaw,
            passwordHash: defaultPasswordHash,
          },
          select: { id: true, email: true, name: true, username: true, createdAt: true },
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          return NextResponse.json({ error: "username already taken in this tenant" }, { status: 409 });
        }
        throw e;
      }
    }

    // 4) Apply role
    let membership:
      | { id: string; tenantId: string; userId: string; role: TenantMemberRole; isActive: boolean }
      | null = null;

    if (role === "APP_ADMIN") {
      await prisma.appRole.upsert({
        where: { userId_role: { userId: user.id, role: "APP_ADMIN" } },
        update: {},
        create: { userId: user.id, role: "APP_ADMIN" },
      });
    } else if (isValidTenantRole(role)) {
      const roleEnum = toEnumRole(role);
      const existingMembership = await prisma.tenantMembership.findFirst({
        where: { tenantId, userId: user.id },
        select: { id: true, isActive: true, role: true },
      });

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
    } else {
      return NextResponse.json(
        { error: "role must be APP_ADMIN | TENANT_ADMIN | MANAGER | MEMBER" },
        { status: 400 }
      );
    }

    // 5) Audit log (non-fatal)
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: role === "APP_ADMIN" ? "user.create.app_admin" : "user.create",
          metaJson: {
            targetUserId: user.id,
            email: user.email,
            username: user.username,
            role,
            membershipRole: membership?.role ?? null,
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
