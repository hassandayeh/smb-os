// src/industry/presets.ts
export type IndustryKey = "pharmacy" | "factory" | "services";

export type ModuleConfig = Record<string, any>;

// Opinionated but minimal starting points.
// These are SAFE defaults; we’ll expand later in Scope 2.
export const PRESETS: Record<IndustryKey, ModuleConfig> = {
  pharmacy: {
    inventory: { requireBatches: true, pickingPolicy: "FEFO", bomEnabled: false },
    invoices: { taxMode: "vat", rounding: "line" },
    subtenants: { max: 3 },
  },
  factory: {
    inventory: { requireBatches: false, pickingPolicy: "FIFO", bomEnabled: true },
    invoices: { taxMode: "gst", rounding: "total" },
    subtenants: { max: 5 },
  },
  services: {
    inventory: { requireBatches: false, pickingPolicy: "NONE", bomEnabled: false },
    invoices: { taxMode: "none", rounding: "none" },
    subtenants: { max: 2 },
  },
};
