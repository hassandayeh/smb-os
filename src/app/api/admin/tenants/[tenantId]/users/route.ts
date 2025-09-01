// src/app/api/admin/tenants/[tenantId]/users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole } from "@prisma/client";

export const dynamic = "force-dynamic";

type CreateUserBody = {
  name?: string;
  email?: string;
  /** NEW: optional on input; if omitted we’ll derive from email local-part */
  username?: string;
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

// username rules: lowercase, digits, hyphen, 3..30 chars
function normalizeUsername(v: unknown) {
  if (typeof v !== "string") return "";
  const base = v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return base.slice(0, 30);
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
      username: String(form.get("username") ?? ""),
      role: (form.get("role") as any) ?? undefined,
      redirectTo: String(form.get("redirectTo") ?? ""),
    };
  }
  return (await req.json().catch(() => ({}))) as CreateUserBody;
}

// Ensure username uniqueness within tenant by suffixing -1, -2, ...
async function ensureUniqueUsername(tenantId: string, desiredRaw: string): Promise<string> {
  const desired = normalizeUsername(desiredRaw);
  const base = desired || "user";
  // First try the base
  let candidate = base;
  let i = 1;
  // Cap attempts sensibly
  while (true) {
    const exists = await prisma.user.findFirst({
      where: { tenantId, username: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    const suffix = `-${i++}`;
    const head = base.slice(0, Math.max(1, 30 - suffix.length));
    candidate = `${head}${suffix}`;
    if (i > 5000) throw new Error("Could not find a unique username");
  }
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

  // Read & validate input
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const inputName = normalizeName(body.name);
  const inputUsername = normalizeUsername(body.username);
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
    // Does a user with this (tenantId, email) already exist?
    let user = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { id: true, email: true, name: true, username: true, createdAt: true },
    });

    // If creating a new user, we must assign a username (input or derived from email local-part)
    let usernameToUse = inputUsername;
    if (!usernameToUse) {
      const emailLocal = email.includes("@") ? email.split("@")[0] : email;
      usernameToUse = normalizeUsername(emailLocal);
    }

    if (!user) {
      // If username provided explicitly, verify availability first for a friendly 409
      if (inputUsername) {
        const taken = await prisma.user.findFirst({
          where: { tenantId, username: inputUsername },
          select: { id: true },
        });
        if (taken) {
          return NextResponse.json({ error: "username already taken in this tenant" }, { status: 409 });
        }
      }

      const uniqueUsername = await ensureUniqueUsername(tenantId, usernameToUse);

      user = await prisma.user.create({
        data: {
          tenantId,
          email,
          name: derivedName,
          username: uniqueUsername,
          passwordHash: "__dev_placeholder__", // TODO: replace when wiring real invites/passwords
        },
        select: { id: true, email: true, name: true, username: true, createdAt: true },
      });
    } else {
      // Existing user under same tenant/email:
      // - If a name was provided and current name is empty, backfill it.
      // - If a username was provided and different, try to set it (respect uniqueness).
      if (inputName && !user.name) {
        user = await prisma.user.update({
          where: { tenantId_email: { tenantId, email } },
          data: { name: inputName },
          select: { id: true, email: true, name: true, username: true, createdAt: true },
        });
      }
      if (inputUsername && inputUsername !== user.username) {
        // Try to set; if unique violation happens, catch below
        try {
          user = await prisma.user.update({
            where: { tenantId_email: { tenantId, email } },
            data: { username: inputUsername },
            select: { id: true, email: true, name: true, username: true, createdAt: true },
          });
        } catch (e: any) {
          // Prisma unique error code P2002
          const msg = typeof e?.code === "string" && e.code === "P2002"
            ? "username already taken in this tenant"
            : "failed to set username";
          return NextResponse.json({ error: msg }, { status: 409 });
        }
      }
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
          actorUserId: actorUserId,
          action: "user.create",
          metaJson: {
            targetUserId: user.id,
            email: user.email,
            username: user.username,
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
