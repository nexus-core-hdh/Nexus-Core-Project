// Cutting Card — Colour-wise and Complete-Order Cutting over the same storage (one CuttingCard per
// Work Order + Production Color + Fabric, one CuttingCardEntry per color per batch). Throwaway
// full-schema test database (`npm run test:cutting`); every test seeds its own Work Order. The
// Work Order's Fabric BOM is stubbed (resolveBomLines) so each test states exactly which Fabric
// applies to which color: MAIN FAB to every color, RIB to RED only.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { WorkOrderService } from '../../src/modules/legacy-erp/work-order.service';
import { CuttingCardService } from '../../src/modules/legacy-erp/cutting-card.service';

let prisma: PrismaService;
let svc: CuttingCardService;
let userId: string;
let companyId: string;
const bomByWorkOrder = new Map<number, any[]>();
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<{ id: number }[]>(sql))[0].id);
const MAIN = 'fabric:variant:main fab';
const RIB = 'fabric:variant:rib';

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  const workOrders = new WorkOrderService(prisma, audit, null as any);
  const bom = { resolveBomLines: async (id: number) => bomByWorkOrder.get(id) ?? [] } as any;
  svc = new CuttingCardService(prisma, workOrders, bom, { getById: async () => null } as any, audit);
  const company = await prisma.company.create({ data: { name: `Cutting Modes ${RUN}` } });
  const user = await prisma.user.create({ data: { companyId: company.id, name: 'cutting-test', email: `cut-${RUN}@test.invalid`, password: 'x' } });
  userId = user.id;
  companyId = company.id;
});
after(async () => { await prisma.$disconnect(); });

/** A Work Order with Manufacturing Quantities RED: S 10, M 20 · BLUE: S 5, M 0 and Extra Cutting 10%. */
async function workOrder(opts: { colorBased?: number; quantities?: [string, string, number][]; bom?: boolean } = {}) {
  const woId = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "Quantity2", "ProductionColorCumulativeType", "IsDeleted") VALUES (${uniq('W/O-')}, 10, ${opts.colorBased ?? 0}, 0) RETURNING "RecId" as id`);
  const itemId = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${woId}, 1, 0) RETURNING "RecId" as id`);
  const qty = opts.quantities ?? [['RED', 'S', 10], ['RED', 'M', 20], ['BLUE', 'S', 5], ['BLUE', 'M', 0]];
  for (const [i, [color, size, n]] of qty.entries()) {
    await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "Quantity", "SubNo", "IsDeleted") VALUES (${itemId}, ${`${color}‖${size}`}, ${n}, ${i + 1}, 0)`;
  }
  if (opts.bom !== false) {
    const fab = await one(Prisma.sql`INSERT INTO "IM_Item" ("InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${uniq('FAB')}, 'Jersey', 'FABRIC', 0) RETURNING "RecId" as id`);
    bomByWorkOrder.set(woId, [
      { inventoryId: fab, variant1: 'MAIN FAB', variant2: null, colorCardId: null, wastage: 0 },
      { inventoryId: fab, variant1: 'RIB', variant2: 'RED', colorCardId: null, wastage: 0 },
    ]);
  }
  return woId;
}
const cutOf = (card: any) => Object.fromEntries(card.rows.map((r: any) => [r.sizeCode, r.cutQty]));
const rejects = (p: Promise<unknown>, status: number, re: RegExp) =>
  assert.rejects(p, (e: any) => { assert.equal(e?.getStatus?.(), status); assert.match(e.message, re); return true; });

