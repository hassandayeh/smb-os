import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import PrettyJson from "../PrettyJson";

export const dynamic = "force-dynamic";

export default async function AuditDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const id = params.id;

  const log = await prisma.auditLog.findUnique({
    where: { id },
  });

  if (!log) return notFound();

  // Rebuild a "back" link that preserves any filters/page from the list.
  const backParams = new URLSearchParams();
  const allowed = ["tenantId", "action", "from", "to", "page"];
  for (const key of allowed) {
    const v = searchParams?.[key];
    if (typeof v === "string" && v) backParams.set(key, v);
  }
  const backHref =
    backParams.toString().length > 0
      ? `/admin/audit?${backParams.toString()}`
      : "/admin/audit";

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit Log Entry</h1>
        <Link href={backHref} className="underline hover:no-underline">
          ← Back to list
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="mb-2 text-sm text-muted-foreground">ID</div>
          <div className="font-mono text-sm">{log.id}</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-2 text-sm text-muted-foreground">Time</div>
          <div className="text-sm">
            {new Date(log.createdAt).toLocaleString()}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-2 text-sm text-muted-foreground">Tenant</div>
          <div className="font-mono text-sm">{log.tenantId}</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-2 text-sm text-muted-foreground">Actor</div>
          <div className="font-mono text-sm">{log.actorUserId ?? "—"}</div>
        </div>

        <div className="rounded-lg border p-4 md:col-span-2">
          <div className="mb-2 text-sm text-muted-foreground">Action</div>
          <div className="font-mono text-sm">{log.action}</div>
        </div>

        <div className="md:col-span-2">
          <PrettyJson value={log.metaJson as any} />
        </div>
      </div>
    </div>
  );
}
