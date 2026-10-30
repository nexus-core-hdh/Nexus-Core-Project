// Order Manufacturing Entry report — the Report Builder document source
// (reports/order-manufacturing-entry.report.ts). Its data is the screen's own read model
// (OrderManufacturingService.getContext), stubbed here with W/O-000212's live figures for process
// 08 Printing (2026-10-30); everything else is the real ReportBuilderService and ReportExportService
// on the throwaway test database (`npm run test:om-entry-report`). Checks both views, the
// reconciliation of size-wise and summary totals, the Work Order / Process filters, the section
// columns (Manage Columns: visibility, order, labels) saved with a report and restored when it is run
// again, validation, the standard report definition and the exports (with row / cell colours).
import { useTestDatabase } from '../packing-list/test-db';
useTestDatabase();

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as ExcelJS from 'exceljs';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { ReportExportService } from '../../src/modules/reports/report-export.service';
import { standardLegacyReportInputs } from '../../src/modules/reports/standard-legacy-reports';
import {
  OM_ENTRY_FIELDS as F, OM_ENTRY_REPORT_NAME, OM_ENTRY_SECTIONS, OM_ENTRY_SIZE_LINES, OrderManufacturingContext,
} from '../../src/modules/reports/order-manufacturing-entry.report';

let prisma: PrismaService;
let reports: ReportBuilderService;
let companyId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const user = () => ({ id: 'om-entry-report-test', companyId });

// ── W/O-000212, process 08 Printing, as getContext returned it ─────────────────────────────────────
const SIZES = ['2Y', '3Y', '4Y', '5Y', '6Y', '7Y', '8Y', '9Y', '10Y', '12Y', '14Y'];
const per = (values: number[]) => Object.fromEntries(SIZES.map((s, i) => [s, values[i]]));
const ORDER = per([0, 101, 277, 386, 379, 330, 408, 296, 354, 250, 219]);
const WBC = per([0, 107, 291, 406, 398, 347, 429, 311, 372, 263, 230]);
const SENT = per([0, 98, 85, 0, 94, 212, 320, 0, 0, 0, 0]);
const RECEIVED = per([0, 4, 96, 0, 63, 84, 12, 0, 0, 0, 0]);
const bySize = Object.fromEntries(SIZES.map((s) => [s, {
  order: ORDER[s], willBeCut: WBC[s], cutting: 0, sent: SENT[s], received: RECEIVED[s], returned: 0, balance: ORDER[s] - RECEIVED[s] + 0,
}]));
const sumOf = (k: string) => SIZES.reduce((t, s) => t + (bySize[s] as any)[k], 0);
const totals = { order: sumOf('order'), willBeCut: sumOf('willBeCut'), cutting: 0, sent: sumOf('sent'), received: sumOf('received'), returned: 0, balance: sumOf('balance') };
const CONTEXT = (process: OrderManufacturingContext['process']): OrderManufacturingContext => ({
  workOrder: { workOrderNo: 'W/O-000212', customerCode: null, customerName: null },
  style: { styleNumber: 'SC-2026-8607', title: 'c', imageUrl: null },
  process, lockReason: null, sizes: SIZES, extraCuttingPercent: 5,
  materialColumns: [
    { key: 'fabric:card:24', lineType: 'Fabric', label: 'FLAT KNIT RIB 1X1 | 320 GSM' },
    { key: 'trim:card:9', lineType: 'Trim', label: 'sweeing thread 50/3' },
  ],
  qualityColumns: [{ id: 1, code: 'A', name: 'A Quality' }, { id: 2, code: 'B', name: 'B Quality' }],
  rows: [{ color: 'DARK DENIM', cells: { 'fabric:card:24': { code: 'DARK DENIM', name: 'DARK DENIM', hex: '#568147' } }, bySize, totals, byQuality: { 1: 259 } }],
  grandTotal: { bySize, totals, byQuality: { 1: 259 } },
});
const PRINTING = { id: 5, code: '08', name: 'Printing' };
const calls: [number, number | null][] = [];
const omStub = {
  getContext: async (wo: number, proc: number | null) => {
    calls.push([wo, proc]);
    if (wo !== 239) throw new NotFoundException('Work order not found');
    return CONTEXT(proc === 5 ? PRINTING : proc === 1 ? { id: 1, code: '12', name: 'Sewing' } : proc == null ? null : null);
  },
};

const definition = (filters: any[] = [], columns = OM_ENTRY_SECTIONS.map(([field]) => ({ field })) as any[]) =>
  ({ name: `OM ${RUN}`, dataSource: 'order-manufacturing-entry', columns, filters, sorting: [] }) as any;
const run = (view?: string, proc: number | null = 5, wo = 239) => reports.preview('legacy-erp', definition([
  { id: 'w', field: F.workOrder, operator: 'eq', value: String(wo) },
  ...(proc != null ? [{ id: 'p', field: F.process, operator: 'eq', value: String(proc) }] : []),
  ...(view ? [{ id: 'v', field: F.view, operator: 'equals', value: view }] : []),
]), {}, user());
const section = (r: any, key: string) => r.sections.find((s: any) => s.key === key);

