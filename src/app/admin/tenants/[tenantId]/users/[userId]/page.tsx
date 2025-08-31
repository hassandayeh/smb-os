// src/app/admin/tenants/[tenantId]/users/[userId]/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import SubmitButton from "@/components/SubmitButton";
import RoleSelect from "./RoleSelect";
import ConfirmDeleteButton from "./ConfirmDeleteButton";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d?.toString() ?? "—";
  }
}

export default async function ManageTenantUserPage({
  params,
  searchParams,
}: {
  params: { tenantId: string; userId: string };
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const { tenantId, userId } = params;

  // Keep module list in sync with your app
  const MODULE_KEYS = ["inventory", "invoices"] as const;

  // Preserve back links (q/sort)
  const sp = searchParams ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "";
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (sort) qs.set("sort", sort);
  const qsStr = qs.toString();

  const backToUsers = qsStr
    ? `/admin/tenants/${tenantId}/users?${qsStr}`
    : `/admin/tenants/${tenantId}/users`;
  const backToTenant = qsStr
    ? `/admin/tenants/${tenantId}?${qsStr}`
    : `/admin/tenants/${tenantId}`;
  const currentUrl = qsStr
    ? `/admin/tenants/${tenantId}/users/${userId}?${qsStr}`
    : `/admin/tenants/${tenantId}/users/${userId}`;

  // Load tenant + user + membership + entitlements
  const [tenant, user, membership, entRows] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.tenantMembership.findFirst({
      where: { tenantId, userId },
      select: { id: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    }),
    prisma.userEntitlement.findMany({
      where: { tenantId, userId, moduleKey: { in: [...MODULE_KEYS] } },
      select: { moduleKey: true, isEnabled: true },
    }),
  ]);

  // Entitlements lookup for the Access section
  const entMap = MODULE_KEYS.reduce((acc, mk) => {
    acc[mk] = undefined as boolean | undefined;
    return acc;
  }, {} as Record<(typeof MODULE_KEYS)[number], boolean | undefined>);
  for (const e of entRows) {
    if (MODULE_KEYS.includes(e.moduleKey as any)) {
      entMap[e.moduleKey as (typeof MODULE_KEYS)[number]] = e.isEnabled;
    }
  }

  const isActive = membership?.isActive ?? true;

  return (
    <div className="p-6 space-y-6">
      {/* Header / breadcrumbs */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Manage user</h1>
          <div className="text-sm text-muted-foreground">
            Tenant: <span className="font-medium">{tenant?.name ?? tenantId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Admin Console
          </Link>
          <Link
            href={backToUsers}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Back to users
          </Link>
          <Link
            href={backToTenant}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Manage Tenant
          </Link>
        </div>
      </div>

      {/* Summary (Status chip replaces Access) */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Name</div>
              <div className="font-medium">{user?.name ?? "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="font-medium">{user?.email ?? "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Created</div>
              <div className="font-medium">{fmtDate(user?.createdAt)}</div>
            </div>

            {/* Status chip (bigger; red when inactive) */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Status</div>
              <span
                className={[
                  "inline-flex items-center rounded-full border px-3 py-1 text-sm",
                  isActive
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-rose-300 bg-rose-50 text-rose-700",
                ].join(" ")}
              >
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account controls (role autosaves, no textbox status, only toggle button) */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Account</div>
            <div className="text-xs text-muted-foreground">
              Role & status for this user in this tenant
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Role — autosubmit on change */}
            <RoleSelect
              action={`/api/admin/tenants/${tenantId}/users/${userId}`}
              defaultValue={String(membership?.role ?? "MEMBER") as any}
              redirectTo={currentUrl}
            />

            {/* Activate / Deactivate (only the button) */}
            <form
              action={`/api/admin/tenants/${tenantId}/users/${userId}`}
              method="POST"
              className="flex items-end gap-3"
            >
              <input type="hidden" name="isActive" value={String(!isActive)} />
              <input type="hidden" name="redirectTo" value={currentUrl} />
              <SubmitButton className="h-9 px-4 rounded-md border text-sm">
                {isActive ? "Deactivate" : "Activate"}
              </SubmitButton>
            </form>
          </div>

          {/* Preview / Clear preview */}
          <div className="flex items-center gap-2">
            <form action="/api/dev/preview-user" method="POST">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="redirectTo" value={currentUrl} />
              <button
                type="submit"
                className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
                title={`Preview as ${user?.name || user?.email || userId}`}
              >
                Preview as
              </button>
            </form>
            <Link
              href={`/api/dev/preview-user?action=clear&redirectTo=${encodeURIComponent(
                currentUrl
              )}`}
              className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
            >
              Clear preview
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Access controls (per-user overrides) */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Access (per-user overrides)</div>
            <div className="text-xs text-muted-foreground">
              These override the tenant-level entitlements for this user
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(MODULE_KEYS as readonly string[]).map((mk) => {
              const current = entMap[mk as (typeof MODULE_KEYS)[number]];
              const isOn = current === true;
              const next = !isOn;
              const label = mk.charAt(0).toUpperCase() + mk.slice(1);
              return (
                <form
                  key={mk}
                  action={`/api/admin/tenants/${tenantId}/users/${userId}/entitlements`}
                  method="POST"
                >
                  <input type="hidden" name="moduleKey" value={mk} />
                  <input type="hidden" name="isEnabled" value={String(next)} />
                  <input type="hidden" name="redirectTo" value={currentUrl} />
                  <button
                    className={[
                      "inline-flex h-8 items-center rounded-md border px-3 text-xs",
                      isOn
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                        : "hover:bg-muted",
                    ].join(" ")}
                    title={
                      isOn ? `Disable ${label} for this user` : `Enable ${label} for this user`
                    }
                  >
                    {label}: {current === undefined ? "—" : isOn ? "ON" : "OFF"}
                  </button>
                </form>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="rounded-2xl border-red-200">
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-medium text-red-700">Danger zone</div>
          <div className="flex flex-wrap gap-2">
            <ConfirmDeleteButton
              action={`/api/admin/tenants/${tenantId}/users/${userId}`}
              redirectTo={`/admin/tenants/${tenantId}/users`}
            />
            <button
              disabled
              className="inline-flex h-8 items-center rounded-md border px-3 text-xs opacity-60 cursor-not-allowed"
              title="Coming soon"
            >
              Reset password
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Deleting removes this user from the tenant (membership + per-user overrides). Historical
            audit records remain intact.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
