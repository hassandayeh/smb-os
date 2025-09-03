// src/components/LanguageSwitcher.tsx
"use client";

import { useI18n } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Simple language switcher:
 * - Sets a cookie "ui.locale" to "en" or "ar"
 * - Refreshes the page so the server layout picks it up
 */
export default function LanguageSwitcher() {
  const { t, locale } = useI18n() as { t: (k: string) => string; locale: "en" | "ar" };
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setLocale(next: "en" | "ar") {
    // Cookie visible to all paths; expires far in the future
    document.cookie = `ui.locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm opacity-80" aria-label={t("language.label")}>
        {t("language.label")}
      </label>
      <select
        className="rounded-md border px-2 py-1 text-sm"
        value={locale}
        onChange={(e) => setLocale(e.target.value as "en" | "ar")}
        disabled={isPending}
        aria-live="polite"
      >
        <option value="en">{t("language.english")}</option>
        <option value="ar">{t("language.arabic")}</option>
      </select>
    </div>
  );
}
