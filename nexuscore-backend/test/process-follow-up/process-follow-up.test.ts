// Process Follow-up Report — the Report Builder document source (reports/process-follow-up.report.ts)
// and its data (legacy-erp/process-follow-up.service.ts). Throwaway full-schema test database
// (`npm run test:process-follow-up`); the tests seed their own customers, factories, processes,
// quality types, Style Card, Work Orders and Order Manufacturing entries. Checks the column mapping
// per movement kind, the quality split, Balance (also against the reference PDF's own figures),
// grouping and Process totals, duplicate prevention, deleted records, each filter alone and
// combined, date boundaries, validation, exports (with a picture) and a saved report.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ProcessFollowUpService, processBalance, processTotals, QUALITY_COLUMNS } from '../../src/modules/legacy-erp/process-follow-up.service';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { LegacyMasterLookupService } from '../../src/modules/legacy-erp/legacy-master-lookup.service';
import { ReportExportService } from '../../src/modules/reports/report-export.service';
import { standardLegacyReportInputs } from '../../src/modules/reports/standard-legacy-reports';
import { PROCESS_FOLLOW_UP_EMPTY_FIELD, PROCESS_FOLLOW_UP_FIELDS as F, PROCESS_FOLLOW_UP_REPORT_NAME, processFollowUpSections } from '../../src/modules/reports/process-follow-up.report';

let prisma: PrismaService;
let reports: ReportBuilderService;
let companyId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<{ id: number }[]>(sql))[0].id);
const user = () => ({ id: 'process-follow-up-test', companyId });
const PICTURE = 'upload/0b6c1c8e-aaaa-4c1e-9f51-000000000001';
// A 1×1 PNG, served by the stub upload store below.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const ids: Record<string, number> = {};
const v: Record<string, number> = {}; // Work Order item variants (Color‖Size)
const EMB = `Embroidery ${RUN}`;
const FIN = `Finishing ${RUN}`;
const DYE = `Garment Dye ${RUN}`;
let wo1No = '';
let wo2No = '';
let styleNumber = '';

