// Fabric Planning — receipt-backed columns (Received, Manufacturing Send, Subcontract Send/Receive
// such as "Knitting Receive") belong to the planning row whose (Work Order, Item, Material Color)
// the receipt line carries, and Transaction Details lists exactly those receipts. Regression for
// the shared 94.113 (= 46.781 + 47.332) shown on every color row of W/O-000211 / FABRIC-00006.
// Throwaway full-schema test database (`npm run test:fabric-planning`); every test seeds its own
// uniquely-coded rows; nothing is deleted. The Fabric requirements engine is stubbed so the planning
// rows are exactly the color rows under test; everything this fix touches (receipt joins and
// aggregation) runs against the real database.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FabricPlanningService } from '../../src/modules/legacy-erp/fabric-planning.service';
import { FabricYarnRequirementsService } from '../../src/modules/legacy-erp/fabric-yarn-requirements.service';
import { ItemAllocationService } from '../../src/modules/legacy-erp/item-allocation.service';

let prisma: PrismaService;
let branchId: string;
let knittingTypeId: number;
let dyeingTypeId: number;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();
const one = async (sql: string, ...params: unknown[]) => Number((await prisma.$queryRawUnsafe<any[]>(sql, ...params))[0].id);

// Planning rows per Work Order, as the (stubbed) Fabric requirements engine returns them.
const requirementRows = new Map<number, any[]>();
const requirementsStub = { getMaterialRequirements: async (workOrderId: number) => requirementRows.get(workOrderId) ?? [] } as any;
let planning: FabricPlanningService;
let details: FabricYarnRequirementsService;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const company = await prisma.company.create({ data: { name: `Fabric Planning Test ${RUN}` } });
  branchId = (await prisma.branch.create({ data: { name: 'FP', companyId: company.id } })).id;
  knittingTypeId = await one(`INSERT INTO "MD_SubcontractType" ("SubcontractTypeCode","SubcontractTypeName") VALUES ($1,'knitting') RETURNING "RecId" AS id`, uniq('KN'));
  dyeingTypeId = await one(`INSERT INTO "MD_SubcontractType" ("SubcontractTypeCode","SubcontractTypeName") VALUES ($1,'dyeing') RETURNING "RecId" AS id`, uniq('DY'));
  // Only prisma is used by the methods under test (candidate/header/aggregate queries and
  // getTransactionDetails); the requirements engine is the stub above.
  planning = new FabricPlanningService(prisma, null as any, requirementsStub, new ItemAllocationService(prisma, null as any) as any);
  details = new FabricYarnRequirementsService(prisma, null as any, null as any, null as any);
});
after(async () => { await prisma.$disconnect(); });

// --- seed helpers ----------------------------------------------------------------------------
const fabricItem = (code: string) =>
  one(`INSERT INTO "IM_Item" ("InventoryCode","InventoryName","AccessCode","IsDeleted") VALUES ($1,'3TH TERRY CROSS','FABRIC',0) RETURNING "RecId" AS id`, code);
const color = async (name: string) => (await prisma.colorCard.create({ data: { code: uniq('C'), name, color: '#123456', branchId } })).id;

/** A Work Order (Order No prefixed with this run, so filtering by RUN isolates it) and its line. */
async function workOrder() {
  const style = await prisma.styleCard.create({ data: { styleNumber: uniq('SC-'), title: 'new test', branchId, createdBy: 'u1' } });
  const workOrderNo = `W/O-${RUN}-${++seq}`.toUpperCase(); // UdtCode: at most 25 characters
  const id = await one(`INSERT INTO "MA_WorkOrder" ("WorkOrderNo","StyleCardId","IsDeleted") VALUES ($1,$2,0) RETURNING "RecId" AS id`, workOrderNo, style.id);
  const itemId = await one(`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId","ItemOrderNo","IsDeleted") VALUES ($1,1,0) RETURNING "RecId" AS id`, id);
  return { id, itemId, workOrderNo };
}

