// src/app/[tenantId]/layout.tsx
import { ReactNode } from "react";
import { TenantNav } from "@/components/tenant-nav";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic"; // keep server-fresh while developing; optional

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenantId: string };
}) {
  const { tenantId } = params;

  // Fetch enabled entitlements for this tenant (module keys only)
  const enabled = await prisma.entitlement.findMany({
    where: { tenantId, isEnabled: true },
    select: { moduleKey: true },
  });

  const entitlements = enabled.map((e) => e.moduleKey);

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Tenant-scoped navigation */}
      <TenantNav tenantId={tenantId} entitlements={entitlements} />

      {/* Page content */}
      <main className="p-4">{children}</main>
    </div>
  );
}
