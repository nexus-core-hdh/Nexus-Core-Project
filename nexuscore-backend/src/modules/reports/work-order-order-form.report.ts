// Report Builder "document" source: the Work Order Order Form (legacy "Order Form" printout).
//
// A document source is one record printed as several sections rather than one row per record.
// Its "columns" are the sections (chosen and ordered in the designer like any column, with the
// column label as the section title) and its one filter is the Work Order it prints. The data is
// built by WorkOrderOrderFormService (legacy-erp) from the same services the Work Order screens use
// — effective BOM, Will Be Cut, saved-else-calculated requirements — so the printout always agrees
// with them; this file only lays that data out as ReportSections.
//
// Each section's own columns are configurable too: a report column (a section) may carry
// `sectionColumns` — which of the section's columns to print, in which order, with which label,
// width, alignment, decimals and visibility — saved in the report definition's `columns` JSON like
// every other column setting. ORDER_FORM_SECTION_COLUMNS is the catalog of what each section can
// show: exactly the values its data carries, nothing calculated here.
import type { WorkOrderOrderForm } from '../legacy-erp/work-order-order-form.service';
import type { DocumentReportSource, ReportField } from './report-sources';
import {
  OPTIONAL_COLUMN, ReportSection, SectionColumnConfig, SectionColumnDef, SectionColumnType, catalogForDesigner,
  placeTotalLabels, sectionColumnDef, toSectionColumn, unitTotals as totalsPerUnit, visibleSectionConfig,
} from './document-sections';

// Shared document types, still importable from here.
export type { ReportSection, ReportSectionColumn, SectionColumnConfig, SectionColumnDef } from './document-sections';
export { cleanSectionColumns } from './document-sections';

export const ORDER_FORM_SOURCE_KEY = 'work-order-order-form';
/** The parameter field: the Work Order's RecId, picked with the Work Order lookup. */
export const ORDER_FORM_WORK_ORDER_FIELD = 'workOrderId';

export const ORDER_FORM_SECTIONS = [
  ['section.header', 'Work Order Header'],
  ['section.colorSizeChart', 'Color/Size Chart'],
  ['section.fabricRecipe', 'Fabric Recipe Detail'],
  ['section.fabricRequirement', 'Fabric Requirement Detail'],
  ['section.yarnRequirement', 'Yarn Requirement Detail'],
  ['section.trimRecipe', 'Trim Recipe Detail'],
  ['section.trimRequirement', 'Trim Requirement Detail'],
  ['section.embellishments', 'Embellishment Details'],
] as const;

type ColumnType = SectionColumnType;
const c = sectionColumnDef;

/** Every column each section can print, in default order — each one a value the section's data
 *  really carries (work-order-order-form.service.ts). `opt` columns are not printed by default
 *  (they were not on the legacy Order Form); Columns → Add column offers them. For the header these
 *  are its fields. */
