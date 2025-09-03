'use client';

import React, { createContext, useContext, useMemo } from 'react';

export type Messages = Record<string, string>;
export type Locale = 'en';

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function format(msg: string, params?: Record<string, string | number>) {
  if (!params) return msg;
  return Object.keys(params).reduce((acc, name) => {
    const re = new RegExp(`\\{${name}\\}`, 'g');
    return acc.replace(re, String(params[name]));
  }, msg);
}

/** Phase 0: simple provider with dev-only missing-key warnings. */
export function I18nProvider({
  locale,
  messages,
  children,
}: React.PropsWithChildren<{ locale: Locale; messages: Messages }>) {
  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      messages,
      t: (key: string, params?: Record<string, string | number>) => {
        const found = messages[key];
        if (found == null) {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(`[i18n] Missing key: "${key}" for locale "${locale}"`);
          }
          // Show the key itself so it's obvious during Phase 1 keying-on-touch.
          return key;
        }
        return format(found, params);
      },
    };
  }, [locale, messages]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook for components to translate strings. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within <I18nProvider>');
  }
  return ctx;
}
