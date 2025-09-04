// src/components/ClearPreviewLink.tsx
'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Builds a link to clear preview and return to the current page.
 * It preserves both pathname and query string.
 */
export default function ClearPreviewLink({
  className,
  children = 'Clear',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const current =
    pathname + (search && search.toString() ? `?${search.toString()}` : '');
  const href =
    '/api/dev/preview-user?action=clear&redirectTo=' +
    encodeURIComponent(current);

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
