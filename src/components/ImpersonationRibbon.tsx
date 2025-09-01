// src/components/ImpersonationRibbon.tsx
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Sticky ribbon that appears when impersonating via previewUserId cookie.
 * Clicking "Return to admin" clears the cookie (GET?action=clear) and
 * redirects back to the current page thanks to referer fallback.
 */
export default async function ImpersonationRibbon() {
  const jar = await cookies();
  const previewId = jar.get("previewUserId")?.value;
  if (!previewId) return null;

  const user = await prisma.user.findUnique({
    where: { id: previewId },
    select: { name: true, email: true },
  });

  return (
    <div className="sticky top-0 z-50 w-full border-b border-amber-300 bg-amber-100 text-amber-900">
      <div className="mx-auto max-w-screen-2xl px-4 py-2 text-sm flex items-center justify-between gap-3">
        <span className="truncate">
          Viewing as <strong>{user?.name ?? "User"}</strong>
          {user?.email ? ` (${user.email})` : ""}
        </span>
        <a
          href="/api/dev/preview-user?action=clear"
          className="inline-flex h-8 items-center rounded-md bg-amber-900 px-3 text-amber-50 hover:opacity-90"
          role="button"
          aria-label="Return to admin (exit preview)"
        >
          Return to admin
        </a>
      </div>
    </div>
  );
}
