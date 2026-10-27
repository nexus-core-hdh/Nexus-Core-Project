// Inward Gate Pass — the Report Builder document source (reports/inward-gate-pass.report.ts) and its
// data (legacy-erp/inventory-receipt-gate-pass.service.ts). Throwaway full-schema test database
// (`npm run test:gate-pass`); every test seeds its own receipts. Checks every printed value against
// the IM_Receipt / IM_ReceiptItem rows it comes from, that two receipts never mix, which receipt types
// print, the standard report, per-section column settings, exports, and that no title is printed.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { InventoryReceiptService } from '../../src/modules/legacy-erp/inventory-receipt.service';
import { InventoryReceiptGatePassService } from '../../src/modules/legacy-erp/inventory-receipt-gate-pass.service';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { ReportExportService } from '../../src/modules/reports/report-export.service';
import { UploadService } from '../../src/modules/upload/upload.service';
import { standardLegacyReportInputs } from '../../src/modules/reports/standard-legacy-reports';
import { GATE_PASS_SECTIONS } from '../../src/modules/reports/inward-gate-pass.report';

let prisma: PrismaService;
let reports: ReportBuilderService;
let exporter: ReportExportService;
let companyId: string;
let branchId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<{ id: number }[]>(sql))[0].id);
const user = () => ({ id: 'gate-pass-test', companyId });

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  const receipts = new InventoryReceiptService(prisma, null as any, null as any, null as any, null as any, audit);
  reports = new ReportBuilderService(prisma, audit, undefined, new InventoryReceiptGatePassService(prisma, receipts));
  exporter = new ReportExportService(new UploadService(prisma));
  const company = await prisma.company.create({ data: { name: `Gate Pass ${RUN}`, address: '21 KM Ferozepur Road, Lahore' } });
  companyId = company.id;
  branchId = (await prisma.branch.create({ data: { companyId, name: `Gate Pass ${RUN}` } })).id;
});
after(async () => { await prisma.$disconnect(); });

interface LineSeed { name: string; unit: string; gross: number | null; qty: number; wo?: string; shade?: string; lot?: string; rolls?: number; remarks?: string }

/** One receipt with its supplier, warehouse and lines; returns its id and the line ids. */
async function seedReceipt(o: { type: number; supplier: string; warehouse: string; driver?: string; vehicle?: string; ogp?: string; lines: LineSeed[] }) {
  const supplier = await one(Prisma.sql`INSERT INTO "FI_Account" ("CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${uniq('S')}, ${o.supplier}, 0) RETURNING "RecId" as id`);
  const warehouse = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("WarehouseCode", "WarehouseName", "IsDeleted") VALUES (${uniq('W')}, ${o.warehouse}, 0) RETURNING "RecId" as id`);
  const receiptNo = uniq('IGP-');
  const receiptId = await one(Prisma.sql`
    INSERT INTO "IM_Receipt" ("ReceiptNo", "ReceiptType", "ReceiptDate", "CurrentAccountId", "InWarehouseId", "DriverName", "PlateNumber", "DocumentNo", "IsDeleted")
    VALUES (${receiptNo}, ${o.type}, ${'2026-10-23'}::timestamp, ${supplier}, ${warehouse}, ${o.driver ?? null}, ${o.vehicle ?? null}, ${o.ogp ?? null}, 0) RETURNING "RecId" as id`);
  for (const [i, l] of o.lines.entries()) {
    const item = await one(Prisma.sql`INSERT INTO "IM_Item" ("InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${uniq('F')}, ${l.name}, 'FABRIC', 0) RETURNING "RecId" as id`);
    const unit = await one(Prisma.sql`INSERT INTO "MD_UnitSetItem" ("UnitCode", "UnitName", "IsDeleted") VALUES (${l.unit}, ${l.unit}, 0) RETURNING "RecId" as id`);
    let woItem: number | null = null;
    if (l.wo) {
      const wo = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "IsDeleted") VALUES (${l.wo}, 0) RETURNING "RecId" as id`);
      woItem = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${wo}, 1, 0) RETURNING "RecId" as id`);
    }
    const shade = l.shade ? (await prisma.colorCard.create({ data: { code: uniq('CC'), name: l.shade, color: '#888888', branchId } })).id : null;
    await prisma.$executeRaw`
      INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId", "ItemOrderNo", "InventoryId", "UnitId", "GrossQuantity", "Quantity", "WorkOrderReceiptItemId", "ColorCardId", "PartyNo", "PackageQuantity", "Explanation", "IsDeleted")
      VALUES (${receiptId}, ${i + 1}, ${item}, ${unit}, ${l.gross}, ${l.qty}, ${woItem}, ${shade}, ${l.lot ?? null}, ${l.rolls ?? null}, ${l.remarks ?? null}, 0)`;
  }
  return { receiptId, receiptNo };
}