before(async () => {
  prisma = new PrismaService();
  companyId = (await prisma.company.create({ data: { name: `OM Report ${RUN}` } })).id;
  reports = new ReportBuilderService(prisma, new AuditService(prisma), undefined, undefined, undefined, undefined, undefined, omStub as any);
});
after(async () => { await prisma.$disconnect(); });

test('Summary View (default): Work Order header, one line per color with the screen\'s figures and a Grand Total — no size breakdown', async () => {
  const r: any = await run();
  assert.deepEqual(r.sections.map((s: any) => s.key), ['section.header', 'section.summary']);
  assert.match(r.appliedFilters[0], /W\/O-000212 · Process 08 Printing · Summary View/);
  const h = section(r, 'section.header');
  assert.deepEqual(h.rows.map((x: any) => [x.label, x.value]), [['Order No', 'W/O-000212'], ['Customer', null], ['Style No', 'SC-2026-8607'], ['Style', 'c'], ['Process', '08 Printing'], ['Extra Cutting %', 5]]);
  const s = section(r, 'section.summary');
  assert.deepEqual(s.columns.map((c: any) => c.label), ['FLAT KNIT RIB 1X1 | 320 GSM', 'sweeing thread 50/3', 'Order', 'Will be Cut', 'Cutting', 'Sent', 'A Quality', 'B Quality', 'Received', 'Return', 'Balance']);
  const row = s.rows[0];
  // The screen's DARK DENIM line: zeros blank (Order always shown), the material's color swatch.
  assert.deepEqual([row.order, row.willBeCut, row.cutting, row.sent, row['quality:1'], row['quality:2'], row.received, row.returned, row.balance], [3000, 3154, null, 809, 259, null, 259, null, 2741]);
  assert.deepEqual(row.__cellFills, { 'material:fabric:card:24': '#568147' });
  assert.equal(s.footerRows[0]['material:fabric:card:24'], 'Grand Total');
  assert.equal(s.footerRows[0].balance, 2741);
  assert.match(s.note, /Will be Cut includes Extra Cutting 5%/);
});

test('Size-Wise View: every size of the Work Order per line, in the screen\'s line order and tints — totals reconcile with the Summary', async () => {
  const r: any = await run('sizes');
  assert.deepEqual(r.sections.map((s: any) => s.key), ['section.header', 'section.summary', 'section.sizes']);
  const z = section(r, 'section.sizes');
  assert.deepEqual(z.columns.map((c: any) => c.label), ['Color', 'Quantity', ...SIZES, 'Total']);
  assert.deepEqual(z.rows.map((x: any) => x.line), OM_ENTRY_SIZE_LINES.map((l) => l.label));
  assert.deepEqual(z.rows.map((x: any) => x.__fill), OM_ENTRY_SIZE_LINES.map((l) => l.fill));
  const line = (rows: any[], label: string) => rows.find((x) => x.line === label);
  assert.deepEqual(SIZES.map((s) => line(z.rows, 'Sent')[`size:${s}`]), [null, 98, 85, null, 94, 212, 320, null, null, null, null]);
  assert.deepEqual(SIZES.map((s) => line(z.rows, 'Balance')[`size:${s}`]), [null, 97, 181, 386, 316, 246, 396, 296, 354, 250, 219]);
  const summary = section(r, 'section.summary').rows[0];
  for (const l of OM_ENTRY_SIZE_LINES) {
    const zr = line(z.rows, l.label);
    const bySizes = SIZES.reduce((t, s) => t + (zr[`size:${s}`] ?? 0), 0);
    assert.equal(bySizes, zr.total ?? 0, `${l.label}: sizes add up to its Total`);
    assert.equal(zr.total ?? 0, l.key === 'order' ? summary.order : summary[l.key] ?? 0, `${l.label}: Total = Summary`);
    assert.equal(line(z.footerRows, l.label).total ?? 0, zr.total ?? 0, `${l.label}: Grand Total`);
  }
  assert.equal(z.footerRows[0].color, '** Grand Total **');
  // Changing the view never changes a figure.
  const summaryOnly: any = await run('summary');
  assert.deepEqual(section(summaryOnly, 'section.summary'), section(r, 'section.summary'));
});

test('filters: the chosen Work Order and Process reach the screen\'s read model; blank Process = the Work Order\'s default; errors are clear', async () => {
  calls.length = 0;
  await run('summary', 1);
  await run('summary', null);
  assert.deepEqual(calls, [[239, 1], [239, null]]);
  const none: any = await run('summary', null);
  assert.match(section(none, 'section.summary').note, /No Process selected/);
  assert.match((await run('summary', null)).appliedFilters[0], /Process no Process/);
  await assert.rejects(run('summary', 77), /Process 77 was not found/);
  await assert.rejects(run('summary', 5, 4242), /Work Order 4242 was not found/);
  const empty: any = await reports.preview('legacy-erp', definition([]), {}, user());
  assert.equal(empty.notice, 'Choose the Work Order to print.');
  await assert.rejects(reports.preview('legacy-erp', definition([{ id: 'v', field: F.view, operator: 'equals', value: 'pivot' }]), {}, user()), /Choose one of the options/);
});

