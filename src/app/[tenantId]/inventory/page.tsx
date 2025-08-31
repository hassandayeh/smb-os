// src/app/[tenantId]/inventory/page.tsx
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
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