const opt = OPTIONAL_COLUMN;
export const ORDER_FORM_SECTION_COLUMNS: Record<string, SectionColumnDef[]> = {
  'section.header': [
    c('workOrderNo', 'Order No'), c('poNumber', 'PO Number'), c('brand', 'Brand'), c('customer', 'Customer'),
    c('category', 'Category'), c('styleName', 'Style Name'), c('styleNo', 'Style No'), c('season', 'Season'),
    c('orderConfirmationDate', 'Order Confirmation Date', 'date'), c('shipmentHandoverDate', 'Shipment Handover', 'date'),
    c('deliveryDate', 'Delivery Date', 'date'), c('orderQuantity', 'Order Quantity', 'number'), c('remarks', 'Remarks'),
    c('cuttingExtraPct', 'Cutting Extra %', 'number'), c('productionColors', 'Production Colors'),
    c('customerCode', 'Customer Code', 'string', opt), c('customerStyleNo', 'Customer Style No', 'string', opt),
    c('approved', 'Approved', 'boolean', opt), c('closed', 'Closed', 'boolean', opt),
  ],
  'section.colorSizeChart': [
    c('color', 'Color'), c('customerOrderNo', 'COrder No'), c('kind', 'Quantity'),
    // One entry for all size columns: their headings are the Work Order's own sizes.
    c('sizes', 'Sizes (one column per size)', 'number', { labelEditable: false }), c('total', 'Total', 'number'),
  ],
  'section.fabricRecipe': [
    c('fabric', 'Fabric'), c('fabricCode', 'Fabric Code', 'string', opt), c('dia', 'Dia'), c('gauge', 'Gauge'), c('finishWidth', 'Finish Width'),
    c('variants', 'Variants'), c('explanation', 'Explanation'), c('process', 'Process'), c('rawQty', 'Raw Qty', 'number'),
    c('dyeWastePct', 'Dye Waste %', 'number'), c('cutWastePct', 'Cut Waste %', 'number'), c('totalWastePct', 'Total Waste %', 'number'),
    c('unit', 'Unit'), c('finalQty', 'Final Qty', 'number'),
    c('variant', 'Variant', 'string', opt), c('productionColor', 'Production Color', 'string', opt), c('materialColor', 'Material Color', 'string', opt),
    c('component', 'Component', 'string', opt), c('placement', 'Placement', 'string', opt), c('finishRoute', 'Finish Route', 'string', opt),
    c('revision', 'Revision', 'string', opt), c('markerWidth', 'Marker Width', 'number', opt), c('markerLength', 'Marker Length', 'number', opt),
    c('markerWeight', 'Marker Weight', 'number', opt), c('price', 'Price', 'number', opt),
    c('mainFabric', 'Main Fabric', 'boolean', opt), c('willBeCut', 'Will be Cut', 'boolean', opt),
  ],
  'section.fabricRequirement': [
    c('fabric', 'Fabric'), c('fabricCode', 'Fabric Code', 'string', opt), c('dia', 'Dia'), c('gauge', 'Gauge'), c('finishWidth', 'Finish Width'),
    c('variants', 'Variants'), c('explanation', 'Explanation'), c('unit', 'Unit'), c('quantity', 'Required Quantity', 'number'),
    c('revision', 'Revision'), c('dyeingInstruction', 'Dyeing Instruction'), c('remarks', 'Remarks'),
    c('variant1', 'Variant', 'string', opt), c('productionColor', 'Production Color', 'string', opt), c('materialColor', 'Material Color', 'string', opt),
  ],
  'section.yarnRequirement': [
    c('yarn', 'Yarn'), c('yarnCode', 'Yarn Code', 'string', opt), c('variant', 'Variants'), c('knittingWastePct', 'Knitting Waste %'),
    c('dyeWastePct', 'Dye Waste %'), c('unit', 'Unit'), c('quantity', 'Required Quantity', 'number'), c('bags', "Bag's", 'number'),
  ],
  'section.trimRecipe': [
    c('trim', 'Trim'), c('trimCode', 'Trim Code', 'string', opt), c('variant', 'Variants'), c('color', 'Color'),
    c('wastagePct', 'Wastage %', 'number'), c('unit', 'Unit'), c('quantity', 'Quantity', 'number'),
    c('variant1', 'Variant', 'string', opt), c('productionColor', 'Production Color', 'string', opt), c('explanation', 'Explanation', 'string', opt),
    c('process', 'Process', 'string', opt), c('component', 'Component', 'string', opt), c('placement', 'Placement', 'string', opt),
    c('price', 'Price', 'number', opt),
  ],
  'section.trimRequirement': [
    c('trim', 'Trim'), c('trimCode', 'Trim Code', 'string', opt), c('variants', 'Variants'), c('unit', 'Unit'), c('quantity', 'Required Quantity', 'number'),
    c('variant1', 'Variant', 'string', opt), c('productionColor', 'Production Color', 'string', opt), c('materialColor', 'Material Color', 'string', opt),
  ],
  'section.embellishments': [
    c('embellishment', 'Embellishment Details'), c('bodyColor', 'Body Color'), c('printColor', 'Print Color'), c('placement', 'Parts & Placement'),
    c('component', 'Component', 'string', opt), c('process', 'Process', 'string', opt),
  ],
};

