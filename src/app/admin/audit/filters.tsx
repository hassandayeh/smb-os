// src/app/admin/audit/filters.tsx
"use client";

import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export type AuditFiltersState = {
  tenant: string;
  q: string;        // kept for compatibility with callers but unused now
  from: string;     // yyyy-mm-dd
  to: string;       // yyyy-mm-dd
  action?: string;  // normalized prefix (e.g., "entitlement")
};

export default function Filters({ initial }: { initial: AuditFiltersState }) {
  const router = useRouter();
  const pathname = usePathname();
  useSearchParams(); // keep hook parity (even if unused directly)

  // Local controlled state (prevents cursor jumps)
  const [tenant, setTenant] = useState(initial.tenant ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [action, setAction] = useState(initial.action ?? "");

  // Refs to keep focus at end while typing
  const tenantRef = useRef<HTMLInputElement | null>(null);

  // Build querystring from current local state
  const qs = useMemo(() => {
    const usp = new URLSearchParams();
    if (tenant) usp.set("tenant", tenant);
    if (from) usp.set("from", from);
    if (to) usp.set("to", to);
    if (action) usp.set("action", action);
    return usp.toString();
  }, [tenant, from, to, action]);

  // Debounced auto-apply (300ms)
  useEffect(() => {
    const handle = setTimeout(() => {
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
      // Keep cursor at end for the tenant text input
      const t = tenantRef.current;
      if (t && document.activeElement === t) {
        const end = t.value.length;
        t.setSelectionRange(end, end);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [qs, pathname, router]);

  // Manual Apply (instant), for users who prefer button
  const onApply = () => {
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const onClear = () => {
    setTenant("");
    setFrom("");
    setTo("");
    setAction("");
    startTransition(() => {
      router.replace(pathname);
    });
    // focus back to tenant box
    setTimeout(() => tenantRef.current?.focus(), 0);
  };

  // Build Export CSV URL from current state (matches the export API)
  const exportUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (tenant) p.set("qTenant", tenant);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (action) p.set("action", action);
    const qs = p.toString();
    return `/api/admin/audit/export${qs ? `?${qs}` : ""}`;
  }, [tenant, from, to, action]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {/* Tenant: ID or Name */}
      <input
        ref={tenantRef}
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
        placeholder="Tenant ID or Name"
        value={tenant}
        onChange={(e) => setTenant(e.target.value)}
      />

      {/* Action dropdown */}
      <select
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        title="Action"
      >
        <option value="">All actions</option>
        <option value="entitlement">Entitlement updated</option>
        <option value="tenant.create">Tenant create</option>
        <option value="tenant.update">Tenant update</option>
        <option value="user.">User actions</option>
      </select>

      {/* Date range */}
      <input
        type="date"
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <input
        type="date"
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />

      {/* Spacer to keep 5-column grid balanced */}
      <div />

      {/* Actions row */}
      <div className="col-span-full flex items-center gap-2">
        <button
          onClick={onApply}
          className="inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted"
          type="button"
        >
          Apply
        </button>
        <button
          onClick={onClear}
          className="inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted"
          type="button"
        >
          Clear
        </button>

        {/* Export CSV (respects current filters) */}
        <Link href={exportUrl} prefetch={false} target="_blank" rel="noopener">
          <button
            type="button"
            className="inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Export CSV
          </button>
        </Link>
      </div>
    </div>
  );
}
