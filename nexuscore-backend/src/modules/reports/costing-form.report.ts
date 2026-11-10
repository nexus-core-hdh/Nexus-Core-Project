// Report Builder "document" source: the Costing Form — one saved PLM Costing Sheet printed as the
// legacy "COSTING FORM" (cost sheet header, Fabric & Lining with each fabric's Raw / Labor detail,
// Trims & Accessories, Cost of Decoration & Testing, Cost of Labor, and the final price summary).
// Same engine as the Work Order Order Form / Inward Gate Pass (document-sections.ts): the report's
// columns are the sections (each with its own configurable columns), its one filter is the sheet's
// Costing No. The data comes from CostingService.costingForm (costing.service.ts), which reads the
// saved sheet through the screen's own get() / computeTotals — nothing is calculated here.
//
// Not printed because the Costing Sheet has no such data: Payment Tool, Stage, To Be Cut Quantity,
// Discount %, Y/D Cost 1 / 2, and Wastage / UOM on Others lines.
import type { CostingService } from '../costing/costing.service';
import type { DocumentReportSource, ReportField } from './report-sources';
import {
  OPTIONAL_COLUMN as opt, ReportSection, ReportSectionColumn, SectionColumnConfig, SectionColumnDef, catalogForDesigner, placeTotalLabels,
  sectionColumnDef as c, toSectionColumn, visibleSectionConfig,
} from './document-sections';

export type CostingFormData = Awaited<ReturnType<CostingService['costingForm']>>;

export const COSTING_FORM_SOURCE_KEY = 'costing-form';
/** The parameter field: the sheet's Costing No (unique; what the user sees and types). */
export const COSTING_FORM_SHEET_FIELD = 'costingNo';
export const COSTING_FORM_REPORT_NAME = 'Costing Form';

export const COSTING_FORM_SECTIONS = [
  ['section.header', 'Cost Sheet'],
  ['section.fabric', 'Fabric & Lining'],
  // Printed under each fabric of Fabric & Lining (not on their own) — listed as sections so the
  // designer can hide them or choose their columns like any other section.
  ['section.fabricRaw', 'Fabric Detail — Raw'],
  ['section.fabricLabor', 'Fabric Detail — Labor'],
  ['section.trims', 'Trims & Accessories'],
  ['section.decoration', 'Cost of Decoration & Testing'],
  ['section.labor', 'Cost of Labor'],
  ['section.summary', 'Price Summary'],
] as const;

const money = { defaultDecimals: 2 };
const rate4 = { defaultDecimals: 4 };