const gatePassInput = () => standardLegacyReportInputs().find((r) => r.name === 'Inward Gate Pass')!;
async function run(receiptId: number, columns?: any[]) {
  const { definition } = await reports.validate('legacy-erp', gatePassInput());
  return reports.preview('legacy-erp', { ...definition, ...(columns ? { columns } : {}) }, { [definition.filters[0].id]: { value: String(receiptId) } }, user());
}
const section = (r: any, key: string) => r.sections.find((s: any) => s.key === key);

test('the standard Inward Gate Pass report validates: header, lines, signatures, one Receipt filter', async () => {
  const { definition } = await reports.validate('legacy-erp', gatePassInput());
  assert.deepEqual(definition.columns.map((c) => c.field), GATE_PASS_SECTIONS.map(([k]) => k));
  assert.deepEqual([definition.filters[0].field, definition.filters[0].operator, definition.filters[0].prompt], ['receiptId', 'eq', true]);
});

test('header and every line come from the selected receipt; totals per unit; no title printed', async () => {
  const a = await seedReceipt({
    type: 11, supplier: `Knitting ${RUN}`, warehouse: 'Ecru Store', driver: 'MASTER IMRAN', vehicle: 'BY HAND', ogp: 'CA#1400-A+1400-B',
    lines: [
      { name: 'L.S FLEECE PLAIN', unit: 'KG', gross: 15, qty: 14.5, wo: uniq('W/O-'), shade: 'GARDENIA - 11-0604', lot: 'LOT-A', rolls: 1, remarks: '1 ROLL' },
      { name: 'S. JERSEY 160 GSM', unit: 'KG', gross: null, qty: 2, shade: 'RHUBARB - 19-1652', remarks: '(LOT#SPL)' },
      { name: 'BUTTON 10MM', unit: 'PCS', gross: null, qty: 500 },
    ],
  });
  const r = await run(a.receiptId);
  assert.deepEqual(r.appliedFilters, [`Receipt ${a.receiptNo}`]);
  assert.deepEqual(r.document, { showTitle: false, companyAddress: '21 KM Ferozepur Road, Lahore', showSectionTitles: false }, 'no INWARD GATE PASS title');

  const header = section(r, 'section.header');
  assert.deepEqual(header.rows.slice(0, 6).map((x: any) => [x.label, x.value]), [
    ['Supplier Name', `Knitting ${RUN}`], ['IGP #', a.receiptNo], ['Ware House', 'Ecru Store'], ['Driver Name', 'MASTER IMRAN'],
    ['Vehicle #', 'BY HAND'], ['Party OGP', 'CA#1400-A+1400-B'],
  ]);
  // The receipt screen shows the date's calendar day (String(receiptDate).slice(0, 10)); so does the print.
  assert.equal(new Date(header.rows[6].value).toISOString().slice(0, 10), '2026-10-23');

  const lines = section(r, 'section.lines');
  assert.deepEqual(lines.columns.map((c: any) => c.label), ['Sr#.', 'Name', 'GROSS', 'Quantity', 'UOM', 'W/O', 'Shade', 'Lot #', 'Rolls/Bags', 'Remarks']);
  assert.equal(lines.rows.length, 3, 'one row per receipt line, no duplicates');
  const [l1, l2, l3] = lines.rows;
  assert.deepEqual([l1.srNo, l1.name, l1.gross, l1.quantity, l1.unit, l1.lot, l1.rollsBags, l1.remarks], [1, 'L.S FLEECE PLAIN', 15, 14.5, 'KG', 'LOT-A', 1, '1 ROLL']);
  assert.match(String(l1.workOrder), /^W\/O-/, 'W/O from the line\'s Work Order link');
  assert.match(String(l1.shade), /^GARDENIA - 11-0604 - CC/, 'Shade = ColorCard name - code');
  assert.deepEqual([l2.gross, l2.workOrder, l2.lot, l2.rollsBags], [null, null, null, null], 'missing optional values stay blank');
  assert.equal(l3.unit, 'PCS');
  // Totals per unit — KG and PCS never added together.
  assert.deepEqual(lines.footerRows.map((x: any) => [x.name, x.gross, x.quantity, x.rollsBags]), [['Total (KG)', 15, 16.5, 1], ['Total (PCS)', 0, 500, 0]]);

  const signatures = section(r, 'section.signatures');
  assert.equal(signatures.layout, 'signatures');
  assert.deepEqual(signatures.rows.map((x: any) => x.label), ['Gate Clerk', 'Carrier', 'Checked By']);

  for (const format of ['pdf', 'xlsx', 'csv'] as const) {
    const file = await exporter.export(r, format, `Gate Pass ${RUN}`);
    assert.ok(file.buffer.length > 100, `${format} export`);
  }
  const csv = (await exporter.export(r, 'csv', 'x')).buffer.toString('utf8');
  assert.ok(csv.includes('L.S FLEECE PLAIN') && csv.includes('Total (KG)'));
});