/** A planning row of the stubbed engine: one BOM line scope with its own Material Color. */
function planRow(workOrderId: number, inventoryId: number, code: string, colorCardId: string | null, variant2: string, required: number) {
  const rows = requirementRows.get(workOrderId) ?? [];
  rows.push({ id: `${rows.length + 1}::line`, inventoryId, inventoryCode: code, inventoryName: '3TH TERRY CROSS', process: null,
    variant1: null, variant2, colorCardId, colorCode: null, colorName: null, consumption: 1, applicableQuantity: required, requirementUnit: null, quantity: required });
  requirementRows.set(workOrderId, rows);
}

/** One receipt (header + line) linked to a Work Order line, with the line's own Material Color. */
async function receipt(opts: { receiptType: number; subcontractTypeId?: number | null; inventoryId: number; quantity: number; workOrderItemId: number; colorCardId: string | null }) {
  const receiptNo = uniq('OPR-');
  const receiptId = await one(
    `INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo","ReceiptDate","CompanyId","WorkplaceId","SubcontractTypeId","IsDeleted") VALUES ($1,$2,'2026-10-01'::date,1,1,$3,0) RETURNING "RecId" AS id`,
    opts.receiptType, receiptNo, opts.subcontractTypeId ?? null);
  await one(
    `INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId","ReceiptType","InventoryId","Quantity","UnitPrice","WorkOrderReceiptItemId","ColorCardId","IsDeleted") VALUES ($1,$2,$3,$4,0,$5,$6,0) RETURNING "RecId" AS id`,
    receiptId, opts.receiptType, opts.inventoryId, opts.quantity, opts.workOrderItemId, opts.colorCardId);
  return receiptNo;
}
const knitReceive = (o: Omit<Parameters<typeof receipt>[0], 'receiptType' | 'subcontractTypeId'>) => receipt({ ...o, receiptType: 11, subcontractTypeId: knittingTypeId });
const purchaseReceipt = (o: Omit<Parameters<typeof receipt>[0], 'receiptType' | 'subcontractTypeId'>) => receipt({ ...o, receiptType: 2 });

const list = () => planning.listPlanningRows({ orderNo: RUN });
const knitting = (row: any) => row.subcontractTransactions[String(knittingTypeId)]?.receive ?? 0;
const rowOf = (rows: any[], workOrderId: number, variant2: string) => {
  const r = rows.find((x) => x.workOrderId === workOrderId && x.variant2 === variant2);
  assert.ok(r, `planning row ${variant2} of WO ${workOrderId}`);
  return r;
};
/** What Transaction Details lists for a planning row (as Fabric Planning requests it). */
const panelFor = (row: any) => details.getTransactionDetails(row.workOrderId, row.inventoryId, row.colorCardId ?? undefined, true) as Promise<any[]>;
const sum = (rows: any[], receiptType: number) => Math.round(rows.filter((r) => r.receiptType === receiptType).reduce((s, r) => s + Number(r.quantity), 0) * 10000) / 10000;

