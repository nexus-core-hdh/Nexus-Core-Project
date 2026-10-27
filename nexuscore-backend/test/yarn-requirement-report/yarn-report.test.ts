// Yarn Requirement report — the Report Builder document source (reports/yarn-requirement.report.ts)
// and its data (legacy-erp/yarn-requirement-report.service.ts). Throwaway full-schema test database
// (`npm run test:yarn-report`); every test seeds its own Work Orders (manufacturing quantities, Fabric
// BOM, Yarn Recipe, Purchase Orders, receipts). Expected figures are worked out from the ERP's own
// formula: Requirement = BOM Quantity × Will Be Cut × (1 + Waste %) × Recipe %.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { WorkOrderService } from '../../src/modules/legacy-erp/work-order.service';
import { FabricYarnRecipeService } from '../../src/modules/legacy-erp/fabric-yarn-recipe.service';
import { FabricYarnRequirementsService } from '../../src/modules/legacy-erp/fabric-yarn-requirements.service';
import { FabricPlanningService } from '../../src/modules/legacy-erp/fabric-planning.service';
import { YarnRequirementReportService } from '../../src/modules/legacy-erp/yarn-requirement-report.service';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { ReportExportService } from '../../src/modules/reports/report-export.service';
import { UploadService } from '../../src/modules/upload/upload.service';
import { standardLegacyReportInputs } from '../../src/modules/reports/standard-legacy-reports';

let prisma: PrismaService;
let reports: ReportBuilderService;
let exporter: ReportExportService;
let companyId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<{ id: number }[]>(sql))[0].id);
const user = () => ({ id: 'yarn-report-test', companyId });

let fabric: number; let yarnA: number; let yarnB: number;
const YARN_A = `20/1 COMBED ${RUN}`;
const YARN_B = `70-DNR LYCRA ${RUN}`;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  const workOrders = new WorkOrderService(prisma, audit, null as any);
  const requirements = new FabricYarnRequirementsService(prisma, workOrders, new FabricYarnRecipeService(prisma, null as any, null as any), audit);
  const planning = new FabricPlanningService(prisma, workOrders, requirements, null as any);
  reports = new ReportBuilderService(prisma, audit, undefined, undefined, new YarnRequirementReportService(prisma, requirements, planning));
  exporter = new ReportExportService(new UploadService(prisma));
  companyId = (await prisma.company.create({ data: { name: `Yarn Report ${RUN}` } })).id;

  const item = (code: string, name: string, access: string) =>
    one(Prisma.sql`INSERT INTO "IM_Item" ("InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${code}, ${name}, ${access}, 0) RETURNING "RecId" as id`);
  fabric = await item(uniq('FAB-'), `CARDI FLEECE ${RUN}`, 'FABRIC');
  yarnA = await item(uniq('YRN-A'), YARN_A, 'YARN');
  yarnB = await item(uniq('YRN-B'), YARN_B, 'YARN');
  // The fabric's Yarn Recipe: 60% A (Knit), 10% A in variant D/C-MIXED (Knit), 30% B (Dye).
  await prisma.fabricYarnRecipeLine.createMany({
    data: [
      { fabricInventoryId: fabric, yarnInventoryId: yarnA, process: 'Knit', percentage: 60, sortOrder: 0 },
      { fabricInventoryId: fabric, yarnInventoryId: yarnA, process: 'Knit', variant1: 'D/C-MIXED GREY R-5', percentage: 10, sortOrder: 1 },
      { fabricInventoryId: fabric, yarnInventoryId: yarnB, process: 'Dye', percentage: 30, sortOrder: 2 },
    ],
  });
});
after(async () => { await prisma.$disconnect(); });