/** Every column each section can print — each one a value the Costing Form data carries. */
export const COSTING_FORM_SECTION_COLUMNS: Record<string, SectionColumnDef[]> = {
  'section.header': [
    c('costingNo', 'Cost Sheet #'), c('costingDate', 'Date', 'date'), c('buyer', 'Buyer'), c('brand', 'Brand'),
    c('category', 'Category'), c('season', 'Season'), c('styleCode', 'Style #'), c('styleName', 'Style Name'),
    c('orderQuantity', 'Order Quantity', 'number', { defaultDecimals: 0 }),
    c('currency', 'Currency'), c('exchangeRate', 'Ex. Rate', 'number', money), c('paymentTerms', 'Payment Terms'),
    c('excessProductionPct', 'Excess Production %', 'number', money), c('fobPrice', 'FOB Price', 'number', money),
    c('overheadPct', 'Overhead %', 'number', money), c('overheadAmount', 'Overhead', 'number', money),
    c('excessProductionAmount', 'Excess Production', 'number', money), c('financialCostAmount', 'Financial Cost', 'number', money),
    c('accountCode', 'Buyer Code', 'string', opt), c('foreignCurrency', 'Foreign Currency', 'string', opt),
    c('foreignRate', 'Foreign Rate', 'number', { ...opt, ...rate4 }), c('fobPriceForex', 'FOB Price (Forex)', 'number', { ...opt, ...rate4 }),
    c('financialCostPct', 'Financial Cost %', 'number', { ...opt, ...money }), c('shippingTerms', 'Shipping Terms', 'string', opt),
    c('quotedPriceForex', 'Quoted Price Forex', 'string', opt), c('quotedPrice', 'Quoted Price', 'number', { ...opt, ...money }),
  ],
  'section.fabric': [
    c('itemType', 'Items', 'string', { defaultWidth: 12 }), c('description', 'Item Description'), c('itemRef', 'Item Ref #', 'string', { defaultWidth: 16 }),
    c('consumption', 'Consumption', 'number', { defaultWidth: 11, ...rate4 }), c('wastePct', 'Wstg %', 'number', { defaultWidth: 7, ...money }),
    c('calculatedQty', 'Calculated Qty', 'number', { defaultWidth: 12, ...rate4 }), c('unit', 'UOM', 'string', { defaultWidth: 6 }),
    c('rate', 'CIF Rate', 'number', { defaultWidth: 11, ...rate4 }), c('totalCost', 'Total Cost', 'number', { defaultWidth: 11, ...rate4 }),
    c('explanation', 'Explanation', 'string', opt), c('forex', 'Forex', 'string', opt),
  ],
  'section.fabricRaw': [
    c('detail', 'Detail', 'string', { defaultWidth: 7 }), c('explanation', 'Explanation'), c('price', 'Price', 'number', { defaultWidth: 11, ...rate4 }),
    c('pct', '%', 'number', { defaultWidth: 7, ...money }), c('wastePct', 'Wstg %', 'number', { defaultWidth: 7, ...money }),
    c('amount', 'Amount', 'number', { defaultWidth: 11, ...money }),
    c('wasteType', 'Waste Type', 'string', opt), c('laborType', 'Labor', 'string', opt), c('laborAmount', 'Labor Amt', 'number', { ...opt, ...money }),
  ],
  'section.fabricLabor': [
    c('detail', 'Detail', 'string', { defaultWidth: 14 }), c('explanation', 'Explanation'), c('price', 'Price', 'number', { defaultWidth: 11, ...rate4 }),
    c('pct', '%', 'number', { defaultWidth: 7, ...money }), c('amount', 'Amount', 'number', { defaultWidth: 11, ...money }),
    c('type', 'Type', 'string', opt),
  ],
  'section.trims': [
    c('itemType', 'Items', 'string', { defaultWidth: 14 }), c('description', 'Item Description'), c('itemRef', 'Item Ref #', 'string', { defaultWidth: 16 }),
    c('consumption', 'Quantity', 'number', { defaultWidth: 10, ...money }), c('wastePct', 'Wst %', 'number', { defaultWidth: 7, ...money }),
    c('unit', 'UOM', 'string', { defaultWidth: 8 }), c('rate', 'Unit Price', 'number', { defaultWidth: 11, ...money }),
    c('totalCost', 'Total Cost', 'number', { defaultWidth: 11, ...money }),
    c('explanation', 'Explanation', 'string', opt), c('forex', 'Forex', 'string', opt),
  ],
  'section.decoration': [
    c('item', 'Items', 'string', { defaultWidth: 16 }), c('itemRef', 'Item Ref #'), c('quantity', 'Quantity', 'number', { defaultWidth: 10, ...money }),
    c('unitPrice', 'Unit Price', 'number', { defaultWidth: 11, ...money }), c('totalCost', 'Total Cost', 'number', { defaultWidth: 11, ...money }),
    c('groupCode', 'Group Code', 'string', opt), c('forex', 'Forex', 'string', opt),
  ],
  'section.labor': [
    c('item', 'Items', 'string', { defaultWidth: 16 }), c('itemRef', 'Item Ref #'), c('quantity', 'Quantity', 'number', { defaultWidth: 10, ...money }),
    c('wastePct', 'Wst %', 'number', { defaultWidth: 7, ...money }), c('unitPrice', 'Unit Price', 'number', { defaultWidth: 11, ...money }),
    c('totalCost', 'Total Cost', 'number', { defaultWidth: 11, ...money }),
    c('groupCode', 'Group Code', 'string', opt), c('forex', 'Forex', 'string', opt),
  ],
  'section.summary': [
    c('label', 'Item'), c('pct', '%', 'number', { defaultWidth: 9, ...money }),
    c('forex', 'Forex', 'number', { defaultWidth: 13, ...rate4 }), c('pkr', 'PKR', 'number', { defaultWidth: 14, ...rate4 }),
  ],
};

export const COSTING_FORM_SOURCE: DocumentReportSource = {
  kind: 'document',
  key: COSTING_FORM_SOURCE_KEY,
  module: 'plm',
  label: 'Costing Sheet — Costing Form',
  description: 'One saved Costing Sheet printed as the Costing Form: cost sheet header, Fabric & Lining with each fabric\'s raw and labor detail, Trims & Accessories, Decoration & Testing, Labor, and the price summary (overhead, commission, financial cost, excess production, profit, net FOB in PKR and foreign currency). Columns are the sections (each with its own columns); the Costing No filter chooses the sheet.',
  builder: COSTING_FORM_SOURCE_KEY,
  defaultSort: { field: COSTING_FORM_SHEET_FIELD, direction: 'asc' },
  menuSection: { title: 'Costing Sheet Reports', icon: 'BadgeDollarSign' },
  fields: [
    { key: COSTING_FORM_SHEET_FIELD, label: 'Costing No', group: 'Print For', type: 'string', operators: ['equals'] },
    ...COSTING_FORM_SECTIONS.map(([key, label]): ReportField => ({
      key, label, group: 'Sections', type: 'string', section: true, sectionColumns: catalogForDesigner(COSTING_FORM_SECTION_COLUMNS[key]),
    })),
  ],
};

type ReportColumnLike = { field: string; label?: string; sectionColumns?: SectionColumnConfig[] };

/** A table section of `rows` with this section's configured columns and an optional total row. */
function table(key: string, title: string, defs: SectionColumnDef[], saved: SectionColumnConfig[] | undefined, rows: Record<string, unknown>[], emptyText: string, totals?: Record<string, number>): ReportSection {
  const columns: ReportSectionColumn[] = visibleSectionConfig(defs, saved).map((x) => toSectionColumn(defs, x));
  const footerRows = totals && rows.length ? placeTotalLabels(columns, [{ __label: 'Total', ...totals }]) : [];
  return { key, title, layout: 'table', columns, rows, footerRows, note: null, emptyText };
}

