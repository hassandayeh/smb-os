// src/app/admin/tenants/new/page.tsx
import { requireAccess } from "@/lib/guard-page"; // ✅ Keystone guard
import NewTenantClient from "./NewTenantClient";

export default async function NewTenantPage() {
  // Keystone compliance: enforce platform admin guard
  await requireAccess();

  // Render client component (form)
  return <NewTenantClient />;
}
