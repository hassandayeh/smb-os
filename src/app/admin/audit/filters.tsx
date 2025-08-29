// src/app/admin/audit/filters.tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export type AuditFiltersState = {
  tenant?: string; // id OR name (partial)
  action?: string;
  from?: string;   // yyyy-mm-dd
  to?: string;     // yyyy-mm-dd
};

export default function AuditFilters({ initial }: { initial: AuditFiltersState }) {
  const formRef = useRef<HTMLFormElement | null>(null);

  // Debounced auto-submit on input/change
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    let timer: any;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      }, 350);
    };

    form.addEventListener("input", handler);
    form.addEventListener("change", handler);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", handler);
      form.removeEventListener("change", handler);
    };
  }, []);

  // Build current query for Export link
  const q = new URLSearchParams();
  if (initial.tenant) q.set("tenant", initial.tenant);
  if (initial.action) q.set("action", initial.action);
  if (initial.from) q.set("from", initial.from);
  if (initial.to) q.set("to", initial.to);

  return (
    <form
      ref={formRef}
      method="get"
      action="/admin/audit"
      className="grid grid-cols-1 gap-3 md:grid-cols-5"
    >
      <input
        name="tenant"
        defaultValue={initial.tenant ?? ""}
        placeholder="Tenant ID or Name"
        className="h-9 rounded-md border px-3 text-sm"
        aria-label="Tenant ID or Name"
      />
      <input
        name="action"
        defaultValue={initial.action ?? ""}
        placeholder='e.g. "entitlement.update"'
        className="h-9 rounded-md border px-3 text-sm"
        aria-label="Action"
      />
      <input
        type="date"
        name="from"
        defaultValue={initial.from ?? ""}
        title="From (UTC)"
        className="h-9 rounded-md border px-3 text-sm"
        aria-label="From date (UTC)"
      />
      <input
        type="date"
        name="to"
        defaultValue={initial.to ?? ""}
        title="To (UTC)"
        className="h-9 rounded-md border px-3 text-sm"
        aria-label="To date (UTC)"
      />

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          title="Apply now (Enter)"
        >
          Apply
        </button>

        <Link href="/admin/audit">
          <Button type="button" variant="secondary">
            Clear
          </Button>
        </Link>

        {/* Export respects active filters */}
        <Link
          href={`/admin/audit/export${q.toString() ? `?${q.toString()}` : ""}`}
          prefetch={false}
        >
          <Button type="button">Export CSV</Button>
        </Link>
      </div>
    </form>
  );
}
