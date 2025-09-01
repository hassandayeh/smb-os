// src/app/sign-in/page.tsx
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Sign in" };

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const redirectTo =
    (typeof searchParams?.redirectTo === "string" && searchParams?.redirectTo) || "/";

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <Card className="w-full max-w-md rounded-2xl shadow">
        <CardContent className="p-6">
          <h1 className="text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Use your email and password.
          </p>

          <form
            method="POST"
            action="/api/auth/sign-in"
            className="space-y-4"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring"
                placeholder="••••••••"
              />
            </div>

            {/* Optional: only needed if same email exists in multiple tenants */}
            <div className="space-y-1">
              <label htmlFor="tenantId" className="text-sm font-medium">
                Tenant ID (optional)
              </label>
              <input
                id="tenantId"
                name="tenantId"
                type="text"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring"
                placeholder="Leave empty unless prompted"
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-black px-4 text-white hover:opacity-90"
            >
              Sign in
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
