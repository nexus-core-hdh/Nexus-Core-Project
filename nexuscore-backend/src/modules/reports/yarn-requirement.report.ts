// Report Builder "document" sources: the cumulative material requirement reports — Yarn Requirement
// (legacy "Yarn Requirement Report" with cumulative totals), and the same report for Fabric and for
// Trim. One or more Work Orders, each printed as its header line and its material table, then
// Cumulative Totals across them. Same document engine as the Order Form and the Inward Gate Pass:
// a report's columns are its three section kinds (each with its own configurable columns, applied to
// every Work Order's table alike), its filters choose the Work Orders. The data comes from
// YarnRequirementReportService (legacy-erp), which documents every figure's source and the row
// identity per material.
import type { RequirementMaterial, YarnRequirementReport } from '../legacy-erp/yarn-requirement-report.service';
import type { DocumentReportSource, ReportField } from './report-sources';
import {
  OPTIONAL_COLUMN as opt, ReportSection, SectionColumnConfig, SectionColumnDef, catalogForDesigner,
  sectionColumnDef as c, toSectionColumn, visibleSectionConfig,
} from './document-sections';

/** Filter fields (same on every material report): specific Work Orders ("is one of"), and/or Work Orders by Order No. */
export const YARN_REPORT_WORK_ORDERS_FIELD = 'workOrderIds';
export const YARN_REPORT_ORDER_NO_FIELD = 'workOrderNo';
/** Option: calculate requirements from the BOM for Work Orders that have none saved. Default No. */
export const BOM_FALLBACK_FIELD = 'calculateFromBom';
export const BOM_FALLBACK_YES = 'yes';
export const BOM_FALLBACK_OPTIONS = [
  { value: 'no', label: 'No — Show Message' },
  { value: BOM_FALLBACK_YES, label: 'Yes — Calculate from BOM' },
];

export const MATERIAL_REPORT_SECTIONS = (material: RequirementMaterial) => [
  ['section.workOrderHeader', 'Work Order Header'],
  ['section.yarnLines', `${MATERIAL[material].label} Requirements (per Work Order)`],
  ['section.cumulative', 'Cumulative Totals'],
] as const;

const MATERIAL: Record<RequirementMaterial, { label: string; sourceKey: string; reportName: string; colored: boolean }> = {
  yarn: { label: 'Yarn', sourceKey: 'yarn-requirement-report', reportName: 'Yarn Requirement Report', colored: false },
  fabric: { label: 'Fabric', sourceKey: 'fabric-requirement-report', reportName: 'Fabric Cumulative Report', colored: true },
  trim: { label: 'Trim', sourceKey: 'trim-requirement-report', reportName: 'Trim Cumulative Report', colored: true },
};
export const MATERIAL_REPORT_SOURCE_KEYS = Object.fromEntries(Object.entries(MATERIAL).map(([m, v]) => [m, v.sourceKey])) as Record<RequirementMaterial, string>;
export const MATERIAL_REPORT_NAMES = Object.fromEntries(Object.entries(MATERIAL).map(([m, v]) => [m, v.reportName])) as Record<RequirementMaterial, string>;
/** The material a material-report source key is for. */
export const materialOfSource = (sourceKey: string) => (Object.keys(MATERIAL) as RequirementMaterial[]).find((m) => MATERIAL[m].sourceKey === sourceKey);

// Yarn names kept for existing imports.
export const YARN_REPORT_SOURCE_KEY = MATERIAL.yarn.sourceKey;
export const YARN_REPORT_SECTIONS = MATERIAL_REPORT_SECTIONS('yarn');

