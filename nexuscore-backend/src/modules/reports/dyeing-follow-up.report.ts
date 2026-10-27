// Report Builder "document" source: the Dyeing Follow-up Report (legacy "Dyeing Follow up Report").
// Subcontract (outside process) receipt lines grouped by subcontractor ("Fasoncu") and Party No, each
// party with its Party Total and Kalan / Fire% line, each subcontractor closed by its Subcontractor
// Total and Kalan / Fire% line. Same document engine as the Order Form, Inward Gate Pass and the
// cumulative reports: the report's columns are its sections (each with its own configurable
// columns), its filters — all optional, combined with AND — choose the lines. The data comes from
// DyeingFollowUpService (legacy-erp), which documents every figure's source and formula.
import type { DyeingFollowUpReport, DyeingTotals } from '../legacy-erp/dyeing-follow-up.service';
import type { DocumentReportSource, ReportField } from './report-sources';
import {
  OPTIONAL_COLUMN as opt, ReportSection, ReportSectionColumn, SectionColumnConfig, SectionColumnDef, catalogForDesigner,
  sectionColumnDef as c, toSectionColumn, visibleSectionConfig,
} from './document-sections';

export const DYEING_SOURCE_KEY = 'dyeing-follow-up';
export const DYEING_REPORT_NAME = 'Dyeing Follow-up Report';

/** Filter fields — every one optional; together they are combined with AND. */
export const DYEING_FIELDS = {
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
  subcontractors: 'subcontractorIds',
  partyNo: 'partyNo',
  receiptNo: 'receiptNo',
  documentNo: 'documentNo',
  inventory: 'inventoryIds',
  inventoryName: 'inventoryName',
  process: 'process',
  workOrders: 'workOrderIds',
} as const;

export const DYEING_SECTIONS = [
  ['section.subcontractor', 'Subcontractor'],
  ['section.lines', 'Receipts (per Party No)'],
] as const;

const qty = (key: string, label: string) => c(key, label, 'number', { defaultWidth: 11, defaultDecimals: 4 });
/** Every column each section can print — each one a value the report's data carries. */
export const DYEING_SECTION_COLUMNS: Record<string, SectionColumnDef[]> = {
  'section.subcontractor': [
    c('subcontractor', 'Subcontractor'),
    c('subcontractorCode', 'Subcontractor Code', 'string', opt), c('subcontractorName', 'Subcontractor Name', 'string', opt),
  ],
  'section.lines': [
    c('receiptNo', 'Receipt No', 'string', { defaultWidth: 10 }), c('receiptDate', 'Receipt Date', 'date', { defaultWidth: 11 }),
    c('documentNo', 'Document', 'string', { defaultWidth: 12 }), c('inventoryCode', 'Inventory Code', 'string', { defaultWidth: 18 }),
    c('inventoryName', 'Inventory Name'),
    qty('sent', 'Sent'), qty('grossReceived', 'Gross Received'), qty('netReceived', 'Net Received'), qty('returned', 'Return'), qty('amount', 'Amount'),
    c('process', 'Process', 'string', { ...opt, defaultWidth: 12 }), c('receiptTypeLabel', 'Receipt Type', 'string', { ...opt, defaultWidth: 18 }),
    c('workOrderNo', 'Work Order', 'string', { ...opt, defaultWidth: 13 }), c('partyNo', 'Party No', 'string', { ...opt, defaultWidth: 10 }),
    c('unit', 'Unit', 'string', { ...opt, defaultWidth: 6 }), c('unitPrice', 'Price', 'number', { ...opt, defaultWidth: 10, defaultDecimals: 4 }),
    c('explanation', 'Explanation', 'string', { ...opt, defaultWidth: 20 }),
    c('subcontractorCode', 'Subcontractor Code', 'string', { ...opt, defaultWidth: 10 }), c('subcontractorName', 'Subcontractor Name', 'string', opt),
  ],
};

const text = (key: string, label: string, operators = ['contains', 'startsWith', 'equals']): ReportField =>
  ({ key, label, group: 'Filters', type: 'string', operators });
export const DYEING_SOURCE: DocumentReportSource = {
  kind: 'document',
  key: DYEING_SOURCE_KEY,
  module: 'legacy-erp',
  label: 'Subcontract Receipts — Dyeing Follow-up',
  description: 'Outside-process sent, received and returned lines by subcontractor and Party No, with Party / Subcontractor totals, Kalan (Sent − Gross Received − Return) and Fire%. Every filter is optional; filters given together must all match.',
  builder: DYEING_SOURCE_KEY,
  defaultSort: { field: DYEING_FIELDS.dateFrom, direction: 'asc' },
  menuSection: { title: 'Production Reports', icon: 'Factory' },
  fields: [
    { key: DYEING_FIELDS.dateFrom, label: 'Date From', group: 'Filters', type: 'date', operators: ['gte'] },
    { key: DYEING_FIELDS.dateTo, label: 'Date To', group: 'Filters', type: 'date', operators: ['lte'] },
    {
      key: DYEING_FIELDS.subcontractors, label: 'Party Name', group: 'Filters', type: 'number', operators: ['in'],
      lookup: { masterKey: 'current-account', multiple: true },
    },
    text(DYEING_FIELDS.partyNo, 'Party No'),
    text(DYEING_FIELDS.receiptNo, 'Receipt No'),
    text(DYEING_FIELDS.documentNo, 'Document No'),
    {
      key: DYEING_FIELDS.inventory, label: 'Inventory Code', group: 'Filters', type: 'number', operators: ['in'],
      lookup: { masterKey: 'inventory-item', multiple: true },
    },
    text(DYEING_FIELDS.inventoryName, 'Inventory Name'),
    text(DYEING_FIELDS.process, 'Process', ['equals', 'contains', 'startsWith']),
    {
      key: DYEING_FIELDS.workOrders, label: 'Work Order No', group: 'Filters', type: 'number', operators: ['in'],
      lookup: { masterKey: 'manufacturing-order', lookupPath: '/legacy-erp/work-orders-list', multiple: true },
    },
    ...DYEING_SECTIONS.map(([key, label]): ReportField => ({
      key, label, group: 'Sections', type: 'string', section: true, sectionColumns: catalogForDesigner(DYEING_SECTION_COLUMNS[key]),
    })),
  ],
};

