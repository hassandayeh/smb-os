// src/app/[tenantId]/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hasModuleAccess, getActorLevel } from "@/lib/access";
import { getCurrentUserId } from "@/lib/current-user";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Workspace" };

export default async function TenantHomePage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { tenantId } = params;

  // Who's viewing?
  const userId = await getCurrentUserId();

  // Resolve Keystone actor level once (centralized logic, no ad-hoc rules)
  const actorLevel = userId ? await getActorLevel(userId, tenantId) : null;
  const canSeeSettings =
    actorLevel === "L1" || actorLevel === "L2" || actorLevel === "L3";

  // Tenant-level enabled modules
  const tenantEnts = await prisma.entitlement.findMany({
    where: { tenantId, isEnabled: true },
    select: { moduleKey: true },
  });
  const enabledKeys = tenantEnts.map((e) => e.moduleKey);

  // Filter to modules THIS user can access
  const checks = await Promise.all(
    enabledKeys.map((moduleKey) =>
      hasModuleAccess({ userId, tenantId, moduleKey }).then((d) => ({
        moduleKey,
        allowed: d.allowed,
      }))
    )
  );
  const accessibleKeys = checks.filter((c) => c.allowed).map((c) => c.moduleKey);

  // Only show modules that actually exist as implemented routes today.
  const implemented = new Set(["inventory", "invoices"]);
  const usableKeys = accessibleKeys.filter((k) => implemented.has(k));

  // Get display names for those modules
  const modules = await prisma.module.findMany({
    where: { key: { in: usableKeys } },
    select: { key: true, name: true, description: true },
    orderBy: { key: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Choose a module to get started.
        </p>
      </div>

      {modules.length === 0 && !canSeeSettings ? (
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground">
              You don’t have access to any modules yet. Please contact your
              administrator.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Module cards */}
          {modules.map((m) => (
            <Card key={m.key} className="rounded-2xl hover:shadow">
              <CardContent className="p-5 space-y-2">
                <div className="text-base font-medium">{m.name || m.key}</div>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {m.description || "Module"}
                </div>
                <div className="pt-2">
                  <Link
                    href={`/${tenantId}/${m.key}`}
                    className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
                  >
                    Open
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Keystone-controlled Settings tile (visible to L1/L2/L3 only) */}
          {canSeeSettings && (
            <Card className="rounded-2xl hover:shadow">
              <CardContent className="p-5 space-y-2">
                <div className="text-base font-medium">Settings</div>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  Workspace users & roles
                </div>
                <div className="pt-2">
                  <Link
                    href={`/${tenantId}/settings`}
                    className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
                  >
                    Open
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
