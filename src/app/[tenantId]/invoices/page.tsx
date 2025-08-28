// src/app/[tenantId]/invoices/page.tsx
import { requireEntitlement } from '@/lib/entitlements';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Invoices' };

export default async function InvoicesPage({
  params,
}: {
  params: { tenantId: string };
}) {
  await requireEntitlement(params.tenantId, 'invoices');

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Invoices</h1>
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground">
            Placeholder: Invoices module shell.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
