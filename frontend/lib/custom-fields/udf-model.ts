// User Defined Fields — the administration screen's model of a CustomField (see
// nexuscore-backend/src/modules/entities/custom-fields.service.ts for the server-side rules).
//
// Only what the runtime renders is offered: each control type below maps to one of the runtime
// types the screens' "Customized Fields" tabs render (text | textarea | email | number | date |
// checkbox | select). A dropdown's runtime value is the option LABEL; option codes are kept for
// administration only.

export type EntityCapability = "supported" | "definitions-only";
/** Screen = a record's Customized Fields tab; Grid = UDF columns of a shared detail grid. */
export type UdfLevel = "screen" | "grid";

export interface UdfEntity {
  key: string;
  label: string;
  hint: string;
  capability: EntityCapability;
  level: UdfLevel;
  /** Where the fields appear — shown in Preview on Screen. */
  screen?: string;
  /** Grid only: the screens that render this logical grid (one definition serves them all). */
  usages?: string[];
  /** Grid only: screens showing the same grid whose rows cannot hold values yet, and why. */
  unsupportedUsages?: { usage: string; reason: string }[];
}

// Supported = the runtime renders CustomField definitions for it today: a screen's "Customized
// Fields" tab, or a grid's UDF columns. Definitions only = a real ERP entity with no renderer yet;
// fields cannot be created or activated for it (the server refuses too) until one exists.
// Capability, usages and unsupported usages here are only the offline default — the screen
// replaces them with what the server's runtime registry reports (GET entities/custom-field-targets,
// see withRuntimeTargets), so "Supported" means "the runtime renders it", never merely "a
// definition can be saved".
export const UDF_ENTITIES: UdfEntity[] = [
  { key: "InventoryReceipt", label: "Inventory Receipts", hint: "Purchase, Subcontract and every other receipt type", capability: "supported", level: "screen", screen: "Inventory Receipt" },
  { key: "FiReceipt", label: "Financial Receipts", hint: "Financial receipt vouchers", capability: "supported", level: "screen", screen: "Financial Receipt" },
  { key: "YarnCard", label: "Yarn Cards", hint: "Yarn inventory cards", capability: "supported", level: "screen", screen: "Yarn Card" },
  { key: "StyleCard", label: "Style Cards", hint: "PLM style cards", capability: "supported", level: "screen", screen: "Style Card" },
  { key: "SampleCard", label: "Sample Cards", hint: "PLM sample cards", capability: "supported", level: "screen", screen: "Sample Card" },
  { key: "WorkOrder", label: "Work Orders", hint: "Manufacturing work orders", capability: "supported", level: "screen", screen: "Work Order" },
  { key: "PurchaseOrder", label: "Purchase Orders", hint: "Purchase orders", capability: "supported", level: "screen", screen: "Purchase Order" },
  { key: "SubcontractOrder", label: "Subcontract Orders", hint: "Subcontract orders", capability: "supported", level: "screen", screen: "Subcontract Order" },
  { key: "Contract", label: "Contracts", hint: "Purchase and Sale Contracts", capability: "supported", level: "screen", screen: "Contract" },
  { key: "CostingSheet", label: "Costing Sheets", hint: "No Customized Fields renderer yet", capability: "definitions-only", level: "screen" },
  { key: "FabricCard", label: "Fabric Cards", hint: "No Customized Fields renderer yet", capability: "definitions-only", level: "screen" },
  { key: "TrimCard", label: "Trim Cards", hint: "No Customized Fields renderer yet", capability: "definitions-only", level: "screen" },
  { key: "CurrentAccount", label: "Current Accounts", hint: "Customers and suppliers — no renderer yet", capability: "definitions-only", level: "screen" },
  { key: "Warehouse", label: "Warehouses", hint: "No Customized Fields renderer yet", capability: "definitions-only", level: "screen" },
  // Logical grids — keyed by what the rows are, not by page (backend custom-field-grids.ts).
  { key: "InventoryReceiptLine", label: "Inventory Receipt Lines", hint: "Detail lines of every receipt type", capability: "supported", level: "grid", screen: "Inventory Receipt lines", usages: ["Inventory Receipts (every receipt type)"] },
  { key: "OrderLine", label: "Order Lines", hint: "Purchase and Subcontract Order lines", capability: "supported", level: "grid", screen: "Order lines", usages: ["Purchase Orders", "Subcontract Orders"] },
  { key: "ContractLine", label: "Contract Lines", hint: "Purchase and Sale Contract lines", capability: "supported", level: "grid", screen: "Contract lines", usages: ["Purchase Contracts, Sale Contracts"] },
  { key: "FiReceiptLine", label: "Financial Receipt Lines", hint: "Financial receipt detail lines", capability: "supported", level: "grid", screen: "Financial Receipt lines", usages: ["Financial Receipts"] },
  { key: "BomLine", label: "BOM Lines", hint: "Style and Sample Card BOM", capability: "supported", level: "grid", screen: "BOM lines", usages: ["Style Cards", "Sample Cards"], unsupportedUsages: [{ usage: "Work Orders", reason: "Work Order BOM rows have no stable row key yet." }] },
];

