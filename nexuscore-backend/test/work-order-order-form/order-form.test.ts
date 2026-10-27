// Work Order "Order Form" — the Report Builder document source (reports/work-order-order-form.report.ts)
// and its data (legacy-erp/work-order-order-form.service.ts). Throwaway full-schema test database
// (`npm run test:order-form`); every test seeds its own Work Orders, like the Cutting suite. Checks
// each section against the rows it is built from, that two Work Orders never mix, and that the
// standard Order Form report validates, runs, prompts and exports through the Report Builder.
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
import { CuttingCardService } from '../../src/modules/legacy-erp/cutting-card.service';
import { WorkOrderOrderFormService } from '../../src/modules/legacy-erp/work-order-order-form.service';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { ReportExportService } from '../../src/modules/reports/report-export.service';
import { UploadService } from '../../src/modules/upload/upload.service';
import { standardLegacyReportInputs } from '../../src/modules/reports/standard-legacy-reports';
import { ORDER_FORM_SECTIONS } from '../../src/modules/reports/work-order-order-form.report';

let prisma: PrismaService;
let svc: WorkOrderOrderFormService;
let reports: ReportBuilderService;
let exporter: ReportExportService;
let companyId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<{ id: number }[]>(sql))[0].id);

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  const workOrders = new WorkOrderService(prisma, audit, null as any);
  const requirements = new FabricYarnRequirementsService(prisma, workOrders, new FabricYarnRecipeService(prisma, null as any, null as any), audit);
  const cutting = new CuttingCardService(prisma, workOrders, requirements, { getById: async () => null } as any, audit);
  svc = new WorkOrderOrderFormService(prisma, workOrders, requirements, cutting);
  reports = new ReportBuilderService(prisma, audit, svc);
  exporter = new ReportExportService(new UploadService(prisma));
  companyId = (await prisma.company.create({ data: { name: `Order Form ${RUN}` } })).id;
});
after(async () => { await prisma.$disconnect(); });

const item = (access: string, name: string) =>
  one(Prisma.sql`INSERT INTO "IM_Item" ("InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${uniq(access)}, ${name}, ${access}, 0) RETURNING "RecId" as id`);

/** A Work Order with Manufacturing Quantities, a Fabric + Trim BOM and saved Fabric / Yarn requirements. */
async function seedWorkOrder(o: { quantities: [string, string, number][]; extraPct: number; approved: boolean; fabricQty: number; wastage: number; saved: { fabric: number[]; yarn: number[] } }) {
  const customer = await one(Prisma.sql`INSERT INTO "FI_Account" ("CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${uniq('C')}, ${`Customer ${RUN}`}, 0) RETURNING "RecId" as id`);
  const woNo = uniq('W/O-');
  const woId = await one(Prisma.sql`
    INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "Quantity", "Quantity2", "CurrentAccountId", "UD_Brands", "CustomerOrderNo", "SeasonCode", "IsApproved", "Explanation", "IsDeleted")
    VALUES (${woNo}, ${o.quantities.reduce((s, q) => s + q[2], 0)}, ${o.extraPct}, ${customer}, 'TAO', 'PO-77', 'W26', ${o.approved ? 1 : 0}, 'Handle with care', 0) RETURNING "RecId" as id`);
  const itemId = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "CustomerOrderNo", "IsDeleted") VALUES (${woId}, 1, '1035606', 0) RETURNING "RecId" as id`);
  for (const [i, [color, size, n]] of o.quantities.entries()) {
    await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "Quantity", "SubNo", "IsDeleted") VALUES (${itemId}, ${`${color}‖${size}`}, ${n}, ${i + 1}, 0)`;
  }
  const fabric = await item('FABRIC', `Fleece ${RUN}`);
  const trim = await item('TRIM', `Button ${RUN}`);
  const yarn = await item('YARN', `30/1 Carded ${RUN}`);
  for (const [type, inv, qty, wastage, dia] of [[1, fabric, o.fabricQty, o.wastage, '36'], [2, trim, 2, 5, null]] as const) {
    const recipe = await one(Prisma.sql`INSERT INTO "MA_Recipe" ("WorkOrderId", "RecipeType", "RecipeCode", "IsDeleted") VALUES (${woId}, ${type}, ${uniq('R')}, 0) RETURNING "RecId" as id`);
    await prisma.$executeRaw`INSERT INTO "MA_RecipeItem" ("RecipeId", "InventoryId", "Quantity", "Wastage", "UD_Dia", "UD_Remarks", "IsDeleted") VALUES (${recipe}, ${inv}, ${qty}, ${wastage}, ${dia}, 'Knit + Dye', 0)`;
  }
  for (const [type, inv, list] of [[1, fabric, o.saved.fabric], [2, yarn, o.saved.yarn]] as const) {
    for (const q of list) {
      await prisma.$executeRaw`INSERT INTO "MA_Requirement" ("RequirementType", "WorkOrderItemId", "InventoryId", "Quantity", "IsDeleted", "UUID") VALUES (${type}, ${itemId}, ${inv}, ${q}, 0, gen_random_uuid())`;
    }
  }
  return { woId, woNo, fabric, yarn, trim };
}

