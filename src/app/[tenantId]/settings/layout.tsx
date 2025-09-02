// src/app/[tenantId]/settings/layout.tsx
import type { ReactNode } from "react";
import { ensureL3SettingsAccessOrRedirect } from "@/lib/access";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenantId: string };
}) {
  // Keystone compliance: layout-first, centralized guard (settings-specific)
  await ensureL3SettingsAccessOrRedirect(params.tenantId);
  return <>{children}</>;
}
