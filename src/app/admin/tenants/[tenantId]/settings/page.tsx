// src/app/admin/tenants/[tenantId]/settings/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getModuleConfig, getIndustry } from "@/lib/config/moduleConfig";
import { Prisma } from "@prisma/client"; // for InputJsonValue / DbNull if needed

export const dynamic = "force-dynamic";

type PageProps = {
  params: { tenantId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
};

// Simple placeholder until your real admin guard is wired
function canEditSettings(): boolean {
  return true;
}

// --- Server actions (admin-only) ---

// Reset tenant-specific overrides so defaults + industry preset apply.
export async function resetToIndustryPreset(formData: FormData) {
  "use server";
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) throw new Error("Missing tenantId");
  if (!canEditSettings()) throw new Error("Not authorized");

  const moduleKeys = ["inventory", "invoices", "subtenants"] as const;

  await prisma.$transaction(async (tx) => {
    for (const key of moduleKeys) {
      await tx.entitlement.updateMany({
        where: { tenantId, moduleKey: key },
        // If your project expects DB NULL for JSON clears, keep DbNull; otherwise plain null also works.
        data: { limitsJson: Prisma.DbNull },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        action: "settings.applyPreset",
        metaJson: JSON.stringify({ tenantId, modules: moduleKeys }),
      },
    });
  });

  revalidatePath(`/admin/tenants/${tenantId}/settings`);
  redirect(`/admin/tenants/${tenantId}/settings?saved=1`);
}

// Update a safe knob in subtenants → limitsJson: { maxCount: number }
export async function updateSubtenantCap(formData: FormData) {
  "use server";
  const tenantId = String(formData.get("tenantId") ?? "");
  const raw = String(formData.get("maxCount") ?? "").trim();
  if (!tenantId) throw new Error("Missing tenantId");
  if (!raw) throw new Error("Missing maxCount");
  if (!canEditSettings()) throw new Error("Not authorized");

  const maxCount = Number(raw);
  if (!Number.isFinite(maxCount) || maxCount < 0) {
    throw new Error("maxCount must be a number ≥ 0");
  }

  await prisma.$transaction(async (tx) => {
    const ent = await tx.entitlement.findUnique({
      where: { tenantId_moduleKey: { tenantId, moduleKey: "subtenants" } },
      select: { limitsJson: true },
    });

    const current =
      ent?.limitsJson && typeof ent.limitsJson === "object"
        ? (ent.limitsJson as Record<string, unknown>)
        : {};

    const next: Prisma.InputJsonValue = { ...current, maxCount };

    await tx.entitlement.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey: "subtenants" } },
      update: { limitsJson: next },
      create: {
        tenantId,
        moduleKey: "subtenants",
        isEnabled: true,
        limitsJson: next,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        action: "settings.updateLimits",
        metaJson: JSON.stringify({
          tenantId,
          moduleKey: "subtenants",
          diffs: { "limitsJson.maxCount": { to: maxCount } },
        }),
      },
    });
  });

  revalidatePath(`/admin/tenants/${tenantId}/settings`);
  redirect(`/admin/tenants/${tenantId}/settings?saved=1`);
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-5 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

async function getTenantBasic(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
}

