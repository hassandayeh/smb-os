// src/app/admin/tenants/layout.tsx
import { requireAccess } from "@/lib/guard-page";

export default async function TenantsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ✅ Keystone compliance: layout-first guard for the whole tenants area
  await requireAccess();
  return <>{children}</>;
}