describe('Colour-wise Cutting', () => {
  test('loads and saves only the selected color', async () => {
    const wo = await workOrder();
    const fabrics = await svc.listApplicableFabrics(wo, 'RED');
    assert.deepEqual(fabrics.map((f) => f.materialKey), [MAIN, RIB]);
    assert.deepEqual((await svc.listApplicableFabrics(wo, 'BLUE')).map((f) => f.materialKey), [MAIN], 'RIB is RED-only');

    let red: any = await svc.addCuttingEntry(wo, 'RED', MAIN, 'MAIN FAB', userId, companyId);
    red = await svc.setCuttingEntrySize(wo, 'RED', MAIN, 'MAIN FAB', red.entries[0].id, 'S', 7, userId, companyId);
    assert.equal(red.productionColor, 'RED');
    assert.deepEqual(red.rows.map((r: any) => [r.sizeCode, r.orderQty, r.willBeCutQty, r.cutQty]), [['S', 10, 11, 7], ['M', 20, 22, 0]]);

    const blue: any = await svc.getCuttingCard(wo, 'BLUE', MAIN, 'MAIN FAB');
    assert.deepEqual(blue.entries, [], 'BLUE has no entries');
    assert.deepEqual(cutOf(blue), { S: 0, M: 0 });

    const matrix = await svc.getColorMatrix(wo);
    assert.deepEqual(matrix.colors.map((c) => [c.color, c.bySize.S.cutQty, c.total.cutQty]), [['RED', 7, 7], ['BLUE', 0, 0]], 'Cut row per color');
  });

  test('an entry of one color can never be changed or deleted through another color or Fabric', async () => {
    const wo = await workOrder();
    let red: any = await svc.addCuttingEntry(wo, 'RED', MAIN, 'MAIN FAB');
    const entryId = red.entries[0].id;
    red = await svc.setCuttingEntrySize(wo, 'RED', MAIN, 'MAIN FAB', entryId, 'S', 4);
    await rejects(svc.setCuttingEntrySize(wo, 'BLUE', MAIN, 'MAIN FAB', entryId, 'S', 99), 404, /Production Color and Fabric/);
    await rejects(svc.setCuttingEntrySize(wo, 'RED', RIB, 'RIB', entryId, 'S', 99), 404, /Production Color and Fabric/);
    await rejects(svc.updateCuttingEntry(wo, 'BLUE', MAIN, 'MAIN FAB', entryId, { partyNo: 'X' }), 404, /Production Color/);
    await rejects(svc.deleteCuttingEntry(wo, 'BLUE', MAIN, 'MAIN FAB', entryId), 404, /Production Color/);
    const other = await workOrder();
    await rejects(svc.setCuttingEntrySize(other, 'RED', MAIN, 'MAIN FAB', entryId, 'S', 99), 404, /not found/);
    assert.deepEqual(cutOf(await svc.getCuttingCard(wo, 'RED', MAIN, 'MAIN FAB')), { S: 4, M: 0 }, 'unchanged');
    // the color's own context still works, case/whitespace-insensitively like the rest of the service
    assert.deepEqual(cutOf(await svc.setCuttingEntrySize(wo, ' red ', MAIN, 'MAIN FAB', entryId, 'S', 5)), { S: 5, M: 0 });
    assert.equal(await prisma.cuttingCard.count({ where: { workOrderId: wo, materialKey: MAIN } }), 1, 'no second card for another letter case');
  });
});

