// src/components/tenant-nav.tsx
import Link from "next/link";

type Props = {
  tenantId: string;
  /** List of enabled module keys for this tenant (e.g. ["invoices", "inventory"]) */
  entitlements?: string[];
};

/**
 * Tenant-scoped top navigation.
 * Matches the original call site API:
 *   <TenantNav tenantId={tenantId} entitlements={accessibleKeys} />
 *
 * Notes:
 * - Keeps labels simple (you can key later if desired).
 * - Filters tabs by entitlements when provided.
 */
export function TenantNav({ tenantId, entitlements = [] }: Props) {
  const items = [
    { key: "invoices", label: "Invoices", href: `/${tenantId}/invoices` },
    { key: "inventory", label: "Inventory", href: `/${tenantId}/inventory` },
  ];

  const visible =
    entitlements.length > 0
      ? items.filter((i) => entitlements.includes(i.key))
      : items;

  return (
    <nav className="mt-3 border-b">
      <ul className="flex gap-6 text-sm">
        {visible.map((i) => (
          <li key={i.key}>
            <Link className="underline" href={i.href}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Also provide default export to be robust to default imports.
export default TenantNav;