/** Every column each section can print — each one a value the report's data carries. */
function lineColumns(material: RequirementMaterial, cumulative: boolean): SectionColumnDef[] {
  const { label, colored } = MATERIAL[material];
  return [
    c('code', `${label} Code`, 'string', { defaultWidth: 12 }), c('name', `${label} Name`),
    // Process (the recipe's / BOM line's) and Production Color (the garment's) belong to one Work Order.
    ...(cumulative ? [] : [c('process', 'Process', 'string', { defaultWidth: 16 })]),
    c('variant1', 'Variant-1', 'string', { defaultWidth: 22 }),
    ...(colored && !cumulative ? [c('productionColor', 'Production Color', 'string', { defaultWidth: 18 })] : []),
    ...(colored ? [c('materialColor', 'Material Color', 'string', { defaultWidth: 18 })] : []),
    // Quantities with 2 decimals, as the legacy report prints them (0.00).
    c('requirement', 'Requirement', 'number', { defaultWidth: 12, defaultDecimals: 2 }),
    // Yarn prints like the legacy report (no unit column); Fabric / Trim units vary (KG, PCS, CONE...).
    c('unit', 'Unit', 'string', { ...(colored ? {} : opt), defaultWidth: 7 }),
    c('purchaseAccount', 'Purchase Current Account', 'string', { defaultWidth: 24 }),
    c('purchaseOrdered', 'Pur.Order', 'number', { defaultWidth: 10, defaultDecimals: 2 }), c('received', 'Received', 'number', { defaultWidth: 10, defaultDecimals: 2 }),
    c('outQty', 'Out.Qty.', 'number', { defaultWidth: 10, defaultDecimals: 2 }),
  ];
}
const HEADER_COLUMNS: SectionColumnDef[] = [
  c('workOrderNo', 'Order No'), c('styleCode', 'Style Code'), c('styleName', 'Style Name'), c('customer', 'Customer'),
  c('orderDate', 'Order Date', 'date'), c('quantity', 'Quantity', 'number'),
  c('customerCode', 'Customer Code', 'string', opt), c('customerOrderNo', 'Customer Order No', 'string', opt),
  c('deliveryDate', 'Delivery Date', 'date', opt),
];
export const materialSectionColumns = (material: RequirementMaterial): Record<string, SectionColumnDef[]> => ({
  'section.workOrderHeader': HEADER_COLUMNS,
  'section.yarnLines': lineColumns(material, false),
  'section.cumulative': lineColumns(material, true),
});
export const YARN_REPORT_SECTION_COLUMNS = materialSectionColumns('yarn');

function materialSource(material: RequirementMaterial): DocumentReportSource {
  const { label, sourceKey } = MATERIAL[material];
  const columns = materialSectionColumns(material);
  return {
    kind: 'document',
    key: sourceKey,
    module: 'legacy-erp',
    label: `Work Orders — ${label} Requirement`,
    description: `${label} requirement of one or more Work Orders — each Work Order's header and ${label.toLowerCase()} table (requirement, purchase order, received, sent to production), then Cumulative Totals across them. Choose the Work Orders, or an Order No to include every matching Work Order.`,
    builder: sourceKey,
    defaultSort: { field: YARN_REPORT_ORDER_NO_FIELD, direction: 'desc' },
    menuSection: { title: 'Production Reports', icon: 'Factory' },
    fields: [
      {
        key: YARN_REPORT_WORK_ORDERS_FIELD, label: 'Work Orders', group: 'Print For', type: 'number',
        operators: ['in'], lookup: { masterKey: 'manufacturing-order', lookupPath: '/legacy-erp/work-orders-list', multiple: true },
      },
      { key: YARN_REPORT_ORDER_NO_FIELD, label: 'Order No', group: 'Print For', type: 'string', operators: ['startsWith', 'contains', 'equals'] },
      {
        key: BOM_FALLBACK_FIELD, label: 'Calculate Missing Requirements from BOM', group: 'Options', type: 'string',
        operators: ['equals'], options: BOM_FALLBACK_OPTIONS,
      },
      ...MATERIAL_REPORT_SECTIONS(material).map(([key, sectionLabel]): ReportField => ({
        key, label: sectionLabel, group: 'Sections', type: 'string', section: true, sectionColumns: catalogForDesigner(columns[key]),
      })),
    ],
  };
}
export const YARN_REPORT_SOURCE = materialSource('yarn');
export const FABRIC_REPORT_SOURCE = materialSource('fabric');
export const TRIM_REPORT_SOURCE = materialSource('trim');

