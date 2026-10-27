// Report Builder "document" source: the Process Follow-up Report (legacy "Process Follow-up
// Report"). Order Manufacturing Entry quantities per Work Order × Color × Factory, one section per
// Process ("Process: Finishing") with its own column headings and a Process total. Same document
// engine as the Order Form, Inward Gate Pass, the cumulative reports and the Dyeing Follow-up: the
// report's columns are its sections (each with its own configurable columns), its filters — all
// optional, combined with AND — choose the lines. The data comes from ProcessFollowUpService
// (legacy-erp), which documents every figure's source and formula.
import type { ProcessFollowUpReport } from '../legacy-erp/process-follow-up.service';
import type { DocumentReportSource, ReportField } from './report-sources';
import {
  OPTIONAL_COLUMN as opt, ReportSection, ReportSectionColumn, SectionColumnConfig, SectionColumnDef, catalogForDesigner,
  sectionColumnDef as c, toSectionColumn, visibleSectionConfig,
} from './document-sections';

export const PROCESS_FOLLOW_UP_SOURCE_KEY = 'process-follow-up';
export const PROCESS_FOLLOW_UP_REPORT_NAME = 'Process Follow-up Report';

/** Filter fields — every one optional; together they are combined with AND. */
export const PROCESS_FOLLOW_UP_FIELDS = {
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
  customers: 'customerIds',
  workOrders: 'workOrderIds',
  orderNo: 'orderNo',
  styleCode: 'styleCode',
  styleName: 'styleName',
  color: 'color',
  processes: 'processIds',
  factories: 'factoryIds',
} as const;

/** Option (chooses no records): also print the master's processes that have no matching entries. */
export const PROCESS_FOLLOW_UP_EMPTY_FIELD = 'showEmptyProcesses';
export const PROCESS_FOLLOW_UP_EMPTY_YES = 'yes';
export const PROCESS_FOLLOW_UP_EMPTY_OPTIONS = [
  { value: 'no', label: 'No — only processes with entries (as on the legacy report)' },
  { value: PROCESS_FOLLOW_UP_EMPTY_YES, label: 'Yes — every process of the Process master' },
];

export const PROCESS_FOLLOW_UP_SECTIONS = [
  ['section.process', 'Process'],
  ['section.lines', 'Work Orders (per Process)'],
] as const;

// Quantities print 2 decimals, quality quantities 4 (as on the reference) — and get the room for them.
const qty = (key: string, label: string, decimals = 2) => c(key, label, 'number', { defaultWidth: decimals > 2 ? 10 : 8, defaultDecimals: decimals });
/** Every column each section can print — each one a value the report's data carries. Default
 *  columns and order are the reference report's; the rest are offered by Columns → Add column. */
export const PROCESS_FOLLOW_UP_SECTION_COLUMNS: Record<string, SectionColumnDef[]> = {
  'section.process': [
    c('process', 'Process'),
    c('processCode', 'Process Code', 'string', opt),
  ],
  'section.lines': [
    c('deliveryDate', 'Delivery Date', 'date', { defaultWidth: 10 }), c('orderNo', 'Order No', 'string', { defaultWidth: 11 }),
    c('customer', 'Customer', 'string', { defaultWidth: 12 }), c('styleCode', 'Style Code', 'string', { defaultWidth: 13 }),
    c('style', 'Style', 'string', { defaultWidth: 13 }), c('stylePicture', 'Style Picture', 'image', { defaultWidth: 11 }),
    c('color', 'Color', 'string', { defaultWidth: 11 }), c('factory', 'Factory', 'string', { defaultWidth: 13 }),
    qty('sent', 'Sent'), qty('received', 'Received'),
    qty('aQuality', 'A Quality', 4), qty('bQuality', 'B Quality', 4), qty('defected', 'Defected', 4), qty('hole', 'Hole', 4),
    qty('others', 'Others', 4), qty('rejection', 'Rejection', 4),
    qty('returned', 'Return'), qty('wastage', 'Wastage'), qty('repair', 'Repair'), qty('balance', 'Balance'),
    c('qualityNotSet', 'Quality Not Set', 'number', { ...opt, defaultWidth: 10, defaultDecimals: 4 }),
    c('process', 'Process', 'string', { ...opt, defaultWidth: 12 }),
    c('customerCode', 'Customer Code', 'string', { ...opt, defaultWidth: 10 }),
    c('customerOrderNo', 'Customer Order No', 'string', { ...opt, defaultWidth: 12 }),
    c('factoryCode', 'Factory Code', 'string', { ...opt, defaultWidth: 10 }),
    c('firstDate', 'First Entry Date', 'date', { ...opt, defaultWidth: 10 }),
    c('lastDate', 'Last Entry Date', 'date', { ...opt, defaultWidth: 10 }),
  ],
};

