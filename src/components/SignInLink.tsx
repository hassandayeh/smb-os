// src/components/SignInLink.tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function SignInLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  const redirectTo = (pathname || "/") + (qs ? `?${qs}` : "");
  const href = `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <Link href={href} className={className} aria-label="Sign in">
      Sign in
    </Link>
  );
}
