import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const nameRaw = (body?.name ?? "") as string;
    const activatedUntilRaw = (body?.activatedUntil ?? "") as string;

    const name = nameRaw.trim();
    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: "Name is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const activatedUntil =
      activatedUntilRaw?.trim()
        ? new Date(`${activatedUntilRaw.trim()}T00:00:00.000Z`)
        : null;

    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        name,
        ...(activatedUntil ? { activatedUntil } : {}),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId: null,
        action: "tenant.create",
        metaJson: {
          name,
          activatedUntil: activatedUntil ? activatedUntil.toISOString() : null,
          source: "admin.tenants.create",
        },
      },
    });

    return new Response(JSON.stringify({ ok: true, id: tenant.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Create tenant error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