/** What GET entities/custom-field-targets returns. */
export interface UdfRuntimeTargets {
  screens: { key: string; label: string }[];
  grids: { key: string; label: string; usages: string[]; unsupportedUsages: { usage: string; reason: string }[] }[];
}

/**
 * The entity list with capability and usages taken from the server's runtime registry: a target
 * the server does not register is "definitions only", whatever the offline default says; a grid
 * the server registers that this list does not know yet is still offered.
 */
export function withRuntimeTargets(entities: UdfEntity[], targets: UdfRuntimeTargets | null): UdfEntity[] {
  if (!targets) return entities;
  const screens = new Set(targets.screens.map((t) => t.key));
  const grids = new Map(targets.grids.map((g) => [g.key, g]));
  const known = new Set(entities.map((e) => e.key));
  const merged = entities.map((e): UdfEntity => {
    if (e.level === "grid") {
      const g = grids.get(e.key);
      return g ? { ...e, capability: "supported", usages: g.usages, unsupportedUsages: g.unsupportedUsages } : { ...e, capability: "definitions-only" };
    }
    return { ...e, capability: screens.has(e.key) ? "supported" : "definitions-only" };
  });
  for (const g of targets.grids) {
    if (!known.has(g.key)) {
      merged.push({ key: g.key, label: g.label, hint: g.usages.join(", "), capability: "supported", level: "grid", screen: g.label, usages: g.usages, unsupportedUsages: g.unsupportedUsages });
    }
  }
  return merged;
}

export type DataType = "text" | "number" | "date" | "boolean" | "selection";
export type ControlType = "textbox" | "textarea" | "email" | "number" | "date" | "checkbox" | "dropdown";
export type RuntimeType = "text" | "textarea" | "email" | "number" | "date" | "checkbox" | "select";

export const DATA_TYPES: { value: DataType; label: string; controls: { value: ControlType; label: string }[] }[] = [
  { value: "text", label: "Text", controls: [{ value: "textbox", label: "Text Box" }, { value: "textarea", label: "Long Text" }, { value: "email", label: "Email" }] },
  { value: "number", label: "Number", controls: [{ value: "number", label: "Number" }] },
  { value: "date", label: "Date", controls: [{ value: "date", label: "Date" }] },
  { value: "boolean", label: "Yes / No", controls: [{ value: "checkbox", label: "Yes / No" }] },
  { value: "selection", label: "Selection", controls: [{ value: "dropdown", label: "Dropdown" }] },
];

export const RUNTIME_TYPE: Record<ControlType, RuntimeType> = {
  textbox: "text", textarea: "textarea", email: "email", number: "number", date: "date", checkbox: "checkbox", dropdown: "select",
};

const CONTROL_FROM_RUNTIME: Record<string, ControlType> = Object.fromEntries(
  Object.entries(RUNTIME_TYPE).map(([control, runtime]) => [runtime, control as ControlType]),
);

export const dataTypeOf = (control: ControlType): DataType =>
  DATA_TYPES.find((d) => d.controls.some((c) => c.value === control))!.value;
export const dataTypeLabel = (control: ControlType) => DATA_TYPES.find((d) => d.value === dataTypeOf(control))!.label;
export const controlLabel = (control: ControlType) =>
  DATA_TYPES.flatMap((d) => d.controls).find((c) => c.value === control)?.label ?? control;

export type Scope = "global" | "company" | "branch";

export interface UdfOption { key: string; code: string; label: string; isActive: boolean }

