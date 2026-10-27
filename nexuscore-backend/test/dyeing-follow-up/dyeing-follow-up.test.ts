// Dyeing Follow-up Report — the Report Builder document source (reports/dyeing-follow-up.report.ts)
// and its data (legacy-erp/dyeing-follow-up.service.ts). Throwaway full-schema test database
// (`npm run test:dyeing`); the tests seed their own subcontractors, items and receipts. Checks the
// column mapping per receipt type, grouping, Party / Subcontractor totals, Kalan and Fire% (also
// against the reference PDF's own figures), each filter alone and combined, date boundaries,
// validation, exports and a saved report.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { DyeingFollowUpService, dyeingTotals } from '../../src/modules/legacy-erp/dyeing-follow-up.service';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { ReportExportService } from '../../src/modules/reports/report-export.service';
import { standardLegacyReportInputs } from '../../src/modules/reports/standard-legacy-reports';
import { DYEING_FIELDS, DYEING_REPORT_NAME } from '../../src/modules/reports/dyeing-follow-up.report';

let prisma: PrismaService;
let reports: ReportBuilderService;
let exporter: ReportExportService;
let companyId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<{ id: number }[]>(sql))[0].id);
const user = () => ({ id: 'dyeing-test', companyId });

const ids: Record<string, number> = {};
const nos: Record<string, string> = {};
const DYE = `Dyeing ${RUN}`;
const KNIT = `Knitting ${RUN}`;

async function receipt(key: string, o: { type: number; account: number; date: string; process?: number; doc?: string; deleted?: boolean;
  lines: { item: number; qty: number; gross?: number | null; total?: number; party?: string; wo?: number; deleted?: boolean }[] }) {
  nos[key] = uniq('R-');
  const id = await one(Prisma.sql`
    INSERT INTO "IM_Receipt" ("ReceiptNo", "ReceiptType", "ReceiptDate", "CurrentAccountId", "SubcontractTypeId", "DocumentNo", "IsDeleted")
    VALUES (${nos[key]}, ${o.type}, ${o.date}::timestamp, ${o.account}, ${o.process ?? null}, ${o.doc ?? null}, ${o.deleted ? 1 : 0}) RETURNING "RecId" as id`);
  for (const [i, l] of o.lines.entries()) {
    await prisma.$executeRaw`
      INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId", "ReceiptType", "ItemOrderNo", "InventoryId", "Quantity", "GrossQuantity", "ItemTotal", "PartyNo", "WorkOrderReceiptItemId", "IsDeleted")
      VALUES (${id}, ${o.type}, ${i + 1}, ${l.item}, ${l.qty}, ${l.gross ?? null}, ${l.total ?? null}, ${l.party ?? null}, ${l.wo ?? null}, ${l.deleted ? 1 : 0})`;
  }
  return id;
}

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  reports = new ReportBuilderService(prisma, audit, undefined, undefined, undefined, new DyeingFollowUpService(prisma));
  exporter = new ReportExportService();
  companyId = (await prisma.company.create({ data: { name: `Dyeing ${RUN}` } })).id;

  const account = (code: string, name: string) => one(Prisma.sql`INSERT INTO "FI_Account" ("CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${code}, ${name}, 0) RETURNING "RecId" as id`);
  ids.a = await account(`A${RUN}`, 'Alpha Dyers');
  ids.b = await account(`B${RUN}`, 'Beta Knitwears');
  const item = (name: string) => one(Prisma.sql`INSERT INTO "IM_Item" ("InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${uniq('K')}, ${name}, 'FABRIC', 0) RETURNING "RecId" as id`);
  ids.fleece = await item(`L.S FLEECE ${RUN}`);
  ids.rib = await item(`RIB 2X1 ${RUN}`);
  const process = (name: string) => one(Prisma.sql`INSERT INTO "MD_SubcontractType" ("SubcontractTypeCode", "SubcontractTypeName", "InUse", "IsDeleted") VALUES (${uniq('P')}, ${name}, 1, 0) RETURNING "RecId" as id`);
  ids.dye = await process(DYE);
  ids.dye2 = await process(DYE); // a second master row of the same process — the filter matches both
  ids.knit = await process(KNIT);
  const wo = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "IsDeleted") VALUES (${`W/O-${RUN}`.slice(0, 25)}, 0) RETURNING "RecId" as id`);
  ids.wo = wo;
  ids.woItem = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${wo}, 1, 0) RETURNING "RecId" as id`);

  // Alpha, party (blank): sent 100, received gross 60 / net 50 (amount 600), returned 5.
  await receipt('sent', { type: 134, account: ids.a, date: '2026-03-01 17:00', process: ids.dye, doc: `OGP-${RUN}-1`, lines: [{ item: ids.fleece, qty: 100 }] });
  await receipt('recv', { type: 11, account: ids.a, date: '2026-03-05 17:00', process: ids.dye2, lines: [{ item: ids.fleece, qty: 50, gross: 60, total: 600 }] });
  await receipt('ret', { type: 133, account: ids.a, date: '2026-03-06 09:00', process: ids.dye, lines: [{ item: ids.fleece, qty: 5 }] });
  // Alpha, party P1: received without a gross weight (gross = quantity), linked to a Work Order.
  await receipt('p1', { type: 11, account: ids.a, date: '2026-03-10 17:00', process: ids.knit, lines: [{ item: ids.rib, qty: 20, party: `P1${RUN}`, wo: ids.woItem }] });
  // Beta: sent only.
  await receipt('beta', { type: 134, account: ids.b, date: '2026-04-01 17:00', process: ids.dye, doc: `OGP-${RUN}-9`, lines: [{ item: ids.rib, qty: 50 }] });
  // Never printed: another receipt type, a deleted receipt, a deleted line.
  await receipt('purchase', { type: 2, account: ids.a, date: '2026-03-02', lines: [{ item: ids.fleece, qty: 999 }] });
  await receipt('opReturn', { type: 12, account: ids.a, date: '2026-03-02', lines: [{ item: ids.fleece, qty: 888 }] });
  await receipt('deleted', { type: 11, account: ids.a, date: '2026-03-02', deleted: true, lines: [{ item: ids.fleece, qty: 777 }] });
  await receipt('deletedLine', { type: 11, account: ids.a, date: '2026-03-02', lines: [{ item: ids.fleece, qty: 666, deleted: true }] });
});
after(async () => { await prisma.$disconnect(); });

