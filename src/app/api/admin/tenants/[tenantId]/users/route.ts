// src/app/api/admin/tenants/[tenantId]/users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TenantMemberRole } from "@prisma/client";
import { requireAccess } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import {
  assertSingleTenantL1,
  validateSupervisorRule,
  RbacError,
} from "@/lib/rbac/validators";

// --- Local dev hasher (Keystone note: replace with bcrypt/argon2 in auth lib) ---
async function hashPasswordDev(password: string) {
  return password;
}

export const dynamic = "force-dynamic";

type CreateUserBody = {
  name?: string; // REQUIRED (server-side validation)
  email?: string; // OPTIONAL; placeholder used if blank
  username?: string; // REQUIRED; normalized to slugish lowercase
  role?: "APP_ADMIN" | "TENANT_ADMIN" | "MANAGER" | "MEMBER";
  supervisorId?: string | null; // REQUIRED when role === MEMBER; must be active MANAGER in same tenant
  redirectTo?: string; // optional redirect after creation
};

// ---------- Helpers ----------
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

function isValidTenantRole(
  v: unknown
): v is Exclude<CreateUserBody["role"], "APP_ADMIN"> {
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
      supervisorId:
        (form.get("supervisorId") != null
          ? String(form.get("supervisorId"))
          : null) as string | null,
      redirectTo: String(form.get("redirectTo") ?? ""),
    };
  }
  return (await req.json().catch(() => ({}))) as CreateUserBody;
}

// ---------- POST /api/admin/tenants/[tenantId]/users ----------
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  const tenantId = params?.tenantId;
  if (!tenantId) {
    // (kept shape, just a clearer key)
    return NextResponse.json({ error: "errors.tenant.required" }, { status: 400 });
  }

  // Resolve actor
  const actorUserId = await getCurrentUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "errors.auth.required" }, { status: 401 });
  }

  // Admin console is platform-only: restrict to L1/L2 via centralized guard
  try {
  // Admin console guard → pass the actor, the tenant in the URL, and a stable module key
  await requireAccess({ userId: actorUserId, tenantId, moduleKey: "admin" });
} catch {
  return NextResponse.json({ error: "errors.forbidden" }, { status: 403 });
}


  // Read & validate input
  const body = await readBody(req);
  const name = normalizeName(body.name);
  const email = normalizeEmail(body.email);
  const usernameRaw = normalizeUsername(body.username);
  const role = body.role;
  const supervisorId =
    body.supervisorId === undefined ? null : (body.supervisorId as string | null);

  if (!name) {
    return NextResponse.json({ error: "errors.user.name_required" }, { status: 400 });
  }
  if (!usernameRaw) {
    return NextResponse.json({ error: "errors.user.username_required" }, { status: 400 });
  }

  try {
    // 1) Username must be unique within tenant
    const taken = await prisma.user.findFirst({
      where: { tenantId, username: usernameRaw },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { error: "errors.username.conflict.tenant" },
        { status: 409 }
      );
    }

    // 2) Check existing by (tenantId,email) if a real email was provided
    const hasRealEmail = !!email && !/@(?:^|\.)local$/i.test(email);
    let user =
      hasRealEmail
        ? await prisma.user.findUnique({
            where: { tenantId_email: { tenantId, email } },
            select: {
              id: true,
              email: true,
              name: true,
              username: true,
              createdAt: true,
            },
          })
        : null;

    // 3) Compute email to save (placeholder if blank)
    const emailToSave = hasRealEmail ? email : `${usernameRaw}@${tenantId}.local`;

    // Default password = "123" (dev stub)
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
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            createdAt: true,
          },
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          const target = Array.isArray(e?.meta?.target)
            ? e.meta.target.join(",")
            : "unique field";
          return NextResponse.json(
            { error: "errors.conflict.unique", meta: { target } },
            { status: 409 }
          );
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
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            createdAt: true,
          },
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          return NextResponse.json(
            { error: "errors.username.conflict.tenant" },
            { status: 409 }
          );
        }
        throw e;
      }
    }

    // 4) Apply role (validators added, everything else preserved)
    let membership:
      | {
          id: string;
          tenantId: string;
          userId: string;
          role: TenantMemberRole;
          isActive: boolean;
        }
      | null = null;

    if (role === "APP_ADMIN") {
      // Platform role (L2)
      await prisma.appRole.upsert({
        where: { userId_role: { userId: user.id, role: "APP_ADMIN" } },
        update: {},
        create: { userId: user.id, role: "APP_ADMIN" },
      });
    } else if (isValidTenantRole(role)) {
      const roleEnum = toEnumRole(role);

      // NEW: supervisor validation (MEMBER requires valid MANAGER; others must not carry a supervisor)
      try {
        await validateSupervisorRule(
          {
            tenantId,
            userId: user.id,
            role: roleEnum,
            supervisorId: roleEnum === "MEMBER" ? supervisorId ?? null : null,
          }
        );
      } catch (e) {
        if (e instanceof RbacError) {
          const status = e.code === "roles.singleL1Violation" ? 409 : 400;
          return NextResponse.json(
            e.meta ? { error: e.code, meta: e.meta } : { error: e.code },
            { status }
          );
        }
        throw e;
      }

      const existingMembership = await prisma.tenantMembership.findFirst({
        where: { tenantId, userId: user.id },
        select: { id: true, isActive: true, role: true },
      });

      if (existingMembership) {
        membership = await prisma.tenantMembership.update({
          where: { id: existingMembership.id },
          data: {
            role: roleEnum,
            isActive: true,
            supervisorId: roleEnum === "MEMBER" ? supervisorId ?? null : null,
          },
          select: {
            id: true,
            tenantId: true,
            userId: true,
            role: true,
            isActive: true,
          },
        });
      } else {
        membership = await prisma.tenantMembership.create({
          data: {
            tenantId,
            userId: user.id,
            role: roleEnum,
            isActive: true,
            supervisorId: roleEnum === "MEMBER" ? supervisorId ?? null : null,
          },
          select: {
            id: true,
            tenantId: true,
            userId: true,
            role: true,
            isActive: true,
          },
        });
      }

      // NEW: enforce single L1 when assigning TENANT_ADMIN
      if (roleEnum === "TENANT_ADMIN") {
        try {
          await assertSingleTenantL1(tenantId);
        } catch (e) {
          if (e instanceof RbacError) {
            return NextResponse.json(
              e.meta ? { error: e.code, meta: e.meta } : { error: e.code },
              { status: 409 }
            );
          }
          throw e;
        }
      }
    } else {
      return NextResponse.json(
        { error: "errors.role.invalid" },
        { status: 400 }
      );
    }

    // 5) Audit log (non-fatal)
    try {
      await writeAudit({
        tenantId,
        actorUserId,
        action: "user.create",
        req,
        meta: {
          targetUserId: user.id,
          username: user.username,
          email: user.email,
          assignedRole: role ?? null,
          membershipRole: membership?.role ?? null,
          platformRole: role === "APP_ADMIN" ? "APP_ADMIN" : null,
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
    console.error("POST /admin/tenants/[tenantId]/users error:", err);
    return NextResponse.json({ error: "errors.user.create_failed" }, { status: 500 });
  }
}
