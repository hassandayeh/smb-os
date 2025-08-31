// src/app/[tenantId]/invoices/page.tsx
import { Card, CardContent } from '@/components/ui/card';
import { redirect } from 'next/navigation';
import { getCurrentUserId } from '@/lib/current-user';
import { requireAccess } from '@/lib/access';

export const metadata = { title: 'Invoices' };
// Keep consistent SSR behavior while we’re previewing users
export const dynamic = 'force-dynamic';

export default async function InvoicesPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { tenantId } = params;

  try {
    const userId = await getCurrentUserId(); // uses previewUserId cookie if set
    await requireAccess({ userId, tenantId, moduleKey: 'invoices' });
  } catch (err: any) {
    const reason = (err as any)?.reason ?? 'forbidden';
    redirect(`/forbidden?reason=${encodeURIComponent(reason)}`);
  }

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