const input = () => standardLegacyReportInputs().find((r) => r.name === DYEING_REPORT_NAME)!;
/** Runs the standard report with the given prompt values (by field). */
async function run(values: Partial<Record<keyof typeof DYEING_FIELDS, string>>) {
  const { definition } = await reports.validate('legacy-erp', input());
  const params: Record<string, { value: string }> = {};
  for (const f of definition.filters) {
    const key = (Object.keys(DYEING_FIELDS) as (keyof typeof DYEING_FIELDS)[]).find((k) => DYEING_FIELDS[k] === f.field)!;
    if (values[key]) params[f.id] = { value: values[key]! };
  }
  return reports.preview('legacy-erp', definition, params, user());
}
const both = () => `${ids.a},${ids.b}`;
const tables = (r: any) => (r.sections as any[]).filter((s) => s.layout === 'table');
const receiptNos = (r: any) => tables(r).flatMap((s) => s.rows.map((x: any) => x.receiptNo));
const ours = (r: any) => receiptNos(r).filter((n: string) => Object.values(nos).includes(n));
const keyOf = (no: string) => Object.entries(nos).find(([, v]) => v === no)![0];

test('Kalan and Fire% reproduce the reference report (dying.pdf) figures', () => {
  const t = (sent: number, grossReceived: number, netReceived: number, returned: number) => dyeingTotals([{ sent, grossReceived, netReceived, returned, amount: 0 }]);
  const cases: [number, number, number, number, number, number][] = [
    [0, 36, 34, 0, -36, 5.56], // CA-0001
    [909, 0, 0, 0, 909, 100], // CA-0003 (nothing received)
    [241942.4384, 450668.8518, 366478.1676, 35, -208761.41, 18.67], // S-0044 party (blank)
    [30048.4, 54952.7086, 48408.869, 11.5, -24915.81, 11.89], // S-0052 party (blank)
    [8308, 8307.5, 26722.86, 0, 0.5, -221.67], // S-0047
    [19985.7893, 16217.4619, 14466, 0, 3768.33, 10.8], // S-0051
  ];
  for (const [s, g, n, r, kalan, fire] of cases) assert.deepEqual([t(s, g, n, r).kalan, t(s, g, n, r).firePercent], [kalan, fire], `${s}/${g}/${n}/${r}`);
});