test('every section is built from the selected Work Order\'s own rows', async () => {
  const wo = await seedWorkOrder({
    quantities: [['PALE OLIVE', '3M', 279], ['PALE OLIVE', '6M', 509], ['NAVY', '3M', 10]],
    extraPct: 5, approved: true, fabricQty: 0.11, wastage: 12, saved: { fabric: [608.04], yarn: [300, 241.62] },
  });
  const r = await svc.build(wo.woId, companyId);

  // Header
  assert.equal(r.header.workOrderNo, wo.woNo);
  assert.equal(r.header.customer, `Customer ${RUN}`);
  assert.equal(r.header.brand, 'TAO');
  assert.equal(r.header.poNumber, 'PO-77');
  assert.equal(r.header.season, 'W26');
  assert.equal(r.header.orderQuantity, 798);
  assert.equal(r.header.cuttingExtraPct, 5);
  assert.equal(r.header.remarks, 'Handle with care');
  assert.equal(r.header.approved, true);
  assert.equal(r.company.name, `Order Form ${RUN}`);

  // Color/Size Chart — Will Be Cut rounds up per size: ceil(279 * 1.05) = 293, ceil(509 * 1.05) = 535.
  assert.equal(r.colorSizeChart.customerOrderNo, '1035606');
  assert.deepEqual(r.colorSizeChart.sizes, ['3M', '6M']);
  const olive = r.colorSizeChart.colors.find((c: any) => c.color === 'PALE OLIVE')!;
  assert.deepEqual([olive.bySize['3M'].orderQty, olive.bySize['3M'].willBeCutQty], [279, 293]);
  assert.deepEqual([olive.total.orderQty, olive.total.willBeCutQty, olive.total.cutQty], [788, 828, 0]);

  // Fabric Recipe — Final Qty = Raw Qty x (1 + Total Waste %).
  assert.equal(r.fabricRecipe.length, 1);
  assert.equal(r.fabricRecipe[0].fabric, `Fleece ${RUN}`);
  assert.equal(r.fabricRecipe[0].dia, '36');
  assert.equal(r.fabricRecipe[0].process, 'Knit + Dye');
  assert.equal(r.fabricRecipe[0].totalWastePct, 12);
  assert.equal(r.fabricRecipe[0].finalQty, 0.1232);

  // Requirements — the saved MA_Requirement quantities, printed as stored.
  assert.equal(r.fabricRequirement.source, 'saved');
  assert.deepEqual(r.fabricRequirement.rows.map((x: any) => x.quantity), [608.04]);
  assert.equal(r.fabricRequirement.rows[0].dia, '36', 'requirement row carries its BOM line\'s specs');
  assert.equal(r.yarnRequirement.source, 'saved');
  assert.equal(r.yarnRequirement.rows.length, 1, 'one row per yarn');
  assert.equal(r.yarnRequirement.rows[0].quantity, 541.62);

  // Trim — recipe from the BOM; nothing saved, so the requirement is the live calculation.
  assert.equal(r.trimRecipe.length, 1);
  assert.deepEqual([r.trimRecipe[0].trim, r.trimRecipe[0].wastagePct, r.trimRecipe[0].quantity], [`Button ${RUN}`, 5, 2]);
  assert.equal(r.trimRequirement.source, 'calculated');
  // 2 per piece x 5% waste x Will Be Cut (each color): 2.1 x (828 + 11)
  const trimTotal = r.trimRequirement.rows.reduce((s: number, x: any) => s + x.quantity, 0);
  assert.equal(Math.round(trimTotal * 100) / 100, Math.round(2.1 * (828 + 11) * 100) / 100);
});

