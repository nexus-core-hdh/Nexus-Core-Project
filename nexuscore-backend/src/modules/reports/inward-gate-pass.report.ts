// Report Builder "document" source: the Inward Gate Pass (legacy "INWARD GATE PASS" printout) —
// one inward inventory receipt printed as its header, its received lines and the signing block.
// Same engine as the Work Order Order Form (work-order-order-form.report.ts): the report's columns
// are the sections (each with its own configurable columns), its one filter is the receipt. The data
// comes from InventoryReceiptGatePassService (legacy-erp), which documents every field's source.
import type { InwardGatePass } from '../legacy-erp/inventory-receipt-gate-pass.service';
import type { DocumentReportSource, ReportField } from './report-sources';
import {
  OPTIONAL_COLUMN as opt, ReportSection, SectionColumnConfig, SectionColumnDef, catalogForDesigner, placeTotalLabels,
  sectionColumnDef as c, toSectionColumn, unitTotals, visibleSectionConfig,
} from './document-sections';

export const GATE_PASS_SOURCE_KEY = 'inward-gate-pass';
/** The parameter field: the receipt's RecId (IM_Receipt). */
export const GATE_PASS_RECEIPT_FIELD = 'receiptId';

export const GATE_PASS_SECTIONS = [
  ['section.header', 'Gate Pass Details'],
  ['section.lines', 'Received Items'],
  ['section.signatures', 'Signatures'],
] as const;

/** Every column each section can print — each one a value the receipt's data carries. */
export const GATE_PASS_SECTION_COLUMNS: Record<string, SectionColumnDef[]> = {
  'section.header': [
    c('supplier', 'Supplier Name'), c('receiptNo', 'IGP #'), c('warehouse', 'Ware House'), c('driverName', 'Driver Name'),
    c('vehicleNo', 'Vehicle #'), c('partyOgp', 'Party OGP'), c('receiptDate', 'Date', 'date'),
    c('supplierCode', 'Supplier Code', 'string', opt), c('warehouseCode', 'Warehouse Code', 'string', opt),
    c('receiptTypeLabel', 'Receipt Type', 'string', opt), c('shipmentDate', 'Shipment Date', 'date', opt),
  ],
  'section.lines': [
    // Default widths (characters) as on the paper form; Name takes the remaining width.
    c('srNo', 'Sr#.', 'number', { defaultWidth: 5 }), c('name', 'Name'), c('gross', 'GROSS', 'number', { defaultWidth: 9 }),
    c('quantity', 'Quantity', 'number', { defaultWidth: 10 }), c('unit', 'UOM', 'string', { defaultWidth: 6 }),
    c('workOrder', 'W/O', 'string', { defaultWidth: 13 }), c('shade', 'Shade', 'string', { defaultWidth: 24 }),
    c('lot', 'Lot #', 'string', { defaultWidth: 9 }), c('rollsBags', 'Rolls/Bags', 'number', { defaultWidth: 11 }),
    c('remarks', 'Remarks', 'string', { defaultWidth: 22 }),
    c('itemCode', 'Item Code', 'string', opt), c('shadeCode', 'Shade Code', 'string', opt), c('packageNo', 'Package No', 'number', opt),
    c('lotQuantity', 'Lot Quantity', 'number', opt), c('specialCode', 'Special Code', 'string', opt),
    c('customerOrderNo', 'Customer Order No', 'string', opt), c('orderReceiptNo', 'Purchase Order No', 'string', opt),
  ],
  'section.signatures': [
    c('gateClerk', 'Gate Clerk'), c('carrier', 'Carrier'), c('checkedBy', 'Checked By'),
  ],
};

export const GATE_PASS_SOURCE: DocumentReportSource = {
  kind: 'document',
  key: GATE_PASS_SOURCE_KEY,
  module: 'legacy-erp',
  label: 'Inventory Receipt — Inward Gate Pass',
  description: 'One inward inventory receipt (Purchase Receipt, Outside Process Receive, Outside Process Sent Return) printed as the Inward Gate Pass: supplier, IGP #, warehouse, driver, vehicle, party OGP and date, the received items with totals per unit, and the signing block. Columns are the sections (each with its own columns); the Receipt filter chooses the receipt.',
  builder: 'inward-gate-pass',
  defaultSort: { field: GATE_PASS_RECEIPT_FIELD, direction: 'asc' },
  menuSection: { title: 'Inventory Reports', icon: 'Boxes' },
  fields: [
    { key: GATE_PASS_RECEIPT_FIELD, label: 'Receipt', group: 'Print For', type: 'number', operators: ['eq'] },
    ...GATE_PASS_SECTIONS.map(([key, label]): ReportField => ({
      key, label, group: 'Sections', type: 'string', section: true, sectionColumns: catalogForDesigner(GATE_PASS_SECTION_COLUMNS[key]),
    })),
  ],
};

/** The gate pass's sections, in the order and with the titles of the report's columns. */
export function gatePassSections(d: InwardGatePass, columns: { field: string; label?: string; sectionColumns?: SectionColumnConfig[] }[]): ReportSection[] {
  const titles = new Map<string, string>(GATE_PASS_SECTIONS);
  return columns.filter((col) => titles.has(col.field)).map((col): ReportSection => {
    const defs = GATE_PASS_SECTION_COLUMNS[col.field];
    const cfg = visibleSectionConfig(defs, col.sectionColumns);
    const title = col.label || titles.get(col.field)!;
    if (col.field === 'section.header') {
      const values = d.header as Record<string, unknown>;
      const rows = cfg.map((x) => {
        const sc = toSectionColumn(defs, x);
        return { key: x.key, label: sc.label, value: values[x.key] ?? null, type: sc.type, align: sc.align, decimals: sc.decimals };
      });
      const widest = Math.max(0, ...cfg.map((x) => x.width ?? 0));
      return {
        key: col.field, title, layout: 'fields',
        columns: [{ key: 'label', label: 'Field', type: 'string', total: false }, { key: 'value', label: 'Value', type: 'string', total: false, width: widest || null }],
        rows, footerRows: [], note: null, emptyText: '',
      };
    }
    if (col.field === 'section.signatures') {
      // Blank signing lines — the paper form's own block; nothing about them is stored.
      return {
        key: col.field, title, layout: 'signatures',
        columns: [{ key: 'label', label: 'Signature', type: 'string', total: false }],
        rows: cfg.map((x) => ({ key: x.key, label: toSectionColumn(defs, x).label })), footerRows: [], note: null, emptyText: '',
      };
    }
    const columnsOut = cfg.map((x) => toSectionColumn(defs, x));
    // GROSS, Quantity and Rolls/Bags totalled per unit (the form's own footer), never across units.
    const footerRows = d.lines.length ? placeTotalLabels(columnsOut, unitTotals(d.lines, ['gross', 'quantity', 'rollsBags'])) : [];
    return {
      key: col.field, title, layout: 'table', columns: columnsOut, rows: d.lines, footerRows, note: null,
      emptyText: 'This receipt has no lines.',
    };
  });
}
