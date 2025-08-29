// src/app/admin/tenants/[tenantId]/page.tsx
import { prisma } from "@/lib/prisma";
import { TenantStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import SavedBanner from "@/components/SavedBanner";
import SubmitButton from "@/components/SubmitButton";

// Helper: parse/format dates safely (YYYY-MM-DD)
function toDateInputValue(d: Date | null) {
  if (!d) return "";
  const iso = d.toISOString();
  return iso.slice(0, 10);
}

async function getTenant(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      activatedUntil: true,
      createdAt: true,
    },
  });
}

function parseStatus(value: string): TenantStatus {
  switch (value) {
    case TenantStatus.ACTIVE:
      return TenantStatus.ACTIVE;
    case TenantStatus.SUSPENDED:
      return TenantStatus.SUSPENDED;
    default: {
      const v = value.toLowerCase();
      if (v === "active") return TenantStatus.ACTIVE;
      if (v === "suspended") return TenantStatus.SUSPENDED;
      throw new Error("Invalid status. Allowed: ACTIVE, SUSPENDED.");
    }
  }
}

// Server action (update & log)
export async function updateTenant(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const activatedUntilStr = String(formData.get("activatedUntil") ?? "").trim();

  if (!id) throw new Error("Missing tenant id.");
  if (!name) throw new Error("Name is required.");
  if (!statusRaw) throw new Error("Status is required.");

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) throw new Error("Tenant not found.");

  const status = parseStatus(statusRaw);
  const activatedUntil = activatedUntilStr
    ? new Date(activatedUntilStr + "T00:00:00.000Z")
    : null;

  const updated = await prisma.tenant.update({
    where: { id },
    data: { name, status, activatedUntil },
  });

  const diffs: Record<string, { from: unknown; to: unknown }> = {};
  if (existing.name !== updated.name) diffs.name = { from: existing.name, to: updated.name };
  if (existing.status !== updated.status) diffs.status = { from: existing.status, to: updated.status };
  const exAct = existing.activatedUntil ? existing.activatedUntil.toISOString() : null;
  const upAct = updated.activatedUntil ? updated.activatedUntil.toISOString() : null;
  if (exAct !== upAct) diffs.activatedUntil = { from: exAct, to: upAct };

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: id,
        actorUserId: null,
        action: "tenant.update",
        metaJson: JSON.stringify({ id, diffs }),
      },
    });
  } catch (err) {
    console.error("AuditLog error:", err);
  }

  revalidatePath(`/admin/tenants/${id}`);
  revalidatePath(`/admin/tenants`);
  redirect(`/admin/tenants/${id}?saved=1`);
}

export default async function ManageTenantPage({
  params,
  searchParams,
}: {
  params: { tenantId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { tenantId } = params;
  const sp = searchParams || {};
  const tenant = await getTenant(tenantId);

  if (!tenant) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Manage Tenant</h1>
        <p className="text-red-600">Tenant not found.</p>
        <Link
          href={{
            pathname: "/admin/tenants",
            query: {
              q: typeof sp.q === "string" ? sp.q : undefined,
              sort: typeof sp.sort === "string" ? sp.sort : undefined,
            },
          }}
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
        >
          Back to list
        </Link>
      </div>
    );
  }

  const statusOptions = Object.values(TenantStatus) as TenantStatus[];

  // preserve q/sort for outbound links when present
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "";
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (sort) qs.set("sort", sort);
  const qsStr = qs.toString();
  const viewEntitlementsHref = qsStr
    ? `/admin/tenants/${tenant.id}/entitlements?${qsStr}`
    : `/admin/tenants/${tenant.id}/entitlements`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage Tenant</h1>

        <div className="flex items-center gap-2">
          {/* FIX: do NOT force q=tenant.id when no q exists */}
          <Link
            href={{
              pathname: "/admin/tenants",
              query: {
                q: typeof sp.q === "string" ? sp.q : undefined,
                sort: typeof sp.sort === "string" ? sp.sort : undefined,
              },
            }}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Back to list
          </Link>
          <Link
            href={viewEntitlementsHref}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            View Entitlements
          </Link>
        </div>
      </div>

      <SavedBanner />

      <form action={updateTenant} className="space-y-4 max-w-xl">
        <input type="hidden" name="id" value={tenant.id} />

        <div className="space-y-1">
          <label htmlFor="name" className="block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            defaultValue={tenant.name}
            className="w-full rounded-md border px-3 py-2"
            placeholder="Tenant name"
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={tenant.status}
            className="w-full rounded-md border px-3 py-2 bg-white"
            required
          >
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">Allowed values come from your Prisma enum.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="activatedUntil" className="block text-sm font-medium">
            Activated Until
          </label>
          <input
            id="activatedUntil"
            name="activatedUntil"
            type="date"
            defaultValue={toDateInputValue(tenant.activatedUntil)}
            className="w-full rounded-md border px-3 py-2"
          />
          <p className="text-xs text-gray-500">Leave empty to unset.</p>
        </div>

        <div className="pt-2">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      <div className="text-xs text-gray-500">
        <div>ID: {tenant.id}</div>
        <div>Created: {tenant.createdAt?.toISOString()}</div>
      </div>
    </div>
  );
}