export const ORDER_FORM_SOURCE: DocumentReportSource = {
  kind: 'document',
  key: ORDER_FORM_SOURCE_KEY,
  module: 'legacy-erp',
  label: 'Work Order — Order Form',
  description: 'One Work Order printed as the Order Form: header with style picture, Color/Size Chart, Fabric / Trim Recipe, Fabric / Yarn / Trim Requirement and Embellishment Details. Columns are the sections to print (each with its own columns); the Work Order filter chooses the order.',
  builder: 'work-order-order-form',
  defaultSort: { field: ORDER_FORM_WORK_ORDER_FIELD, direction: 'asc' },
  menuSection: { title: 'Production Reports', icon: 'Factory' },
  fields: [
    {
      key: ORDER_FORM_WORK_ORDER_FIELD, label: 'Work Order', group: 'Print For', type: 'number',
      operators: ['eq'], lookup: { masterKey: 'manufacturing-order', lookupPath: '/legacy-erp/work-orders-list' },
    },
    ...ORDER_FORM_SECTIONS.map(([key, label]): ReportField => ({
      key, label, group: 'Sections', type: 'string', section: true,
      sectionColumns: catalogForDesigner(ORDER_FORM_SECTION_COLUMNS[key]),
    })),
  ],
};

const joined = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' / ') || null;
const notSaved = (source: 'saved' | 'calculated') =>
  source === 'calculated' ? 'Not saved on the Requirements screen yet — calculated from the current BOM and quantities.' : null;

/** "Total (KG)" rows of the requirement sections: Required Quantity summed per unit. */
const unitTotals = (rows: Record<string, any>[], extra?: (unit: string, list: any[]) => Record<string, unknown>) => totalsPerUnit(rows, ['quantity'], extra);
const effectiveConfig = (sectionKey: string, saved?: SectionColumnConfig[]) => visibleSectionConfig(ORDER_FORM_SECTION_COLUMNS[sectionKey], saved);
const sectionColumn = (sectionKey: string, cfg: SectionColumnConfig, key = cfg.key, label?: string) => toSectionColumn(ORDER_FORM_SECTION_COLUMNS[sectionKey], cfg, key, label);

