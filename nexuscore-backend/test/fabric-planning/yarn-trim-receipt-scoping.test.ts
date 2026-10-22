// Yarn Planning and Trim Planning — same rule as Fabric Planning (receipt-scoping.test.ts): the
// receipt-backed columns (Received, Manufacturing Send, Subcontract Send/Receive) belong to the
// planning row whose (Work Order, Item, Material Color) the receipt line carries, and Transaction
// Details lists exactly those receipts. Receipts made from a planning row carry that row's own
// colorCardId (receipt-menu.ts buildPrefillLines) — for a Yarn row that is the source Fabric
// line's Material Color, which is also what the row itself carries.
// Throwaway full-schema test database (`npm run test:fabric-planning`); the requirements engine is
// stubbed so the planning rows are exactly the rows under test.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FabricPlanningService } from '../../src/modules/legacy-erp/fabric-planning.service';
import { YarnPlanningService } from '../../src/modules/legacy-erp/yarn-planning.service';
import { TrimPlanningService } from '../../src/modules/legacy-erp/trim-planning.service';
import { FabricYarnRequirementsService } from '../../src/modules/legacy-erp/fabric-yarn-requirements.service';
import { ItemAllocationService } from '../../src/modules/legacy-erp/item-allocation.service';

let prisma: PrismaService;
let branchId: string;
let dyeingTypeId: number;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();
const one = async (sql: string, ...params: unknown[]) => Number((await prisma.$queryRawUnsafe<any[]>(sql, ...params))[0].id);

const yarnRows = new Map<number, any[]>();
const trimRows = new Map<number, any[]>();
const requirementsStub = {
  getYarnRequirements: async (workOrderId: number) => yarnRows.get(workOrderId) ?? [],
  getMaterialRequirements: async (workOrderId: number, type: string) => (type === 'trim' ? trimRows.get(workOrderId) ?? [] : []),
} as any;
let yarn: YarnPlanningService;
let trim: TrimPlanningService;
let details: FabricYarnRequirementsService;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const company = await prisma.company.create({ data: { name: `Yarn/Trim Planning Test ${RUN}` } });
  branchId = (await prisma.branch.create({ data: { name: 'YT', companyId: company.id } })).id;
  dyeingTypeId = await one(`INSERT INTO "MD_SubcontractType" ("SubcontractTypeCode","SubcontractTypeName") VALUES ($1,'Dyeing') RETURNING "RecId" AS id`, uniq('DY'));
  const allocation = new ItemAllocationService(prisma, null as any);
  const fabric = new FabricPlanningService(prisma, null as any, requirementsStub, allocation);
  yarn = new YarnPlanningService(fabric, requirementsStub, allocation);
  trim = new TrimPlanningService(fabric, requirementsStub, allocation);
  details = new FabricYarnRequirementsService(prisma, null as any, null as any, null as any);
});
after(async () => { await prisma.$disconnect(); });

const item = (code: string, access: string) =>
  one(`INSERT INTO "IM_Item" ("InventoryCode","InventoryName","AccessCode","IsDeleted") VALUES ($1,$1,$2,0) RETURNING "RecId" AS id`, code, access);
const color = async (name: string) => (await prisma.colorCard.create({ data: { code: uniq('C'), name, color: '#123456', branchId } })).id;

async function workOrder() {
  const style = await prisma.styleCard.create({ data: { styleNumber: uniq('SC-'), title: 'yarn trim test', branchId, createdBy: 'u1' } });
  const workOrderNo = `W/O-${RUN}-${++seq}`.toUpperCase(); // UdtCode: at most 25 characters
  const id = await one(`INSERT INTO "MA_WorkOrder" ("WorkOrderNo","StyleCardId","IsDeleted") VALUES ($1,$2,0) RETURNING "RecId" AS id`, workOrderNo, style.id);
  const itemId = await one(`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId","ItemOrderNo","IsDeleted") VALUES ($1,1,0) RETURNING "RecId" AS id`, id);
  return { id, itemId };
}

/** A Yarn requirement row: production color in garmentColor, source Fabric line's Material Color in colorCardId. */
function yarnRow(workOrderId: number, inventoryId: number, colorCardId: string | null, garmentColor: string, required: number) {
  const rows = yarnRows.get(workOrderId) ?? [];
  rows.push({ id: `${rows.length + 1}-0`, inventoryId, inventoryCode: 'YARN', inventoryName: 'YARN', process: null, variant1: null, variant2: null,
    garmentColor, colorCardId, colorCode: null, colorName: null, requirementUnit: null, quantity: required });
  yarnRows.set(workOrderId, rows);
}
/** A Trim requirement row (one BOM line scope with its own Material Color). */
function trimRow(workOrderId: number, inventoryId: number, colorCardId: string | null, variant2: string, required: number) {
  const rows = trimRows.get(workOrderId) ?? [];
  rows.push({ id: `${rows.length + 1}::line`, inventoryId, inventoryCode: 'TRIM', inventoryName: 'TRIM', process: null, variant1: null, variant2,
    colorCardId, colorCode: null, colorName: null, consumption: 1, applicableQuantity: required, requirementUnit: null, quantity: required });
  trimRows.set(workOrderId, rows);
}

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

