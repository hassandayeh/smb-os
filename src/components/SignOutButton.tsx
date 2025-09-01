// src/components/SignOutButton.tsx
"use client";

export default function SignOutButton() {
  return (
    <form method="POST" action="/api/auth/sign-out?redirectTo=/sign-in">
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-background hover:opacity-90 text-sm"
        aria-label="Sign out"
      >
        Sign out
      </button>
    </form>
  );
}
