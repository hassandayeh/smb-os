// src/lib/i18n-server.ts
import { cookies } from "next/headers";
import type { Locale, Messages } from "./i18n";
import { en } from "@/messages/en";
import { ar } from "@/messages/ar";

/** Minimal param formatter (matches client formatter) */
function format(msg: string, params?: Record<string, unknown>) {
  if (!params) return msg;
  return Object.keys(params).reduce((acc, name) => {
    const re = new RegExp(`\\{${name}\\}`, "g");
    return acc.replace(re, String(params[name]));
  }, msg);
}

/** Resolve locale from cookie (fallback to 'en'). */
async function getLocaleFromCookies(): Promise<Locale> {
  const jar = await cookies(); // NOTE: cookies() → Promise<ReadonlyRequestCookies> in your setup
  const lc = jar.get("locale")?.value;
  return lc === "ar" ? "ar" : "en";
}

/** Load messages for a given locale. */
function getMessagesFor(locale: Locale): Messages {
  return locale === "ar" ? (ar as Messages) : (en as Messages);
}

/**
 * Server-side i18n accessor:
 *   const { t, locale } = await getTServer();
 *   t('admin.tenants.title')
 */
export async function getTServer(explicitLocale?: Locale) {
  const locale: Locale = explicitLocale ?? (await getLocaleFromCookies());
  const messages = getMessagesFor(locale);
  const t = (key: string, params?: Record<string, unknown>) =>
    format(messages[key] ?? key, params);
  return { t, locale, messages };
}
