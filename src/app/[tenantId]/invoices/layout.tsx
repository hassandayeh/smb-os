// src/app/[tenantId]/invoices/layout.tsx
import { ReactNode } from "react";
import { ensureModuleAccessOrRedirect } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function InvoicesLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenantId: string };
}) {
  // ✅ Keystone compliance: layout-first module access guard for all invoices pages
  await ensureModuleAccessOrRedirect(params.tenantId, "invoices");
  return <>{children}</>;
}
