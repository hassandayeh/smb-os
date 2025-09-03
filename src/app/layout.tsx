// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getSessionUserId } from "@/lib/auth"; // uses session cookie
import { prisma } from "@/lib/prisma";
import SignInLink from "@/components/SignInLink";
import SignOutButton from "@/components/SignOutButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// i18n catalogs + provider
import { I18nProvider, type Locale } from "@/lib/i18n";
import { en } from "@/messages/en";
import { ar } from "@/messages/ar";
import { cookies } from "next/headers";

const catalogs = {
  en,
  ar,
} as const;

export const metadata: Metadata = {
  title: "SMB OS",
  description: "Local-first, modular SMB app",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // --- FIX: cookies() is async in your environment — await it before .get()
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("ui.locale")?.value;
  const currentLocale: Locale = cookieLocale === "ar" ? "ar" : "en";
  const messages = catalogs[currentLocale];
  const dir = currentLocale === "ar" ? "rtl" : "ltr";

  // Resolve session user (if any)
  const sessionUserId = await getSessionUserId();

  const sessionUser = sessionUserId
    ? await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { name: true, tenantId: true },
      })
    : null;

  // Platform roles (L1/L2) → controls showing "Admin" and renders a badge
  const platformRoles = sessionUserId
    ? await prisma.appRole.findMany({
        where: { userId: sessionUserId },
        select: { role: true },
      })
    : [];

  const hasDev = platformRoles.some((r) => r.role === "DEVELOPER");
  const hasAppAdmin = platformRoles.some((r) => r.role === "APP_ADMIN");
  const isPlatform = hasDev || hasAppAdmin;
  const platformBadge = hasDev ? "Developer" : hasAppAdmin ? "App admin" : null;

  return (
    <html lang={currentLocale} dir={dir}>
      <body>
        {/* Wrap the entire app with I18nProvider so all pages/components can call useI18n().t(...) */}
        <I18nProvider locale={currentLocale} messages={messages}>
          {/* Header */}
          <header
            className={cn(
              "flex items-center justify-between px-4 py-3",
              "border-b" // uses theme tokens from globals.css
            )}
          >
            <div className="flex items-center gap-3">
              <Link href="/" className="font-semibold">
                SMB OS
              </Link>

              {/* Global nav */}
              <nav className="flex items-center gap-3">
                <Link href="/">Dashboard</Link>
                {isPlatform ? (
                  <Link href="/admin">Admin</Link>
                ) : sessionUser ? (
                  <Link href={`/${sessionUser.tenantId ?? ""}`.replace(/\/$/, "")}>
                    Workspace
                  </Link>
                ) : null}
              </nav>
            </div>

            {/* Right-side actions */}
            <div className="flex items-center gap-3">
              {/* Language switcher appears for everyone */}
              <LanguageSwitcher />

              {sessionUser ? (
                <>
                  <span className="text-sm">
                    Signed in as: {sessionUser.name ?? "User"}
                  </span>
                  {platformBadge ? (
                    <span className="text-xs px-2 py-0.5 rounded-full ring-1">
                      {platformBadge}
                    </span>
                  ) : null}
                  <SignOutButton />
                </>
              ) : (
                <SignInLink />
              )}
            </div>
          </header>

          {/* Main */}
          <main className="min-h-[60vh]">{children}</main>

          {/* Footer */}
          <footer className="px-4 py-6 text-sm">
            <div className="opacity-80">
              © {new Date().getFullYear()} SMB OS
            </div>
            <div className="opacity-70">
              Local-first • Multi-tenant • Modular
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
