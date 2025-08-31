// src/app/[tenantId]/inventory/layout.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function InventoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenantId: string };
}) {
  const { tenantId } = params;

  try {
    const userId = await getCurrentUserId(); // uses previewUserId cookie if present
    await requireAccess({ userId, tenantId, moduleKey: "inventory" });
  } catch (err: any) {
    const reason = (err as any)?.reason ?? "forbidden";
    redirect(`/forbidden?reason=${encodeURIComponent(reason)}`);
  }

  return <>{children}</>;
}
