// src/app/admin/tenants/new/NewTenantClient.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NewTenantClient() {
  const router = useRouter();

  // NEW — manual ID + availability status
  const [id, setId] = useState("");
  const [idCheck, setIdCheck] =
    useState<"idle" | "checking" | "available" | "taken" | "unknown">("idle");

  // Existing fields
  const [name, setName] = useState("");
  const [activatedUntil, setActivatedUntil] = useState<string>("");
  const [defaultLocale, setDefaultLocale] = useState<"en" | "ar" | "de">("en");

  // NEW — industry (optional)
  const [industry, setIndustry] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- helpers ---
  function normalizeId(v: string) {
    // lowercase, keep letters/numbers/hyphen/underscore
    return v.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  }

  // Debounced best-effort ID uniqueness check (non-blocking; POST is source of truth)
  const checkTimer = useRef<number | null>(null);
  useEffect(() => {
    const clean = normalizeId(id);
    if (!clean) {
      setIdCheck("idle");
      return;
    }
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    setIdCheck("checking");
    checkTimer.current = window.setTimeout(async () => {
      try {
        // This endpoint may not exist yet; if 404/5xx we show "unknown".
        const res = await fetch(`/api/admin/tenants/check-id?id=${encodeURIComponent(clean)}`);
        if (!res.ok) {
          setIdCheck("unknown");
          return;
        }
        const data = await res.json().catch(() => ({}));
        setIdCheck(data?.available ? "available" : "taken");
      } catch {
        setIdCheck("unknown");
      }
    }, 400);
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanId = normalizeId(id);
    if (!cleanId) {
      setError("ID is required (letters, numbers, hyphen, underscore).");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // NEW — pass id + industry
          id: cleanId,
          name: name.trim(),
          industry: industry || null,
          activatedUntil: activatedUntil || null, // yyyy-mm-dd or null
          defaultLocale,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to create tenant");
      }

      router.push("/admin/tenants");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="container mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4">
        <Button variant="outline" asChild>
          <Link href="/admin/tenants">← Back to Tenants</Link>
        </Button>
      </div>

      <div className="rounded-2xl border bg-card text-card-foreground p-6">
        <h2 className="text-xl font-semibold">New Tenant</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Create a customer company. You can enable modules later in “Manage Entitlements”.
        </p>

        <form onSubmit={onSubmit} className="space-y-5">
          {/* NEW — ID */}
          <div className="grid gap-2">
            <label htmlFor="id" className="text-sm font-medium">ID</label>
            <input
              id="id"
              type="text"
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g., blue-bakery"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, hyphen, underscore only.
            </p>
            {id && (
              <div className="text-xs">
                {idCheck === "checking" && (
                  <span className="text-muted-foreground">Checking availability…</span>
                )}
                {idCheck === "available" && <span className="text-green-600">ID is available</span>}
                {idCheck === "taken" && <span className="text-red-600">ID already taken</span>}
                {idCheck === "unknown" && (
                  <span className="text-muted-foreground">
                    Can’t verify now; will validate on submit.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Name */}
          <div className="grid gap-2">
            <label htmlFor="name" className="text-sm font-medium">Name</label>
            <input
              id="name"
              type="text"
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g., Blue Bakery LLC"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Activated Until */}
          <div className="grid gap-2">
            <label htmlFor="activatedUntil" className="text-sm font-medium">Activated Until</label>
            <input
              id="activatedUntil"
              type="date"
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              value={activatedUntil}
              onChange={(e) => setActivatedUntil(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to set later. If set, the tenant is considered active until this date.
            </p>
          </div>

          {/* NEW — Industry */}
          <div className="grid gap-2">
            <label htmlFor="industry" className="text-sm font-medium">Industry</label>
            <input
              id="industry"
              type="text"
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g., Food & Beverage"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>

          {/* Default Locale */}
          <div className="grid gap-2">
            <label htmlFor="defaultLocale" className="text-sm font-medium">Default Locale</label>
            <select
              id="defaultLocale"
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              value={defaultLocale}
              onChange={(e) => setDefaultLocale(e.target.value as "en" | "ar" | "de")}
            >
              <option value="en">English (en)</option>
              <option value="ar">العربية (ar)</option>
              <option value="de">Deutsch (de)</option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting || idCheck === "taken"}>
              {submitting ? "Creating…" : "Create Tenant"}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/admin/tenants">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
