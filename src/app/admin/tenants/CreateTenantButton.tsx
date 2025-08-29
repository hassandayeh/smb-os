"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";

export default function CreateTenantButton() {
  const router = useRouter();
  const sp = useSearchParams();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [activatedUntil, setActivatedUntil] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/admin/tenants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          activatedUntil: activatedUntil || undefined, // YYYY-MM-DD
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to create tenant");
      }
      // Refresh list then navigate to Manage page
      router.refresh();
      router.push(`/admin/tenants/${data.id}`);
      setOpen(false);
      setName("");
      setActivatedUntil("");
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function onClose() {
    setOpen(false);
    setError(null);
    setName("");
    setActivatedUntil("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
      >
        Create Tenant
      </button>

      <dialog
        ref={dialogRef}
        onClose={onClose}
        className="w-[min(92vw,520px)] rounded-xl border p-0 open:animate-in open:fade-in-0"
      >
        <form onSubmit={onSubmit} className="p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Create Tenant</h2>
            <p className="text-sm text-muted-foreground">
              Enter the tenant details. You can edit other fields later.
            </p>
          </div>

          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm text-muted-foreground">Name</span>
              <input
                className="h-9 rounded-md border px-3"
                placeholder="e.g., New Business LLC"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-muted-foreground">Activated Until (optional)</span>
              <input
                type="date"
                className="h-9 rounded-md border px-3"
                value={activatedUntil}
                onChange={(e) => setActivatedUntil(e.target.value)}
              />
            </label>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md border px-3 text-sm"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
