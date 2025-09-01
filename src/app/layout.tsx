import "./globals.css"
import type { Metadata } from "next"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { getSessionUserId } from "@/lib/auth" // uses session cookie
import { prisma } from "@/lib/prisma"
import SignInLink from "@/components/SignInLink"
import SignOutButton from "@/components/SignOutButton"

export const metadata: Metadata = {
  title: "SMB OS",
  description: "Local-first, modular SMB app",
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolve session user (if any)
  const sessionUserId = await getSessionUserId()
  const sessionUser = sessionUserId
    ? await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { name: true, tenantId: true },
      })
    : null

  // Platform roles (L1/L2) → controls showing "Admin" and renders a badge
  const platformRoles = sessionUserId
    ? await prisma.appRole.findMany({
        where: { userId: sessionUserId },
        select: { role: true },
      })
    : []

  const hasDev = platformRoles.some((r) => r.role === "DEVELOPER")
  const hasAppAdmin = platformRoles.some((r) => r.role === "APP_ADMIN")
  const isPlatform = hasDev || hasAppAdmin
  const platformBadge =
    hasDev ? "Developer" : hasAppAdmin ? "App admin" : null

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-dvh bg-background text-foreground antialiased"
        )}
      >
        {/* Header */}
        <header className="border-b">
          <div className="container flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-md bg-foreground" aria-hidden />
              <Link href="/" className="font-semibold">
                SMB OS
              </Link>
            </div>

            {/* Global nav */}
            <nav className="hidden md:flex items-center gap-6 text-sm">
              <Link href="/" className="hover:underline underline-offset-4">
                Dashboard
              </Link>
              {isPlatform ? (
                <Link href="/admin" className="hover:underline underline-offset-4">
                  Admin
                </Link>
              ) : sessionUser ? (
                <Link
                  href={`/${sessionUser.tenantId}`}
                  className="hover:underline underline-offset-4"
                >
                  Workspace
                </Link>
              ) : null}
            </nav>

            {/* Right-side actions */}
            <div className="flex items-center gap-3">
              {sessionUser ? (
                <>
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    Signed in as: <strong>{sessionUser.name ?? "User"}</strong>
                    {platformBadge ? (
                      <span
                        className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs"
                        title={`Platform role: ${platformBadge}`}
                      >
                        {platformBadge}
                      </span>
                    ) : null}
                  </span>
                  <SignOutButton />
                </>
              ) : (
                <SignInLink
                  className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
                />
              )}
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="container py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t">
          <div className="container h-12 flex items-center justify-between text-sm text-muted-foreground">
            <span>© {new Date().getFullYear()} SMB OS</span>
            <span>Local-first • Multi-tenant • Modular</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