const dyeingSend = (row: any) => row.subcontractTransactions[String(dyeingTypeId)]?.send ?? 0;
const rowOf = (rows: any[], workOrderId: number, variant2: string) => {
  const r = rows.find((x) => x.workOrderId === workOrderId && x.variant2 === variant2);
  assert.ok(r, `planning row ${variant2} of WO ${workOrderId}`);
  return r;
};
/** Transaction Details for a row, exactly as the Planning screens request it. */
const panelFor = (row: any) => details.getTransactionDetails(row.workOrderId, row.inventoryId, row.colorCardId ?? undefined, true) as Promise<any[]>;
const total = (rows: any[], receiptType: number) => Math.round(rows.filter((r) => r.receiptType === receiptType).reduce((s, r) => s + Number(r.quantity), 0) * 10000) / 10000;

for (const screen of ['Yarn', 'Trim'] as const) {
  describe(`${screen} Planning: receipt-backed columns follow the row's (Work Order, Item, Material Color)`, () => {
    let wo: Awaited<ReturnType<typeof workOrder>>;
    let invId: number;
    const cc: Record<string, string> = {};
    const nos: Record<string, string[]> = { A: [], B: [], none: [] };
    const list = () => (screen === 'Yarn' ? yarn : trim).listPlanningRows({ orderNo: RUN });
    const addRow = (colorCardId: string | null, variant: string, required: number) =>
      screen === 'Yarn' ? yarnRow(wo.id, invId, colorCardId, variant, required) : trimRow(wo.id, invId, colorCardId, variant, required);

    before(async () => {
      wo = await workOrder();
      invId = await item(uniq(screen === 'Yarn' ? 'YARN-' : 'TRIM-'), screen === 'Yarn' ? 'YARN' : 'TRIM');
      for (const k of ['A', 'B', 'C']) cc[k] = await color(`${screen} ${k}`);
      addRow(cc.A, 'DARK DENIM', 16.1108);
      addRow(cc.B, 'NAVY BLUE', 50);
      addRow(cc.C, 'OXFORD TAN', 20);
      addRow(null, 'COMMON', 30);
      const on = (colorCardId: string | null) => ({ inventoryId: invId, workOrderItemId: wo.itemId, colorCardId });
      nos.A.push(await receipt({ receiptType: 134, subcontractTypeId: dyeingTypeId, quantity: 9, ...on(cc.A) }));
      nos.B.push(await receipt({ receiptType: 2, quantity: 5, ...on(cc.B) }));
      nos.B.push(await receipt({ receiptType: 140, quantity: 3, ...on(cc.B) }));
      nos.B.push(await receipt({ receiptType: 134, subcontractTypeId: dyeingTypeId, quantity: 4, ...on(cc.B) }));
      nos.none.push(await receipt({ receiptType: 2, quantity: 6, ...on(null) }));
    });

    test('each color row shows only its own Received, Manufacturing Send and Subcontract figures', async () => {
      const rows = await list();
      const a = rowOf(rows, wo.id, 'DARK DENIM');
      assert.equal(dyeingSend(a), 9);
      assert.equal(a.received, 0);
      assert.equal(a.manufacturingSend, 0);
      assert.equal(a.balance, 16.1108);
      const b = rowOf(rows, wo.id, 'NAVY BLUE');
      assert.equal(dyeingSend(b), 4);
      assert.equal(b.received, 5);
      assert.equal(b.manufacturingSend, 3);
      assert.equal(b.balance, 45);
    });

    test('a color row with no receipts shows zero', async () => {
      const c = rowOf(await list(), wo.id, 'OXFORD TAN');
      assert.deepEqual(c.subcontractTransactions, {});
      assert.equal(c.received, 0);
      assert.equal(c.manufacturingSend, 0);
      assert.equal(c.balance, c.required);
    });

    test('a row without a Material Color matches only receipt lines without one', async () => {
      const common = rowOf(await list(), wo.id, 'COMMON');
      assert.equal(common.received, 6);
      assert.equal(common.manufacturingSend, 0);
      assert.deepEqual(common.subcontractTransactions, {});
    });

    test('Transaction Details of each row adds up to that row\'s own columns', async () => {
      const rows = (await list()).filter((r) => r.workOrderId === wo.id);
      const expected: Record<string, string[]> = { 'DARK DENIM': nos.A, 'NAVY BLUE': nos.B, 'OXFORD TAN': [], COMMON: nos.none };
      for (const r of rows) {
        const panel = await panelFor(r);
        assert.deepEqual(panel.map((p) => p.receiptNo).sort(), [...expected[r.variant2]].sort(), r.variant2);
        assert.equal(total(panel, 2), r.received, `${r.variant2}: Received`);
        assert.equal(total(panel, 140), r.manufacturingSend, `${r.variant2}: Manufacturing Send`);
        assert.equal(total(panel, 134), dyeingSend(r), `${r.variant2}: Dyeing Send`);
      }
    });
  });
}
