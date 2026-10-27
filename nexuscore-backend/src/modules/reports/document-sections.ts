// Shared parts of the Report Builder's "document" sources — one record printed as several sections
// (the Work Order Order Form, the Inward Gate Pass, ...). Each source declares, per section, the
// columns its data really carries (SectionColumnDef); a report saves per-section column settings
// (SectionColumnConfig) in its definition's `columns` JSON; the builders lay their data out as
// ReportSections, which the report view and the PDF / Excel / CSV exports render.

/** 'image' = a stored picture ("upload/<id>", e.g. a Style Picture), drawn as a thumbnail in the cell. */
export type SectionColumnType = 'string' | 'number' | 'date' | 'boolean' | 'image';

/** A column a section can print. `labelEditable: false` — its heading comes from the data (sizes). */
export interface SectionColumnDef {
  key: string; label: string; type: SectionColumnType; labelEditable?: boolean; defaultHidden?: boolean;
  /** Width (characters) when the report sets none — keeps short columns from wrapping on the page. */
  defaultWidth?: number;
  /** Number columns: fixed decimals when the report sets none (e.g. 2, as the legacy reports print quantities). */
  defaultDecimals?: number;
}
export const sectionColumnDef = (key: string, label: string, type: SectionColumnType = 'string', extra: Partial<SectionColumnDef> = {}): SectionColumnDef =>
  ({ key, label, type, ...extra });
/** Extra for columns not printed by default (offered by Columns → Add column). */
export const OPTIONAL_COLUMN = { defaultHidden: true };

/** One section column's saved settings (in the report definition's columns JSON). */
export interface SectionColumnConfig {
  key: string;
  label?: string;
  /** Width in characters (blank = automatic). */
  width?: number;
  align?: 'left' | 'center' | 'right';
  /** Number columns: fixed decimal places (blank = up to 2, as everywhere else). */
  decimals?: number;
  hidden?: boolean;
}

export type ReportSectionColumn = {
  key: string; label: string; type: SectionColumnType; total: boolean;
  width?: number | null; align?: 'left' | 'center' | 'right' | null; decimals?: number | null;
};
export interface ReportSection {
  key: string;
  title: string;
  /** 'fields' = label / value pairs (a document header); 'table' = columns and rows;
   *  'signatures' = blank signing lines, one per row label (e.g. Gate Clerk, Carrier, Checked By);
   *  'inline' = label: value pairs on one wrapped line (e.g. a Work Order's header above its table). */
  layout: 'fields' | 'table' | 'signatures' | 'inline';
  columns: ReportSectionColumn[];
  rows: Record<string, unknown>[];
  /** Total rows printed under the table (one per unit, so different units are never added). */
  footerRows: Record<string, unknown>[];
  note: string | null;
  emptyText: string;
  /** 'fields' layout only: whether the record has a picture panel (imageUrl, or "no picture"). */
  picture?: boolean;
  imageUrl?: string | null;
  /** 'fields' layout only: status stamps (APPROVED, ...). */
  badges?: string[];
}

/** How a document prints around its sections. */
export interface ReportDocumentInfo {
  /** Print the report's name as the document title (the Order Form does; the Inward Gate Pass does not). */
  showTitle: boolean;
  /** Printed under the company name, when the company has one. */
  companyAddress: string | null;
  /** Print each section's title above it (the Inward Gate Pass form has none). Default true. */
  showSectionTitles?: boolean;
  /** PDF: tables in smaller print with tighter cells, scaled so every column fits across the
   *  landscape page (a wide legacy layout, e.g. the Process Follow-up's 20 columns). Default false. */
  compactTables?: boolean;
}

/**
 * Validates one section's column settings against its catalog (unknown keys, bad widths /
 * decimals / alignment are errors; a repeated key is kept once). Undefined = "no settings".
 */
