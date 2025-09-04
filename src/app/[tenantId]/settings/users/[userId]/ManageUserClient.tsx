// src/app/[tenantId]/settings/users/[userId]/ManageUserClient.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

// Optional toast support: if your project exposes a toast hook,
// we use it; otherwise we no-op (no extra deps introduced).
let useToast:
  | undefined
  | (() => {
      toast: (opts: {
        title?: string;
        description?: string;
        variant?: "default" | "destructive" | "success";
      }) => void;
    });
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useToast = require("@/components/ui/use-toast").useToast;
} catch {
  /* noop if not present */
}

type TenantRole = "TENANT_ADMIN" | "MANAGER" | "MEMBER";

type Props = {
  tenantId: string;
  userId: string;

  /** Current values (server-provided) */
  initialRole: TenantRole;
  initialActive: boolean;

  /** Guard-driven UI constraints (server decides; UI respects) */
  allowedRoles: TenantRole[]; // which roles can the actor set on this target
  disableRoleChange: boolean; // hard block role changes (peer/self rules already checked on server)

  /** Optional: fine-grained disables for other actions (default false = allowed) */
  canToggleStatus?: boolean; // if false, the toggle is disabled (UI only; server still enforces)
  canDeleteUser?: boolean; // if false, delete is disabled (UI only; server still enforces)
};

/** API helpers (kept simple and DB-neutral) */
async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as any;
    throw new Error(data?.error || `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as any;
    throw new Error(data?.error || `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

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
  const sp = useSearchParams();
  const toastApi = useToast ? useToast() : null;

  // === Existing state (Role/Status) ===
  const [role, setRole] = useState<TenantRole>(initialRole);
  const [isActive, setIsActive] = useState<boolean>(initialActive);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // NOTE: Keeping your existing consolidated route as-is per golden rules.
  const apiBase = useMemo(
    () => `/api/${tenantId}/settings/users/${userId}`,
    [tenantId, userId]
  );

  function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
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
      } catch (e: any) {
        setError(e?.message || "Network error");
      }
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
      // (i18n later) Soft delete confirmation
      "Soft delete this user? They will be removed from the list (membership marked deleted) and an audit entry will be recorded."
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const res = await fetch(apiBase, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as any;
          setError(data?.error || `Error ${res.status}`);
          return;
        }
        // Back to Users settings list
        router.push(`/${tenantId}/settings`);
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "Network error");
      }
    });
  }

  const roleOptions: TenantRole[] = ["TENANT_ADMIN", "MANAGER", "MEMBER"];
  const visibleRoleOptions = roleOptions.filter((r) => allowedRoles.includes(r));

  // === Supervisor (Manager) mapping section (for L5 only) ===
  type SupervisorPayload = {
    supervisor: {
      currentId: string | null;
      candidates: Array<{ id: string; name: string }>;
      canAssign: boolean;
    };
  };

  const isMember = role === "MEMBER";

  const [mgrLoading, setMgrLoading] = useState(false);
  const [mgrSaving, setMgrSaving] = useState(false);
  const [mgrError, setMgrError] = useState<string | null>(null);
  const [currentSupervisorId, setCurrentSupervisorId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string }>>([]);
  const [canAssign, setCanAssign] = useState(false);

  useEffect(() => {
    if (!isMember) return; // Only for L5
    let cancelled = false;
    const run = async () => {
      setMgrLoading(true);
      setMgrError(null);
      try {
        const data = await fetchJSON<SupervisorPayload>(
          `/api/admin/tenants/supervisor?tenantId=${encodeURIComponent(
            tenantId
          )}&userId=${encodeURIComponent(userId)}`
        );
        if (cancelled) return;
        setCurrentSupervisorId(data.supervisor.currentId);
        setCandidates(data.supervisor.candidates);
        setCanAssign(data.supervisor.canAssign);
      } catch (e: any) {
        if (!cancelled) setMgrError(e?.message || "Failed to load manager info");
      } finally {
        if (!cancelled) setMgrLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [tenantId, userId, isMember]);

  async function onSupervisorChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextId = e.target.value || null; // "" -> null (clear)
    setMgrError(null);
    setMgrSaving(true);
    try {
      const data = await postJSON<{ ok: true; supervisorId: string | null }>(
        `/api/admin/tenants/supervisor`,
        {
          tenantId,
          userId,
          supervisorId: nextId && (nextId as string).length > 0 ? nextId : null,
        }
      );

      setCurrentSupervisorId(data.supervisorId ?? null);

      // HORIZON POLISH:
      // 1) Success toast (if hook exists)
      toastApi?.toast?.({
        title: "Manager updated.", // keep existing copy to avoid churn
        variant: "success",
      });

      // 2) Trigger SavedBanner by adding ?saved=1 then refresh
      const params = new URLSearchParams(sp?.toString() || "");
      params.set("saved", "1");
      // replace current URL to avoid duplicate history entry
      router.replace(`?${params.toString()}`, { scroll: false });
      router.refresh();
    } catch (e: any) {
      setMgrError(e?.message || "Failed to update manager");
      toastApi?.toast?.({
        title: "Couldn't update manager.",
        variant: "destructive",
      });
    } finally {
      setMgrSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <section className="space-y-2">
        <h3 className="text-base font-semibold">Status</h3>
        <p className="text-sm">
          {isActive ? "Active" : "Inactive"} — toggle to {isActive ? "deactivate" : "activate"} this
          user
        </p>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={onToggleActive}
            disabled={!canToggleStatus || busy}
          />
          <span>{isActive ? "On" : "Off"}</span>
        </label>
      </section>

      {/* Role */}
      <section className="space-y-2">
        <h3 className="text-base font-semibold">Role</h3>
        <p className="text-sm">Changes save automatically</p>

        {visibleRoleOptions.length > 0 ? (
          <select
            className="rounded-lg border px-3 py-2"
            value={role}
            onChange={onRoleChange}
            disabled={disableRoleChange || busy}
          >
            {visibleRoleOptions.map((r) => (
              <option key={r} value={r}>
                {r === "TENANT_ADMIN" ? "Tenant Admin" : r === "MANAGER" ? "Manager" : "Member"}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm">You can’t change this user’s role.</p>
        )}
      </section>

      {/* Manager (Supervisor) — only for L5 Members */}
      {isMember && (
        <section className="space-y-2">
          <h3 className="text-base font-semibold">Manager</h3>
          <p className="text-sm">Assign a manager (L4) for this member. Changes save immediately.</p>

          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border px-3 py-2"
              value={currentSupervisorId ?? ""}
              onChange={onSupervisorChange}
              disabled={!canAssign || mgrLoading || mgrSaving}
            >
              {/* None option */}
              <option value="">{mgrLoading ? "Loading…" : "— None —"}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id}
                </option>
              ))}
            </select>
          </div>

          {mgrError && <p className="text-sm text-red-600">{mgrError}</p>}
        </section>
      )}

      {/* Danger zone */}
      <section className="space-y-2">
        <h3 className="text-base font-semibold">Delete user</h3>
        <p className="text-sm">
          Soft delete only: membership is marked deleted and hidden from lists.
        </p>

        <Button variant="destructive" onClick={onDelete} disabled={!canDeleteUser || busy}>
          Delete
        </Button>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}
