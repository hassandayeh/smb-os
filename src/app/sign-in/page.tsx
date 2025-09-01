// src/app/sign-in/page.tsx
import { Card, CardContent } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";

export const metadata = { title: "Sign in" };

function errorMessage(code?: string) {
  switch (code) {
    case "missing":
      return "Please enter your username and password.";
    case "ambiguous":
      return "This username exists in multiple tenants. Please enter your Tenant ID.";
    case "invalid":
      return "Invalid username or password.";
    default:
      return null;
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  // Compute redirect target from query
  let redirectTo =
    (typeof searchParams?.redirectTo === "string" && searchParams.redirectTo) || "/";

  // Prevent loops to /sign-in
  if (redirectTo.startsWith("/sign-in")) redirectTo = "/";

  // If already signed in, bounce to the target immediately
  const uid = await getSessionUserId();
  if (uid) {
    redirect(redirectTo);
  }

  const errCode =
    (typeof searchParams?.error === "string" && searchParams.error) || undefined;

  // prefill after redirect-back
  const presetUsername =
    (typeof searchParams?.username === "string" && searchParams.username) || "";
  const presetTenantId =
    (typeof searchParams?.tenantId === "string" && searchParams.tenantId) || "";

  const msg = errorMessage(errCode);

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <Card className="w-full max-w-md rounded-2xl shadow">
        <CardContent className="p-6">
          <h1 className="text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Use your <span className="font-medium">username</span> and password.
          </p>

          {msg && (
            <div
              className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
              aria-live="polite"
            >
              {msg}
            </div>
          )}

          <form method="POST" action="/api/auth/sign-in" className="space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <div className="space-y-1">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
                defaultValue={presetUsername}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring"
                placeholder="your-username"
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

            {/* Optional: only needed if same username exists in multiple tenants */}
            <div className="space-y-1">
              <label htmlFor="tenantId" className="text-sm font-medium">
                Tenant ID (optional)
              </label>
              <input
                id="tenantId"
                name="tenantId"
                type="text"
                defaultValue={presetTenantId}
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