/** One Order Manufacturing entry, as the screen writes it: header + its Color×Size quantities. */
async function entry(o: { item: number; process: number; factory: number; inOut: 1 | 2; repair?: boolean; quality?: number | null; date: string;
  sizes: Record<string, number>; deleted?: boolean; productionType?: number; variantDeleted?: boolean }) {
  const total = Object.values(o.sizes).reduce((a, b) => a + b, 0);
  const id = await one(Prisma.sql`
    INSERT INTO "MA_WorkOrderProduction" ("WorkOrderItemId", "ProductionType", "ProcessId", "CurrentAccountId", "InOut", "IsRepair", "ProductionSubType", "ProductionDate", "Quantity", "IsDeleted")
    VALUES (${o.item}, ${o.productionType ?? 1}, ${o.process}, ${o.factory}, ${o.inOut}, ${o.repair ? 1 : 0}, ${o.quality ?? null}, ${o.date}::timestamp, ${total}, ${o.deleted ? 1 : 0})
    RETURNING "RecId" as id`);
  for (const [variant, qty] of Object.entries(o.sizes)) {
    await prisma.$executeRaw`INSERT INTO "MA_WorkOrderProductionVariant" ("WorkOrderProductionId", "WorkOrderItemVariantId", "Quantity", "IsDeleted") VALUES (${id}, ${v[variant]}, ${qty}, ${o.variantDeleted ? 1 : 0})`;
  }
}

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  reports = new ReportBuilderService(prisma, new AuditService(prisma), undefined, undefined, undefined, undefined, new ProcessFollowUpService(prisma));
  const company = await prisma.company.create({ data: { name: `Process ${RUN}` } });
  companyId = company.id;
  const branchId = (await prisma.branch.create({ data: { name: 'PF', companyId } })).id;

  const account = (name: string) => one(Prisma.sql`INSERT INTO "FI_Account" ("CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${uniq('A')}, ${name}, 0) RETURNING "RecId" as id`);
  ids.tap = await account(`Tap E Oeil ${RUN}`);
  ids.prime = await account(`Prime Source ${RUN}`);
  ids.f1 = await account(`Alpha Finishing ${RUN}`);
  ids.f2 = await account(`Beta Sewing Line ${RUN}`);
  const process = (name: string) => one(Prisma.sql`INSERT INTO "MA_Process" ("ProcessCode", "ProcessName", "IsDeleted") VALUES (${uniq('P').slice(0, 20)}, ${name}, 0) RETURNING "RecId" as id`);
  ids.emb = await process(EMB);
  ids.fin = await process(FIN);
  ids.fin2 = await process(FIN); // a second master process of the same name — a separate process
  ids.dye = await process(DYE); // in the master, no entries
  ids.gone = await process(`Aaa Deleted ${RUN}`); // deleted from the master later — its entries still print, last
  await prisma.$executeRaw`UPDATE "MA_Process" SET "IsDeleted" = 1 WHERE "RecId" = ${ids.gone}`;
  const quality = (code: string, name: string) => one(Prisma.sql`INSERT INTO "MA_QualityType" ("QualityCode", "QualityName", "IsDeleted") VALUES (${code}, ${name}, 0) RETURNING "RecId" as id`);
  ids.qa = await quality('A', 'A Quality');
  ids.qb = await quality('B', 'B Quality');
  ids.qr = await quality(uniq('R').slice(0, 10), 'Rejection');

  styleNumber = uniq('CA-');
  const style = await prisma.styleCard.create({ data: { styleNumber, title: `SWEAT BA NINON ${RUN}`, branchId, createdBy: 'u1', attachments: [{ type: 'image/png', url: PICTURE, name: 'front.png' }] } });
  const workOrder = async (no: string, customer: number, styleId: string | null, deleted = false) => {
    const id = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "CurrentAccountId", "StyleCardId", "DeliveryDate", "IsDeleted") VALUES (${no}, ${customer}, ${styleId}, '2026-05-14'::timestamp, ${deleted ? 1 : 0}) RETURNING "RecId" as id`);
    const item = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${id}, 1, 0) RETURNING "RecId" as id`);
    return { id, item };
  };
  wo1No = `W/O-A${RUN}`.slice(0, 25);
  wo2No = `W/O-B${RUN}`.slice(0, 25);
  const wo1 = await workOrder(wo1No, ids.tap, style.id);
  const wo2 = await workOrder(wo2No, ids.prime, null);
  const wo3 = await workOrder(`W/O-X${RUN}`.slice(0, 25), ids.tap, style.id, true); // deleted Work Order
  Object.assign(ids, { wo1: wo1.id, wo2: wo2.id, item1: wo1.item, item2: wo2.item, item3: wo3.item });
  const variant = async (key: string, item: number, explanation: string) => {
    v[key] = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation") VALUES (${item}, ${explanation}) RETURNING "RecId" as id`);
  };
  await variant('redS', wo1.item, 'RED‖S');
  await variant('redM', wo1.item, 'RED‖M');
  await variant('blueS', wo1.item, 'BLUE‖S');
  await variant('wo2redS', wo2.item, 'RED‖S');
  await variant('wo3redS', wo3.item, 'RED‖S');
  ids.oldItem1 = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${wo1.id}, 2, 1) RETURNING "RecId" as id`);
  await variant('oldRedM', ids.oldItem1, 'RED‖M');

  // Finishing · WO1 · RED · Alpha: sent 100, received 70 A + 5 B + 2 Rejection + 4 (no quality),
  // repair: 3 sent back (Return) and 3 received again (A).
  const fin = { process: ids.fin, factory: ids.f1, item: wo1.item };
  await entry({ ...fin, inOut: 2, date: '2026-03-01 09:00', sizes: { redS: 60, redM: 40 } });
  await entry({ ...fin, inOut: 1, quality: ids.qa, date: '2026-03-05 17:00', sizes: { redS: 40, redM: 30 } });
  await entry({ ...fin, inOut: 1, quality: ids.qb, date: '2026-03-06 08:00', sizes: { redM: 5 } });
  await entry({ ...fin, inOut: 1, quality: ids.qr, date: '2026-03-06 23:30', sizes: { redS: 2 } });
  await entry({ ...fin, inOut: 2, repair: true, date: '2026-03-07', sizes: { redS: 3 } });
  await entry({ ...fin, inOut: 1, repair: true, quality: ids.qa, date: '2026-03-08', sizes: { redS: 3 } });
  // No quality type set, booked on the Work Order's earlier (since replaced) Style Info line — the
  // screen still counts it for the Work Order, so does the report (same line, no second row).
  await entry({ ...fin, item: ids.oldItem1, inOut: 1, date: '2026-03-09', sizes: { oldRedM: 4 } });
  // Finishing · WO1 · RED · Beta: sent, nothing received yet. Finishing · WO1 · BLUE · Alpha: all back.
  await entry({ ...fin, factory: ids.f2, inOut: 2, date: '2026-03-02', sizes: { redS: 50 } });
  await entry({ ...fin, inOut: 2, date: '2026-03-02', sizes: { blueS: 10 } });
  await entry({ ...fin, inOut: 1, quality: ids.qa, date: '2026-03-10', sizes: { blueS: 10 } });
  // Embroidery · WO2 · RED · Alpha: more received than sent (Balance negative, as on the reference).
  await entry({ process: ids.emb, factory: ids.f1, item: wo2.item, inOut: 2, date: '2026-04-01', sizes: { wo2redS: 20 } });
  await entry({ process: ids.emb, factory: ids.f1, item: wo2.item, inOut: 1, quality: ids.qa, date: '2026-04-02', sizes: { wo2redS: 25 } });
  // The second "Finishing" process and the since-deleted process: one entry each on WO2.
  await entry({ process: ids.fin2, factory: ids.f1, item: wo2.item, inOut: 2, date: '2026-04-03', sizes: { wo2redS: 7 } });
  await entry({ process: ids.gone, factory: ids.f1, item: wo2.item, inOut: 2, date: '2026-04-04', sizes: { wo2redS: 9 } });
  // Never printed: a deleted entry, another production type, an entry whose sizes are all deleted,
  // an entry of a deleted Work Order.
  await entry({ ...fin, inOut: 2, date: '2026-03-01', sizes: { redS: 999 }, deleted: true });
  await entry({ ...fin, inOut: 2, date: '2026-03-01', sizes: { redS: 888 }, productionType: 2 });
  await entry({ ...fin, inOut: 2, date: '2026-03-01', sizes: { redS: 777 }, variantDeleted: true });
  await entry({ ...fin, item: wo3.item, inOut: 2, date: '2026-03-01', sizes: { wo3redS: 666 } });
});
after(async () => { await prisma.$disconnect(); });

const input = () => standardLegacyReportInputs().find((r) => r.name === PROCESS_FOLLOW_UP_REPORT_NAME)!;
/** Runs the standard report with the given prompt values (by field). */
async function run(values: Partial<Record<keyof typeof F | 'showEmpty', string>>) {
  const { definition } = await reports.validate('legacy-erp', input());
  const params: Record<string, { value: string }> = {};
  for (const f of definition.filters) {
    const key = f.field === PROCESS_FOLLOW_UP_EMPTY_FIELD ? 'showEmpty' : (Object.keys(F) as (keyof typeof F)[]).find((k) => F[k] === f.field)!;
    if (values[key]) params[f.id] = { value: values[key]! };
  }
  return reports.preview('legacy-erp', definition, params, user());
}
const both = () => `${ids.wo1},${ids.wo2}`;
const tables = (r: any) => (r.sections as any[]).filter((s) => s.layout === 'table');
/** Our lines as "Process:Order No/Color/Factory" — the process by record (E, F, F2 = the second "Finishing", X = deleted). */
const tag = (processId: number) => ({ [ids.emb]: 'E', [ids.fin]: 'F', [ids.fin2]: 'F2', [ids.gone]: 'X' } as Record<number, string>)[processId] ?? '?';
const lines = (r: any) => tables(r).flatMap((s) => s.rows).filter((x: any) => [wo1No, wo2No].includes(x.orderNo))
  .map((x: any) => `${tag(x.processId)}:${x.orderNo === wo1No ? 'WO1' : 'WO2'}/${x.color}/${String(x.factory).split(' ')[0]}`);
const WO1_LINES = ['F:WO1/BLUE/Alpha', 'F:WO1/RED/Alpha', 'F:WO1/RED/Beta'];
const WO2_LINES = ['E:WO2/RED/Alpha', 'F2:WO2/RED/Alpha', 'X:WO2/RED/Alpha'];
const ALL = ['E:WO2/RED/Alpha', ...WO1_LINES, 'F2:WO2/RED/Alpha', 'X:WO2/RED/Alpha'];

test('Balance and totals reproduce the reference report (process follow-up report.pdf) figures', () => {
  // [sent, received, return, printed Balance]
  const cases: [number, number, number, number][] = [
    [3203, 3177, 0, 26], // 4133 · Finishing
    [6984, 7024, 0, -40], // W/O-4166 · Embroidery (received includes 40 Rejection)
    [6525, 0, 0, 0], // W/O-4174 · Embroidery — nothing received yet prints 0.00
    [3174, 0, 0, 0], // W/O-4206 · Finishing
    [7752, 8930, 0, -1178], // W/O-4275 · Finishing
  ];
  for (const [s, r, ret, balance] of cases) assert.equal(processBalance(s, r, ret), balance, `${s}/${r}`);
  const t = processTotals([{ sent: 1, received: 2, balance: -1, wastage: null }, { sent: 3, received: 0, balance: 0, wastage: null }]);
  assert.deepEqual([t.sent, t.received, t.balance, t.wastage], [4, 2, -1, null], 'sums, and a column with no source stays blank');
});

test('grouping by Process, column mapping, quality split, repair / return, Balance and Process totals', async () => {
  const r = await run({ workOrders: both() });
  const heads = (r.sections as any[]).filter((s) => s.layout === 'inline' && s.key.startsWith('section.process')).map((s) => s.rows[0].value);
  const ourHeads = heads.filter((h: string) => h === EMB || h === FIN || h.startsWith('Aaa Deleted'));
  assert.deepEqual(ourHeads, [EMB, FIN, FIN, `Aaa Deleted ${RUN}`], 'one section per process record, in the Process dropdown order (deleted process last)');
  assert.deepEqual(lines(r), ALL, 'per Work Order × Color × Factory under its own process record; each entry counted once');
  const all = tables(r).flatMap((s: any) => s.rows);
  const red = all.find((x: any) => x.orderNo === wo1No && x.color === 'RED' && x.factory.startsWith('Alpha'));
  assert.deepEqual(
    [red.sent, red.received, red.aQuality, red.bQuality, red.rejection, red.qualityNotSet, red.returned, red.repair, red.wastage, red.balance],
    [100, 84, 73, 5, 2, 4, 3, 3, null, 19],
    'Received = every IN (incl. Received (Repair)); quality split; Return = Sent (Repair); Balance = Sent + Return − Received',
  );
  assert.equal(red.received, red.aQuality + red.bQuality + red.rejection + red.qualityNotSet, 'the quality split reconciles with Received');
  assert.deepEqual([red.deliveryDate, red.customer, red.styleCode, red.style, red.stylePicture, red.process],
    ['2026-05-14', `Tap E Oeil ${RUN}`, styleNumber, `SWEAT BA NINON ${RUN}`, PICTURE, FIN]);
  const beta = all.find((x: any) => x.orderNo === wo1No && x.factory.startsWith('Beta'));
  assert.deepEqual([beta.sent, beta.received, beta.balance], [50, 0, 0], 'nothing received yet: Balance 0, as on the reference');
  const wo2 = all.find((x: any) => x.orderNo === wo2No);
  assert.deepEqual([wo2.sent, wo2.received, wo2.balance, wo2.stylePicture], [20, 25, -5, null]);
  // Quality columns with no quality type defined print blank, never a made-up 0.
  const types = await prisma.$queryRaw<{ code: string | null; name: string | null }[]>`SELECT "QualityCode" as code, "QualityName" as name FROM "MA_QualityType" WHERE COALESCE("IsDeleted", 0) = 0`;
  for (const q of QUALITY_COLUMNS) {
    const defined = types.some((t) => q.match(String(t.code ?? '').trim().toLowerCase(), String(t.name ?? '').trim().toLowerCase()));
    assert.equal(red[q.key] === null, !defined, `${q.label}: blank exactly when no quality type defines it`);
  }
  // The Finishing table closes with its Process Total.
  const finTable = tables(r).find((s: any) => s.rows.some((x: any) => x.processId === ids.fin));
  const total = finTable.footerRows[0];
  assert.equal(total.factory, 'Process Total :', 'label in the last text column before Sent');
  assert.deepEqual([total.sent, total.received, total.aQuality, total.returned, total.repair, total.balance, total.wastage], [160, 94, 83, 3, 3, 19, null]);
  assert.match(r.appliedFilters[0], new RegExp(`Work Order No: ${wo1No.replace(/[/]/g, '\\/')}, ${wo2No.replace(/[/]/g, '\\/')}`));
});

test('each filter alone and combined (AND); date boundaries are whole calendar days', async () => {
  const of = async (vals: Parameters<typeof run>[0]) => lines(await run({ workOrders: both(), ...vals }));
  assert.deepEqual(await of({ processes: String(ids.emb) }), ['E:WO2/RED/Alpha']);
  assert.deepEqual(await of({ processes: String(ids.fin2) }), ['F2:WO2/RED/Alpha'], 'by process record: the other "Finishing" is not included');
  assert.deepEqual(await of({ factories: String(ids.f2) }), ['F:WO1/RED/Beta']);
  assert.deepEqual(lines(await run({ customers: String(ids.prime) })), WO2_LINES, 'Customer alone');
  assert.deepEqual(await of({ color: 'blu' }), ['F:WO1/BLUE/Alpha'], 'Color contains, case-insensitive');
  assert.deepEqual(lines(await run({ orderNo: wo2No })), WO2_LINES, 'Order No');
  assert.deepEqual(lines(await run({ styleCode: styleNumber })), WO1_LINES, 'Style Code');
  assert.deepEqual(lines(await run({ styleName: `ninon ${RUN}` })), WO1_LINES, 'Style Name');
  assert.deepEqual(await of({ processes: String(ids.fin), factories: String(ids.f1), color: 'RED' }), ['F:WO1/RED/Alpha'], 'combined with AND');
  assert.deepEqual(await of({ processes: String(ids.emb), color: 'BLUE' }), [], 'no line matches both');
  // Dates: both days in full, on the entry's Date.
  const day = async (from?: string, to?: string) => {
    const r = await run({ workOrders: String(ids.wo1), factories: String(ids.f1), color: 'RED', ...(from ? { dateFrom: from } : {}), ...(to ? { dateTo: to } : {}) });
    const x = tables(r).flatMap((s: any) => s.rows).find((l: any) => l.orderNo === wo1No);
    return x ? [x.sent, x.received] : null;
  };
  assert.deepEqual(await day('2026-03-05', '2026-03-06'), [0, 77], 'entries at 17:00 and 23:30 on the boundary days are in');
  assert.deepEqual(await day(undefined, '2026-03-05'), [100, 70]);
  assert.deepEqual(await day('2026-03-07'), [0, 7]);
  const none = await run({ workOrders: both(), color: 'NO-SUCH-COLOR' });
  assert.equal(tables(none).length, 1);
  assert.equal(tables(none)[0].emptyText, 'No Order Manufacturing entries match the filters.');
});

test('sections follow the Process master (the Process dropdown\'s source and order)', async () => {
  const svc = new ProcessFollowUpService(prisma);
  const master = await svc.processMaster();
  // The same rows and order Order Manufacturing Entry's Process dropdown offers (lookup 'process').
  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int as n FROM "MA_Process" WHERE "IsDeleted" = 0`;
  assert.equal(master.length, n, 'every non-deleted process');
  // The dropdown itself (LegacyMasterLookupService 'process', first 50 by name) lists them in the same order.
  const dropdown = (await new LegacyMasterLookupService(prisma, null as any).search('process')).map((r: any) => r.name);
  assert.deepEqual(master.slice(0, dropdown.length).map((m) => m.name), dropdown, 'same order as the dropdown');
  const ours = master.filter((m) => [ids.emb, ids.fin, ids.fin2, ids.dye].includes(m.id)).map((m) => m.id);
  assert.deepEqual(ours, [ids.emb, ids.fin, ids.fin2, ids.dye], 'same-named processes stay separate, by record');
  assert.ok(!master.some((m) => m.id === ids.gone), 'a deleted process is not offered');

  // Default — as on the legacy report: only processes with entries.
  const sectionIds = (r: any) => tables(r).map((s: any) => s.rows[0]?.processId ?? s.key);
  const dflt = await run({ workOrders: both() });
  assert.ok(!tables(dflt).some((s: any) => !s.rows.length), 'no empty process section by default');
  // "Yes": every master process, in master order, an empty one without rows or total.
  const all: any = await run({ workOrders: both(), showEmpty: 'yes' });
  const procHeads = (all.sections as any[]).filter((s) => s.key.startsWith('section.process#')).map((s) => s.rows[0].value);
  assert.deepEqual(procHeads.slice(0, master.length), master.map((m) => m.name ?? '(no process)'), 'every master process, in the dropdown order');
  const dyeIdx = procHeads.indexOf(DYE);
  const dyeTable = tables(all)[dyeIdx];
  assert.deepEqual([dyeTable.rows.length, dyeTable.footerRows.length, dyeTable.emptyText], [0, 0, 'No Order Manufacturing entries for this process.']);
  assert.deepEqual(lines(all), ALL, 'the entries themselves are unchanged');
  assert.ok(all.appliedFilters[0].includes('Processes without entries shown'));
  // With a Process filter, only the chosen processes — empty ones included.
  const two: any = await run({ processes: `${ids.dye},${ids.emb}`, showEmpty: 'yes' });
  assert.deepEqual((two.sections as any[]).filter((s) => s.key.startsWith('section.process#')).map((s) => s.rows[0].value), [EMB, DYE]);
  assert.ok(sectionIds(dflt).length > 0);
});

