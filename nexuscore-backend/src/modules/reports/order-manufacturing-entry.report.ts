// Report Builder "document" source: the Order Manufacturing Entry report — one Work Order's
// manufacturing summary as the Order Manufacturing Entry screen shows it. Same document engine as
// the Order Form, the Inward Gate Pass and the Process Follow-up: the report's columns are its
// sections (each with its own configurable columns, Columns → per section), its filters choose the
// Work Order, the Process and the view. The data is the screen's own read model,
// OrderManufacturingService.getContext (legacy-erp) — every quantity, total and Balance comes from
// there unchanged (Balance = Order − Received + Return), so the report always agrees with the screen.
//
// Views (the Report View filter): Summary (default) — header and one row per Production Color;
// Size-Wise — also the screen's size breakdown per color (Order, Will be Cut, Cutting, Sent,
// Received, Return, Balance per size) with the Grand Total block. The view changes the layout only.
import type { DocumentReportSource, ReportField } from './report-sources';
import {
  OPTIONAL_COLUMN as opt, ReportSection, ReportSectionColumn, SectionColumnConfig, SectionColumnDef, catalogForDesigner,
  placeTotalLabels, sectionColumnDef as c, toSectionColumn, visibleSectionConfig,
} from './document-sections';

export const OM_ENTRY_SOURCE_KEY = 'order-manufacturing-entry';
// Not the screen's own name: both are menu entries (and "Search screens…" results).
export const OM_ENTRY_REPORT_NAME = 'Order Manufacturing Entry Report';

/** Filter fields: the Work Order (required), the Process (optional — blank = the Work Order's own
 *  default process, as on the screen) and the view. */
export const OM_ENTRY_FIELDS = {
  workOrder: 'workOrderId',
  process: 'processId',
  view: 'reportView',
} as const;

export const OM_ENTRY_VIEW_SUMMARY = 'summary';
export const OM_ENTRY_VIEW_SIZES = 'sizes';
export const OM_ENTRY_VIEW_OPTIONS = [
  { value: OM_ENTRY_VIEW_SUMMARY, label: 'Summary View — one line per color' },
  { value: OM_ENTRY_VIEW_SIZES, label: 'Size-Wise View — also every size per color' },
];

export const OM_ENTRY_SECTIONS = [
  ['section.header', 'Work Order'],
  ['section.summary', 'Manufacturing Summary'],
  ['section.sizes', 'Size-Wise Breakdown'],
] as const;

const qty = (key: string, label: string, extra: Partial<SectionColumnDef> = {}) => c(key, label, 'number', { defaultWidth: 9, defaultDecimals: 2, ...extra });
/** Every column each section can print — each one a value of the screen's read model. Columns that
 *  stand for several (materials, quality types, sizes) print one column per value of the Work Order. */
export const OM_ENTRY_SECTION_COLUMNS: Record<string, SectionColumnDef[]> = {
  'section.header': [
    c('workOrderNo', 'Order No'), c('customer', 'Customer'), c('styleNo', 'Style No'), c('style', 'Style'),
    c('process', 'Process'), c('extraCuttingPercent', 'Extra Cutting %', 'number'),
    c('customerCode', 'Customer Code', 'string', opt), c('lockReason', 'Status', 'string', opt),
  ],
  'section.summary': [
    c('color', 'Color', 'string', { ...opt, defaultWidth: 14 }),
    c('materials', 'Materials (one column per BOM material)', 'string', { labelEditable: false, defaultWidth: 14 }),
    qty('order', 'Order'), qty('willBeCut', 'Will be Cut'), qty('cutting', 'Cutting'), qty('sent', 'Sent'),
    qty('qualities', 'Quality Types (one column per type, e.g. A / B Quality)', { labelEditable: false }),
    qty('received', 'Received'), qty('returned', 'Return'), qty('balance', 'Balance'),
  ],
  'section.sizes': [
    c('color', 'Color', 'string', { defaultWidth: 14 }), c('line', 'Quantity', 'string', { defaultWidth: 10 }),
    qty('sizes', 'Sizes (one column per size)', { labelEditable: false, defaultWidth: 7 }), qty('total', 'Total'),
  ],
};

const pick = (key: string, label: string, masterKey: string, lookupPath?: string): ReportField =>
  ({ key, label, group: 'Print For', type: 'number', operators: ['eq'], lookup: { masterKey, ...(lookupPath ? { lookupPath } : {}) } });
