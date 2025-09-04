// src/app/admin/tenants/layout.tsx
import * as React from "react";
import { requireAccess } from "@/lib/guard-page";

/**
 * Admin → Tenants area layout
 * Keystone compliance: layout-first guard protects all nested pages.
 */
export default async function TenantsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAccess();
  return <>{children}</>;
}
