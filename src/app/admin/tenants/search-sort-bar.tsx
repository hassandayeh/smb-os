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
  const [status, setStatus] = useState(sp.get("status") ?? ""); // NEW

  // Keep a debounce timer
  const timerRef = useRef<number | null>(null);

  // Helper to push new URL query params
  const pushQuery = useCallback(
    (nextQ: string, nextSort: string, replace = true) => {
      const params = new URLSearchParams(sp?.toString() || "");
      // q
      if (nextQ) params.set("q", nextQ);
      else params.delete("q");
      // sort
      if (nextSort) params.set("sort", nextSort);
      // NEW: status
      if (status) params.set("status", status);
      else params.delete("status");

      const url = `${pathname}?${params.toString()}`;
      replace ? router.replace(url) : router.push(url);
    },
    [pathname, router, sp, status] // include status so it’s current
  );

  // Debounce: when q changes via typing, update URL after delay
  useEffect(() => {
    // Skip initial mount if value equals initial (avoid duplicate replace)
    if (q === qInitial && sort === sortInitial && (sp.get("status") ?? "") === status) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      pushQuery(q, sort, true);
    }, delay);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Sort changes trigger immediate update (no debounce)
  useEffect(() => {
    if (sort === sortInitial && q === qInitial) return;
    pushQuery(q, sort, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  // NEW: Status changes trigger immediate update (same behavior as sort)
  useEffect(() => {
    pushQuery(q, sort, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Submit (Enter) forces immediate push (no debounce)
  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      pushQuery(q, sort, false); // push adds to history on explicit submit
    },
    [pushQuery, q, sort]
  );

  // Clear only resets q (keeps sort and status as chosen)
  const onClear = useCallback(() => {
    setQ("");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    pushQuery("", sort, true);
  }, [pushQuery, sort]);

  const hasQuery = useMemo(() => q.trim().length > 0, [q]);

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      {/* Search input with a clear (X) button */}
      <div className="relative">
        <input
          type="text"
          name="q"
          placeholder="Search by name or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-64 rounded-md border px-3 pe-8 text-sm outline-none focus:ring-2"
          aria-label="Search tenants"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={onClear}
            className="absolute inset-y-0 right-0 me-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Clear search"
            title="Clear"
          >
            ×
          </button>
        )}
      </div>

      {/* Sort select */}
      <select
        name="sort"
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        className="h-9 rounded-md border px-2 text-sm"
        aria-label="Sort tenants"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* NEW: Status select */}
      <select
        name="status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-9 rounded-md border px-2 text-sm"
        aria-label="Filter by status"
        title="Status"
      >
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="SUSPENDED">Suspended</option>
      </select>

      {/* Explicit Apply (Enter) — optional but nice to have */}
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
        title="Apply now (Enter)"
      >
        Apply
      </button>
    </form>
  );
}
