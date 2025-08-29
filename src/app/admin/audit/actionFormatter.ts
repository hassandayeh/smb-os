// src/app/admin/audit/actionFormatter.ts
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

/** Format Audit “Action” with ON/OFF if it’s an entitlement change. */
export function formatAuditAction(
  action: string | null | undefined,
  metaJson: unknown
): string {
  const a = (action ?? "").trim();
  if (!a) return "—";
  if (!a.toLowerCase().startsWith("entitlement")) return a;

  const meta = safeParseMeta(metaJson);
  if (!meta) return a;

  const moduleKey = meta.moduleKey ?? "—";
  const before = toBoolOrNull(meta.before?.isEnabled);
  const after = toBoolOrNull(meta.after?.isEnabled);

  if (before === null && after === null) {
    return `Entitlement updated: ${moduleKey}`;
  }
  return `Entitlement updated: ${moduleKey} (${label(before)} → ${label(after)})`;
}