test('grouping, column mapping per receipt type, Party / Subcontractor totals, Kalan and Fire%', async () => {
  const r = await run({ subcontractors: both() });
  assert.deepEqual(ours(r).map(keyOf), ['sent', 'recv', 'ret', 'p1', 'beta'], 'only Sent / Receive / Sent Return lines, by subcontractor, party, date');
  const inline = (r.sections as any[]).filter((s) => s.layout === 'inline').map((s) => s.rows.map((x: any) => `${x.label}:${x.value ?? ''}`).join());
  assert.deepEqual(inline, [`Subcontractor:A${RUN} Alpha Dyers`, 'Party No:', `Party No:P1${RUN}`, `Subcontractor:B${RUN} Beta Knitwears`, 'Party No:']);
  const [blank, p1, beta] = tables(r);
  assert.deepEqual(blank.rows.map((x: any) => [x.sent, x.grossReceived, x.netReceived, x.returned, x.amount]), [[100, 0, 0, 0, 0], [0, 60, 50, 0, 600], [0, 0, 0, 5, 0]]);
  assert.deepEqual(blank.rows.map((x: any) => x.receiptDate), ['2026-03-01', '2026-03-05', '2026-03-06'], 'the receipt screen\'s calendar day');
  assert.deepEqual(p1.rows.map((x: any) => [x.grossReceived, x.netReceived, x.workOrderNo, x.process]), [[20, 20, `W/O-${RUN}`.slice(0, 25), KNIT]]);
  // Footers: Party Total + Kalan line; the last party also closes the subcontractor.
  const foot = (s: any) => s.footerRows.map((x: any) => x.inventoryName);
  assert.deepEqual(foot(blank), ['Party Total :', 'Kalan : 35.00     Fire% : 8.33']);
  assert.deepEqual(blank.footerRows[0], { ...blank.footerRows[0], sent: 100, grossReceived: 60, netReceived: 50, returned: 5, amount: 600 });
  assert.deepEqual(foot(p1), ['Party Total :', 'Kalan : -20.00     Fire% : 0.00', 'Subcontractor Total :', 'Kalan : 15.00     Fire% : 6.25']);
  assert.deepEqual(p1.footerRows[2], { ...p1.footerRows[2], sent: 100, grossReceived: 80, netReceived: 70, returned: 5, amount: 600 });
  assert.deepEqual(foot(beta), ['Party Total :', 'Kalan : 50.00     Fire% : 100.00', 'Subcontractor Total :', 'Kalan : 50.00     Fire% : 100.00']);
  assert.match(r.appliedFilters[0], /Party Name: A.* Alpha Dyers, B.* Beta Knitwears/);
});