export function cleanSectionColumns(defs: SectionColumnDef[], input: unknown): SectionColumnConfig[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) throw new Error('Section columns must be a list');
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const seen = new Set<string>();
  const out: SectionColumnConfig[] = [];
  for (const raw of input as any[]) {
    const def = byKey.get(String(raw?.key));
    if (!def) throw new Error(`Unknown column "${raw?.key}"`);
    if (seen.has(def.key)) continue;
    seen.add(def.key);
    const label = def.labelEditable === false ? '' : String(raw.label ?? '').trim().slice(0, 100);
    const cfg: SectionColumnConfig = { key: def.key };
    if (label && label !== def.label) cfg.label = label;
    if (raw.width !== undefined && raw.width !== null && raw.width !== '') {
      const w = Number(raw.width);
      if (!Number.isInteger(w) || w < 3 || w > 80) throw new Error(`Width of "${def.label}" must be 3–80 characters`);
      cfg.width = w;
    }
    if (raw.align !== undefined && raw.align !== null && raw.align !== '') {
      if (!['left', 'center', 'right'].includes(raw.align)) throw new Error(`Invalid alignment for "${def.label}"`);
      cfg.align = raw.align;
    }
    if (raw.decimals !== undefined && raw.decimals !== null && raw.decimals !== '') {
      const d = Number(raw.decimals);
      if (def.type !== 'number') throw new Error(`"${def.label}" is not a number column`);
      if (!Number.isInteger(d) || d < 0 || d > 6) throw new Error(`Decimals of "${def.label}" must be 0–6`);
      cfg.decimals = d;
    }
    if (raw.hidden) cfg.hidden = true;
    out.push(cfg);
  }
  if (!out.some((x) => !x.hidden)) throw new Error('Keep at least one visible column');
  return out;
}

/** The columns a section prints: its saved settings, or every default-visible catalog column. */
export function visibleSectionConfig(defs: SectionColumnDef[], saved?: SectionColumnConfig[]): SectionColumnConfig[] {
  return (saved ?? defs.filter((d) => !d.defaultHidden).map((d): SectionColumnConfig => ({ key: d.key })))
    .filter((x) => !x.hidden && defs.some((d) => d.key === x.key));
}

/** A printed column from its catalog entry and settings (`key` / `label` override for expanded columns). */
export function toSectionColumn(defs: SectionColumnDef[], cfg: SectionColumnConfig, key = cfg.key, label?: string): ReportSectionColumn {
  const def = defs.find((d) => d.key === cfg.key)!;
  return { key, label: label ?? cfg.label ?? def.label, type: def.type, total: false, width: cfg.width ?? def.defaultWidth ?? null, align: cfg.align ?? null, decimals: cfg.decimals ?? def.defaultDecimals ?? null };
}

/** A section field's catalog, as the designer receives it (`defaultVisible` instead of `defaultHidden`). */
export const catalogForDesigner = (defs: SectionColumnDef[]) => defs.map(({ defaultHidden, ...d }) => ({ ...d, defaultVisible: !defaultHidden }));

/** "Total (KG)" rows: `keys` summed per unit, never across units. `__label` names the row. */
export function unitTotals(rows: Record<string, any>[], keys: string[], extra?: (unit: string, list: any[]) => Record<string, unknown>) {
  const byUnit = new Map<string, any[]>();
  for (const r of rows) byUnit.set(r.unit ?? '', [...(byUnit.get(r.unit ?? '') ?? []), r]);
  return [...byUnit.entries()].map(([unit, list]) => ({
    __label: `Total${unit ? ` (${unit})` : ''}`,
    ...Object.fromEntries(keys.map((k) => [k, Math.round(list.reduce((t, r) => t + (Number(r[k]) || 0), 0) * 10000) / 10000])),
    ...(extra ? extra(unit, list) : {}),
  }));
}

/** A total row's label goes in the first visible text column (the usual label column may be hidden). */
export function placeTotalLabels(columns: ReportSectionColumn[], footerRows: Record<string, unknown>[]) {
  const labelKey = columns.find((cl) => cl.type !== 'number')?.key ?? columns[0]?.key;
  return footerRows.map(({ __label, ...row }) => (labelKey && __label ? { ...row, [labelKey]: __label } : row));
}
