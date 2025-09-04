// src/app/admin/tenants/CreateTenantButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export default function CreateTenantButton() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <button
      onClick={() => router.push("/admin/tenants/new")}
      className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
      aria-label={t("actions.createTenant")}
    >
      {t("actions.createTenant")}
    </button>
  );
}
