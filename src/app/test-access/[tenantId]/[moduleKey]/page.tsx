// src/app/test-access/[tenantId]/[moduleKey]/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

// TEMP: best-effort dev resolver (replace with real auth later)
async function getDevUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return u?.id ?? null;
}

export default async function TestAccessPage({
  params,
}: {
  params: { tenantId: string; moduleKey: string };
}) {
  const { tenantId, moduleKey } = params;
  const userId = await getDevUserId();

  try {
    await requireAccess({ userId, tenantId, moduleKey });
  } catch (err: any) {
    const reason = (err as any)?.reason ?? "forbidden";
    redirect(`/forbidden?reason=${encodeURIComponent(reason)}`);
  }

  return (
    <main className="mx-auto max-w-xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Access OK</h1>
      <p className="text-sm text-muted-foreground">
        You have access to <strong>{moduleKey}</strong> in tenant{" "}
        <code className="px-1 py-0.5 rounded bg-muted">{tenantId}</code>.
      </p>
      <p className="text-xs text-muted-foreground">
        (Temporary test surface. We’ll wire real pages next.)
      </p>
    </main>
  );
}
