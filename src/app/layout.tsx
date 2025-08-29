import "./globals.css"
import type { Metadata } from "next"
import Link from "next/link"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "SMB OS",
  description: "Local-first, modular SMB app",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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

            {/* Global nav: Dashboard + Admin only */}
            <nav className="hidden md:flex items-center gap-6 text-sm">
              <Link href="/" className="hover:underline underline-offset-4">
                Dashboard
              </Link>
              <Link href="/admin" className="hover:underline underline-offset-4">
                Admin
              </Link>
            </nav>

            {/* Right-side actions */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Signed in as: demo</span>
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
