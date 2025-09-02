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
  const { tenantId, userId, initialRole, initialActive, allowedRoles, disableRoleChange } = props;
  const router = useRouter();
  const [role, setRole] = useState<TenantRole>(initialRole);
  const [isActive, setIsActive] = useState<boolean>(initialActive);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/tenants/${tenantId}/users/${userId}`, {
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
    patch({ role: next });
  }

  function onToggleActive(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setIsActive(next);
    patch({ isActive: next });
  }

  async function onDelete() {
    setError(null);
    const confirmed = window.confirm(
      "Soft delete this user from the tenant? They will be deactivated (not removed)."
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await fetch(`/api/tenants/${tenantId}/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        setError(data?.error || `Error ${res.status}`);
        return;
      }
      router.push(`/${tenantId}/settings`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <div className="text-sm font-medium">Status</div>
          <div className="text-xs text-muted-foreground">
            {isActive ? "Active" : "Inactive"} — toggle to {isActive ? "deactivate" : "activate"} this user
          </div>
        </div>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={onToggleActive}
            disabled={busy}
            aria-label="Activate or deactivate"
            className="h-4 w-4 accent-blue-600"
          />
          <span className="text-sm">{isActive ? "On" : "Off"}</span>
        </label>
      </div>

      {/* Role */}
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <div className="text-sm font-medium">Role</div>
          <div className="text-xs text-muted-foreground">Changes save automatically</div>
        </div>
        <div>
          <select
            value={role}
            onChange={onRoleChange}
            disabled={busy || disableRoleChange || allowedRoles.length === 0}
            className="h-9 min-w-[12rem] rounded-md border bg-white px-3 text-sm"
            aria-label="Select role"
          >
            {allowedRoles.includes("TENANT_ADMIN") && (
              <option value="TENANT_ADMIN">Tenant Admin</option>
            )}
            {allowedRoles.includes("MANAGER") && <option value="MANAGER">Manager</option>}
            {allowedRoles.includes("MEMBER") && <option value="MEMBER">Member</option>}
          </select>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Delete user</div>
            <div className="text-xs text-muted-foreground">
              Soft delete only: deactivates membership in this tenant.
            </div>
          </div>
          <Button onClick={onDelete} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">
            Delete
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
