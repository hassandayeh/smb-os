// src/app/api/debug/cookies/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug/cookies
 * Dumps all cookies currently visible to the server.
 * Safe for local dev only — remove/disable in production.
 */
export async function GET() {
  const cookieStore = await cookies(); // <-- await (Next 15+)
  const jar = cookieStore.getAll();

  type SimpleCookie = { name: string; value: string };

  const list: SimpleCookie[] = jar.map((c): SimpleCookie => ({
    name: c.name,
    value: c.value,
  }));

  return NextResponse.json({ ok: true, cookies: list }, { status: 200 });
}