/** A Work Order of `pieces` (one color, one size, no extra cutting) using 0.5 fabric/pc at 10% waste. */
async function workOrder(no: string, pieces: number) {
  const woId = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "WorkOrderDate", "Quantity", "Quantity2", "IsDeleted") VALUES (${no}, ${'2026-07-02'}::timestamp, ${pieces}, 0, 0) RETURNING "RecId" as id`);
  const itemId = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${woId}, 1, 0) RETURNING "RecId" as id`);
  await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "Quantity", "SubNo", "IsDeleted") VALUES (${itemId}, ${'OXFORD TAN‖M'}, ${pieces}, 1, 0)`;
  const recipe = await one(Prisma.sql`INSERT INTO "MA_Recipe" ("WorkOrderId", "RecipeType", "RecipeCode", "IsDeleted") VALUES (${woId}, 1, ${uniq('R')}, 0) RETURNING "RecId" as id`);
  await prisma.$executeRaw`INSERT INTO "MA_RecipeItem" ("RecipeId", "InventoryId", "Quantity", "Wastage", "IsDeleted") VALUES (${recipe}, ${fabric}, 0.5, 10, 0)`;
  return { woId, itemId, no };
}
async function purchaseOrder(woId: number, inventoryId: number, qty: number, supplier: string) {
  const acc = await one(Prisma.sql`INSERT INTO "FI_Account" ("CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${uniq('S')}, ${supplier}, 0) RETURNING "RecId" as id`);
  const po = await one(Prisma.sql`INSERT INTO "IM_OrderReceipt" ("ReceiptNo", "ReceiptType", "CurrentAccountId", "IsDeleted") VALUES (${uniq('PO-')}, 1, ${acc}, 0) RETURNING "RecId" as id`);
  await prisma.$executeRaw`INSERT INTO "IM_OrderReceiptItem" ("OrderReceiptId", "ReceiptType", "InventoryId", "Quantity", "ManufacturingOrderId", "IsDeleted") VALUES (${po}, 1, ${inventoryId}, ${qty}, ${woId}, 0)`;
}
async function receipt(type: number, workOrderItemId: number, inventoryId: number, qty: number) {
  const r = await one(Prisma.sql`INSERT INTO "IM_Receipt" ("ReceiptNo", "ReceiptType", "IsDeleted") VALUES (${uniq('RC-')}, ${type}, 0) RETURNING "RecId" as id`);
  await prisma.$executeRaw`INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId", "ItemOrderNo", "InventoryId", "Quantity", "WorkOrderReceiptItemId", "IsDeleted") VALUES (${r}, 1, ${inventoryId}, ${qty}, ${workOrderItemId}, 0)`;
}

const definition = async () => (await reports.validate('legacy-erp', standardLegacyReportInputs().find((r) => r.name === 'Yarn Requirement Report')!)).definition;
// These tests exercise the live calculation, so they ask for the BOM fallback ("yes") unless told otherwise.
async function run(params: { ids?: number[]; no?: string; bom?: string | null }, columns?: any[]) {
  const def = await definition();
  const [idsFilter, noFilter, bomFilter] = def.filters;
  const bom = params.bom === undefined ? 'yes' : params.bom;
  return reports.preview('legacy-erp', { ...def, ...(columns ? { columns } : {}) }, {
    ...(params.ids ? { [idsFilter.id]: { value: params.ids.join(',') } } : {}),
    ...(params.no ? { [noFilter.id]: { value: params.no } } : {}),
    ...(bom ? { [bomFilter.id]: { value: bom } } : {}),
  }, user());
}
const tables = (r: any) => r.sections.filter((s: any) => s.key.startsWith('section.yarnLines#'));
const headers = (r: any) => r.sections.filter((s: any) => s.key.startsWith('section.workOrderHeader#'));
const line = (rows: any[], name: string, variant: string | null) => rows.find((x) => x.name === name && (x.variant1 ?? null) === variant);

