// src/app/[tenantId]/inventory/page.tsx
import { requireEntitlement } from '@/lib/entitlements';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Inventory' };

export default async function InventoryPage({
  params,
}: {
  params: { tenantId: string };
}) {
  await requireEntitlement(params.tenantId, 'inventory');

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