/** The Costing Form's sections, in the order and with the titles of the report's columns. */
export function costingFormSections(d: CostingFormData, columns: ReportColumnLike[]): ReportSection[] {
  const titles = new Map<string, string>(COSTING_FORM_SECTIONS);
  const byField = new Map(columns.map((col) => [col.field, col]));
  const fc = d.foreignCurrency;
  const out: ReportSection[] = [];
  for (const col of columns) {
    if (!titles.has(col.field)) continue;
    const defs = COSTING_FORM_SECTION_COLUMNS[col.field];
    const title = col.label || titles.get(col.field)!;
    switch (col.field) {
      case 'section.header': {
        const cfg = visibleSectionConfig(defs, col.sectionColumns);
        const values = d.header as Record<string, unknown>;
        const rows = cfg.map((x) => {
          const sc = toSectionColumn(defs, x);
          return { key: x.key, label: sc.label, value: values[x.key] ?? null, type: sc.type, align: sc.align, decimals: sc.decimals };
        });
        out.push({
          key: col.field, title, layout: 'fields',
          columns: [{ key: 'label', label: 'Field', type: 'string', total: false }, { key: 'value', label: 'Value', type: 'string', total: false }],
          rows, footerRows: [], note: null, emptyText: '', badges: d.header.locked ? ['LOCKED'] : undefined,
        });
        break;
      }
      case 'section.fabric': {
        // Each fabric: its own one-row table, then its saved raw / labor detail — the paper form's
        // repeated blocks, so every detail row stays printed under the fabric it belongs to.
        const rawCol = byField.get('section.fabricRaw');
        const laborCol = byField.get('section.fabricLabor');
        if (!d.fabrics.length) { out.push(table(col.field, title, defs, col.sectionColumns, [], 'No fabric or lining lines.')); break; }
        d.fabrics.forEach((f: any, i: number) => {
          out.push(table(`${col.field}#${i}`, i === 0 ? title : '', defs, col.sectionColumns, [f], ''));
          if (rawCol && f.raw.length) {
            out.push(table(`section.fabricRaw#${i}`, '', COSTING_FORM_SECTION_COLUMNS['section.fabricRaw'], rawCol.sectionColumns, f.raw, ''));
          }
          // Manufacturing and Dye - Print (Cost Detail Entry) print with the labor rows: same
          // price × (1 + %) shape, the % being their wastage.
          const extra = [
            ...(f.manufacturingPrice ? [{ detail: 'Manufacturing', explanation: '', price: f.manufacturingPrice, pct: f.manufacturingWastePct, amount: f.manufacturingAmount, type: '' }] : []),
            ...(f.dyePrintPrice ? [{ detail: 'Dye - Print', explanation: '', price: f.dyePrintPrice, pct: f.dyePrintWastePct, amount: f.dyePrintAmount, type: '' }] : []),
          ];
          const laborRows = [...f.labor, ...extra];
          if (laborCol && laborRows.length) {
            out.push(table(`section.fabricLabor#${i}`, '', COSTING_FORM_SECTION_COLUMNS['section.fabricLabor'], laborCol.sectionColumns, laborRows, ''));
          }
        });
        // The section total after every fabric block (not on the last fabric, above its detail).
        out.push({
          key: `${col.field}#total`, title: '', layout: 'table',
          columns: [
            { key: 'label', label: title, type: 'string', total: false },
            { key: 'totalCost', label: 'Total Cost', type: 'number', total: false, width: 11, decimals: 4 },
          ],
          rows: [{ label: 'Total', totalCost: d.totals.fabric, __fill: '#F3F4F6' }], footerRows: [], note: null, emptyText: '',
        });
        break;
      }
      case 'section.fabricRaw':
      case 'section.fabricLabor':
        break; // printed under each fabric above
      case 'section.trims':
        out.push(table(col.field, title, defs, col.sectionColumns, d.trims, 'No trims or accessories.', { totalCost: d.totals.trims }));
        break;
      case 'section.decoration':
        out.push(table(col.field, title, defs, col.sectionColumns, d.decoration, 'No decoration or testing costs.', { totalCost: d.totals.decoration }));
        break;
      case 'section.labor':
        out.push(table(col.field, title, defs, col.sectionColumns, d.labor, 'No labor costs.', { totalCost: d.totals.labor }));
        break;
      case 'section.summary': {
        // Forex column heading = the sheet's own foreign currency (e.g. "Usdollar").
        const cfg = visibleSectionConfig(defs, col.sectionColumns);
        const cols = cfg.map((x) => toSectionColumn(defs, x, x.key, x.key === 'forex' && !x.label ? fc : undefined));
        const rows = d.summary.map((s: any) => ({ ...s, ...(s.key === 'netFob' ? { __fill: '#F3F4F6' } : {}) }));
        out.push({ key: col.field, title, layout: 'table', columns: cols, rows, footerRows: [], note: null, emptyText: '' });
        break;
      }
    }
  }
  return out;
}
