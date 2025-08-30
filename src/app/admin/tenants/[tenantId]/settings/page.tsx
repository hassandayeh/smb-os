// src/app/admin/tenants/[tenantId]/settings/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getModuleConfig, getIndustry } from "@/lib/config/moduleConfig";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { tenantId: string };
};

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
  // Keep the select minimal & safe
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  return t;
}

export default async function TenantSettingsPage({ params }: PageProps) {
  const tenantId = params.tenantId;

  const [tenant, industry, inventoryCfg, invoicesCfg, subtenantsCfg] =
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
          <Link href="/admin/tenants" className="inline-flex items-center rounded-xl border px-4 py-2">
            ← Back to list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Settings — <span className="text-gray-600">{tenant.name}</span>
        </h1>
        <div className="flex gap-3">
          <Link
            href={`/admin/tenants/${tenant.id}`}
            className="inline-flex items-center rounded-xl border px-4 py-2"
          >
            View Tenant
          </Link>
          <Link
            href="/admin/tenants"
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
            <pre className="text-sm overflow-auto">{JSON.stringify(subtenantsCfg, null, 2)}</pre>
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          These values are computed server-side using <code>getModuleConfig</code>.
          Admin edit/apply controls arrive in Scope 2.
        </p>
      </SectionCard>
    </div>
  );
}
