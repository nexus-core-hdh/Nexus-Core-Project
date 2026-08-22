// Shared "Customize Worklist" types — used by every Legacy ERP list/browser screen that offers
// Standard vs. custom-column worklists (Receipt & Master Data, Financial Receipt & Master Data,
// and the per-entity list screens). One screen's WorklistSource values are never valid on
// another screen's worklist-fields.list()/resolve() call (see worklist-fields.service.ts's
// optional `primary` scoping) and each screen persists under its own UserSettings.tablePreferences
// key, so worklists never leak across screens even though the source union is shared.
export type WorklistSource =
  | "purchase-receipt" | "yarn-card" | "fabric-card" | "current-account" | "warehouse" | "financial-receipt"
  | "trim-card" | "trim-inventory-card" | "purchase-order" | "contract" | "size-set" | "unit-set" | "inventory-card";

export interface WorklistField {
  source: WorklistSource;
  key: string;
  label: string;
}

export interface Worklist {
  id: string;
  name: string;
  fields: WorklistField[];
}

// Synthetic, never persisted — the existing default grid (Object.keys(rows[0])).
export const STANDARD_WORKLIST_ID = "standard";

// Maps the page's own table dropdown (table-config.ts's TableKey) to a worklist source, only
// where one genuinely applies — used solely for the Design modal's "Standard =>" convenience
// button. "inventory-receipt" and "purchase-receipt" are the same physical IM_Receipt rows
// (see unified-grid.service.ts's own comment), so both map to "purchase-receipt" here.
export function mapTableKeyToWorklistSource(tableKey: string): WorklistSource | undefined {
  if (tableKey === "purchase-receipt" || tableKey === "inventory-receipt") return "purchase-receipt";
  if (tableKey === "current-account") return "current-account";
  if (tableKey === "warehouse") return "warehouse";
  if (tableKey === "financial-receipt") return "financial-receipt";
  return undefined;
}

export const fieldKey = (f: Pick<WorklistField, "source" | "key">) => `${f.source}:${f.key}`;