test('two receipts never mix', async () => {
  const a = await seedReceipt({ type: 2, supplier: `Supplier A ${RUN}`, warehouse: 'Store A', lines: [{ name: 'Yarn A', unit: 'KG', gross: 10, qty: 9 }] });
  const b = await seedReceipt({ type: 2, supplier: `Supplier B ${RUN}`, warehouse: 'Store B', lines: [{ name: 'Yarn B', unit: 'BAG', gross: null, qty: 3 }, { name: 'Yarn C', unit: 'BAG', gross: null, qty: 4 }] });
  const [ra, rb] = await Promise.all([run(a.receiptId), run(b.receiptId)]);
  assert.equal(section(ra, 'section.header').rows[0].value, `Supplier A ${RUN}`);
  assert.equal(section(rb, 'section.header').rows[0].value, `Supplier B ${RUN}`);
  assert.deepEqual(section(ra, 'section.lines').rows.map((x: any) => x.name), ['Yarn A']);
  assert.deepEqual(section(rb, 'section.lines').rows.map((x: any) => x.name), ['Yarn B', 'Yarn C']);
  assert.deepEqual(section(rb, 'section.lines').footerRows.map((x: any) => x.quantity), [7]);
});

test('only inward receipts print; missing, deleted and empty receipts are handled', async () => {
  const outward = await seedReceipt({ type: 122, supplier: `Return ${RUN}`, warehouse: 'Store', lines: [{ name: 'X', unit: 'KG', gross: null, qty: 1 }] });
  await assert.rejects(run(outward.receiptId), /Purchase Return — the Inward Gate Pass prints inward receipts only/);
  const sent = await seedReceipt({ type: 134, supplier: `Sent ${RUN}`, warehouse: 'Store', lines: [] });
  await assert.rejects(run(sent.receiptId), /inward receipts only/);
  await assert.rejects(run(999999999), /Receipt 999999999 was not found/);
  const empty = await seedReceipt({ type: 133, supplier: `Empty ${RUN}`, warehouse: 'Store', lines: [] });
  const r = await run(empty.receiptId);
  assert.deepEqual(section(r, 'section.lines').rows, []);
  assert.deepEqual(section(r, 'section.lines').footerRows, []);
  assert.equal(section(r, 'section.lines').emptyText, 'This receipt has no lines.');
  await prisma.$executeRaw`UPDATE "IM_Receipt" SET "IsDeleted" = 1 WHERE "RecId" = ${empty.receiptId}`;
  await assert.rejects(run(empty.receiptId), /not found/);
  const { definition } = await reports.validate('legacy-erp', gatePassInput());
  const waiting = await reports.preview('legacy-erp', definition, {}, user());
  assert.match(String(waiting.notice), /Choose the Receipt to print/);
});

test('line columns: optional ones can be added; settings save, reopen and print', async () => {
  const a = await seedReceipt({ type: 2, supplier: `Cfg ${RUN}`, warehouse: 'Store', lines: [{ name: 'Fleece', unit: 'KG', gross: 5, qty: 4.25, lot: 'L1' }] });
  const input = gatePassInput();
  const lineColumns = [{ key: 'itemCode', label: 'Code' }, { key: 'name' }, { key: 'quantity', decimals: 3, width: 12 }, { key: 'lot', hidden: true }];
  const created = await reports.create('legacy-erp', {
    ...input, name: `IGP ${RUN}`,
    columns: input.columns.map((c) => (c.field === 'section.lines' ? { ...c, sectionColumns: lineColumns } : c)),
  }, user());
  const reopened = await reports.get('legacy-erp', created.id, user());
  assert.deepEqual((reopened.columns as any[]).find((c) => c.field === 'section.lines').sectionColumns, lineColumns);
  const r = await reports.run('legacy-erp', created.id, { [(reopened.filters as any[])[0].id]: { value: String(a.receiptId) } }, user());
  const lines = section(r, 'section.lines');
  assert.deepEqual(lines.columns.map((c: any) => [c.key, c.label, c.width, c.decimals]), [['itemCode', 'Code', null, null], ['name', 'Name', null, null], ['quantity', 'Quantity', 12, 3]]);
  assert.ok(String(lines.rows[0].itemCode).startsWith('F'), 'Item Code from IM_Item');
  assert.equal(lines.footerRows[0].itemCode, 'Total (KG)', 'total label in the first visible text column (Code here)');
  await reports.remove('legacy-erp', created.id, user());
});

test('the Order Form still runs unchanged next to it (shared document engine)', async () => {
  const { definition } = await reports.validate('legacy-erp', standardLegacyReportInputs().find((r) => r.name === 'Order Form')!);
  const waiting = await reports.preview('legacy-erp', definition, {}, user());
  assert.match(String(waiting.notice), /Choose the Work Order to print/);
});