test('invalid input is rejected; no filter prints everything', async () => {
  await assert.rejects(run({ dateFrom: '2026-03-10', dateTo: '2026-03-01' }), /Date From must be on or before Date To/);
  await assert.rejects(run({ dateFrom: '2026-13-40' }), /Date From is not a valid date/);
  await assert.rejects(run({ workOrders: 'abc' }), /Choose valid values for "Work Order No"/);
  await assert.rejects(run({ processes: '1;drop' }), /Choose valid values for "Process"/);
  const all = await run({});
  assert.deepEqual(all.appliedFilters, ['All Work Orders']);
  assert.deepEqual(lines(all), ALL);
});

test('exports: CSV, Excel and PDF, with the Style Picture drawn from the stored file', async () => {
  const r = await run({ workOrders: both() });
  let reads = 0;
  const exporter = new ReportExportService({ content: async () => { reads++; return { mimeType: 'image/png', buffer: PNG }; } } as any);
  const csv = (await exporter.export(r, 'csv', 'Test Co')).buffer.toString('utf8');
  assert.ok(csv.includes('Delivery Date,Order No,Customer,Style Code,Style,Style Picture,Color,Factory,Sent,Received,A Quality,B Quality,Defected,Hole,Others,Rejection,Return,Wastage,Repair,Balance'), 'the reference column order');
  assert.ok(csv.includes('Process Total :'));
  assert.ok(!csv.includes(PICTURE), 'no picture path in CSV');
  const xlsx = await exporter.export(r, 'xlsx', 'Test Co');
  assert.ok(xlsx.buffer.length > 1000);
  const pdf = await exporter.export(r, 'pdf', 'Test Co');
  assert.ok(pdf.buffer.slice(0, 5).toString() === '%PDF-' && pdf.buffer.includes('/Subtype /Image'), 'the picture is embedded in the PDF');
  assert.equal(reads, 2, 'each picture is read once per export');
});