/** The Order Form's sections, in the order and with the titles of the report's columns. */
export function orderFormSections(d: WorkOrderOrderForm, columns: { field: string; label?: string; sectionColumns?: SectionColumnConfig[] }[]): ReportSection[] {
  const h = d.header;
  // Table sections: their rows, total rows (labelled via __label) and texts; columns come from settings.
  const tables: Record<string, () => { rows: Record<string, unknown>[]; footerRows: Record<string, unknown>[]; note: string | null; emptyText: string }> = {
    'section.colorSizeChart': () => {
      const { sizes, colors, customerOrderNo } = d.colorSizeChart;
      const kinds = [['orderQty', 'Order'], ['willBeCutQty', 'Will be Cut'], ['cutQty', 'Cut']] as const;
      const line = (label: string, orderNo: string | null, kind: string, value: (s: string) => number, total: number) => ({
        color: label, customerOrderNo: orderNo, kind,
        ...Object.fromEntries(sizes.map((s: string) => [`size:${s}`, value(s)])), total,
      });
      const rows = colors.flatMap((cl: any) => kinds.map(([k, kind], i) =>
        line(i === 0 ? cl.color : '', i === 0 ? customerOrderNo : null, kind, (s) => cl.bySize[s]?.[k] ?? 0, cl.total[k])));
      const footerRows = colors.length > 1
        ? kinds.map(([k, kind], i) => ({
          ...line('', null, kind, (s) => colors.reduce((t: number, cl: any) => t + (cl.bySize[s]?.[k] ?? 0), 0), colors.reduce((t: number, cl: any) => t + cl.total[k], 0)),
          ...(i === 0 ? { __label: 'All colors' } : {}),
        }))
        : [];
      return { rows, footerRows, note: null, emptyText: 'No Manufacturing Quantities have been entered for this Work Order.' };
    },
    'section.fabricRecipe': () => ({
      rows: d.fabricRecipe.map((r: any) => ({ ...r, variants: joined(r.variant, r.productionColor, r.materialColor) })),
      footerRows: [], note: null, emptyText: 'This Work Order has no Fabric BOM lines.',
    }),
    'section.fabricRequirement': () => ({
      rows: d.fabricRequirement.rows.map((r: any) => ({ ...r, variants: joined(r.variant, r.materialColor) })),
      footerRows: unitTotals(d.fabricRequirement.rows),
      note: notSaved(d.fabricRequirement.source), emptyText: 'No Fabric Requirement for this Work Order.',
    }),
    'section.yarnRequirement': () => {
      const pct = (v: number[]) => [...new Set(v)].map((x) => `${x}`).join(' / ') || null;
      const rows = d.yarnRequirement.rows;
      const allBags = rows.every((r: any) => r.bags != null);
      return {
        rows: rows.map((r: any) => ({ ...r, knittingWastePct: pct(r.knittingWastePct), dyeWastePct: pct(r.dyeWastePct) })),
        footerRows: unitTotals(rows, (_unit, list) => ({
          bags: allBags ? Math.round(list.reduce((t: number, r: any) => t + (r.bags ?? 0), 0) * 100) / 100 : null,
        })),
        note: notSaved(d.yarnRequirement.source), emptyText: 'No Yarn Requirement for this Work Order.',
      };
    },
    'section.trimRecipe': () => ({ rows: d.trimRecipe, footerRows: [], note: null, emptyText: 'This Work Order has no Trim BOM lines.' }),
    'section.trimRequirement': () => ({
      rows: d.trimRequirement.rows.map((r: any) => ({ ...r, variants: joined(r.variant, r.materialColor) })),
      footerRows: unitTotals(d.trimRequirement.rows),
      note: notSaved(d.trimRequirement.source), emptyText: 'No Trim Requirement for this Work Order.',
    }),
    'section.embellishments': () => ({ rows: d.embellishments, footerRows: [], note: null, emptyText: 'No embellishments for this Work Order.' }),
  };

  const header = (cfg: SectionColumnConfig[]): Omit<ReportSection, 'key' | 'title'> => {
    const values: Record<string, unknown> = {
      workOrderNo: h.workOrderNo, poNumber: h.poNumber, brand: h.brand, customer: h.customer, category: h.category,
      styleName: h.styleName, styleNo: h.styleNo, season: h.season, orderConfirmationDate: h.orderConfirmationDate,
      shipmentHandoverDate: h.shipmentHandoverDate, deliveryDate: h.deliveryDate, orderQuantity: h.orderQuantity,
      remarks: h.remarks, cuttingExtraPct: h.cuttingExtraPct,
      customerCode: h.customerCode, customerStyleNo: h.customerStyleNo, approved: h.approved, closed: h.closed,
      productionColors: d.colorSizeChart.colors.map((cl: any) => cl.color).join(', ') || null,
    };
    // Each header field is one row: its label, value and the value's own type / alignment / decimals.
    const rows = cfg.map((x) => {
      const col = sectionColumn('section.header', x);
      return { key: x.key, label: col.label, value: values[x.key] ?? null, type: col.type, align: col.align, decimals: col.decimals };
    });
    const widest = Math.max(0, ...cfg.map((x) => x.width ?? 0));
    return {
      layout: 'fields',
      // The value column takes the widest width set on any header field (blank = automatic).
      columns: [{ key: 'label', label: 'Field', type: 'string', total: false }, { key: 'value', label: 'Value', type: 'string', total: false, width: widest || null }],
      rows, footerRows: [], note: null, emptyText: '',
      picture: true,
      imageUrl: h.imageUrl,
      badges: [...(h.approved ? ['APPROVED'] : []), ...(h.closed ? ['CLOSED'] : [])],
    };
  };

  const table = (key: string, cfg: SectionColumnConfig[]): Omit<ReportSection, 'key' | 'title'> => {
    const data = tables[key]();
    const cols = cfg.flatMap((x) => (key === 'section.colorSizeChart' && x.key === 'sizes'
      ? d.colorSizeChart.sizes.map((s: string) => sectionColumn(key, x, `size:${s}`, s))
      : [sectionColumn(key, x)]));
    return { layout: 'table', columns: cols, rows: data.rows, footerRows: placeTotalLabels(cols, data.footerRows), note: data.note, emptyText: data.emptyText };
  };

  const titles = new Map<string, string>(ORDER_FORM_SECTIONS);
  return columns
    .filter((col) => titles.has(col.field))
    .map((col) => {
      const cfg = effectiveConfig(col.field, col.sectionColumns);
      return { key: col.field, title: col.label || titles.get(col.field)!, ...(col.field === 'section.header' ? header(cfg) : table(col.field, cfg)) };
    });
}