/** A saved CustomField as the admin API returns it. */
export interface UdfField {
  id: string;
  entity: string;
  code: string;
  name: string;
  description: string | null;
  type: RuntimeType;
  controlType: ControlType | null;
  required: boolean;
  isActive: boolean;
  sortOrder: number;
  defaultValue: unknown;
  options: string[] | null;
  config: { options?: { code: string; label: string; isActive: boolean }[] } | null;
  scope: Scope;
  valueCount: number;
}

/** The configuration panel's editable copy. `id` null = a new, unsaved field. */
export interface UdfDraft {
  id: string | null;
  entity: string;
  code: string;
  codeTouched: boolean;
  name: string;
  description: string;
  controlType: ControlType;
  required: boolean;
  isActive: boolean;
  defaultValue: string | number | boolean | null;
  options: UdfOption[];
  scope: Scope;
  valueCount: number;
}

let optionSeq = 0;
export const newOptionKey = () => `opt-${Date.now()}-${optionSeq++}`;

export const controlOf = (f: UdfField): ControlType => f.controlType ?? CONTROL_FROM_RUNTIME[f.type] ?? "textbox";

export function draftFromField(f: UdfField): UdfDraft {
  const control = controlOf(f);
  const stored = f.config?.options ?? (f.options ?? []).map((label, i) => ({ code: String(i + 1).padStart(2, "0"), label, isActive: true }));
  return {
    id: f.id, entity: f.entity, code: f.code, codeTouched: true, name: f.name, description: f.description ?? "",
    controlType: control, required: f.required, isActive: f.isActive,
    defaultValue: (f.defaultValue as any) ?? null,
    options: control === "dropdown" ? stored.map((o) => ({ ...o, key: newOptionKey() })) : [],
    scope: f.scope, valueCount: f.valueCount,
  };
}

export function emptyDraft(entity: string, defaultScope: Scope): UdfDraft {
  return {
    id: null, entity, code: "UD_", codeTouched: false, name: "", description: "", controlType: "textbox",
    required: false, isActive: true, defaultValue: null, options: [], scope: defaultScope, valueCount: 0,
  };
}

/** "Fabric Type" -> "UD_FabricType" (a suggestion only; the administrator can change it before saving). */
export const suggestCode = (caption: string) =>
  "UD_" + caption.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

/** What the admin API accepts (custom-fields.service.ts create/update). */
export function payloadOf(d: UdfDraft) {
  const blank = d.defaultValue === null || d.defaultValue === "" || (typeof d.defaultValue === "number" && Number.isNaN(d.defaultValue));
  return {
    entity: d.entity,
    ...(d.id ? {} : { code: d.code.trim() }),
    name: d.name.trim(),
    description: d.description.trim() || null,
    controlType: d.controlType,
    required: d.controlType === "checkbox" ? false : d.required,
    isActive: d.isActive,
    defaultValue: blank ? null : d.defaultValue,
    options: d.controlType === "dropdown" ? d.options.map((o) => ({ code: o.code.trim(), label: o.label.trim(), isActive: o.isActive })) : undefined,
    scope: d.scope,
  };
}

/** A field as the runtime would receive it — what the previews render. */
export function runtimeFieldOf(d: UdfDraft) {
  return {
    id: d.id ?? "draft",
    name: d.name.trim() || "Untitled field",
    type: RUNTIME_TYPE[d.controlType],
    required: d.controlType === "checkbox" ? false : d.required,
    options: d.controlType === "dropdown" ? d.options.filter((o) => o.isActive && o.label.trim()).map((o) => o.label.trim()) : null,
    defaultValue: d.defaultValue,
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Field definitions (configuration only — never record values) as CSV. */
export function definitionsCsv(fields: UdfField[]) {
  const header = ["Field Code", "Caption", "Description", "Data Type", "Control Type", "Required", "Active", "Default Value", "Options (code=label, * inactive)", "Scope", "Sort Order"];
  const rows = fields.map((f) => {
    const control = controlOf(f);
    const options = control === "dropdown"
      ? (f.config?.options ?? (f.options ?? []).map((label) => ({ code: "", label, isActive: true })))
        .map((o) => `${o.code ? `${o.code}=` : ""}${o.label}${o.isActive ? "" : "*"}`).join(" | ")
      : "";
    return [f.code, f.name, f.description ?? "", dataTypeLabel(control), controlLabel(control), f.required ? "Yes" : "No", f.isActive ? "Yes" : "No",
      f.defaultValue ?? "", options, f.scope, f.sortOrder];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