export const OM_ENTRY_SOURCE: DocumentReportSource = {
  kind: 'document',
  key: OM_ENTRY_SOURCE_KEY,
  module: 'legacy-erp',
  label: 'Order Manufacturing — Entry',
  description: 'One Work Order as the Order Manufacturing Entry screen shows it: Work Order and Style, one line per Production Color with Order, Will be Cut, Cutting, Sent, the quality types, Received, Return and Balance for the chosen Process — and, in the Size-Wise view, every size per color with the Grand Total.',
  builder: OM_ENTRY_SOURCE_KEY,
  defaultSort: { field: OM_ENTRY_FIELDS.workOrder, direction: 'asc' },
  menuSection: { title: 'Production Reports', icon: 'Factory' },
  fields: [
    pick(OM_ENTRY_FIELDS.workOrder, 'Work Order', 'manufacturing-order', '/legacy-erp/work-orders-list'),
    pick(OM_ENTRY_FIELDS.process, 'Process', 'process'),
    { key: OM_ENTRY_FIELDS.view, label: 'Report View', group: 'Options', type: 'string', operators: ['equals'], options: OM_ENTRY_VIEW_OPTIONS },
    ...OM_ENTRY_SECTIONS.map(([key, label]): ReportField => ({
      key, label, group: 'Sections', type: 'string', section: true, sectionColumns: catalogForDesigner(OM_ENTRY_SECTION_COLUMNS[key]),
    })),
  ],
};

/** The screen's read model (OrderManufacturingService.getContext) — the parts this report prints. */
type QtyCell = { order: number; willBeCut: number; cutting: number; sent: number; received: number; returned: number; balance: number };
export interface OrderManufacturingContext {
  workOrder: { workOrderNo: string; customerCode: string | null; customerName: string | null };
  style: { styleNumber: string; title: string; imageUrl: string | null } | null;
  process: { id: number; code: string | null; name: string | null } | null;
  lockReason: string | null;
  sizes: string[];
  extraCuttingPercent: number;
  materialColumns: { key: string; lineType: string; label: string }[];
  qualityColumns: { id: number; code: string | null; name: string | null }[];
  rows: { color: string; cells: Record<string, { code: string | null; name: string | null; hex: string | null }>; bySize: Record<string, QtyCell>; totals: QtyCell; byQuality: Record<string, number> }[];
  grandTotal: { bySize: Record<string, QtyCell>; totals: QtyCell; byQuality: Record<string, number> };
}

/** The size breakdown's lines and their tints — the screen's (size-summary.tsx LINES), in its order. */
export const OM_ENTRY_SIZE_LINES: { key: keyof QtyCell; label: string; fill: string }[] = [
  { key: 'order', label: 'Order', fill: '#FEFCE8' },
  { key: 'willBeCut', label: 'Will be Cut', fill: '#EEF2FF' },
  { key: 'cutting', label: 'Cutting', fill: '#FDF2F8' },
  { key: 'sent', label: 'Sent', fill: '#FFE4E6' },
  { key: 'received', label: 'Received', fill: '#FFE4E6' },
  { key: 'returned', label: 'Return', fill: '#FFE4E6' },
  { key: 'balance', label: 'Balance', fill: '#FED7AA' },
];

const processLabel = (p: { code: string | null; name: string | null } | null) => (p ? [p.code, p.name].filter(Boolean).join(' ') : null);
/** As on the screen: a zero quantity prints blank (Order always prints). */
const shown = (v: number | undefined) => (v ? v : null);
const hexFill = (hex: string | null | undefined) => (hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null);

