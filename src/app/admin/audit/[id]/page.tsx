// src/app/admin/audit/[id]/page.tsx
import CopyJson from "@/components/CopyJson";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

function friendlyAction(action: string) {
  const map: Record<string, string> = {
    "entitlement.update": "Entitlement updated",
    "tenant.create": "Tenant created",
    "tenant.update": "Tenant updated",
    "tenant.activate": "Activation extended",
  };
  return map[action] ?? action;
}

function summarize(action: string, meta: any): string | null {
  // Add small summaries for common actions
  if (action === "entitlement.update" && meta) {
    const mk = meta.moduleKey ?? "—";
    const enabled =
      typeof meta.isEnabled === "boolean" ? (meta.isEnabled ? "ON" : "OFF") : "—";
    return `Entitlement updated: ${mk} → ${enabled}`;
  }
  if (action === "tenant.update" && meta?.changes) {
    try {
      const changed = Object.keys(meta.changes as object);
      if (changed.length) return `Tenant fields updated: ${changed.join(", ")}`;
    } catch {}
  }
  if (action === "tenant.create" && meta?.tenantName) {
    return `Tenant created: ${meta.tenantName}`;
  }
  if (action === "tenant.activate" && meta?.activatedUntil) {
    return `Activation extended to ${meta.activatedUntil}`;
  }
  return null;
}

export default async function AuditEntryPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const id = params.id;

  const entry = await prisma.auditLog.findUnique({
    where: { id },
  });

  if (!entry) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Audit Entry</h1>
          <Link href="/admin/audit">
            <Button variant="secondary">Back to list</Button>
          </Link>
        </div>
        <div className="text-muted-foreground">Entry not found.</div>
      </div>
    );
  }

  // Load tenant (name) and actor (display)
  const [tenant, actor] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: entry.tenantId },
      select: { id: true, name: true },
    }),
    entry.actorUserId
      ? prisma.user.findUnique({
          where: { id: entry.actorUserId },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve(null),
  ]);

  const titleTenant = tenant?.name || tenant?.id || entry.tenantId || "—";
  const meta =
    typeof entry.metaJson === "object" ? entry.metaJson : (null as any);
  const friendly = summarize(entry.action, meta) ?? friendlyAction(entry.action);

  // Preserve filters in Back button if present
  const q = new URLSearchParams();
  const keys = ["tenantId", "action", "from", "to"];
  keys.forEach((k) => {
    const v = searchParams[k];
    if (typeof v === "string" && v) q.set(k, v);
  });
  const backHref = `/admin/audit${q.toString() ? `?${q.toString()}` : ""}`;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit Entry — {titleTenant}</h1>
        <Link href={backHref}>
          <Button variant="secondary">Back to list</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">ID</div>
          <div className="font-mono">{entry.id}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Tenant</div>
          <div>{tenant?.name || "—"}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Action</div>
          <div>{friendly}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Actor</div>
          <div>{actor?.name || actor?.email || "—"}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Created</div>
          <div>{fmtDate(entry.createdAt)}</div>
        </div>
      </div>

{/* Raw meta JSON */}
<div className="border rounded-lg p-4 space-y-3">
  <details open>
    <summary className="cursor-pointer font-medium">metaJson</summary>
    <CopyJson text={JSON.stringify(entry.metaJson, null, 2)} targetId="meta" />
    <pre
      id="meta"
      className="mt-3 bg-muted/40 rounded p-3 overflow-auto text-sm"
    >
{JSON.stringify(entry.metaJson, null, 2)}
    </pre>
  </details>
</div>

      {/* Tiny client script to support Copy JSON without extra components */}
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
          (function(){
            const btn = document.currentScript?.previousElementSibling?.querySelector('button');
            const pre = document.currentScript?.previousElementSibling?.querySelector('pre');
            if(btn && pre){
              btn.addEventListener('click', async () => {
                try {
                  await navigator.clipboard.writeText(pre.textContent || '');
                  btn.textContent = 'Copied';
                  setTimeout(()=>btn.textContent='Copy JSON', 1000);
                } catch {}
              });
            }
          })();
        `,
        }}
      />
    </div>
  );
}