test('several Work Orders: each its own header and yarns, then Cumulative Totals', async () => {
  const fam = `W/O-${RUN}-4280`;
  const a = await workOrder(`${fam}-A`, 100);
  const b = await workOrder(`${fam}-B`, 200);
  const c = await workOrder(`${fam}-C`, 40);
  await purchaseOrder(a.woId, yarnA, 30, `Spinning X ${RUN}`);
  await purchaseOrder(b.woId, yarnA, 50, `Spinning Y ${RUN}`);
  await receipt(2, a.itemId, yarnA, 20);    // Purchase Receipt → Received
  await receipt(140, a.itemId, yarnA, 12);  // Manufacture Send → Out.Qty.

  const r = await run({ ids: [a.woId, b.woId, c.woId] });
  assert.equal(r.document?.showTitle, true, 'printed under the report title');
  // Newest Order No first, as the legacy report: C, B, A — each header followed by its own table.
  assert.deepEqual(headers(r).map((s: any) => s.rows[0].value), [c.no, b.no, a.no]);
  const keys = r.sections!.map((s: any) => s.key);
  assert.deepEqual(keys.slice(0, 2), [`section.workOrderHeader#${c.woId}`, `section.yarnLines#${c.woId}`]);
  assert.equal(keys[keys.length - 1], 'section.cumulative');
  assert.deepEqual(headers(r)[2].rows.map((x: any) => x.label), ['Order No', 'Style Code', 'Style Name', 'Customer', 'Order Date', 'Quantity']);
  assert.equal(headers(r)[2].rows.find((x: any) => x.key === 'quantity').value, 100);

  // Work Order A: 0.5 × 100 × 1.10 = 55 fabric → A 60% = 33, A (D/C-MIXED) 10% = 5.5, B 30% = 16.5.
  const tA = tables(r)[2].rows;
  assert.equal(tA.length, 3, 'variants of one yarn stay separate rows');
  assert.deepEqual(
    [line(tA, YARN_A, null).requirement, line(tA, YARN_A, 'D/C-MIXED GREY R-5').requirement, line(tA, YARN_B, null).requirement],
    [33, 5.5, 16.5],
  );
  assert.equal(line(tA, YARN_A, null).process, 'Knit');
  assert.equal(line(tA, YARN_B, null).process, 'Dye');
  // Purchase / Received / Out.Qty. per (Work Order, yarn) — on the yarn's first row only.
  assert.deepEqual(
    ['purchaseAccount', 'purchaseOrdered', 'received', 'outQty'].map((k) => line(tA, YARN_A, null)[k]),
    [`Spinning X ${RUN}`, 30, 20, 12],
  );
  assert.equal(line(tA, YARN_A, 'D/C-MIXED GREY R-5').purchaseOrdered, null, 'not repeated on the variant row');
  assert.deepEqual([line(tA, YARN_B, null).purchaseOrdered, line(tA, YARN_B, null).received], [0, 0]);
  assert.match(String(tables(r)[2].note), /calculated/, 'unsaved requirement is labelled');

  // Cumulative: A plain 33 + 66 + 13.2, A variant 5.5 + 11 + 2.2, B 16.5 + 33 + 6.6.
  const cum = r.sections!.find((s: any) => s.key === 'section.cumulative')!.rows as any[];
  assert.equal(cum.length, 3);
  assert.deepEqual(
    [line(cum, YARN_A, null).requirement, line(cum, YARN_A, 'D/C-MIXED GREY R-5').requirement, line(cum, YARN_B, null).requirement],
    [112.2, 18.7, 56.1],
  );
  const cumA = line(cum, YARN_A, null);
  assert.deepEqual([cumA.purchaseOrdered, cumA.received, cumA.outQty], [80, 20, 12], 'each Work Order counted once');
  assert.equal(cumA.purchaseAccount, `Spinning X ${RUN}, Spinning Y ${RUN}`);
  assert.equal(line(cum, YARN_A, 'D/C-MIXED GREY R-5').purchaseOrdered, null);
  assert.ok(!r.sections!.find((s: any) => s.key === 'section.cumulative')!.columns.some((col: any) => col.key === 'process'));

  for (const format of ['pdf', 'xlsx', 'csv'] as const) assert.ok((await exporter.export(r, format, 'Test Co')).buffer.length > 100, `${format} export`);
  const csv = (await exporter.export(r, 'csv', 'Test Co')).buffer.toString('utf8');
  assert.ok(csv.includes('Cumulative Totals') && csv.includes('112.2'));
});