/** The report's sections for one Work Order, in the order of the report's columns. */
export function orderManufacturingEntrySections(
  d: OrderManufacturingContext,
  columns: { field: string; label?: string; sectionColumns?: SectionColumnConfig[] }[],
  view: string,
): ReportSection[] {
  const titles = new Map<string, string>(OM_ENTRY_SECTIONS);
  const defs = (key: string) => OM_ENTRY_SECTION_COLUMNS[key];
  // A column standing for several expands to one printed column per value of this Work Order.
  const expand = (key: string, cfg: SectionColumnConfig): ReportSectionColumn[] => {
    if (cfg.key === 'materials') return d.materialColumns.map((m) => toSectionColumn(defs(key), cfg, `material:${m.key}`, m.label));
    if (cfg.key === 'qualities') return d.qualityColumns.map((q) => toSectionColumn(defs(key), cfg, `quality:${q.id}`, q.name || q.code || `Quality ${q.id}`));
    if (cfg.key === 'sizes') return d.sizes.map((s) => toSectionColumn(defs(key), cfg, `size:${s}`, s));
    return [toSectionColumn(defs(key), cfg)];
  };
  const tableColumns = (key: string, saved?: SectionColumnConfig[]) => visibleSectionConfig(defs(key), saved).flatMap((cfg) => expand(key, cfg));

  // Said once, above the summary, as on the screen.
  const notes = [
    !d.process ? 'No Process selected — Sent, the quality types, Received and Return need a Process (Balance is then the Order quantity).' : null,
    d.extraCuttingPercent ? `Will be Cut includes Extra Cutting ${d.extraCuttingPercent}%, rounded up per size.` : null,
    d.lockReason ? `${d.lockReason} Manufacturing entries are read-only.` : null,
  ].filter(Boolean).join(' ') || null;

  const header = (saved?: SectionColumnConfig[]): Omit<ReportSection, 'key' | 'title'> => {
    const values: Record<string, unknown> = {
      workOrderNo: d.workOrder.workOrderNo, customer: d.workOrder.customerName, customerCode: d.workOrder.customerCode,
      styleNo: d.style?.styleNumber ?? null, style: d.style?.title ?? null, process: processLabel(d.process),
      extraCuttingPercent: d.extraCuttingPercent, lockReason: d.lockReason,
    };
    const cfg = visibleSectionConfig(defs('section.header'), saved);
    const rows = cfg.map((x) => {
      const col = toSectionColumn(defs('section.header'), x);
      return { key: x.key, label: col.label, value: values[x.key] ?? null, type: col.type, align: col.align, decimals: col.decimals };
    });
    return {
      layout: 'fields', columns: [{ key: 'label', label: 'Field', type: 'string', total: false }, { key: 'value', label: 'Value', type: 'string', total: false }],
      rows, footerRows: [], note: null, emptyText: '', picture: true, imageUrl: d.style?.imageUrl ?? null,
    };
  };

  const summary = (saved?: SectionColumnConfig[]): Omit<ReportSection, 'key' | 'title'> => {
    const cols = tableColumns('section.summary', saved);
    const line = (t: QtyCell, byQuality: Record<string, number>) => ({
      order: t.order, willBeCut: shown(t.willBeCut), cutting: shown(t.cutting), sent: shown(t.sent),
      received: shown(t.received), returned: shown(t.returned), balance: shown(t.balance),
      ...Object.fromEntries(d.qualityColumns.map((q) => [`quality:${q.id}`, shown(byQuality[String(q.id)])])),
    });
    const rows = d.rows.map((r) => {
      const fills: Record<string, string> = {};
      const materials = Object.fromEntries(d.materialColumns.map((m) => {
        const cell = r.cells[m.key];
        const fill = hexFill(cell?.hex);
        if (fill) fills[`material:${m.key}`] = fill;
        return [`material:${m.key}`, cell?.code || cell?.name || null];
      }));
      return { color: r.color, ...materials, ...line(r.totals, r.byQuality), ...(Object.keys(fills).length ? { __cellFills: fills } : {}) };
    });
    const footerRows = d.rows.length ? placeTotalLabels(cols, [{ __label: 'Grand Total', ...line(d.grandTotal.totals, d.grandTotal.byQuality) }]) : [];
    return { layout: 'table', columns: cols, rows, footerRows, note: notes, emptyText: 'This Work Order has no Production Colors yet — enter Manufacturing Quantities on its C/S Details tab first.' };
  };

  const sizes = (saved?: SectionColumnConfig[]): Omit<ReportSection, 'key' | 'title'> => {
    const cols = tableColumns('section.sizes', saved);
    const block = (label: string, bySize: Record<string, QtyCell>, totals: QtyCell) => OM_ENTRY_SIZE_LINES.map((l, i) => ({
      color: i === 0 ? label : null, line: l.label,
      ...Object.fromEntries(d.sizes.map((s) => [`size:${s}`, shown(bySize[s]?.[l.key])])),
      total: shown(totals[l.key]), __fill: l.fill,
    }));
    return {
      layout: 'table', columns: cols,
      rows: d.rows.flatMap((r) => block(r.color, r.bySize, r.totals)),
      footerRows: d.rows.length ? block('** Grand Total **', d.grandTotal.bySize, d.grandTotal.totals) : [],
      note: null, emptyText: 'This Work Order has no Production Colors yet — enter Manufacturing Quantities on its C/S Details tab first.',
    };
  };

  return columns
    .filter((col) => titles.has(col.field))
    // The size breakdown belongs to the Size-Wise view only; the Summary view stays compact.
    .filter((col) => col.field !== 'section.sizes' || view === OM_ENTRY_VIEW_SIZES)
    .map((col) => {
      const title = col.label || titles.get(col.field)!;
      const body = col.field === 'section.header' ? header(col.sectionColumns) : col.field === 'section.summary' ? summary(col.sectionColumns) : sizes(col.sectionColumns);
      return { key: col.field, title, ...body };
    });
}
