// src/app/admin/entitlements/debounced-search.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

/**
 * Drop-in replacement for your existing form.
 * - Preserves the exact markup & classes
 * - Debounces URL updates while typing
 * - Keeps input focus on re-render
 * - Enter/Apply submits immediately
 */
export default function DebouncedSearch({ delay = 500 }: { delay?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // initialize from current URL (?q=)
  const [q, setQ] = useState(sp.get("q") ?? "");
  const timerRef = useRef<number | null>(null);

  const pushQuery = useCallback(
    (val: string, replace = true) => {
      const params = new URLSearchParams(sp?.toString() || "");
      if (val) params.set("q", val);
      else params.delete("q");
      const url = `${pathname}?${params.toString()}`;
      replace ? router.replace(url) : router.push(url);
    },
    [pathname, router, sp]
  );

  // debounce while typing
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => pushQuery(q, true), delay);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [q, delay, pushQuery]);

  // submit immediately on Apply / Enter
  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      pushQuery(q, false);
    },
    [pushQuery, q]
  );

  return (
    <form className="mb-4 flex items-end gap-2" method="get" onSubmit={onSubmit}>
      <div className="flex flex-col">
        <label className="mb-1 text-xs text-muted-foreground">Search</label>
        <input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or key"
          className="h-9 w-[260px] rounded-md border px-3"
          inputMode="text"
        />
      </div>
      <button
        type="submit"
        className="h-9 rounded-md border px-3 text-sm hover:bg-muted/40"
      >
        Apply
      </button>
      {q ? (
        <Link
          href="/admin/entitlements"
          className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted/40"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
