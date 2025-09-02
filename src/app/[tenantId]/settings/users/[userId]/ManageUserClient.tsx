// src/app/[tenantId]/settings/users/[userId]/ManageUserClient.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type TenantRole = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

export default function ManageUserClient(props: {
  tenantId: string;
  userId: string;
  initialRole: TenantRole;
  initialActive: boolean;
  allowedRoles: TenantRole[];
  disableRoleChange: boolean;
}) {
  const { tenantId, userId, initialRole, initialActive, allowedRoles, disableRoleChange } =
    props;

  const router = useRouter();
  const [role, setRole] = useState<TenantRole>(initialRole);
  const [isActive, setIsActive] = useState<boolean>(initialActive);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Keystone route base
  const apiBase = `/api/${tenantId}/settings/users/${userId}`;

  function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        setError(data?.error || `Error ${res.status}`);
        return;
      }
      router.refresh();
    });
  }

  function onRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TenantRole;
    setRole(next);
    patch({ role: next }); // auto-save
  }

  function onToggleActive(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setIsActive(next);
    patch({ isActive: next }); // auto-save
  }

  async function onDelete() {
    setError(null);
    const confirmed = window.confirm(
      "Soft delete this user? They will be removed from the list (membership marked deleted) and an audit entry will be recorded."
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await fetch(apiBase, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        setError(data?.error || `Error ${res.status}`);
        return;
      }
      // Back to Users settings list
      router.push(`/${tenantId}/settings`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-1 text-sm font-medium">Status</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          {isActive ? "Active" : "Inactive"} — toggle to {isActive ? "deactivate" : "activate"} this user
        </p>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={isActive}
            onChange={onToggleActive}
            disabled={busy}
          />
          <span>{isActive ? "On" : "Off"}</span>
        </label>
      </section>

      {/* Role */}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-1 text-sm font-medium">Role</h3>
        <p className="mb-3 text-sm text-muted-foreground">Changes save automatically</p>
        <select
          className="min-w-[12rem] rounded-md border px-2 py-1"
          value={role}
          onChange={onRoleChange}
          disabled={disableRoleChange || busy}
        >
          {allowedRoles.includes("TENANT_ADMIN") && <option value="TENANT_ADMIN">Tenant Admin</option>}
          {allowedRoles.includes("MANAGER") && <option value="MANAGER">Manager</option>}
          {allowedRoles.includes("MEMBER") && <option value="MEMBER">Member</option>}
        </select>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-1 text-sm font-medium">Delete user</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Soft delete only: membership is marked deleted and hidden from lists.
        </p>
        <Button variant="destructive" onClick={onDelete} disabled={busy}>
          Delete
        </Button>
      </section>

      {error && (
        <p className="rounded-md border p-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