test('Manage Columns: section columns saved with the report (visibility, order, labels) are restored when it is run again — figures unchanged', async () => {
  const columns = [
    { field: 'section.header', sectionColumns: [{ key: 'workOrderNo' }, { key: 'process', label: 'Operation' }] },
    { field: 'section.summary', sectionColumns: [{ key: 'color' }, { key: 'balance' }, { key: 'order' }, { key: 'sent', label: 'Issued' }, { key: 'qualities', hidden: true }, { key: 'received' }] },
    { field: 'section.sizes', sectionColumns: [{ key: 'line' }, { key: 'sizes' }, { key: 'total', label: 'Sum' }] },
  ];
  const created = await reports.create('legacy-erp', {
    ...definition([{ id: 'w', field: F.workOrder, operator: 'eq', prompt: true }, { id: 'p', field: F.process, operator: 'eq', prompt: true }, { id: 'v', field: F.view, operator: 'equals', prompt: true }], columns),
    name: `OM saved ${RUN}`,
  }, user());
  const r: any = await reports.run('legacy-erp', created.id, { w: { value: '239' }, p: { value: '5' }, v: { value: 'sizes' } }, user());
  assert.deepEqual(section(r, 'section.header').rows.map((x: any) => [x.label, x.value]), [['Order No', 'W/O-000212'], ['Operation', '08 Printing']]);
  const s = section(r, 'section.summary');
  assert.deepEqual(s.columns.map((c: any) => c.label), ['Color', 'Balance', 'Order', 'Issued', 'Received']);
  assert.deepEqual(['color', 'balance', 'order', 'sent', 'received'].map((k) => s.rows[0][k]), ['DARK DENIM', 2741, 3000, 809, 259]);
  assert.deepEqual(section(r, 'section.sizes').columns.map((c: any) => c.label), ['Quantity', ...SIZES, 'Sum']);
  // Reopened (read back from the database): the same settings.
  const again: any = await reports.get('legacy-erp', created.id, user());
  assert.deepEqual((again.columns as any[]).find((c) => c.field === 'section.summary').sectionColumns.map((x: any) => [x.key, x.label ?? null, !!x.hidden]),
    [['color', null, false], ['balance', null, false], ['order', null, false], ['sent', 'Issued', false], ['qualities', null, true], ['received', null, false]]);
  // Validation: unknown columns are refused; the expanding columns keep their data headings.
  await assert.rejects(reports.update('legacy-erp', created.id, { ...definition([], [{ field: 'section.summary', sectionColumns: [{ key: 'wastage' }] }]), name: `OM saved ${RUN}` }, user()), /Unknown column "wastage"/);
  await reports.remove('legacy-erp', created.id, user());
});

test('the standard "Order Manufacturing Entry Report" is valid and asks for the Work Order, Process and Report View', async () => {
  const std = standardLegacyReportInputs().find((d) => d.name === OM_ENTRY_REPORT_NAME)!;
  assert.ok(std);
  assert.deepEqual((std.filters ?? []).map((f: any) => [f.field, f.operator, f.prompt]), [[F.workOrder, 'eq', true], [F.process, 'eq', true], [F.view, 'equals', true]]);
  const r: any = await reports.preview('legacy-erp', std, {}, user());
  assert.equal(r.notice, 'Choose the Work Order to print.');
});

test('exports: PDF, Excel (with the row tints and the material swatch) and CSV', async () => {
  const r: any = await run('sizes');
  const exporter = new ReportExportService();
  const pdf = await exporter.export(r, 'pdf', 'Test Co');
  assert.equal(pdf.contentType, 'application/pdf');
  assert.ok(pdf.buffer.length > 1000);
  const csv = (await exporter.export(r, 'csv', 'Test Co')).buffer.toString('utf8');
  assert.match(csv, /DARK DENIM,,3,000.00,3,154.00|DARK DENIM,,"3,000.00","3,154.00"/);
  assert.match(csv, /\*\* Grand Total \*\*,Order/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await exporter.export(r, 'xlsx', 'Test Co')).buffer as any);
  const ws = wb.worksheets[0];
  const fills = new Set<string>();
  ws.eachRow((row) => row.eachCell((cell) => { const f = (cell.fill as any)?.fgColor?.argb; if (f) fills.add(f); }));
  for (const l of OM_ENTRY_SIZE_LINES) assert.ok(fills.has(`FF${l.fill.slice(1)}`), `${l.label} tint in Excel`);
  assert.ok(fills.has('FF568147'), 'material swatch in Excel');
});
