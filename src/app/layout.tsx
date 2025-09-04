// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import SignInLink from "@/components/SignInLink";
import SignOutButton from "@/components/SignOutButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ClearPreviewLink from "@/components/ClearPreviewLink";
import { cookies } from "next/headers";

// i18n provider + flat catalogs
import { I18nProvider } from "@/lib/i18n";
import { en } from "@/messages/en";
import { ar } from "@/messages/ar";

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
  const locale = cookieLocale === "ar" ? "ar" : "en";
  const t = locale === "ar" ? ar : en;
  const dir = locale === "ar" ? "rtl" : "ltr";

  // Real session user
  const sessionUserId = await getSessionUserId();
  const sessionUser = sessionUserId
    ? await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, name: true, email: true },
      })
    : null;

  // Preview/impersonation
  const previewUserId = cookieStore.get("previewUserId")?.value?.trim() || "";
  const previewUser = previewUserId
    ? await prisma.user.findUnique({
        where: { id: previewUserId },
        select: { id: true, name: true, email: true },
      })
    : null;
  const isPreviewing = !!previewUser;

  // Effective identity for nav visibility
  const effectiveUserId = isPreviewing ? previewUserId : sessionUserId || "";
  const platformRoles = effectiveUserId
    ? await prisma.appRole.findMany({
        where: { userId: effectiveUserId },
        select: { role: true },
      })
    : [];
  const isPlatform =
    platformRoles.some((r) => r.role === "DEVELOPER") ||
    platformRoles.some((r) => r.role === "APP_ADMIN");

  // Real identity badge only (optional)
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
    <html lang={locale} dir={dir}>
      <body>
        {/* ✅ Wrap everything in I18nProvider so useI18n() (LanguageSwitcher) has context */}
        <I18nProvider locale={locale} messages={t}>
          {/* Header */}
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
                      {t["header.previewAs"]}:{" "}
                      <span className="font-medium">{nameOrEmail(previewUser)}</span>
                    </span>
                    <ClearPreviewLink className="underline">
                      {t["header.clearPreview"]}
                    </ClearPreviewLink>
                  </div>
                ) : null}

                {sessionUser ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="opacity-80">
                      {t["header.signedInAs"]}:{" "}
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

          {/* Main */}
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

          {/* Footer */}
          <footer className="mx-auto max-w-6xl px-4 py-6 text-sm opacity-80">
            <div>© {new Date().getFullYear()} SMB OS</div>
            <div>Local-first • Multi-tenant • Modular</div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