const SOURCE_NOTE = 'Not saved on the Requirements screen yet — calculated from the current BOM and quantities.';
/** A Work Order without saved requirements when the BOM fallback is off. */
export const NOT_SAVED_MESSAGE = 'Requirements have not been saved on the Requirements screen for this Work Order. Enable "Calculate Missing Requirements from BOM" to calculate them from the BOM.';
const procurementNote = (label: string) =>
  `Pur.Order, Received and Out.Qty. are recorded per Work Order and ${label.toLowerCase()} item, not per variant or color — shown on each item's first row.`;

/** Header + material table per Work Order (in the report's section order), then Cumulative Totals. */
export function yarnReportSections(d: YarnRequirementReport, columns: { field: string; label?: string; sectionColumns?: SectionColumnConfig[] }[]): ReportSection[] {
  const material = d.material;
  const catalog = materialSectionColumns(material);
  const { label } = MATERIAL[material];
  const chosen = new Map(columns.filter((col) => catalog[col.field]).map((col) => [col.field, col]));
  const cfg = (key: string) => visibleSectionConfig(catalog[key], chosen.get(key)?.sectionColumns);
  const cols = (key: string) => cfg(key).map((x) => toSectionColumn(catalog[key], x));
  const out: ReportSection[] = [];
  const severalRowsPerItem = (rows: any[]) => new Set(rows.map((r) => r.inventoryId ?? r.name)).size < rows.length;

  for (const wo of d.workOrders) {
    if (chosen.has('section.workOrderHeader')) {
      const values = wo.header as Record<string, unknown>;
      out.push({
        key: `section.workOrderHeader#${wo.workOrderId}`, title: '', layout: 'inline',
        columns: [{ key: 'label', label: 'Field', type: 'string', total: false }, { key: 'value', label: 'Value', type: 'string', total: false }],
        rows: cfg('section.workOrderHeader').map((x) => {
          const sc = toSectionColumn(HEADER_COLUMNS, x);
          return { key: x.key, label: sc.label, value: values[x.key] ?? null, type: sc.type, align: sc.align, decimals: sc.decimals };
        }),
        footerRows: [], note: null, emptyText: '',
      });
    }
    if (chosen.has('section.yarnLines')) {
      const notes = [wo.status === 'calculated' ? SOURCE_NOTE : null, severalRowsPerItem(wo.rows) ? procurementNote(label) : null].filter(Boolean);
      out.push({
        key: `section.yarnLines#${wo.workOrderId}`, title: chosen.get('section.yarnLines')?.label ?? '', layout: 'table',
        columns: cols('section.yarnLines'), rows: wo.rows, footerRows: [], note: notes.join(' ') || null,
        emptyText: wo.status === 'not-saved' ? NOT_SAVED_MESSAGE : `No ${label.toLowerCase()} requirement for ${wo.header.workOrderNo ?? 'this Work Order'}.`,
      });
    }
  }
  if (chosen.has('section.cumulative')) {
    const skipped = d.workOrders.filter((w) => w.status === 'not-saved').length;
    out.push({
      key: 'section.cumulative', title: chosen.get('section.cumulative')?.label || 'Cumulative Totals', layout: 'table',
      columns: cols('section.cumulative'), rows: d.cumulative, footerRows: [],
      note: [
        skipped ? `${skipped} Work Order${skipped === 1 ? '' : 's'} without saved requirements ${skipped === 1 ? 'is' : 'are'} not included.` : null,
        severalRowsPerItem(d.cumulative) ? procurementNote(label) : null,
      ].filter(Boolean).join(' ') || null,
      emptyText: d.workOrders.length ? `No ${label.toLowerCase()} requirement in these Work Orders.` : 'No Work Orders match the filter.',
    });
  }
  return out;
}
