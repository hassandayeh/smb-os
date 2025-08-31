// src/app/[tenantId]/inventory/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/access";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

// TEMP for dev only — resolve a user until auth is wired
async function getDevUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return u?.id ?? null;
}

export default async function InventoryPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const tenantId = params.tenantId;

  // Enforce Pyramids rule: tenant entitlement + role + per-user toggle
  try {
    const userId = await getDevUserId();
    await requireAccess({ userId, tenantId, moduleKey: "inventory" });
  } catch (err: any) {
    const reason = (err as any)?.reason ?? "forbidden";
    redirect(`/forbidden?reason=${encodeURIComponent(reason)}`);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground">
            Placeholder: Inventory module shell.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
