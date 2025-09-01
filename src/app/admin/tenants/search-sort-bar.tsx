// src/app/admin/tenants/search-sort-bar.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, FormEvent } from "react";

type SortOption = { value: string; label: string };

interface Props {
  qInitial: string;
  sortInitial: string;
  sortOptions: SortOption[];
  /** Debounce delay in ms (default 500) */
  delay?: number;
}

export default function SearchSortBar({
  qInitial,
  sortInitial,
  sortOptions,
  delay = 500,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Local UI state
  const [q, setQ] = useState(qInitial);
  const [sort, setSort] = useState(sortInitial);
  // Status remains supported if present in the URL; no “Apply” button—auto sync.
  const statusFromUrl = sp.get("status") ?? "";

  // Debounce search text
  const timer = useRef<number | null>(null);
  const schedulePush = useCallback(
    (nextQ: string, nextSort: string) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const params = new URLSearchParams(sp?.toString());
        // keep existing status if present
        if (nextQ) params.set("q", nextQ);
        else params.delete("q");
        if (nextSort) params.set("sort", nextSort);
        else params.delete("sort");
        if (statusFromUrl) params.set("status", statusFromUrl);
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      }, delay);
    },
    [router, pathname, sp, delay, statusFromUrl]
  );

  // Sync if initial props change (SSR→CSR hydration)
  useEffect(() => setQ(qInitial), [qInitial]);
  useEffect(() => setSort(sortInitial), [sortInitial]);

  // Handlers
  function onChangeQ(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    schedulePush(next, sort);
  }

  function onChangeSort(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setSort(next);
    schedulePush(q, next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        placeholder="Search by name or ID..."
        className="h-9 min-w-[240px] rounded-md border px-3 text-sm"
        value={q}
        onChange={onChangeQ}
      />
      <select
        className="h-9 rounded-md border px-2 text-sm"
        value={sort}
        onChange={onChangeSort}
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* No Type dropdown, no Apply button */}
    </div>
  );
}
