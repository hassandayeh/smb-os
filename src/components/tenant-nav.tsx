// src/components/tenant-nav.tsx
import Link from 'next/link';
import { hasEntitlement } from '@/lib/entitlements';

export default async function TenantNav({ tenantId }: { tenantId: string }) {
  const [canInventory, canInvoices] = await Promise.all([
    hasEntitlement(tenantId, 'inventory'),
    hasEntitlement(tenantId, 'invoices'),
  ]);

  return (
    <nav className="flex gap-3 text-sm">
      {canInventory && (
        <Link className="underline-offset-4 hover:underline" href={`/${tenantId}/inventory`}>
          Inventory
        </Link>
      )}
      {canInvoices && (
        <Link className="underline-offset-4 hover:underline" href={`/${tenantId}/invoices`}>
          Invoices
        </Link>
      )}
    </nav>
  );
}