const text = (key: string, label: string): ReportField =>
  ({ key, label, group: 'Filters', type: 'string', operators: ['contains', 'startsWith', 'equals'] });
const pick = (key: string, label: string, masterKey: string, lookupPath?: string): ReportField =>
  ({ key, label, group: 'Filters', type: 'number', operators: ['in'], lookup: { masterKey, multiple: true, ...(lookupPath ? { lookupPath } : {}) } });
export const PROCESS_FOLLOW_UP_SOURCE: DocumentReportSource = {
  kind: 'document',
  key: PROCESS_FOLLOW_UP_SOURCE_KEY,
  module: 'legacy-erp',
  label: 'Order Manufacturing — Process Follow-up',
  description: 'Order Manufacturing Entry sent, received (by quality), return and repair quantities per Work Order, Color and Factory, one section per Process with its total and Balance. Every filter is optional; filters given together must all match.',
  builder: PROCESS_FOLLOW_UP_SOURCE_KEY,
  defaultSort: { field: PROCESS_FOLLOW_UP_FIELDS.dateFrom, direction: 'asc' },
  menuSection: { title: 'Production Reports', icon: 'Factory' },
  fields: [
    { key: PROCESS_FOLLOW_UP_FIELDS.dateFrom, label: 'Date From', group: 'Filters', type: 'date', operators: ['gte'] },
    { key: PROCESS_FOLLOW_UP_FIELDS.dateTo, label: 'Date To', group: 'Filters', type: 'date', operators: ['lte'] },
    pick(PROCESS_FOLLOW_UP_FIELDS.customers, 'Customer', 'current-account'),
    pick(PROCESS_FOLLOW_UP_FIELDS.workOrders, 'Work Order No', 'manufacturing-order', '/legacy-erp/work-orders-list'),
    text(PROCESS_FOLLOW_UP_FIELDS.orderNo, 'Order No'),
    text(PROCESS_FOLLOW_UP_FIELDS.styleCode, 'Style Code'),
    text(PROCESS_FOLLOW_UP_FIELDS.styleName, 'Style Name'),
    text(PROCESS_FOLLOW_UP_FIELDS.color, 'Color'),
    pick(PROCESS_FOLLOW_UP_FIELDS.processes, 'Process', 'process'),
    pick(PROCESS_FOLLOW_UP_FIELDS.factories, 'Factory', 'current-account'),
    {
      key: PROCESS_FOLLOW_UP_EMPTY_FIELD, label: 'Show Processes Without Entries', group: 'Options', type: 'string',
      operators: ['equals'], options: PROCESS_FOLLOW_UP_EMPTY_OPTIONS,
    },
    ...PROCESS_FOLLOW_UP_SECTIONS.map(([key, label]): ReportField => ({
      key, label, group: 'Sections', type: 'string', section: true, sectionColumns: catalogForDesigner(PROCESS_FOLLOW_UP_SECTION_COLUMNS[key]),
    })),
  ],
};

