// src/app/admin/layout.tsx
import { ReactNode } from "react";
import Link from "next/link"; // NEW
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import ImpersonationRibbon from "@/components/ImpersonationRibbon";

// Optional: keep server-fresh during development
export const dynamic = "force-dynamic";

type Props = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: Props) {
  // 1) Identify current user
  const userId = await getCurrentUserId();

  // Fail-closed if unauthenticated
  if (!userId) {
    redirect("/forbidden");
  }

  // 2) Check platform roles (L1/L2)
  const roles = await prisma.appRole.findMany({
    where: { userId },
    select: { role: true },
  });

  const platform = new Set(roles.map((r) => r.role));
  const isPlatform = platform.has("DEVELOPER") || platform.has("APP_ADMIN");

  if (!isPlatform) {
    // Not a platform admin → block Admin area
    redirect("/forbidden");
  }

  // 3) Render Admin area if allowed
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
