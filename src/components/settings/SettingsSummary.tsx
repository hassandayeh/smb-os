// src/components/settings/SettingsSummary.tsx
"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { ViewerKind, LevelKind, SettingsCapabilities } from "@/lib/guard-tenant-settings";

/** Props for the shared (read-only for now) settings view */
export interface SettingsSummaryProps {
  tenantName: string;
  status: "ACTIVE" | "SUSPENDED" | string;
  activatedUntil: string | null; // ISO string or null
  defaultLocale: string; // e.g. "en" | "ar" | "de"
  viewer: ViewerKind; // "platform" | "tenant"
  level: LevelKind;   // "L1" | "L2" | "L3" | "L4" | "L5"
  caps: SettingsCapabilities;
  headerActions?: ReactNode;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    const date = new Date(d);
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  } catch {
    return d ?? "—";
  }
}

/**
 * Reusable, Level-aware settings summary.
 * - Shared by Platform (/admin/tenants/[id]/settings) and Tenant (/[tenantId]/settings)
 * - Per-Level capability matrix in `caps` drives which sections we show later.
 */
export default function SettingsSummary(props: SettingsSummaryProps) {
  const {
    tenantName,
    status,
    activatedUntil,
    defaultLocale,
    viewer,
    level,
    caps,
    headerActions,
  } = props;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            {viewer === "platform"
              ? "Platform view of tenant configuration."
              : "Tenant view of your workspace configuration."}
          </p>
          <div className="mt-2 text-xs text-muted-foreground">
            Level: <span className="font-medium text-foreground">{level}</span>
          </div>
        </div>
        {headerActions && <div className="flex-none">{headerActions}</div>}
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-4">
          <SectionRow label="Tenant name" value={tenantName} />
          <SectionRow label="Status">
            <StatusChip status={status} />
          </SectionRow>
          <SectionRow label="Activated until" value={fmtDate(activatedUntil)} />
          <SectionRow label="Default locale" value={defaultLocale} />
        </CardContent>
      </Card>

      {/* Capability preview (temporary): shows what this Level can do.
          We'll replace with actual sections in the next step. */}
      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-4">
          <div className="text-sm font-medium">Capabilities</div>
          <CapsList caps={caps} />
        </CardContent>
      </Card>
    </div>
  );
}

function SectionRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="sm:col-span-2 text-sm">
        {children ?? <span className="text-foreground">{value}</span>}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const isActive = status?.toUpperCase?.() === "ACTIVE";
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
  const on = "bg-emerald-50 text-emerald-700 ring-emerald-200";
  const off = "bg-rose-50 text-rose-700 ring-rose-200";
  return <span className={`${base} ${isActive ? on : off}`}>{status}</span>;
}

function CapsList({ caps }: { caps: SettingsCapabilities }) {
  const items: Array<{ label: string; on: boolean }> = [
    { label: "Edit basics", on: caps.canEditBasics },
    { label: "Apply presets", on: caps.canApplyPresets },
    { label: "Advanced management", on: caps.canManageAdvanced },
    { label: "Platform-only sections", on: caps.canSeePlatformOnly },
  ];
  return (
    <ul className="text-sm space-y-1">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          <Dot on={it.on} />
          <span className="text-muted-foreground">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

function Dot({ on }: { on: boolean }) {
  const base = "h-2.5 w-2.5 rounded-full ring-1 ring-inset";
  const yes = "bg-emerald-500 ring-emerald-600";
  const no = "bg-slate-300 ring-slate-400";
  return <span className={`${base} ${on ? yes : no}`} />;
}
