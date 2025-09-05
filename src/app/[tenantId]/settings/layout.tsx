// src/app/[tenantId]/settings/layout.tsx
import React from "react";
import { ensureL3SettingsAccessOrRedirect } from "@/lib/access";

type Props = {
  children: React.ReactNode;
  params: { tenantId: string };
};

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children, params }: Props) {
  const { tenantId } = params;

  // Centralized guard:
  // - Allows Platform L1/L2 (A1/A2) globally
  // - Allows Tenant L3 (tenant admin)
  // - Redirects others to /forbidden with a reason
  await ensureL3SettingsAccessOrRedirect(tenantId);

  return <>{children}</>;
}
