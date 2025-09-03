// src/app/[tenantId]/settings/users/[userId]/ManageUserClient.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type TenantRole = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

type Props = {
  tenantId: string;
  userId: string;

  /** Current values */
  initialRole: TenantRole;
  initialActive: boolean;

  /** Guard-driven UI constraints (server decides; UI respects) */
  allowedRoles: TenantRole[];        // which roles can the actor set on this target
  disableRoleChange: boolean;        // hard block role changes (peer/self rules already checked on server)

  /** Optional: fine-grained disables for other actions (default false = allowed) */
  canToggleStatus?: boolean;         // if false, the toggle is disabled (UI only; server still enforces)
  canDeleteUser?: boolean;           // if false, delete is disabled (UI only; server still enforces)
};

export default function ManageUserClient(props: Props) {
  const {
    tenantId,
    userId,
    initialRole,
    initialActive,
    allowedRoles,
    disableRoleChange,
    canToggleStatus = true,
    canDeleteUser = true,
  } = props;

  const router = useRouter();
  const [role, setRole] = useState<TenantRole>(initialRole);
  const [isActive, setIsActive] = useState<boolean>(initialActive);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // NOTE: Keeping your existing consolidated route as-is per golden rules.
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

  const roleOptions: TenantRole[] = ["TENANT_ADMIN", "MANAGER", "MEMBER"];
  const visibleRoleOptions = roleOptions.filter((r) => allowedRoles.includes(r));

  return (
    <div className="space-y-8">
      {/* Status */}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-1 text-base font-semibold">Status</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {isActive ? "Active" : "Inactive"} — toggle to {isActive ? "deactivate" : "activate"} this user
        </p>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={onToggleActive}
            disabled={busy || !canToggleStatus}
          />
          <span className="text-sm">{isActive ? "On" : "Off"}</span>
        </label>
      </section>

      {/* Role */}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-1 text-base font-semibold">Role</h3>
        <p className="mb-4 text-sm text-muted-foreground">Changes save automatically</p>

        <div className="flex items-center gap-3">
          <select
            value={role}
            onChange={onRoleChange}
            disabled={busy || disableRoleChange || visibleRoleOptions.length === 0}
            className="min-w-[12rem]"
          >
            {visibleRoleOptions.map((r) => (
              <option key={r} value={r}>
                {r === "TENANT_ADMIN" ? "Tenant Admin" : r === "MANAGER" ? "Manager" : "Member"}
              </option>
            ))}
          </select>
          {visibleRoleOptions.length === 0 && (
            <span className="text-xs text-muted-foreground">You can’t change this user’s role.</span>
          )}
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-1 text-base font-semibold text-red-600">Delete user</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Soft delete only: membership is marked deleted and hidden from lists.
        </p>

        <Button
          variant="destructive"
          onClick={onDelete}
          disabled={busy || !canDeleteUser}
        >
          Delete
        </Button>

        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