/** The Process total row: its label in the last text column before the first quantity (as on the paper report). */
function totalRow(columns: ReportSectionColumn[], label: string, t: Record<string, number | null>) {
  const firstNumber = columns.findIndex((col) => col.type === 'number');
  const before = columns.slice(0, firstNumber < 0 ? columns.length : firstNumber).filter((col) => col.type !== 'number' && col.type !== 'image');
  const labelKey = before[before.length - 1]?.key ?? columns.find((col) => col.type !== 'number' && col.type !== 'image')?.key;
  const totals = Object.fromEntries(columns.filter((col) => col.type === 'number').map((col) => [col.key, t[col.key] ?? null]));
  return { ...totals, ...(labelKey ? { [labelKey]: `${label} :` } : {}), __kind: 'total' };
}

/** Per Process: its heading line, then its table (column headings repeat per process) with its total. */
export function processFollowUpSections(d: ProcessFollowUpReport, columns: { field: string; label?: string; sectionColumns?: SectionColumnConfig[] }[]): ReportSection[] {
  const chosen = new Map(columns.filter((col) => PROCESS_FOLLOW_UP_SECTION_COLUMNS[col.field]).map((col) => [col.field, col]));
  const cfg = (key: string) => visibleSectionConfig(PROCESS_FOLLOW_UP_SECTION_COLUMNS[key], chosen.get(key)?.sectionColumns);
  const lineCols = cfg('section.lines').map((x) => toSectionColumn(PROCESS_FOLLOW_UP_SECTION_COLUMNS['section.lines'], x));
  const inlineCols: ReportSectionColumn[] = [{ key: 'label', label: 'Field', type: 'string', total: false }, { key: 'value', label: 'Value', type: 'string', total: false }];
  const inline = (key: string, rows: Record<string, unknown>[]): ReportSection => ({ key, title: '', layout: 'inline', columns: inlineCols, rows, footerRows: [], note: null, emptyText: '' });
  const out: ReportSection[] = [];

  if (d.truncated) {
    out.push(inline('section.notice', [{ label: 'Note', value: `Only the first ${d.lineCount.toLocaleString('en-US')} lines are shown — narrow the filters to see the rest.` }]));
  }
  // Columns with no source in this ERP print blank — said once, above the first table, only when shown.
  const blank = lineCols.filter((col) => col.key === 'wastage' || d.missingQuality.includes(col.key)).map((col) => col.label);
  const note = blank.length && chosen.has('section.lines')
    ? `Blank columns have no source: ${blank.join(', ')} (no such quality type is defined / Order Manufacturing Entry records no wastage).`
    : null;
  if (!d.processes.length) {
    out.push({
      key: 'section.lines', title: chosen.get('section.lines')?.label ?? '', layout: 'table', columns: lineCols, rows: [], footerRows: [],
      note: null, emptyText: 'No Order Manufacturing entries match the filters.',
    });
    return out;
  }
  let noteShown = false;
  d.processes.forEach((p, pi) => {
    if (chosen.has('section.process')) {
      const values: Record<string, unknown> = { process: p.name ?? '(no process)', processCode: p.code };
      out.push(inline(`section.process#${pi}`, cfg('section.process').map((x) => {
        const sc = toSectionColumn(PROCESS_FOLLOW_UP_SECTION_COLUMNS['section.process'], x);
        return { key: x.key, label: sc.label, value: values[x.key] ?? null, type: sc.type, align: sc.align, decimals: sc.decimals };
      })));
    }
    if (!chosen.has('section.lines')) return;
    // A process without entries (only printed when asked): its heading and a line saying so — no table, no total.
    const empty = !p.lines.length;
    out.push({
      key: `section.lines#${pi}`, title: '', layout: 'table', columns: lineCols, rows: p.lines,
      footerRows: empty ? [] : [totalRow(lineCols, 'Process Total', p.totals)],
      note: !empty && !noteShown ? note : null, emptyText: empty ? 'No Order Manufacturing entries for this process.' : '',
    });
    if (!empty) noteShown = true;
  });
  return out;
}