test('Order No filter includes the whole order family and nothing else; filters combine', async () => {
  const fam = `W/O-${RUN}-5100`;
  const a = await workOrder(`${fam}-A`, 10);
  const b = await workOrder(`${fam}-B`, 10);
  const other = await workOrder(`W/O-${RUN}-9999`, 10);
  const byNo = await run({ no: fam });
  assert.deepEqual(headers(byNo).map((s: any) => s.rows[0].value), [b.no, a.no]);
  assert.ok(!headers(byNo).some((s: any) => s.rows[0].value === other.no), 'unrelated Work Order not included');
  // Both filters: only Work Orders matching both.
  const both = await run({ ids: [a.woId, other.woId], no: fam });
  assert.deepEqual(headers(both).map((s: any) => s.rows[0].value), [a.no]);
  // Nothing matching: no Work Order sections, an explanatory empty cumulative.
  const none = await run({ no: `NO-SUCH-${RUN}` });
  assert.deepEqual(headers(none), []);
  assert.equal(none.sections!.at(-1)!.emptyText, 'No Work Orders match the filter.');
  // Nothing chosen: the report asks for Work Orders.
  const waiting = await run({});
  assert.match(String(waiting.notice), /Choose the Work Orders to print/);
});

test('a Work Order without yarn requirement still prints its header with an empty table', async () => {
  const bare = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "IsDeleted") VALUES (${uniq('W/O-EMPTY-')}, 0) RETURNING "RecId" as id`);
  const r = await run({ ids: [bare] });
  assert.equal(headers(r).length, 1);
  assert.deepEqual(tables(r)[0].rows, []);
  assert.match(tables(r)[0].emptyText, /No yarn requirement/);
  assert.deepEqual(r.sections!.at(-1)!.rows, []);
});

test('many Work Orders print as a multi-page PDF with every table', async () => {
  const fam = `W/O-${RUN}-LONG`;
  for (let i = 0; i < 18; i++) await workOrder(`${fam}-${String(i).padStart(2, '0')}`, 10 + i);
  const r = await run({ no: fam });
  assert.equal(headers(r).length, 18);
  const pdf = (await exporter.export(r, 'pdf', 'Test Co')).buffer.toString('latin1');
  const pages = Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(pdf)?.[1] ?? 0);
  assert.ok(pages >= 2, `multi-page (${pages} pages)`);
});

test('column settings save, reopen and apply to every Work Order table and the cumulative', async () => {
  const w = await workOrder(`W/O-${RUN}-CFG`, 100);
  const input = standardLegacyReportInputs().find((r) => r.name === 'Yarn Requirement Report')!;
  const lineCols = [{ key: 'name', label: 'Yarn' }, { key: 'requirement', decimals: 3, width: 14 }, { key: 'unit' }, { key: 'process', hidden: true }];
  const cumCols = [{ key: 'name' }, { key: 'requirement', label: 'Total Requirement', decimals: 1 }];
  const created = await reports.create('legacy-erp', {
    ...input, name: `Yarn ${RUN}`,
    columns: input.columns.map((c) => (c.field === 'section.yarnLines' ? { ...c, sectionColumns: lineCols } : c.field === 'section.cumulative' ? { ...c, sectionColumns: cumCols } : c)),
  }, user());
  const reopened = await reports.get('legacy-erp', created.id, user());
  const saved = Object.fromEntries((reopened.columns as any[]).map((c) => [c.field, c.sectionColumns]));
  assert.deepEqual([saved['section.yarnLines'], saved['section.cumulative']], [lineCols, cumCols]);
  const r = await reports.run('legacy-erp', created.id, { [(reopened.filters as any[])[0].id]: { value: String(w.woId) }, [(reopened.filters as any[])[2].id]: { value: 'yes' } }, user());
  assert.deepEqual(tables(r)[0].columns.map((c: any) => [c.key, c.label, c.decimals]), [['name', 'Yarn', null], ['requirement', 'Requirement', 3], ['unit', 'Unit', null]]);
  assert.deepEqual(r.sections!.at(-1)!.columns.map((c: any) => c.label), ['Yarn Name', 'Total Requirement']);
  await assert.rejects(reports.validate('legacy-erp', { ...input, columns: [{ field: 'section.cumulative', sectionColumns: [{ key: 'process' }] }] } as any), /Unknown column "process"/);
  await assert.rejects(reports.validate('legacy-erp', { ...input, filters: [{ id: 'x', field: 'workOrderIds', operator: 'in', value: 'abc' }] } as any), /needs one or more records/);
  await reports.remove('legacy-erp', created.id, user());
});

// ── Fabric and Trim Cumulative Reports — same report, their own requirement rows ─────────────────

const reportDef = async (name: string) => (await reports.validate('legacy-erp', standardLegacyReportInputs().find((r) => r.name === name)!)).definition;
async function runMaterial(name: string, ids: number[], bom: string | null = 'yes', orderNo?: string) {
  const def = await reportDef(name);
  return reports.preview('legacy-erp', def, {
    [def.filters[0].id]: { value: ids.join(',') },
    ...(orderNo ? { [def.filters[1].id]: { value: orderNo } } : {}),
    ...(bom ? { [def.filters[2].id]: { value: bom } } : {}),
  }, user());
}

test('Fabric Cumulative Report: fabric rows per Work Order, material colors kept apart in the totals', async () => {
  const branch = await prisma.branch.create({ data: { companyId, name: `Yarn Report ${RUN} ${++seq}` } });
  const color = async (name: string) => (await prisma.colorCard.create({ data: { code: uniq('CC'), name, color: '#777777', branchId: branch.id } })).id;
  const red = await color(`RED ${RUN}`);
  const blue = await color(`BLUE ${RUN}`);
  const a = await workOrder(`W/O-${RUN}-FAB-A`, 100);
  const b = await workOrder(`W/O-${RUN}-FAB-B`, 200);
  const c = await workOrder(`W/O-${RUN}-FAB-C`, 40);
  // Material Color on each Work Order's fabric BOM line: A and C red, B blue.
  for (const [wo, cc] of [[a, red], [b, blue], [c, red]] as const) {
    await prisma.$executeRaw`UPDATE "MA_RecipeItem" SET "ColorCardId" = ${cc} WHERE "RecipeId" IN (SELECT "RecId" FROM "MA_Recipe" WHERE "WorkOrderId" = ${wo.woId})`;
  }
  await purchaseOrder(a.woId, fabric, 60, `Knitter ${RUN}`);
  await receipt(2, a.itemId, fabric, 50);
  await receipt(140, b.itemId, fabric, 70);

  const r = await runMaterial('Fabric Cumulative Report', [a.woId, b.woId, c.woId]);
  const lines = (r.sections as any[]).filter((s) => s.key.startsWith('section.yarnLines#'));
  assert.deepEqual(lines[0].columns.map((col: any) => col.label), ['Fabric Code', 'Fabric Name', 'Process', 'Variant-1', 'Production Color', 'Material Color', 'Requirement', 'Unit', 'Purchase Current Account', 'Pur.Order', 'Received', 'Out.Qty.']);
  // Fabric requirement = 0.5 × (1 + 10%) per piece: C 40 → 22, B 200 → 110, A 100 → 55. A line with a
  // Material Color is mapped by that color; RED / BLUE match no Production Color here, so the ERP applies
  // the whole order quantity and leaves Production Color empty — printed as the Requirements screen has it.
  assert.deepEqual(lines.map((s: any) => s.rows.map((x: any) => [x.requirement, x.materialColor, x.productionColor])), [
    [[22, `RED ${RUN}`, null]], [[110, `BLUE ${RUN}`, null]], [[55, `RED ${RUN}`, null]],
  ]);
  const rowA = lines[2].rows[0];
  assert.deepEqual([rowA.purchaseAccount, rowA.purchaseOrdered, rowA.received, rowA.outQty], [`Knitter ${RUN}`, 60, 50, 0]);
  assert.equal(lines[1].rows[0].outQty, 70);
  // Cumulative: one row per (fabric, variant, material color, unit) — red 22 + 55, blue 110.
  const cum = r.sections!.at(-1)!;
  assert.deepEqual(cum.columns.map((col: any) => col.key), ['code', 'name', 'variant1', 'materialColor', 'requirement', 'unit', 'purchaseAccount', 'purchaseOrdered', 'received', 'outQty']);
  assert.deepEqual(cum.rows.map((x: any) => [x.materialColor, x.requirement]), [[`RED ${RUN}`, 77], [`BLUE ${RUN}`, 110]]);
  assert.deepEqual([cum.rows[0].purchaseOrdered, cum.rows[0].received, cum.rows[0].outQty], [60, 50, 70], 'procurement per fabric, once');
  assert.equal(cum.rows[1].purchaseOrdered, null, 'not repeated on the fabric\'s second row');
  for (const format of ['pdf', 'xlsx', 'csv'] as const) assert.ok((await exporter.export(r, format, 'Test Co')).buffer.length > 100);
});

test('Trim Cumulative Report: trim BOM requirement, purchases and issues, repeated trims totalled', async () => {
  const trim = await one(Prisma.sql`INSERT INTO "IM_Item" ("InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${uniq('TRM-')}, ${`SNAP BUTTON ${RUN}`}, 'TRIM', 0) RETURNING "RecId" as id`);
  const withTrim = async (no: string, pieces: number) => {
    const w = await workOrder(no, pieces);
    const recipe = await one(Prisma.sql`INSERT INTO "MA_Recipe" ("WorkOrderId", "RecipeType", "RecipeCode", "IsDeleted") VALUES (${w.woId}, 2, ${uniq('T')}, 0) RETURNING "RecId" as id`);
    await prisma.$executeRaw`INSERT INTO "MA_RecipeItem" ("RecipeId", "InventoryId", "Quantity", "Wastage", "UD_Remarks", "IsDeleted") VALUES (${recipe}, ${trim}, 2, 5, 'Attach', 0)`;
    return w;
  };
  const a = await withTrim(`W/O-${RUN}-TRM-A`, 100);
  const b = await withTrim(`W/O-${RUN}-TRM-B`, 50);
  await purchaseOrder(a.woId, trim, 300, `Button Co ${RUN}`);
  await purchaseOrder(b.woId, trim, 120, `Button Co ${RUN}`);
  await receipt(140, a.itemId, trim, 200);

  const r = await runMaterial('Trim Cumulative Report', [a.woId, b.woId]);
  const lines = (r.sections as any[]).filter((s) => s.key.startsWith('section.yarnLines#'));
  // Trim requirement = 2 × (1 + 5%) per piece: B 50 → 105, A 100 → 210; Process from the BOM line.
  assert.deepEqual(lines.map((s: any) => s.rows.map((x: any) => [x.name, x.process, x.requirement, x.purchaseOrdered, x.outQty])), [
    [[`SNAP BUTTON ${RUN}`, 'Attach', 105, 120, 0]], [[`SNAP BUTTON ${RUN}`, 'Attach', 210, 300, 200]],
  ]);
  const cum = r.sections!.at(-1)!.rows as any[];
  assert.equal(cum.length, 1, 'the same trim across Work Orders is one cumulative row');
  assert.deepEqual([cum[0].requirement, cum[0].purchaseOrdered, cum[0].outQty, cum[0].purchaseAccount], [315, 420, 200, `Button Co ${RUN}`]);
  assert.ok(r.sections!.at(-1)!.columns.some((col: any) => col.key === 'materialColor'));
});

