// src/app/[tenantId]/layout.tsx
import { ReactNode } from "react";
import { TenantNav } from "@/components/tenant-nav";
import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/access";
import { getCurrentUserId } from "@/lib/current-user";
import ImpersonationRibbon from "@/components/ImpersonationRibbon"; // NEW

export const dynamic = "force-dynamic"; // keep server-fresh while developing; optional

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenantId: string };
}) {
  const { tenantId } = params;

  // 1) Fetch tenant-level enabled entitlements (module keys only)
  const enabled = await prisma.entitlement.findMany({
    where: { tenantId, isEnabled: true },
    select: { moduleKey: true },
  });
  const tenantEnabledKeys = enabled.map((e) => e.moduleKey);

  // 2) Get current user (server-side helper)
  const userId = await getCurrentUserId();

  // 3) Per-user filtering: only keep modules this user can actually access
  const checks = await Promise.all(
    tenantEnabledKeys.map((moduleKey) =>
      hasModuleAccess({ userId, tenantId, moduleKey }).then((d) => ({
        moduleKey,
        allowed: d.allowed,
      }))
    )
  );

  const accessibleKeys = checks.filter((c) => c.allowed).map((c) => c.moduleKey);

  return (
    <div className="min-h-dvh flex flex-col">
      <ImpersonationRibbon /> {/* NEW */}
      {/* Tenant-scoped navigation */}
      <TenantNav tenantId={tenantId} entitlements={accessibleKeys} />

      {/* Page content */}
      <main className="p-4">{children}</main>
    </div>
  );
}
