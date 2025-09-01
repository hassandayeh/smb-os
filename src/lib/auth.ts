// src/lib/auth.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";

export const SESSION_COOKIE = "sid";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Create a new session token for a user and persist it. */
export async function createSession(userId: string, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await prisma.authSession.create({
    data: { token, userId, expiresAt },
  });

  return { token, expiresAt };
}

/** Get the logged-in userId from the sid cookie (if valid and not expired/revoked). */
export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const s = await prisma.authSession.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true, revokedAt: true },
  });
  if (!s) return null;
  if (s.revokedAt) return null;
  if (s.expiresAt < new Date()) return null;

  return s.userId;
}

/** Delete/revoke the current session (or a given token). */
export async function deleteSession(token?: string) {
  if (!token) {
    const jar = await cookies();
    token = jar.get(SESSION_COOKIE)?.value || undefined;
  }
  if (!token) return { ok: true, cleared: false };

  await prisma.authSession.deleteMany({ where: { token } });
  return { ok: true, cleared: true };
}

/** Set the session cookie on a NextResponse. */
export function setSessionCookie(res: NextResponse, token: string, maxAgeSeconds = DEFAULT_TTL_SECONDS) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

/** Clear the session cookie on a NextResponse. */
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Very small password verifier for local dev.
 * Supports:
 *  - "dev" (accepts password === "dev")
 *  - "plain:<password>" (accepts exact match)
 *  - bcrypt hashes (if "bcryptjs" is installed)
 *  - fallback: treat storedHash as plaintext (local only)
 */
export async function verifyPassword(storedHash: string, provided: string): Promise<boolean> {
  if (!storedHash) return false;

  // dev shortcut
  if (storedHash === "dev") return provided === "dev";

  // explicit plaintext marker
  if (storedHash.startsWith("plain:")) {
    return provided === storedHash.slice(6);
  }

  // bcrypt if available
  if (storedHash.startsWith("$2")) {
    try {
      const bcrypt = await import("bcryptjs");
      return await bcrypt.compare(provided, storedHash);
    } catch {
      // bcrypt not installed → fail closed
      return false;
    }
  }

  // fallback: treat stored as plaintext (ok for local dev only)
  return provided === storedHash;
}