test('the three material reports are separate ready-made reports on separate sources', async () => {
  const names = ['Yarn Requirement Report', 'Fabric Cumulative Report', 'Trim Cumulative Report'];
  const defs = await Promise.all(names.map(reportDef));
  assert.deepEqual(defs.map((d) => d.dataSource), ['yarn-requirement-report', 'fabric-requirement-report', 'trim-requirement-report']);
  for (const d of defs) assert.deepEqual(d.filters.map((f) => [f.field, f.operator, f.prompt]), [['workOrderIds', 'in', true], ['workOrderNo', 'startsWith', true], ['calculateFromBom', 'equals', true]]);
});

// ── "Calculate Missing Requirements from BOM" — default No ─────────────────────────────────────────

const NOT_SAVED = /Requirements have not been saved on the Requirements screen for this Work Order\. Enable "Calculate Missing Requirements from BOM"/;
const REQUIREMENT_TYPE = { fabric: 1, yarn: 2, trim: 3 } as const;
const MATERIAL_NAMES = { yarn: 'Yarn Requirement Report', fabric: 'Fabric Cumulative Report', trim: 'Trim Cumulative Report' } as const;

/** Saved requirement rows (MA_Requirement) of one Work Order, as the Requirements screen's Save writes them. */
async function saveRequirement(wo: { itemId: number }, type: number, inventoryId: number, quantity: number) {
  await prisma.$executeRaw`INSERT INTO "MA_Requirement" ("RequirementType", "WorkOrderItemId", "InventoryId", "Quantity", "IsDeleted", "UUID") VALUES (${type}, ${wo.itemId}, ${inventoryId}, ${quantity}, 0, gen_random_uuid())`;
}