describe('Complete-Order Cutting', () => {
  test('lists each Fabric with the colors it applies to', async () => {
    const wo = await workOrder();
    const fabrics = await svc.listOrderFabrics(wo);
    assert.deepEqual(fabrics.map((f) => [f.materialKey, f.colors]), [[MAIN, ['RED', 'BLUE']], [RIB, ['RED']]]);
  });

  test('one size-wise summary for the whole order: every figure is the sum of the colors\' own figures', async () => {
    const wo = await workOrder();
    const before = await prisma.cuttingCard.count({ where: { workOrderId: wo } });
    let view: any = await svc.getOrderCutting(wo, MAIN);
    assert.equal(await prisma.cuttingCard.count({ where: { workOrderId: wo } }), before, 'reading creates nothing');
    assert.deepEqual(view.sizes, ['S', 'M'], 'the Work Order\'s own sizes');

    // RED S over-cut (15 of 11), BLUE S short (2 of 6): Less and Over are summed per color, never netted
    const red: any = await svc.addCuttingEntry(wo, 'RED', MAIN, 'MAIN FAB');
    await svc.setCuttingEntrySize(wo, 'RED', MAIN, 'MAIN FAB', red.entries[0].id, 'S', 15);
    const blue: any = await svc.addCuttingEntry(wo, 'BLUE', MAIN, 'MAIN FAB');
    await svc.setCuttingEntrySize(wo, 'BLUE', MAIN, 'MAIN FAB', blue.entries[0].id, 'S', 2);
    view = await svc.getOrderCutting(wo, MAIN);
    const row = (k: string) => ['S', 'M'].map((s) => view.totals.bySize[s][k]);
    assert.deepEqual(row('orderQty'), [15, 20]);
    assert.deepEqual(row('willBeCutQty'), [17, 22], 'Will Be Cut rounded up per color and size, then added');
    assert.deepEqual(row('cutQty'), [17, 0]);
    assert.deepEqual(row('less'), [4, 22], 'BLUE\'s shortfall is not hidden by RED\'s over-cut');
    assert.deepEqual(row('over'), [4, 0]);
    assert.deepEqual(view.totals.grand, { orderQty: 35, willBeCutQty: 39, cutQty: 17, less: 26, over: 4 });
    for (const k of Object.keys(view.totals.grand)) {
      assert.equal(view.totals.grand[k], row(k).reduce((a: number, b: number) => a + b, 0), `grand ${k} = sum of the size rows`);
    }
    assert.deepEqual((await svc.getOrderCutting(wo, RIB) as any).colors.map((c: any) => c.color), ['RED'], 'RIB applies to RED only');
  });

  test('entries are added under the chosen color; Colour-wise reopens the same entries; edit/delete stay with their color', async () => {
    const wo = await workOrder();
    // Complete Order's "Add Cutting Entry" for an explicitly chosen color = the per-color add
    let red: any = await svc.addCuttingEntry(wo, 'RED', MAIN, 'MAIN FAB', userId, companyId);
    const redEntry = red.entries[0].id;
    await svc.updateCuttingEntry(wo, 'RED', MAIN, 'MAIN FAB', redEntry, { date: '2026-10-20', partyNo: 'P-1' }, userId, companyId);
    await svc.setCuttingEntrySize(wo, 'RED', MAIN, 'MAIN FAB', redEntry, 'S', 3, userId, companyId);
    const blue: any = await svc.addCuttingEntry(wo, 'BLUE', MAIN, 'MAIN FAB', userId, companyId);
    const blueEntry = blue.entries[0].id;
    await svc.setCuttingEntrySize(wo, 'BLUE', MAIN, 'MAIN FAB', blueEntry, 'S', 4, userId, companyId);

    let view: any = await svc.getOrderCutting(wo, MAIN);
    assert.deepEqual(view.entries.map((e: any) => [e.id, e.color, e.sizes]), [[redEntry, 'RED', { S: 3 }], [blueEntry, 'BLUE', { S: 4 }]]);
    assert.equal(view.entries[0].partyNo, 'P-1');
    assert.equal(view.totals.bySize.S.cutQty, 7);
    assert.equal(await prisma.cuttingCard.count({ where: { workOrderId: wo, materialKey: MAIN } }), 2, 'one card per color, nothing merged');

    // reopened Colour-wise: each color shows only its own entry
    red = await svc.getCuttingCard(wo, 'RED', MAIN, 'MAIN FAB');
    assert.deepEqual([red.entries.map((e: any) => e.id), cutOf(red)], [[redEntry], { S: 3, M: 0 }]);
    assert.deepEqual(cutOf(await svc.getCuttingCard(wo, 'BLUE', MAIN, 'MAIN FAB')), { S: 4, M: 0 });
    assert.deepEqual((await svc.getCuttingCard(wo, 'RED', RIB, 'RIB') as any).entries, [], 'another Fabric is untouched');

    // editing BLUE through its own color changes only BLUE; deleting RED leaves BLUE
    await svc.setCuttingEntrySize(wo, 'BLUE', MAIN, 'MAIN FAB', blueEntry, 'S', 6);
    await rejects(svc.setCuttingEntrySize(wo, 'RED', MAIN, 'MAIN FAB', blueEntry, 'S', 99), 404, /Production Color and Fabric/);
    await svc.deleteCuttingEntry(wo, 'RED', MAIN, 'MAIN FAB', redEntry);
    view = await svc.getOrderCutting(wo, MAIN);
    assert.deepEqual(view.entries.map((e: any) => [e.color, e.sizes]), [['BLUE', { S: 6 }]]);
    assert.deepEqual(view.colors.map((c: any) => [c.color, c.totals.cutQty]), [['RED', 0], ['BLUE', 6]]);
  });

  test('a Fabric not on the Work Order\'s BOM is refused', async () => {
    const wo = await workOrder();
    await rejects(svc.getOrderCutting(wo, 'fabric:variant:nope'), 400, /not on the Work Order/);
    assert.equal(await prisma.cuttingCard.count({ where: { workOrderId: wo } }), 0);
  });
});

describe('Color Based Mfg. and empty states', () => {
  test('Color Based Mfg. Yes and No load the same data the same way, and the flag is never changed', async () => {
    const results: any[] = [];
    for (const colorBased of [0, 1]) {
      const wo = await workOrder({ colorBased });
      const e: any = await svc.addCuttingEntry(wo, 'RED', MAIN, 'MAIN FAB');
      await svc.setCuttingEntrySize(wo, 'RED', MAIN, 'MAIN FAB', e.entries[0].id, 'S', 1);
      const card: any = await svc.getCuttingCard(wo, 'RED', MAIN, 'MAIN FAB');
      results.push([(await svc.getColorMatrix(wo)).colors.map((c) => c.color), cutOf(card), (await svc.listOrderFabrics(wo)).map((f) => f.colors)]);
      const [row] = await prisma.$queryRaw<any[]>`SELECT "ProductionColorCumulativeType" AS v FROM "MA_WorkOrder" WHERE "RecId" = ${wo}`;
      assert.equal(Number(row.v), colorBased, 'not modified');
    }
    assert.deepEqual(results[0], results[1]);
  });

  test('no Manufacturing Quantities, no Fabric BOM, unknown Work Order', async () => {
    const noQty = await workOrder({ quantities: [] });
    assert.deepEqual((await svc.getColorMatrix(noQty)).colors, []);
    assert.deepEqual(await svc.listOrderFabrics(noQty), []);
    await rejects(svc.getOrderCutting(noQty, MAIN), 400, /not on the Work Order/);

    const noBom = await workOrder({ bom: false });
    assert.deepEqual(await svc.listOrderFabrics(noBom), []);
    assert.deepEqual(await svc.listApplicableFabrics(noBom, 'RED'), []);

    await assert.rejects(svc.getOrderCutting(2_000_000_000, MAIN), (e: any) => e?.getStatus?.() === 404);
  });
});
