// src/app/admin/audit/[id]/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import CopyJson from "@/components/CopyJson";


function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return d?.toString() ?? "—";
  }
}

async function getAudit(id: string) {
  return prisma.auditLog.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      actorUserId: true,
      action: true,
      metaJson: true,
      createdAt: true,
    },
  });
}

export default async function AuditDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { id } = params;
  const q = (searchParams?.q as string) || undefined;
  const tenant = (searchParams?.tenant as string) || undefined;
  const action = (searchParams?.action as string) || undefined;
  const date = (searchParams?.date as string) || undefined;

  const audit = await getAudit(id);

  if (!audit) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Audit Entry</h1>
        <p className="text-red-600">Audit entry not found.</p>
        <Link
          href={{
            pathname: "/admin/audit",
            query: { q, tenant, action, date },
          }}
          className="underline"
        >
          Back to list
        </Link>
      </div>
    );
  }

  const metaPretty =
    typeof audit.metaJson === "string"
      ? audit.metaJson
      : JSON.stringify(audit.metaJson ?? null, null, 2);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit Entry</h1>
        <Link
          href={{
            pathname: "/admin/audit",
            query: { q, tenant, action, date },
          }}
          className="text-sm underline"
        >
          Back to list
        </Link>
      </div>

      <div className="grid gap-3 max-w-3xl">
        <div className="rounded-lg border p-4">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <div className="text-gray-500">ID</div>
              <div className="font-mono break-all">{audit.id}</div>
            </div>
            <div>
              <div className="text-gray-500">Tenant</div>
              <div className="font-mono break-all">{audit.tenantId ?? "—"}</div>
            </div>
            <div>
              <div className="text-gray-500">Action</div>
              <div>{audit.action}</div>
            </div>
            <div>
              <div className="text-gray-500">Actor</div>
              <div className="font-mono break-all">
                {audit.actorUserId ?? "—"}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-gray-500">Created</div>
              <div>{fmtDate(audit.createdAt)}</div>
            </div>
          </div>
        </div>

        <details className="rounded-lg border p-4" open>
          <summary className="cursor-pointer text-sm font-medium mb-2">
            metaJson
          </summary>

          <CopyJson text={metaPretty} targetId="meta-json" />

          <pre
            id="meta-json"
            className="whitespace-pre-wrap break-words rounded-md border bg-gray-50 p-3 text-xs"
          >
            {metaPretty}
          </pre>
        </details>
      </div>
    </div>
  );
}