for (const material of ['yarn', 'fabric', 'trim'] as const) {
  test(`${material}: saved requirements always; Work Orders without them only with the BOM option`, async () => {
    // A trim BOM line too, so every material has a live calculation to fall back on.
    const trim = await one(Prisma.sql`INSERT INTO "IM_Item" ("InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${uniq('TRM-')}, ${`LABEL ${RUN}`}, 'TRIM', 0) RETURNING "RecId" as id`);
    const make = async (no: string, pieces: number) => {
      const w = await workOrder(no, pieces);
      const recipe = await one(Prisma.sql`INSERT INTO "MA_Recipe" ("WorkOrderId", "RecipeType", "RecipeCode", "IsDeleted") VALUES (${w.woId}, 2, ${uniq('T')}, 0) RETURNING "RecId" as id`);
      await prisma.$executeRaw`INSERT INTO "MA_RecipeItem" ("RecipeId", "InventoryId", "Quantity", "Wastage", "IsDeleted") VALUES (${recipe}, ${trim}, 1, 0, 0)`;
      return w;
    };
    const fam = `W/O-${RUN}-B${material[0].toUpperCase()}`; // WorkOrderNo is varchar(25)
    const savedWo = await make(`${fam}-A`, 100);
    const unsavedWo = await make(`${fam}-B`, 100);
    const item = material === 'yarn' ? yarnA : material === 'fabric' ? fabric : trim;
    await saveRequirement(savedWo, REQUIREMENT_TYPE[material], item, 777);
    // The live calculation for the unsaved Work Order (100 pcs): fabric 0.5 × 1.1 × 100 = 55,
    // yarn A 60% of that = 33 (plus its 10% variant row), trim 1 × 100 = 100.
    const live = { yarn: 33, fabric: 55, trim: 100 }[material];
    const name = MATERIAL_NAMES[material];
    const ids = [savedWo.woId, unsavedWo.woId];
    const byWo = (r: any) => Object.fromEntries((r.sections as any[]).filter((s) => s.key.startsWith('section.yarnLines#')).map((s) => [Number(s.key.split('#')[1]), s]));
    const cumulativeOf = (r: any) => r.sections.at(-1);

    for (const bom of [null, 'no'] as const) {
      // Left blank or "No": the saved Work Order prints its saved rows; the other a message, no rows.
      const r = await runMaterial(name, ids, bom);
      const t = byWo(r);
      assert.equal((r.sections as any[]).filter((s) => s.key.startsWith('section.workOrderHeader#')).length, 2, 'both headers stay');
      assert.deepEqual(t[savedWo.woId].rows.map((x: any) => x.requirement), [777], 'saved quantity as saved');
      assert.equal(t[savedWo.woId].note, null, 'saved rows are not marked as calculated');
      assert.deepEqual(t[unsavedWo.woId].rows, []);
      assert.match(t[unsavedWo.woId].emptyText, NOT_SAVED);
      assert.deepEqual(cumulativeOf(r).rows.map((x: any) => x.requirement), [777], 'cumulative: saved requirements only');
      assert.match(String(cumulativeOf(r).note), /1 Work Order without saved requirements is not included/);
      assert.ok(r.appliedFilters.some((f: string) => /Saved requirements only/.test(f)));
    }

    // "Yes": the unsaved Work Order is calculated from the BOM (and marked); the saved one stays saved.
    const yes = await runMaterial(name, ids, 'yes');
    const ty = byWo(yes);
    assert.deepEqual(ty[savedWo.woId].rows.map((x: any) => x.requirement), [777]);
    assert.ok(ty[unsavedWo.woId].rows.length > 0);
    assert.equal(ty[unsavedWo.woId].rows.find((x: any) => x.inventoryId === item && !x.variant1).requirement, live);
    assert.match(String(ty[unsavedWo.woId].note), /calculated from the current BOM/);
    const cumRow = cumulativeOf(yes).rows.find((x: any) => x.inventoryId === item && !x.variant1);
    assert.equal(cumRow.requirement, Math.round((777 + live) * 10000) / 10000, 'cumulative: saved + calculated, each once');
    assert.ok(!/not included/.test(String(cumulativeOf(yes).note)));

    // Both Work Order filters combined with the option: only the Work Orders matching both.
    const combined = await runMaterial(name, ids, null, `${fam}-B`);
    assert.deepEqual(Object.keys(byWo(combined)).map(Number), [unsavedWo.woId]);
    assert.match(byWo(combined)[unsavedWo.woId].emptyText, NOT_SAVED);
    assert.deepEqual(cumulativeOf(combined).rows, []);
    const combinedYes = await runMaterial(name, ids, 'yes', `${fam}-B`);
    assert.ok(byWo(combinedYes)[unsavedWo.woId].rows.length > 0);

    // Exports carry the message (CSV) and build (Excel, PDF).
    const csv = (await exporter.export(await runMaterial(name, ids, null), 'csv', 'Test Co')).buffer.toString('utf8');
    assert.ok(csv.includes('Requirements have not been saved on the Requirements screen for this Work Order.'));
    for (const format of ['pdf', 'xlsx'] as const) assert.ok((await exporter.export(yes, format, 'Test Co')).buffer.length > 100);
  });
}

test('the BOM option only accepts its two choices, and a run needs Work Orders, not just the option', async () => {
  const def = await reportDef('Fabric Cumulative Report');
  await assert.rejects(reports.validate('legacy-erp', { ...def, filters: [{ id: 'b', field: 'calculateFromBom', operator: 'equals', value: 'maybe' }] } as any), /Choose one of the options/);
  const onlyOption = await reports.preview('legacy-erp', def, { [def.filters[2].id]: { value: 'yes' } }, user());
  assert.match(String(onlyOption.notice), /Choose the Work Orders to print/);
});