test('a large report spans several PDF pages with the headings repeated', async () => {
  const line = (i: number) => ({ processId: 1, process: 'Finishing', orderNo: `W/O-${i}`, color: 'RED', factory: 'F', sent: 10, received: 8, returned: 0, repair: 0, aQuality: 8, bQuality: 0, defected: null, hole: null, others: null, rejection: 0, qualityNotSet: 0, wastage: null, balance: 2 });
  const many = Array.from({ length: 400 }, (_, i) => line(i));
  const data: any = { generatedAt: new Date().toISOString(), truncated: false, lineCount: 400, missingQuality: ['defected', 'hole', 'others'], processes: [{ processId: 1, code: 'F', name: 'Finishing', lines: many, totals: processTotals(many) }] };
  const sections = processFollowUpSections(data, input().columns as any);
  assert.match(String(sections.find((s) => s.layout === 'table')!.note), /Blank columns have no source: Defected, Hole, Others, Wastage/);
  const result: any = { report: { id: null, name: PROCESS_FOLLOW_UP_REPORT_NAME, description: null, source: '' }, columns: [], rows: [], totals: {}, rowCount: 400, truncated: false, appliedFilters: ['All Work Orders'], generatedAt: new Date().toISOString(), sections, document: { showTitle: true, companyAddress: null, showSectionTitles: false, compactTables: true }, notice: null };
  const pdf = (await new ReportExportService().export(result, 'pdf', 'Test Co')).buffer.toString('latin1');
  assert.ok((pdf.match(/\/Type \/Page\b/g) ?? []).length > 5, 'several pages');
});