// --- the scenario from the report: W/O-000211 / FABRIC-00006 ----------------------------------
describe('receipt-backed columns follow the row\'s (Work Order, Item, Material Color)', () => {
  let wo: Awaited<ReturnType<typeof workOrder>>;
  let woOther: Awaited<ReturnType<typeof workOrder>>;
  let fabric: number;
  const colors: Record<string, string> = {};
  const receiptNos: Record<string, string[]> = {};

  before(async () => {
    wo = await workOrder();
    woOther = await workOrder();
    const code = uniq('FABRIC-');
    fabric = await fabricItem(code);
    for (const [variant, material] of [['OXFORD TAN 15-1306 TCX', 'PTA NI KI NAME'], ['DARK DENIM', 'TOTAL ECLIPSE 19-4010 TCX'], ['NAVY BLUE', '19-5413 TCX'], ['DEEP LICHEN GREEN', 'SNOW WHITE']]) {
      colors[variant] = await color(material);
    }
    planRow(wo.id, fabric, code, colors['OXFORD TAN 15-1306 TCX'], 'OXFORD TAN 15-1306 TCX', 46.781);
    planRow(wo.id, fabric, code, colors['DARK DENIM'], 'DARK DENIM', 47.332);
    planRow(wo.id, fabric, code, colors['NAVY BLUE'], 'NAVY BLUE', 160.708);
    planRow(wo.id, fabric, code, colors['DEEP LICHEN GREEN'], 'DEEP LICHEN GREEN', 87.784);
    // The same item and colors on another Work Order.
    planRow(woOther.id, fabric, code, colors['OXFORD TAN 15-1306 TCX'], 'OXFORD TAN 15-1306 TCX', 486.766);
    planRow(woOther.id, fabric, code, colors['DARK DENIM'], 'DARK DENIM', 100);

    receiptNos.oxford = [await knitReceive({ inventoryId: fabric, quantity: 46.7813, workOrderItemId: wo.itemId, colorCardId: colors['OXFORD TAN 15-1306 TCX'] })];
    receiptNos.denim = [await knitReceive({ inventoryId: fabric, quantity: 47.3316, workOrderItemId: wo.itemId, colorCardId: colors['DARK DENIM'] })];
    // Several receipts for one row: two more Knitting Receives and two Purchase Receipts on DARK DENIM.
    receiptNos.denim.push(await knitReceive({ inventoryId: fabric, quantity: 2.5, workOrderItemId: wo.itemId, colorCardId: colors['DARK DENIM'] }));
    receiptNos.denim.push(await knitReceive({ inventoryId: fabric, quantity: 0.25, workOrderItemId: wo.itemId, colorCardId: colors['DARK DENIM'] }));
    receiptNos.denim.push(await purchaseReceipt({ inventoryId: fabric, quantity: 10, workOrderItemId: wo.itemId, colorCardId: colors['DARK DENIM'] }));
    receiptNos.denim.push(await purchaseReceipt({ inventoryId: fabric, quantity: 5, workOrderItemId: wo.itemId, colorCardId: colors['DARK DENIM'] }));
    // A different subcontract type on the same row stays under its own column.
    receiptNos.denim.push(await receipt({ receiptType: 11, subcontractTypeId: dyeingTypeId, inventoryId: fabric, quantity: 7, workOrderItemId: wo.itemId, colorCardId: colors['DARK DENIM'] }));
    // The other Work Order's own receipts for the same item + color.
    receiptNos.otherOxford = [await knitReceive({ inventoryId: fabric, quantity: 300, workOrderItemId: woOther.itemId, colorCardId: colors['OXFORD TAN 15-1306 TCX'] })];
  });

  test('two variants of the same item on one Work Order each show only their own Knitting Receive', async () => {
    const rows = await list();
    assert.equal(knitting(rowOf(rows, wo.id, 'OXFORD TAN 15-1306 TCX')), 46.7813);
    assert.equal(knitting(rowOf(rows, wo.id, 'DARK DENIM')), 47.3316 + 2.5 + 0.25);
    for (const r of rows.filter((x) => x.workOrderId === wo.id)) assert.notEqual(knitting(r), 46.7813 + 47.3316, `${r.variant2} must not show the combined total`);
  });

  test('a row with no receipts shows zero, never another row\'s quantity', async () => {
    const rows = await list();
    for (const variant of ['NAVY BLUE', 'DEEP LICHEN GREEN']) {
      const r = rowOf(rows, wo.id, variant);
      assert.equal(knitting(r), 0, variant);
      assert.deepEqual(r.subcontractTransactions, {}, variant);
      assert.equal(r.received, 0, variant);
      assert.equal(r.balance, r.required, `${variant}: Balance = Required - its own Received`);
      assert.deepEqual(await panelFor(r), [], `${variant}: Transaction Details empty`);
    }
  });

  test('several receipts for one row are summed for that row only, per column', async () => {
    const rows = await list();
    const denim = rowOf(rows, wo.id, 'DARK DENIM');
    assert.equal(knitting(denim), 50.0816);
    assert.equal(denim.subcontractTransactions[String(dyeingTypeId)].receive, 7, 'other subcontract type in its own column');
    assert.equal(denim.received, 15);
    assert.equal(denim.balance, Math.round((47.332 - 15) * 10000) / 10000);
    const oxford = rowOf(rows, wo.id, 'OXFORD TAN 15-1306 TCX');
    assert.equal(oxford.received, 0);
    assert.equal(oxford.subcontractTransactions[String(dyeingTypeId)], undefined);
  });

  test('Transaction Details of each row lists exactly its receipts and adds up to its columns', async () => {
    const rows = (await list()).filter((r) => r.workOrderId === wo.id);
    for (const r of rows) {
      const panel = await panelFor(r);
      const expected = r.variant2 === 'OXFORD TAN 15-1306 TCX' ? receiptNos.oxford : r.variant2 === 'DARK DENIM' ? receiptNos.denim : [];
      assert.deepEqual(panel.map((p) => p.receiptNo).sort(), [...expected].sort(), r.variant2);
      assert.ok(panel.every((p) => p.colorCardId === r.colorCardId && Number(p.inventoryId) === r.inventoryId), `${r.variant2}: own color and item only`);
      assert.equal(sum(panel, 2), r.received, `${r.variant2}: Received`);
      assert.equal(sum(panel.filter((p) => p.subcontractor === 'knitting'), 11), knitting(r), `${r.variant2}: Knitting Receive`);
    }
  });

  test('the same item and color on another Work Order keeps its own quantities', async () => {
    const rows = await list();
    assert.equal(knitting(rowOf(rows, woOther.id, 'OXFORD TAN 15-1306 TCX')), 300);
    assert.equal(knitting(rowOf(rows, woOther.id, 'DARK DENIM')), 0);
    assert.equal(knitting(rowOf(rows, wo.id, 'OXFORD TAN 15-1306 TCX')), 46.7813, 'not affected by the other Work Order');
    const other = await panelFor(rowOf(rows, woOther.id, 'OXFORD TAN 15-1306 TCX'));
    assert.deepEqual(other.map((p) => p.receiptNo), receiptNos.otherOxford);
  });

  test('without byColor the shared aggregates keep their (Work Order, Item) totals', async () => {
    const subcontract = await planning.aggregateSubcontractReceipts([wo.id], [fabric]);
    assert.equal(subcontract.get(`${wo.id}:${fabric}`)?.get(knittingTypeId)?.receive, 46.7813 + 47.3316 + 2.5 + 0.25);
    const receipts = await planning.aggregateReceipts([wo.id], [fabric]);
    assert.equal(receipts.get(`${wo.id}:${fabric}`)?.received, 15);
    // The Requirements screen's own call (no exactColor) still lists every color of the item.
    const all = await details.getTransactionDetails(wo.id, fabric) as any[];
    assert.equal(all.length, receiptNos.oxford.length + receiptNos.denim.length);
  });
});

describe('rows without a Material Color', () => {
  test('match only receipt lines without one, in the columns and in Transaction Details', async () => {
    const wo = await workOrder();
    const code = uniq('FABRIC-');
    const fabric = await fabricItem(code);
    const red = await color('RED');
    planRow(wo.id, fabric, code, null, 'COMMON', 20);
    planRow(wo.id, fabric, code, red, 'RED', 30);
    const common = await knitReceive({ inventoryId: fabric, quantity: 4, workOrderItemId: wo.itemId, colorCardId: null });
    const redReceipt = await knitReceive({ inventoryId: fabric, quantity: 9, workOrderItemId: wo.itemId, colorCardId: red });

    const rows = await list();
    const commonRow = rowOf(rows, wo.id, 'COMMON');
    const redRow = rowOf(rows, wo.id, 'RED');
    assert.equal(knitting(commonRow), 4);
    assert.equal(knitting(redRow), 9);
    assert.deepEqual((await panelFor(commonRow)).map((p) => p.receiptNo), [common]);
    assert.deepEqual((await panelFor(redRow)).map((p) => p.receiptNo), [redReceipt]);
  });
});