test('two Work Orders never share rows', async () => {
  const a = await seedWorkOrder({ quantities: [['RED', 'S', 10]], extraPct: 0, approved: false, fabricQty: 1, wastage: 0, saved: { fabric: [10], yarn: [] } });
  const b = await seedWorkOrder({ quantities: [['BLUE', 'M', 20]], extraPct: 0, approved: true, fabricQty: 2, wastage: 0, saved: { fabric: [40], yarn: [] } });
  const [ra, rb] = await Promise.all([svc.build(a.woId, companyId), svc.build(b.woId, companyId)]);
  assert.equal(ra.header.workOrderNo, a.woNo);
  assert.equal(rb.header.workOrderNo, b.woNo);
  assert.equal(ra.header.approved, false);
  assert.deepEqual(ra.colorSizeChart.colors.map((c: any) => c.color), ['RED']);
  assert.deepEqual(rb.colorSizeChart.colors.map((c: any) => c.color), ['BLUE']);
  assert.deepEqual(ra.fabricRequirement.rows.map((x: any) => x.quantity), [10]);
  assert.deepEqual(rb.fabricRequirement.rows.map((x: any) => x.quantity), [40]);
  assert.equal(ra.yarnRequirement.rows.length, 0);
});

test('a missing or deleted Work Order is "not found"', async () => {
  await assert.rejects(svc.build(-1, companyId), /not found/i);
  const { woId } = await seedWorkOrder({ quantities: [['RED', 'S', 1]], extraPct: 0, approved: false, fabricQty: 1, wastage: 0, saved: { fabric: [], yarn: [] } });
  await prisma.$executeRaw`UPDATE "MA_WorkOrder" SET "IsDeleted" = 1 WHERE "RecId" = ${woId}`;
  await assert.rejects(svc.build(woId, companyId), /not found/i);
});

