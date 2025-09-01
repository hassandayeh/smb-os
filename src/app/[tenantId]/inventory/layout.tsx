// src/app/[tenantId]/inventory/layout.tsx
import { ReactNode } from "react";
import { ensureModuleAccessOrRedirect } from "@/lib/access"; // ✅ centralized tenant-module guard

export const dynamic = "force-dynamic";

export default async function InventoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenantId: string };
}) {
  // ✅ Keystone compliance: layout-first module access guard for all inventory pages
  await ensureModuleAccessOrRedirect(params.tenantId, "inventory");
  return <>{children}</>;
}