test('a saved report keeps its filters and column settings; another company cannot run it', async () => {
  const base = input();
  const created = await reports.create('legacy-erp', {
    ...base, name: `Process ${RUN}`,
    columns: base.columns.map((c) => (c.field === 'section.lines' ? { ...c, sectionColumns: [{ key: 'orderNo' }, { key: 'color', label: 'Colour' }, { key: 'sent', decimals: 0 }, { key: 'balance', width: 12 }, { key: 'qualityNotSet' }] } : c)),
    filters: [{ id: 'p', field: F.processes, operator: 'in', value: String(ids.fin) }, { id: 'w', field: F.workOrders, operator: 'in', value: both() }],
  }, user());
  const saved = await reports.run('legacy-erp', created.id, {}, user());
  assert.deepEqual(lines(saved).length, 3);
  const t = tables(saved)[0];
  assert.deepEqual(t.columns.map((c: any) => [c.key, c.label, c.decimals, c.width]), [['orderNo', 'Order No', null, 11], ['color', 'Colour', null, 11], ['sent', 'Sent', 0, 8], ['balance', 'Balance', 2, 12], ['qualityNotSet', 'Quality Not Set', 4, 10]]);
  assert.equal(t.footerRows[0].color, 'Process Total :');
  await assert.rejects(reports.run('legacy-erp', created.id, {}, { id: 'x', companyId: (await prisma.company.create({ data: { name: `Other ${RUN}` } })).id }));
  await reports.remove('legacy-erp', created.id, user());
});
