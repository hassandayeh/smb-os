"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  // keep page size/server defaults in sync with page.tsx
  pageSize?: number;
};

export default function AuditFilters({ pageSize = 20 }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [tenantId, setTenantId] = useState(sp.get("tenantId") ?? "");
  const [action, setAction] = useState(sp.get("action") ?? "");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  // Submit via GET by rebuilding the URL with query params
  function apply() {
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    // reset to first page when filters change
    params.set("page", "1");
    router.push(`/admin/audit?${params.toString()}`);
  }

  function clearAll() {
    router.push("/admin/audit?page=1");
    setTenantId("");
    setAction("");
    setFrom("");
    setTo("");
  }

  // Enter key on any input triggers apply
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Enter") apply();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tenantId, action, from, to]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground">Tenant ID</label>
        <input
          className="h-9 rounded-md border px-3"
          placeholder="Exact tenantId"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground">Action</label>
        <input
          className="h-9 rounded-md border px-3"
          placeholder='e.g. "entitlement.update"'
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground">From (UTC)</label>
        <input
          type="date"
          className="h-9 rounded-md border px-3"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground">To (UTC)</label>
        <input
          type="date"
          className="h-9 rounded-md border px-3"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={apply}
          className="h-9 rounded-md bg-primary px-4 text-primary-foreground"
        >
          Apply
        </button>
        <button
          onClick={clearAll}
          className="h-9 rounded-md border px-4"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