test('a Work Order with no quantities, BOM or requirements still builds, with empty sections', async () => {
  const woId = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "IsDeleted") VALUES (${uniq('W/O-')}, 0) RETURNING "RecId" as id`);
  const r = await svc.build(woId, null);
  assert.equal(r.company.name, null);
  assert.deepEqual(r.colorSizeChart.colors, []);
  assert.deepEqual([r.fabricRecipe, r.trimRecipe, r.embellishments], [[], [], []]);
  assert.deepEqual(r.fabricRequirement, { source: 'calculated', rows: [] });
});

// ── Through the Report Builder (Legacy ERP → Manage Reports) ────────────────────────────────────

const orderFormInput = () => standardLegacyReportInputs().find((r) => r.name === 'Order Form')!;
const user = () => ({ id: 'order-form-test', companyId });

test('the standard Order Form report validates: eight sections, one "ask when running" Work Order filter', async () => {
  const input = orderFormInput();
  assert.ok(input, 'Order Form is one of the standard Legacy ERP reports');
  const { definition } = await reports.validate('legacy-erp', input);
  assert.deepEqual(definition.columns.map((c) => c.field), ORDER_FORM_SECTIONS.map(([k]) => k));
  assert.equal(definition.filters.length, 1);
  assert.deepEqual([definition.filters[0].field, definition.filters[0].operator, definition.filters[0].prompt], ['workOrderId', 'eq', true]);
  assert.deepEqual(definition.sorting, []);
});

test('running it for a Work Order (the prompt answered with its id) prints that Work Order\'s sections', async () => {
  const wo = await seedWorkOrder({
    quantities: [['PALE OLIVE', '3M', 279], ['PALE OLIVE', '6M', 509]], extraPct: 5, approved: true,
    fabricQty: 0.11, wastage: 12, saved: { fabric: [608.04, 15.61], yarn: [541.62] },
  });
  const { definition } = await reports.validate('legacy-erp', orderFormInput());
  const filterId = definition.filters[0].id;

  const waiting = await reports.preview('legacy-erp', { ...definition }, {}, user());
  assert.match(String(waiting.notice), /Choose the Work Order/);
  assert.deepEqual(waiting.sections, []);

  const r = await reports.preview('legacy-erp', { ...definition }, { [filterId]: { value: String(wo.woId) } }, user());
  assert.equal(r.notice, null);
  assert.deepEqual(r.appliedFilters, [`Work Order ${wo.woNo}`]);
  assert.deepEqual(r.sections!.map((s) => s.title), ORDER_FORM_SECTIONS.map(([, t]) => t));
  const section = (key: string) => r.sections!.find((s) => s.key === key)!;
  const header = section('section.header');
  assert.equal(header.layout, 'fields');
  assert.equal(header.rows.find((x) => x.label === 'Order No')!.value, wo.woNo);
  assert.deepEqual(header.badges, ['APPROVED']);
  const chart = section('section.colorSizeChart');
  assert.deepEqual(chart.rows.map((x) => [x.kind, x['size:3M'], x.total]), [['Order', 279, 788], ['Will be Cut', 293, 828], ['Cut', 0, 0]]);
  const fabric = section('section.fabricRequirement');
  assert.deepEqual(fabric.rows.map((x) => x.quantity), [608.04, 15.61]);
  assert.deepEqual(fabric.footerRows.map((x) => x.quantity), [623.65], 'one total per unit');
  assert.equal(section('section.trimRequirement').note?.startsWith('Not saved'), true);

  // Exports — the same sections through the existing CSV / Excel / PDF export.
  const pdf = await exporter.export(r, 'pdf', 'Test Co');
  assert.equal(pdf.buffer.subarray(0, 5).toString(), '%PDF-');
  const csv = (await exporter.export(r, 'csv', 'Test Co')).buffer.toString('utf8');
  for (const [, title] of ORDER_FORM_SECTIONS) assert.ok(csv.includes(title), `CSV has "${title}"`);
  assert.ok(csv.includes(wo.woNo));
  const xlsx = await exporter.export(r, 'xlsx', 'Test Co');
  assert.equal(xlsx.buffer.subarray(0, 2).toString(), 'PK');
});

test('chosen sections, their order and renamed titles are what gets printed', async () => {
  const wo = await seedWorkOrder({ quantities: [['RED', 'S', 1]], extraPct: 0, approved: false, fabricQty: 1, wastage: 0, saved: { fabric: [1], yarn: [] } });
  const r = await reports.preview('legacy-erp', {
    name: 'Short Order Form', dataSource: 'work-order-order-form',
    columns: [{ field: 'section.trimRecipe' }, { field: 'section.header', label: 'Order' }],
    filters: [{ id: 'wo', field: 'workOrderId', operator: 'eq', value: String(wo.woId) }],
  }, {}, user());
  assert.deepEqual(r.sections!.map((s) => s.title), ['Trim Recipe Detail', 'Order']);
});

test('the designer cannot misconfigure it, and an unknown Work Order is reported', async () => {
  const base = { name: 'Bad', dataSource: 'work-order-order-form', columns: [{ field: 'section.header' }] };
  await assert.rejects(reports.validate('legacy-erp', { ...base, columns: [{ field: 'workOrderId' }] }), /not a section/);
  await assert.rejects(reports.validate('legacy-erp', { ...base, filters: [{ id: 'x', field: 'workOrderId', operator: 'gt', value: '1' }] }), /Invalid condition/);
  await assert.rejects(reports.validate('legacy-erp', { ...base, filters: [{ id: 'x', field: 'section.header', operator: 'equals', value: 'a' }] }), /cannot be filtered/);
  await assert.rejects(reports.validate('plm', base), /valid data source/, 'Legacy ERP only');
  await assert.rejects(
    reports.preview('legacy-erp', { ...base, filters: [{ id: 'x', field: 'workOrderId', operator: 'eq', value: '999999999' }] }, {}, user()),
    /not found/,
  );
});

// ── Each section's own columns (ReportColumn.sectionColumns, saved in the definition's columns JSON) ──

const FABRIC_RECIPE_COLUMNS = [
  { key: 'variants', label: 'Color', width: 24, align: 'center' as const },
  { key: 'fabric', label: 'Material', width: 40 },
  { key: 'finalQty', label: 'Qty / pc', decimals: 3, align: 'right' as const },
  { key: 'process', hidden: true },
  { key: 'fabricCode' },
];

test('Fabric Recipe columns: saved with the report, reopened unchanged, printed as configured', async () => {
  const wo = await seedWorkOrder({ quantities: [['RED', 'S', 10]], extraPct: 0, approved: false, fabricQty: 0.11, wastage: 12, saved: { fabric: [1], yarn: [] } });
  const input = orderFormInput();
  const columns = input.columns.map((c) => (c.field === 'section.fabricRecipe' ? { ...c, sectionColumns: FABRIC_RECIPE_COLUMNS } : c));
  const created = await reports.create('legacy-erp', { ...input, name: `Order Form ${RUN} configured`, columns }, user());

  // Reopen: the definition the designer loads carries exactly the saved settings.
  const reopened = await reports.get('legacy-erp', created.id, user());
  const saved = (reopened.columns as any[]).find((c) => c.field === 'section.fabricRecipe').sectionColumns;
  assert.deepEqual(saved, FABRIC_RECIPE_COLUMNS);
  assert.equal((reopened.columns as any[]).find((c) => c.field === 'section.header').sectionColumns, undefined, 'other sections keep their defaults');

  // Run: configured order, labels, widths, alignment, decimals; the hidden column is not printed.
  const filterId = (reopened.filters as any[])[0].id;
  const r = await reports.run('legacy-erp', created.id, { [filterId]: { value: String(wo.woId) } }, user());
  const recipe = r.sections!.find((s) => s.key === 'section.fabricRecipe')!;
  assert.deepEqual(recipe.columns.map((c) => [c.key, c.label, c.width, c.align, c.decimals]), [
    ['variants', 'Color', 24, 'center', null],
    ['fabric', 'Material', 40, null, null],
    ['finalQty', 'Qty / pc', null, 'right', 3],
    ['fabricCode', 'Fabric Code', null, null, null],
  ]);
  assert.equal(recipe.rows[0].finalQty, 0.1232, 'the value itself is unchanged — decimals only format it');
  assert.ok(String(recipe.rows[0].fabricCode).startsWith('FABRIC'), 'Fabric Code is real data from IM_Item');

  // The other sections still print their default columns.
  const requirement = r.sections!.find((s) => s.key === 'section.fabricRequirement')!;
  assert.deepEqual(requirement.columns.map((c) => c.key), ['fabric', 'dia', 'gauge', 'finishWidth', 'variants', 'explanation', 'unit', 'quantity', 'revision', 'dyeingInstruction', 'remarks']);

  // Exports follow the settings: CSV has the new headings and 3 decimals; the PDF builds.
  const csv = (await exporter.export(r, 'csv', 'Test Co')).buffer.toString('utf8');
  assert.ok(csv.includes('Color,Material,Qty / pc,Fabric Code'), 'CSV headings in the configured order');
  assert.ok(csv.includes('0.123'), 'CSV value with 3 decimals');
  assert.ok(!/Process/.test(csv.split('Fabric Recipe Detail')[1].split('Fabric Requirement Detail')[0]), 'hidden column not exported');
  const pdf = await exporter.export(r, 'pdf', 'Test Co');
  assert.equal(pdf.buffer.subarray(0, 5).toString(), '%PDF-');
  const xlsx = await exporter.export(r, 'xlsx', 'Test Co');
  assert.equal(xlsx.buffer.subarray(0, 2).toString(), 'PK');

  // Update keeps working: back to the default columns by removing the settings.
  const updated = await reports.update('legacy-erp', created.id, { ...input, name: `Order Form ${RUN} configured`, columns: input.columns }, user());
  assert.equal((updated.columns as any[]).find((c) => c.field === 'section.fabricRecipe').sectionColumns, undefined);
  await reports.remove('legacy-erp', created.id, user());
});

test('section column settings: size columns, total rows and header fields', async () => {
  const wo = await seedWorkOrder({ quantities: [['RED', 'S', 10], ['RED', 'M', 20], ['BLUE', 'S', 5]], extraPct: 0, approved: false, fabricQty: 1, wastage: 0, saved: { fabric: [10, 20], yarn: [] } });
  const r = await reports.preview('legacy-erp', {
    name: 'Cfg', dataSource: 'work-order-order-form',
    columns: [
      { field: 'section.header', sectionColumns: [{ key: 'orderQuantity', label: 'Pieces', decimals: 1 }, { key: 'workOrderNo' }] },
      { field: 'section.colorSizeChart', sectionColumns: [{ key: 'kind' }, { key: 'sizes', decimals: 0, width: 6 }, { key: 'total' }] },
      // The "Total (unit)" label normally sits in the Fabric column, which is not printed here.
      { field: 'section.fabricRequirement', sectionColumns: [{ key: 'unit' }, { key: 'quantity' }] },
    ],
    filters: [{ id: 'wo', field: 'workOrderId', operator: 'eq', value: String(wo.woId) }],
  } as any, {}, user());
  const [header, chart, req] = r.sections!;
  assert.deepEqual(header.rows.map((x) => [x.label, x.value, x.decimals]), [['Pieces', 35, 1], ['Order No', wo.woNo, null]]);
  assert.deepEqual(chart.columns.map((c) => c.label), ['Quantity', 'S', 'M', 'Total'], 'one column per size, headed by the size');
  assert.ok(chart.columns.filter((c) => c.key.startsWith('size:')).every((c) => c.width === 6 && c.decimals === 0));
  assert.equal(chart.footerRows[0].kind, 'All colors', 'total label moves to the first visible text column');
  assert.deepEqual(req.footerRows.map((x) => [x.unit, x.quantity]), [['Total', 30]]);
});

test('invalid section column settings are rejected with the section named', async () => {
  const base = { name: 'Bad', dataSource: 'work-order-order-form' };
  const bad = (sectionColumns: any[]) => reports.validate('legacy-erp', { ...base, columns: [{ field: 'section.fabricRecipe', sectionColumns }] } as any);
  await assert.rejects(bad([{ key: 'notAColumn' }]), /Fabric Recipe Detail: Unknown column "notAColumn"/);
  await assert.rejects(bad([{ key: 'fabric', decimals: 2 }]), /not a number column/);
  await assert.rejects(bad([{ key: 'rawQty', decimals: 9 }]), /Decimals .* 0–6/);
  await assert.rejects(bad([{ key: 'fabric', width: 200 }]), /Width .* 3–80/);
  await assert.rejects(bad([{ key: 'fabric', align: 'justify' }]), /Invalid alignment/);
  await assert.rejects(bad([{ key: 'fabric', hidden: true }]), /at least one visible column/);
  await assert.rejects(bad([]), /at least one visible column/);
});

// ── Add column — every section, every catalog column (ORDER_FORM_SECTION_COLUMNS) ────────────────

/** A Work Order linked to a Style Card that has one Ornament line (the Embellishment Details source). */
async function seedStyleWorkOrder() {
  const branch = await prisma.branch.create({ data: { companyId, name: `Order Form ${RUN} ${++seq}` } });
  const style = await prisma.styleCard.create({
    data: {
      styleNumber: uniq('SC-'), title: 'Sweat', category: 'Sweatshirt', customerStyleNo: 'CS-21634', branchId: branch.id, createdBy: 'order-form-test',
      bomLines: { create: [{ lineType: 'ornament', fabricName: 'Teddy Embroidery', bodyColor: 'Pale Olive', printColor: 'THRED-18-5612', placement: 'Front', component: 'Body', process: 'Embroidery' }] },
    },
  });
  const woId = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "StyleCardId", "IsDeleted") VALUES (${uniq('W/O-')}, ${style.id}, 0) RETURNING "RecId" as id`);
  return woId;
}