export default async function TenantSettingsPage({ params, searchParams }: PageProps) {
  const tenantId = params.tenantId;

  // Preserve q/sort for outbound links (UX)
  const sp = searchParams || {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "";
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (sort) qs.set("sort", sort);
  const qsStr = qs.toString();

  const [tenant, industry, inventoryCfg, invoicesCfg, subtenantsCfgRaw] =
    await Promise.all([
      getTenantBasic(tenantId),
      getIndustry(tenantId),
      getModuleConfig(tenantId, "inventory"),
      getModuleConfig(tenantId, "invoices"),
      getModuleConfig(tenantId, "subtenants"),
    ]);

  if (!tenant) {
    return (
      <div className="p-6">
        <div className="text-red-600">Tenant not found.</div>
        <div className="mt-4">
          <Link
            href={qsStr ? `/admin/tenants?${qsStr}` : "/admin/tenants"}
            className="inline-flex items-center rounded-xl border px-4 py-2"
          >
            ← Back to list
          </Link>
        </div>
      </div>
    );
  }

  // (#1) Normalize subtenants config for display: prefer `maxCount`, map `max` → `maxCount` if needed
  const hasMaxCount = subtenantsCfgRaw && typeof subtenantsCfgRaw === "object" && "maxCount" in (subtenantsCfgRaw as any);
  const hasMax = subtenantsCfgRaw && typeof subtenantsCfgRaw === "object" && "max" in (subtenantsCfgRaw as any);

  const subtenantsCfg =
    hasMaxCount
      ? subtenantsCfgRaw
      : hasMax
      ? { ...(subtenantsCfgRaw as Record<string, unknown>), maxCount: (subtenantsCfgRaw as any).max, /* hide legacy */ max: undefined }
      : subtenantsCfgRaw;

  // (#4) Pre-fill the input with the effective value
  const effectiveMaxCount =
    (subtenantsCfg as any)?.maxCount ??
    (subtenantsCfgRaw as any)?.max ??
    "";

  // (#3) Build links that preserve q/sort
  const backToListHref = qsStr ? `/admin/tenants?${qsStr}` : "/admin/tenants";
  const viewTenantHref = qsStr
    ? `/admin/tenants/${tenant.id}?${qsStr}`
    : `/admin/tenants/${tenant.id}`;

  const canEdit = canEditSettings();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Settings — <span className="text-gray-600">{tenant.name}</span>
        </h1>
        <div className="flex gap-3">
          <Link
            href={viewTenantHref}
            className="inline-flex items-center rounded-xl border px-4 py-2"
          >
            View Tenant
          </Link>
          <Link
            href={backToListHref}
            className="inline-flex items-center rounded-xl border px-4 py-2"
          >
            ← Back to list
          </Link>
        </div>
      </div>

      <SectionCard title="Industry (read-only)">
        <div className="text-gray-800">
          {industry ?? "— not set —"}
          <p className="mt-1 text-sm text-gray-500">
            Used to determine preset defaults (can be applied/edited in a later scope).
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Merged Module Config (defaults → preset → tenant limits)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border p-4">
            <div className="font-medium mb-2">inventory</div>
            <pre className="text-sm overflow-auto">{JSON.stringify(inventoryCfg, null, 2)}</pre>
          </div>
          <div className="rounded-xl border p-4">
            <div className="font-medium mb-2">invoices</div>
            <pre className="text-sm overflow-auto">{JSON.stringify(invoicesCfg, null, 2)}</pre>
          </div>
          <div className="rounded-xl border p-4">
            <div className="font-medium mb-2">subtenants</div>
            {/* show normalized object to avoid "max" + "maxCount" confusion */}
            <pre className="text-sm overflow-auto">{JSON.stringify(subtenantsCfg, null, 2)}</pre>
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          These values are computed server-side using <code>getModuleConfig</code>.
          Admin edit/apply controls arrive in Scope 2.
        </p>
      </SectionCard>

      {canEdit && (
        <SectionCard title="Admin Controls">
          <div className="flex flex-col gap-6">
            <form action={resetToIndustryPreset} className="flex items-center gap-3">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <button
                type="submit"
                className="inline-flex items-center rounded-xl border px-4 py-2 hover:bg-muted"
              >
                Apply Industry Preset
              </button>
              <p className="text-sm text-gray-500">
                Resets tenant overrides (limitsJson) for inventory, invoices, and subtenants.
              </p>
            </form>

            <form action={updateSubtenantCap} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <label htmlFor="maxCount" className="text-sm font-medium">
                Sub-tenant cap
              </label>
              <input
                id="maxCount"
                name="maxCount"
                type="number"
                min={0}
                placeholder="e.g. 5"
                defaultValue={effectiveMaxCount} // ← (#4) prefill current value
                className="w-32 rounded-xl border px-4 py-2"
                required
              />
              <button
                type="submit"
                className="inline-flex items-center rounded-xl border px-4 py-2 hover:bg-muted"
              >
                Update
              </button>
              <p className="basis-full text-sm text-gray-500">
                Writes to <code>Entitlement.limitsJson</code> for the <code>subtenants</code> module as
                <code> {"{ maxCount: number }"}</code>. Audited automatically.
              </p>
            </form>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
