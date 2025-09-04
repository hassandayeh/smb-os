// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SignInLink from "@/components/SignInLink";
import SignOutButton from "@/components/SignOutButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ClearPreviewLink from "@/components/ClearPreviewLink"; // NEW

// i18n catalogs + provider
import { I18nProvider, type Locale } from "@/lib/i18n";
import { en } from "@/messages/en";
import { ar } from "@/messages/ar";

import { cookies } from "next/headers";

const catalogs = { en, ar } as const;

export const metadata: Metadata = {
  title: "SMB OS",
  description: "Local-first, modular SMB app",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Locale
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("ui.locale")?.value;
  const currentLocale: Locale = cookieLocale === "ar" ? "ar" : "en";
  const messages = catalogs[currentLocale];
  const dir = currentLocale === "ar" ? "rtl" : "ltr";

  // Real session user
  const sessionUserId = await getSessionUserId();
  const sessionUser = sessionUserId
    ? await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, name: true, email: true },
      })
    : null;

  // Preview/impersonation state
  const previewUserId = cookieStore.get("previewUserId")?.value?.trim() || "";
  const previewUser = previewUserId
    ? await prisma.user.findUnique({
        where: { id: previewUserId },
        select: { id: true, name: true, email: true },
      })
    : null;
  const isPreviewing = !!previewUser;

  // Compute platform ability from the EFFECTIVE identity
  const effectiveUserId = isPreviewing ? previewUserId : sessionUserId || "";
  const platformRoles = effectiveUserId
    ? await prisma.appRole.findMany({
        where: { userId: effectiveUserId },
        select: { role: true },
      })
    : [];
  const hasDev = platformRoles.some((r) => r.role === "DEVELOPER");
  const hasAppAdmin = platformRoles.some((r) => r.role === "APP_ADMIN");
  const isPlatform = hasDev || hasAppAdmin;

  // Show the platform badge only for the real identity (not while previewing)
  const realPlatformRoles = sessionUserId
    ? await prisma.appRole.findMany({
        where: { userId: sessionUserId },
        select: { role: true },
      })
    : [];
  const realBadge =
    realPlatformRoles.some((r) => r.role === "DEVELOPER")
      ? "Developer"
      : realPlatformRoles.some((r) => r.role === "APP_ADMIN")
      ? "App admin"
      : null;

  const nameOrEmail = (u: { name: string | null; email: string | null } | null) =>
    u?.name || u?.email || "User";

  return (
    <html lang={currentLocale} dir={dir}>
      <body>
        <I18nProvider locale={currentLocale} messages={messages}>
          <header className="border-b">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              {/* Left: Brand + nav (based on effective identity) */}
              <div className="flex items-center gap-4">
                <Link href="/" className="font-semibold">
                  SMB OS
                </Link>
                <nav className="flex items-center gap-3 text-sm">
                  <Link href="/dashboard" className="underline">
                    Dashboard
                  </Link>
                  {isPlatform ? (
                    <Link href="/admin" className="underline">
                      Admin
                    </Link>
                  ) : sessionUser ? (
                    <Link href="/" className="underline">
                      Workspace
                    </Link>
                  ) : null}
                </nav>
              </div>

              {/* Right: language, preview indicator, auth */}
              <div className="flex items-center gap-3">
                <LanguageSwitcher />

                {isPreviewing ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-md px-2 py-1 ring-1">
                      {/* i18n: header.preview.as */}
                      Previewing as:{" "}
                      <span className="font-medium">{nameOrEmail(previewUser)}</span>
                    </span>
                    {/* Keep me on this page after clearing */}
                    <ClearPreviewLink className="underline">
                      {/* i18n: header.preview.clear */}
                      Clear
                    </ClearPreviewLink>
                  </div>
                ) : null}

                {sessionUser ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="opacity-80">
                      {/* i18n: header.signedInAs */}
                      Signed in as:{" "}
                      <span className="font-medium">{nameOrEmail(sessionUser)}</span>
                    </span>
                    {realBadge ? (
                      <span className="rounded-md px-2 py-0.5 text-xs ring-1">
                        {realBadge}
                      </span>
                    ) : null}
                    <SignOutButton />
                  </div>
                ) : (
                  <SignInLink />
                )}
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

          <footer className="mx-auto max-w-6xl px-4 py-6 text-sm opacity-80">
            <div>© {new Date().getFullYear()} SMB OS</div>
            <div>Local-first • Multi-tenant • Modular</div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
