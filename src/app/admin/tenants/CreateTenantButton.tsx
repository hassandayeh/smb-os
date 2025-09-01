// src/app/admin/tenants/CreateTenantButton.tsx
"use client";

import { useRouter } from "next/navigation";

export default function CreateTenantButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push("/admin/tenants/new")}
      className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
    >
      Create Tenant
    </button>
  );
}
