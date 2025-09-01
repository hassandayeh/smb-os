// src/app/admin/layout.tsx
import { ReactNode } from "react";
import Link from "next/link";
import ImpersonationRibbon from "@/components/ImpersonationRibbon";
import { requireAccess } from "@/lib/guard-page"; // ✅ centralized admin guard

// Optional: keep server-fresh during development
export const dynamic = "force-dynamic";

type Props = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: Props) {
  // ✅ Keystone compliance: one-line, layout-first guard for the whole Admin area
  await requireAccess();

  // Render Admin area if allowed
  return (
    <div className="min-h-dvh flex flex-col">
      <ImpersonationRibbon />
      {/* Admin sub-nav */}
      <div className="border-b bg-background">
        <div className="container h-10 flex items-center gap-6 text-sm">
          <Link href="/admin/tenants" className="hover:underline underline-offset-4">
            Tenants
          </Link>
          <Link href="/admin/platform-roles" className="hover:underline underline-offset-4">
            Platform roles
          </Link>
        </div>
      </div>

      {/* Page content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
