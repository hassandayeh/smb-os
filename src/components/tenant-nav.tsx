"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

interface TenantNavProps {
  tenantId: string;
  entitlements: string[]; // list of enabled module keys
}

export function TenantNav({ tenantId, entitlements }: TenantNavProps) {
  const pathname = usePathname();

  const items: NavItem[] = [];

  if (entitlements.includes("inventory")) {
    items.push({ href: `/${tenantId}/inventory`, label: "Inventory" });
  }

  if (entitlements.includes("invoices")) {
    items.push({ href: `/${tenantId}/invoices`, label: "Invoices" });
  }

  return (
    <div className="border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40">
      <nav className="mx-auto max-w-6xl px-4">
        <div className="flex gap-4">
          {items.length > 0 ? (
            items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "inline-flex h-9 items-center rounded-t-md border-b-2 px-3 text-sm transition-colors",
                    active
                      ? "border-blue-600 font-semibold text-blue-600"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })
          ) : (
            <span className="h-9 inline-flex items-center text-sm text-muted-foreground">
              No modules enabled for this tenant.
            </span>
          )}
        </div>
      </nav>
    </div>
  );
}