const fmt2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOTAL_KEYS = ['sent', 'grossReceived', 'netReceived', 'returned', 'amount'] as const;
/** "Party Total" + "Kalan / Fire%" rows; labels go in the text column just before the first quantity (as on the paper report). */
function totalRows(columns: ReportSectionColumn[], label: string, t: DyeingTotals) {
  const firstNumber = columns.findIndex((col) => col.type === 'number');
  const before = columns.slice(0, firstNumber < 0 ? columns.length : firstNumber).filter((col) => col.type !== 'number');
  const labelKey = before[before.length - 1]?.key ?? columns.find((col) => col.type !== 'number')?.key ?? columns[0]?.key;
  const totals = Object.fromEntries(TOTAL_KEYS.map((k) => [k, t[k]]));
  return [
    { ...totals, ...(labelKey ? { [labelKey]: `${label} :` } : {}), __kind: 'total' },
    { ...(labelKey ? { [labelKey]: `Kalan : ${fmt2(t.kalan)}     Fire% : ${fmt2(t.firePercent)}` } : {}), kalan: t.kalan, firePercent: t.firePercent, __kind: 'kalan' },
  ];
}

/** Subcontractor header line, then per Party No its header line and table (with totals). */
export function dyeingSections(d: DyeingFollowUpReport, columns: { field: string; label?: string; sectionColumns?: SectionColumnConfig[] }[]): ReportSection[] {
  const chosen = new Map(columns.filter((col) => DYEING_SECTION_COLUMNS[col.field]).map((col) => [col.field, col]));
  const cfg = (key: string) => visibleSectionConfig(DYEING_SECTION_COLUMNS[key], chosen.get(key)?.sectionColumns);
  const lineCols = cfg('section.lines').map((x) => toSectionColumn(DYEING_SECTION_COLUMNS['section.lines'], x));
  const inlineCols: ReportSectionColumn[] = [{ key: 'label', label: 'Field', type: 'string', total: false }, { key: 'value', label: 'Value', type: 'string', total: false }];
  const inline = (key: string, rows: Record<string, unknown>[]): ReportSection => ({ key, title: '', layout: 'inline', columns: inlineCols, rows, footerRows: [], note: null, emptyText: '' });
  const out: ReportSection[] = [];

  if (d.truncated) {
    out.push(inline('section.notice', [{ label: 'Note', value: `Only the first ${d.lineCount.toLocaleString('en-US')} lines are shown — narrow the filters to see the rest.` }]));
  }
  if (!d.subcontractors.length) {
    out.push({
      key: 'section.lines', title: chosen.get('section.lines')?.label ?? '', layout: 'table', columns: lineCols, rows: [], footerRows: [],
      note: null, emptyText: 'No subcontract receipts match the filters.',
    });
    return out;
  }
  d.subcontractors.forEach((s, si) => {
    if (chosen.has('section.subcontractor')) {
      const values: Record<string, unknown> = {
        subcontractor: [s.code, s.name].filter(Boolean).join(' ') || '(no subcontractor)', subcontractorCode: s.code, subcontractorName: s.name,
      };
      out.push(inline(`section.subcontractor#${si}`, cfg('section.subcontractor').map((x) => {
        const sc = toSectionColumn(DYEING_SECTION_COLUMNS['section.subcontractor'], x);
        return { key: x.key, label: sc.label, value: values[x.key] ?? null, type: sc.type, align: sc.align, decimals: sc.decimals };
      })));
    }
    if (!chosen.has('section.lines')) return;
    s.parties.forEach((p, pi) => {
      out.push(inline(`section.party#${si}.${pi}`, [{ key: 'partyNo', label: 'Party No', value: p.partyNo, type: 'string' }]));
      const last = pi === s.parties.length - 1;
      out.push({
        key: `section.lines#${si}.${pi}`, title: '', layout: 'table', columns: lineCols, rows: p.lines,
        // The subcontractor's totals close its last party's table, as on the paper report.
        footerRows: [...totalRows(lineCols, 'Party Total', p.totals), ...(last ? totalRows(lineCols, 'Subcontractor Total', s.totals) : [])],
        note: null, emptyText: '',
      });
    });
  });
  return out;
}
