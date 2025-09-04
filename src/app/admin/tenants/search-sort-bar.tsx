// src/app/admin/tenants/search-sort-bar.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type SortOption = { value: string; label: string };

/**
 * Props — supports both legacy and new naming for back-compat.
 */
interface Props {
  // Preferred naming
  qInitial?: string;
  sortInitial?: string;

  // Legacy naming (still supported)
  currentQ?: string;
  currentSort?: string;
  currentStatus?: string; // ignored (status comes from URL, but kept to avoid prop warnings)

  sortOptions: SortOption[];
  delay?: number;
}

export default function SearchSortBar({
  qInitial,
  sortInitial,
  sortOptions,
  delay = 500,
  currentQ,
  currentSort,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { t } = useI18n();

  // Resolve initial values from either prop set
  const initialQ = qInitial ?? currentQ ?? "";
  const initialSort = sortInitial ?? currentSort ?? "";

  // Local UI state
  const [q, setQ] = useState(initialQ);
  const [sort, setSort] = useState(initialSort);

  // Keep in sync with parent updates
  useEffect(() => setQ(initialQ), [initialQ]);
  useEffect(() => setSort(initialSort), [initialSort]);

  // Apply search query (debounced)
  useEffect(() => {
    const h = setTimeout(() => {
      const params = new URLSearchParams(sp as any);
      if (q) params.set("q", q);
      else params.delete("q");
      params.delete("page"); // reset paging
      router.push(`${pathname}?${params.toString()}`);
    }, delay);
    return () => clearTimeout(h);
  }, [q, delay, pathname, router, sp]);

  // Apply sort instantly
  useEffect(() => {
    if (!sort) return;
    const params = new URLSearchParams(sp as any);
    params.set("sort", sort);
    router.push(`${pathname}?${params.toString()}`);
  }, [sort, pathname, router, sp]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {/* Search box */}
      <input
        type="search"
        placeholder={t("search.placeholder.tenants")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full rounded-md border px-3 py-1.5 text-sm shadow-sm sm:max-w-xs"
      />

      {/* Sort dropdown (labels already translated by the server page) */}
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        className="rounded-md border px-2 py-1.5 text-sm shadow-sm"
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
