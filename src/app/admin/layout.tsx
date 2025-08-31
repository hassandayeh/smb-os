// src/app/admin/layout.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";

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
  const isPlatform =
    platform.has("DEVELOPER") || platform.has("APP_ADMIN");

  if (!isPlatform) {
    // Not a platform admin → block Admin area
    redirect("/forbidden");
  }

  // 3) Render Admin area if allowed
  return (
    <div className="min-h-dvh flex flex-col">
      {/* You can add an Admin nav/header here later if needed */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
