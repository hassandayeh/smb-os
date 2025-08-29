// src/app/admin/audit/[id]/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import CopyJson from "@/components/CopyJson"; // expects { text: string; targetId?: string }

type EntMeta = {
  moduleKey?: string;
  before?: { isEnabled?: boolean | null } | null;
  after?: { isEnabled?: boolean | null } | null;
};

function toBoolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function label(v: boolean | null): "ON" | "OFF" | "—" {
  if (v === true) return "ON";
  if (v === false) return "OFF";
  return "—";
}

function formatEntitlementAction(meta: EntMeta | null | undefined): string {
  if (!meta) return "Entitlement updated";
  const moduleKey = meta.moduleKey ?? "—";
  const before = toBoolOrNull(meta.before?.isEnabled);
  const after = toBoolOrNull(meta.after?.isEnabled);
  if (before === null && after === null) {
    return `Entitlement updated: ${moduleKey}`;
  }
  return `Entitlement updated: ${moduleKey} (${label(before)} → ${label(after)})`;
}

function safeParseMeta(metaJson: unknown): EntMeta | null {
  try {
    if (!metaJson) return null;
    if (typeof metaJson === "string") return JSON.parse(metaJson);
    if (typeof metaJson === "object") return metaJson as EntMeta;
    return null;
  } catch {
    return null;
  }
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export const dynamic = "force-dynamic";

export default async function AuditEntryPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;

  // Load audit entry (no relation includes → avoids TS relation-name issues)
  const entry = await prisma.auditLog.findUnique({
    where: { id },
    select: {
      id: true,
      action: true,
      createdAt: true,
      metaJson: true,
      tenantId: true,
      actorUserId: true,
    },
  });

  if (!entry) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <Link
            href="/admin/audit"
            className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to list
          </Link>
        </div>
        <h1 className="text-xl font-semibold">Audit entry not found</h1>
      </div>
    );
  }

  // Look up display names
  const [tenant, actor] = await Promise.all([
    entry.tenantId
      ? prisma.tenant.findUnique({
          where: { id: entry.tenantId },
          select: { name: true },
        })
      : Promise.resolve(null),
    entry.actorUserId
      ? prisma.user.findUnique({
          where: { id: entry.actorUserId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const meta = safeParseMeta(entry.metaJson);
  const actionLine = (entry.action ?? "").toLowerCase().startsWith("entitlement")
    ? formatEntitlementAction(meta)
    : entry.action ?? "—";

  // ✅ Prepare pretty string once; reuse for CopyJson + <pre>
  const prettyMeta =
    typeof entry.metaJson === "string"
      ? entry.metaJson
      : JSON.stringify(entry.metaJson, null, 2);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-end">
        <Link
          href="/admin/audit"
          className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Back to list
        </Link>
      </div>

      <h1 className="text-2xl font-bold">
        Audit Entry — {tenant?.name ?? "—"}
      </h1>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground mb-1">ID</div>
          <div className="font-mono break-all text-sm">{entry.id}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground mb-1">Tenant</div>
          <div className="text-sm">{tenant?.name ?? entry.tenantId ?? "—"}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground mb-1">Action</div>
          <div className="text-sm">{actionLine}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground mb-1">Actor</div>
          <div className="text-sm">{actor?.name ?? entry.actorUserId ?? "—"}</div>
        </div>

        <div className="rounded-xl border p-4 md:col-span-2">
          <div className="text-xs text-muted-foreground mb-1">Created</div>
          <div className="text-sm">{fmtDate(entry.createdAt)}</div>
        </div>
      </div>

      {/* metaJson viewer */}
      <div className="rounded-xl border">
        <details open className="p-4">
          <summary className="cursor-pointer text-sm font-medium">
            metaJson
          </summary>

          {/* ✅ Copy JSON button (uses text prop) */}
          <div className="mt-3">
            <CopyJson text={prettyMeta} />
          </div>

          {/* Pretty JSON */}
          <pre className="mt-3 overflow-auto rounded-lg bg-muted p-4 text-sm">
{prettyMeta}
          </pre>
        </details>
      </div>
    </div>
  );
}
