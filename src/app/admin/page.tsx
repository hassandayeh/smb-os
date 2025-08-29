import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminIndex() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-semibold">Admin Console</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Audit Log */}
        <Link
          href="/admin/audit"
          className="rounded-xl border p-4 transition-colors hover:bg-muted/40"
        >
          <div className="mb-1 text-sm text-muted-foreground">Monitoring</div>
          <div className="text-base font-medium">Audit Log</div>
          <p className="mt-1 text-sm text-muted-foreground">
            View actions taken across tenants. Filter by tenant, action, or date.
          </p>
        </Link>

        {/* Tenants (tenant-centric management) */}
        <Link
          href="/admin/tenants"
          className="rounded-xl border p-4 transition-colors hover:bg-muted/40"
        >
          <div className="mb-1 text-sm text-muted-foreground">Directory</div>
          <div className="text-base font-medium">Tenants</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage tenants, activation dates, and details.
          </p>
        </Link>

        {/* Modules (module-centric management; routes to /admin/entitlements) */}
        <Link
          href="/admin/entitlements"
          className="rounded-xl border p-4 transition-colors hover:bg-muted/40"
        >
          <div className="mb-1 text-sm text-muted-foreground">Access</div>
          <div className="text-base font-medium">Modules</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage tenant access by module.
          </p>
        </Link>
      </div>
    </div>
  );
}