test('each filter alone and combined (AND); date boundaries are whole calendar days', async () => {
  const keys = async (v: Parameters<typeof run>[0]) => ours(await run({ subcontractors: both(), ...v })).map(keyOf);
  assert.deepEqual(await keys({ dateFrom: '2026-03-05', dateTo: '2026-03-06' }), ['recv', 'ret'], 'both days included in full');
  assert.deepEqual(await keys({ dateTo: '2026-03-05' }), ['sent', 'recv'], 'a line at 17:00 on the Date To day is in');
  assert.deepEqual(await keys({ dateFrom: '2026-03-06' }), ['ret', 'p1', 'beta']);
  assert.deepEqual(ours(await run({ subcontractors: String(ids.b) })).map(keyOf), ['beta'], 'Party Name alone');
  assert.deepEqual(ours(await run({ dateFrom: '2026-03-01', dateTo: '2026-03-31', subcontractors: String(ids.a) })).map(keyOf), ['sent', 'recv', 'ret', 'p1']);
  assert.deepEqual(await keys({ dateFrom: '2026-03-01', dateTo: '2026-03-31', process: DYE, inventory: String(ids.fleece) }), ['sent', 'recv', 'ret'], 'process by name covers both "Dyeing" master rows');
  assert.deepEqual(await keys({ process: KNIT, inventory: String(ids.fleece) }), [], 'no line matches both');
  assert.deepEqual(await keys({ documentNo: `OGP-${RUN}-9` }), ['beta']);
  assert.deepEqual(await keys({ documentNo: `ogp-${RUN}` }), ['sent', 'beta'], 'contains, case-insensitive');
  assert.deepEqual(await keys({ workOrders: String(ids.wo) }), ['p1']);
  assert.deepEqual(await keys({ partyNo: `P1${RUN}` }), ['p1']);
  assert.deepEqual(await keys({ receiptNo: nos.ret }), ['ret']);
  assert.deepEqual(await keys({ inventoryName: `RIB 2X1 ${RUN}` }), ['p1', 'beta']);
  const none = await run({ subcontractors: both(), partyNo: 'NO-SUCH-PARTY' });
  assert.equal(tables(none).length, 1);
  assert.equal(tables(none)[0].emptyText, 'No subcontract receipts match the filters.');
});

test('empty filters print every subcontract receipt; invalid input is rejected', async () => {
  const all = await run({});
  assert.deepEqual(ours(all).map(keyOf), ['sent', 'recv', 'ret', 'p1', 'beta']);
  assert.deepEqual(all.appliedFilters, ['All subcontract receipts']);
  await assert.rejects(run({ dateFrom: '2026-03-10', dateTo: '2026-03-01' }), /Date From must be on or before Date To/);
  await assert.rejects(run({ dateFrom: '2026-13-40' }), /Date From is not a valid date/);
  await assert.rejects(run({ subcontractors: 'abc' }), /Choose valid values for "Party Name"/);
});

test('exports, and a saved report with fixed filters and column settings', async () => {
  const r = await run({ subcontractors: both() });
  const csv = (await exporter.export(r, 'csv', 'Test Co')).buffer.toString('utf8');
  assert.ok(csv.includes('Kalan : 15.00     Fire% : 6.25'));
  assert.ok(csv.includes('Subcontractor Total :'));
  for (const format of ['pdf', 'xlsx'] as const) assert.ok((await exporter.export(r, format, 'Test Co')).buffer.length > 1000);

  const base = input();
  const created = await reports.create('legacy-erp', {
    ...base, name: `Dyeing ${RUN}`,
    columns: base.columns.map((c) => (c.field === 'section.lines' ? { ...c, sectionColumns: [{ key: 'receiptNo' }, { key: 'inventoryName' }, { key: 'sent', decimals: 2 }, { key: 'process' }] } : c)),
    filters: [{ id: 'p', field: DYEING_FIELDS.process, operator: 'equals', value: DYE }, { id: 's', field: DYEING_FIELDS.subcontractors, operator: 'in', value: both() }],
  }, user());
  const saved = await reports.run('legacy-erp', created.id, {}, user());
  assert.deepEqual(ours(saved).map(keyOf), ['sent', 'recv', 'ret', 'beta']);
  assert.deepEqual(tables(saved)[0].columns.map((c: any) => [c.key, c.decimals]), [['receiptNo', null], ['inventoryName', null], ['sent', 2], ['process', null]]);
  assert.equal(tables(saved)[0].footerRows[0].inventoryName, 'Party Total :', 'the total label sits before the first quantity');
  await reports.remove('legacy-erp', created.id, user());
});
