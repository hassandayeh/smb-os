// src/app/admin/tenants/new/page.tsx
import { requireAccess } from "@/lib/guard-page"; // ✅ Keystone guard
import NewTenantClient from "./NewTenantClient";

/**
 * Admin → Tenants → New
 * Guarded server component that renders the client form.
 */
export default async function NewTenantPage() {
  await requireAccess();
  return <NewTenantClient />;
}
