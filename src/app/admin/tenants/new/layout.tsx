// src/app/admin/tenants/new/layout.tsx
import { ReactNode } from "react";
import { requireAccess } from "@/lib/guard-page"; // centralized admin guard

export default async function NewTenantLayout({ children }: { children: ReactNode }) {
  // Keystone compliance: guard at the very top (layout-first)
  await requireAccess();
  return <>{children}</>;
}
