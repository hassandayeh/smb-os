import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/tenants
export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, status: true, activatedUntil: true, createdAt: true },
    });
    return NextResponse.json({ tenants }, { status: 200 });
  } catch (err) {
    console.error('GET /api/admin/tenants error:', err);
    return NextResponse.json({ error: 'Failed to load tenants' }, { status: 500 });
  }
}

// POST /api/admin/tenants
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name: string | undefined = body?.name;
    const activatedUntilStr: string | null | undefined = body?.activatedUntil ?? null;
    const defaultLocale: string = body?.defaultLocale || 'en';

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    let activatedUntil: Date | null = null;
    if (activatedUntilStr) {
      const iso = `${activatedUntilStr}T00:00:00.000Z`; // UTC midnight
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) {
        return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
      }
      activatedUntil = d;
    }

    // Create tenant (no defaultLocale write, to match your current schema)
    const tenant = await prisma.tenant.create({
      data: {
        name: name.trim(),
        activatedUntil,
      },
      select: { id: true, name: true, activatedUntil: true, createdAt: true },
    });

    // Audit log (non-fatal if it fails)
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: null, // TODO: replace when auth is wired
          action: 'tenant.create',
          metaJson: {
            name: tenant.name,
            activatedUntil: activatedUntilStr ?? null,
            defaultLocale, // stored in log only for now
          },
        },
      });
    } catch (logErr) {
      console.warn('Audit log failed (tenant.create):', logErr);
    }

    return NextResponse.json({ ok: true, tenant }, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/tenants error:', err);
    return NextResponse.json({ error: 'Failed to create tenant' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