test('Add column, every section: all catalog columns save, reopen, print from real data and export', async () => {
  const wo = await seedWorkOrder({
    quantities: [['RED', 'S', 10], ['RED', 'M', 20], ['BLUE', 'S', 5]], extraPct: 5, approved: true,
    fabricQty: 0.5, wastage: 10, saved: { fabric: [12.5, 3], yarn: [4.25] },
  });
  const styleWoId = await seedStyleWorkOrder();
  const fields = (await reports.catalog('legacy-erp', user())).sources.find((s) => s.key === 'work-order-order-form')!.fields;
  assert.equal(fields.filter((f: any) => f.sectionColumns).length, 8, 'all eight sections expose their columns');

  for (const [sectionKey, title] of ORDER_FORM_SECTIONS) {
    const defs = (fields.find((f: any) => f.key === sectionKey) as any).sectionColumns as { key: string; label: string; type: string; labelEditable?: boolean; defaultVisible: boolean }[];
    assert.ok(defs.some((d) => !d.defaultVisible) || sectionKey === 'section.colorSizeChart', `${title}: offers columns beyond its defaults`);
    // Every column, reversed; labels renamed; numbers with 2 decimals; the last one hidden.
    const config = [...defs].reverse().map((d, i) => ({
      key: d.key,
      ...(d.labelEditable === false ? {} : { label: `${d.label} *` }),
      ...(d.type === 'number' ? { decimals: 2 } : {}),
      width: 12,
      ...(i === defs.length - 1 ? { hidden: true } : {}),
    }));
    const input = orderFormInput();
    const created = await reports.create('legacy-erp', {
      ...input, name: `OF ${RUN} ${sectionKey}`,
      columns: [{ field: sectionKey, sectionColumns: config }],
    }, user());

    // Reopen: identical settings.
    const reopened = await reports.get('legacy-erp', created.id, user());
    assert.deepEqual((reopened.columns as any[])[0].sectionColumns, config, `${title}: reopened unchanged`);

    // Run: the printed columns are the configured, visible ones — each a value the data carries.
    const woId = sectionKey === 'section.embellishments' ? styleWoId : wo.woId;
    const r = await reports.run('legacy-erp', created.id, { [(reopened.filters as any[])[0].id]: { value: String(woId) } }, user());
    const section = r.sections![0];
    const visible = config.filter((x) => !x.hidden);
    if (sectionKey === 'section.header') {
      assert.deepEqual(section.rows.map((x) => x.key), visible.map((x) => x.key), `${title}: header fields in order`);
      assert.ok(section.rows.every((x) => String(x.label).endsWith(' *')));
      assert.equal(section.rows.find((x) => x.key === 'approved')!.value, true, 'Approved comes from MA_WorkOrder.IsApproved');
    } else {
      const expected = visible.flatMap((x) => (x.key === 'sizes' ? ['size:S', 'size:M'] : [x.key]));
      assert.deepEqual(section.columns.map((col) => col.key), expected, `${title}: columns in configured order`);
      assert.ok(section.rows.length > 0, `${title}: has rows to check`);
      for (const row of section.rows) {
        for (const key of expected) assert.ok(Object.prototype.hasOwnProperty.call(row, key), `${title}: data carries "${key}"`);
      }
    }

    // Exports build with the configuration.
    for (const format of ['pdf', 'xlsx', 'csv'] as const) {
      const file = await exporter.export(r, format, 'Test Co');
      assert.ok(file.buffer.length > 100, `${title}: ${format} export`);
    }
    const csv = (await exporter.export(r, 'csv', 'Test Co')).buffer.toString('utf8');
    if (sectionKey !== 'section.header') {
      const firstLabel = visible[0].key === 'sizes' ? 'S' : `${defs.find((d) => d.key === visible[0].key)!.label} *`;
      assert.ok(csv.includes(firstLabel), `${title}: CSV heading "${firstLabel}"`);
    }

    // Remove the first column, then add it back at the end: both saves keep the other settings.
    const [first, ...rest] = config;
    const removed = await reports.update('legacy-erp', created.id, { ...input, name: created.name, columns: [{ field: sectionKey, sectionColumns: rest }] }, user());
    assert.deepEqual((removed.columns as any[])[0].sectionColumns, rest);
    const readded = await reports.update('legacy-erp', created.id, { ...input, name: created.name, columns: [{ field: sectionKey, sectionColumns: [...rest, first] }] }, user());
    assert.deepEqual((readded.columns as any[])[0].sectionColumns, [...rest, first]);
    await reports.remove('legacy-erp', created.id, user());
  }
});

test('Add column: a column cannot be added twice — duplicates are saved once', async () => {
  const { definition } = await reports.validate('legacy-erp', {
    name: 'Dup', dataSource: 'work-order-order-form',
    columns: [{ field: 'section.trimRecipe', sectionColumns: [{ key: 'trim' }, { key: 'price', decimals: 2 }, { key: 'price', decimals: 4 }, { key: 'trim', hidden: true }] }],
  } as any);
  assert.deepEqual(definition.columns[0].sectionColumns, [{ key: 'trim' }, { key: 'price', decimals: 2 }]);
});
