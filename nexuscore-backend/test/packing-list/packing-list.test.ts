// Packing List — service, dynamic sizes, calculations, validation, approval, permissions and data
// safety. Runs against the throwaway test database only (`npm run test:packing-list`). Every test
// seeds its own Work Orders under unique numbers, so nothing is ever deleted between runs.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from './test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { WorkOrderService } from '../../src/modules/legacy-erp/work-order.service';
import { CuttingCardService } from '../../src/modules/legacy-erp/cutting-card.service';
import { PackingListService } from '../../src/modules/legacy-erp/packing-list.service';
import { PackingListController } from '../../src/modules/legacy-erp/packing-list.controller';
import * as calc from '../../src/modules/legacy-erp/packing-list.calc';
import * as uiCalc from '../../../frontend/lib/legacy-erp/packing-list-calc';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';

let prisma: PrismaService;
let svc: PackingListService;
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}-${RUN}-${++seq}`;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  const workOrders = new WorkOrderService(prisma, audit, null as any);
  const cutting = new CuttingCardService(prisma, workOrders, null as any, null as any, audit);
  svc = new PackingListService(prisma, cutting, workOrders);
});
after(async () => { await prisma.$disconnect(); });

// ── Seed helpers (legacy tables, test database only) ──────────────────────────────────────────
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const account = (name: string) => one(Prisma.sql`INSERT INTO "FI_Account" ("CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${uniq('CA')}, ${name}, 0) RETURNING "RecId" as id`);
const receipt = () => one(Prisma.sql`INSERT INTO "IM_Receipt" ("ReceiptNo", "ReceiptType", "IsDeleted") VALUES (${uniq('R')}, 120, 0) RETURNING "RecId" as id`);

/** A Work Order whose Manufacturing Quantities are `variants` ([color, size, qty]) in exactly this
 *  SubNo order — the order CuttingCardService.resolveSizes() reads sizes in. */
async function workOrder(variants: [string, string, number][], extraCuttingPercent = 0) {
  const customer = await account('Customer');
  const factory = await account('Factory');
  const no = uniq('W/O');
  const id = await one(Prisma.sql`
    INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "CurrentAccountId", "FactoryId", "CustomerOrderNo", "Quantity2", "IsDeleted")
    VALUES (${no}, ${customer}, ${factory}, ${uniq('CO')}, ${extraCuttingPercent}, 0) RETURNING "RecId" as id`);
  const itemId = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${id}, 1, 0) RETURNING "RecId" as id`);
  let subNo = 0;
  for (const [color, size, qty] of variants) {
    await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "Quantity", "SubNo", "IsDeleted") VALUES (${itemId}, ${`${color}‖${size}`}, ${qty}, ${++subNo}, 0)`;
  }
  return { id, no, itemId, customer, factory };
}
const grid = (color: string, sizes: string[], qty: number[]) => sizes.map((s, i) => [color, s, qty[i]] as [string, string, number]);

const expectStatus = async (p: Promise<unknown>, status: number, message?: RegExp) => {
  await assert.rejects(p, (e: any) => {
    assert.equal(e?.getStatus?.(), status, `expected HTTP ${status}, got ${e?.getStatus?.()}: ${e?.message}`);
    if (message) assert.match(String(e.message), message);
    return true;
  });
};
const sizeRows = (lineId: number) => prisma.$queryRaw<any[]>`SELECT "variantKey", "quantity"::float AS q FROM "PackingListItemSize" WHERE "packingListItemId" = ${lineId} ORDER BY "variantKey"`;

// ── Calculations ─────────────────────────────────────────────────────────────────────────────
describe('calculations (packing-list.calc.ts)', () => {
  test('box range, in-box, total, net / package / gross weight — legacy screenshot row 13–23', () => {
    const sizes = ['A', 'B'];
    const t = calc.lineTotals({ startBox: 13, endBox: 23, styleWeight: 0.1425, packageWeight: 1.068, sizes: { A: 80, B: 0 } }, sizes);
    assert.equal(t.boxes, 11);
    assert.equal(t.inBoxQuantity, 80);
    assert.equal(t.totalQuantity, 880);
    assert.ok(Math.abs(t.netWeight - 125.4) < 1e-9);
    assert.ok(Math.abs(t.totalPackageWeight - 11.748) < 1e-9);
    assert.ok(Math.abs(t.grossWeight - 137.148) < 1e-9);
    assert.deepEqual(t.packedBySize, { A: 880, B: 0 });
  });
  test('grand totals = sums of lines (screenshot: 3,129 pcs × 0.1425 = 445.8825; 44 boxes × 1.068 = 46.992)', () => {
    const lines = [{ startBox: 1, endBox: 43, styleWeight: 0.1425, packageWeight: 1.068, sizes: { X: 72 } }, { startBox: 44, endBox: 44, styleWeight: 0.1425, packageWeight: 1.068, sizes: { X: 33 } }];
    const t = calc.packingTotals(lines, ['X']);
    assert.equal(t.totalQuantity, 43 * 72 + 33);
    assert.equal(t.boxes, 44);
    assert.ok(Math.abs(t.totalPackageWeight - 46.992) < 1e-9);
    assert.ok(Math.abs(calc.netWeight(3129, 0.1425) - 445.8825) < 1e-9);
  });
  test('invalid ranges count zero boxes', () => {
    assert.equal(calc.boxCount(5, 4), 0);
    assert.equal(calc.boxCount(0, 3), 0);
    assert.equal(calc.boxCount('x', 3), 0);
  });
  test('summary rows and percentage', () => {
    const s = calc.sizeSummary(['03M'], { order: { '03M': 117 }, willBeCut: { '03M': 123 }, cut: { '03M': 123 }, packed: { '03M': 130 }, shipped: { '03M': 130 } });
    assert.equal(s.rows.orderMinusShipment['03M'], -13);
    assert.equal(s.rows.willBeCutMinusShipped['03M'], -7);
    assert.equal(s.rows.cutMinusShipped['03M'], -7);
    assert.equal(s.rows.orderMinusShipmentPercent['03M'], -11.11);
    assert.equal(calc.orderShipmentPercent(0, 5), 0);
  });
  test('variant keys round-trip', () => {
    assert.equal(calc.variantKey(' MIXED ECRU ', '03M'), 'MIXED ECRU‖03M');
    assert.deepEqual(calc.parseVariantKey('MIXED ECRU‖03M'), { color: 'MIXED ECRU', size: '03M' });
    assert.equal(calc.parseVariantKey('no separator'), null);
  });
  test('the UI formulas (frontend/lib/legacy-erp/packing-list-calc.ts) give identical results', () => {
    const sizes = ['S', 'M', 'L'];
    const lines = [
      { startBox: 1, endBox: 10, styleWeight: 0.21, packageWeight: 0.9, sizes: { S: 5, M: 7, L: 0 } },
      { startBox: 11, endBox: 11, styleWeight: '0.3', packageWeight: '1.1', sizes: { S: 0, M: 3, L: 4 } },
      { startBox: 4, endBox: 2, styleWeight: 1, packageWeight: 1, sizes: { S: 9, M: 9, L: 9 } },
    ];
    for (const l of lines) assert.deepEqual(uiCalc.lineTotals(l, sizes), calc.lineTotals(l, sizes));
    assert.deepEqual(uiCalc.packingTotals(lines, sizes), calc.packingTotals(lines, sizes));
    assert.equal(uiCalc.variantKey('Red', 'S'), calc.variantKey('Red', 'S'));
  });
});

// ── Work Order → dynamic sizes ───────────────────────────────────────────────────────────────
describe('dynamic sizes come from the selected Work Order', () => {
  test('Order A (03M 06M 09M 12M), Order B (S M L XL), Order C (02Y–05Y) each get exactly their own sizes', async () => {
    const a = await workOrder(grid('ECRU', ['03M', '06M', '09M', '12M'], [10, 20, 30, 40]));
    const b = await workOrder(grid('NAVY', ['S', 'M', 'L', 'XL'], [1, 2, 3, 4]));
    const c = await workOrder(grid('RED', ['02Y', '03Y', '04Y', '05Y'], [5, 5, 5, 5]));
    assert.deepEqual((await svc.workOrderContext(a.id)).sizes, ['03M', '06M', '09M', '12M']);
    assert.deepEqual((await svc.workOrderContext(b.id)).sizes, ['S', 'M', 'L', 'XL']);
    assert.deepEqual((await svc.workOrderContext(c.id)).sizes, ['02Y', '03Y', '04Y', '05Y']);
  });
  test('the Order sequence is preserved, never sorted', async () => {
    const w = await workOrder(grid('RED', ['XL', 'XS', 'M', '04Y'], [1, 1, 1, 1]));
    assert.deepEqual((await svc.workOrderContext(w.id)).sizes, ['XL', 'XS', 'M', '04Y']);
  });
  test('a different number of sizes per Work Order', async () => {
    const two = await workOrder(grid('RED', ['ONE', 'TWO'], [1, 1]));
    const six = await workOrder(grid('RED', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], [1, 1, 1, 1, 1, 1]));
    assert.equal((await svc.workOrderContext(two.id)).sizes.length, 2);
    assert.equal((await svc.workOrderContext(six.id)).sizes.length, 6);
  });
  test('context carries colors, the Order Line and header defaults', async () => {
    const w = await workOrder([['ECRU', 'S', 1], ['NAVY', 'S', 2], ['ECRU', 'M', 3]]);
    const ctx = await svc.workOrderContext(w.id);
    assert.deepEqual(ctx.sizes, ['S', 'M']);
    assert.deepEqual(ctx.colors, ['ECRU', 'NAVY']);
    assert.equal(ctx.orderLine?.id, w.itemId);
    assert.equal(ctx.workOrder.currentAccountId, w.customer);
    assert.equal(ctx.workOrder.factoryId, w.factory);
  });
  test('missing / unknown Work Order is rejected', async () => {
    await expectStatus(svc.workOrderContext(99999999), 400, /does not exist/);
  });
});

// ── Header CRUD ──────────────────────────────────────────────────────────────────────────────
describe('Packing List header', () => {
  test('create requires a real Work Order', async () => {
    await expectStatus(svc.create({}, USER), 400, /Work Order is required/);
    await expectStatus(svc.create({ workOrderId: 99999999 }, USER), 400, /does not exist/);
  });
  test('create numbers the list and defaults Customer / Factory / Customer Order No from the Work Order', async () => {
    const w = await workOrder(grid('ECRU', ['S'], [1]));
    const pl: any = await svc.create({ workOrderId: w.id, packagingDate: '2026-02-02', dimension: '60X40X30 CM', styleWeight: 0.1425, packagingWeight: 1.068 }, USER);
    assert.match(pl.packagingNo, /^PL-\d{5}$/);
    assert.equal(pl.workOrderId, w.id);
    assert.equal(pl.workOrderNo, w.no);
    assert.equal(pl.currentAccountId, w.customer);
    assert.equal(pl.factoryId, w.factory);
    assert.equal(pl.dimension, '60X40X30 CM');
    assert.equal(pl.isApproved, false);
    const loaded: any = await svc.get(pl.id);
    assert.equal(loaded.packagingNo, pl.packagingNo);
    assert.equal(Number(loaded.styleWeight), 0.1425);
  });
  test('update and load; unknown Factory / Shipment receipt rejected', async () => {
    const w = await workOrder(grid('ECRU', ['S'], [1]));
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const rc = await receipt();
    const updated: any = await svc.update(pl.id, { documentNo: 'DOC-1', inventoryReceiptId: rc, explanation: 'first shipment' }, USER);
    assert.equal(updated.documentNo, 'DOC-1');
    assert.equal(updated.inventoryReceiptId, rc);
    assert.ok(updated.shipmentReceiptNo);
    await expectStatus(svc.update(pl.id, { factoryId: 99999999 }, USER), 400, /Factory/);
    await expectStatus(svc.update(pl.id, { inventoryReceiptId: 99999999 }, USER), 400, /Shipment receipt/);
  });
  test('list finds it by number, Work Order and customer', async () => {
    const w = await workOrder(grid('ECRU', ['S'], [1]));
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const byNo: any = await svc.list(pl.packagingNo);
    assert.ok((Array.isArray(byNo) ? byNo : byNo.data ?? byNo.rows ?? byNo.items).some((r: any) => r.id === pl.id));
    const byWo: any = await svc.list(w.no);
    assert.ok((Array.isArray(byWo) ? byWo : byWo.data ?? byWo.rows ?? byWo.items).some((r: any) => r.id === pl.id));
  });
});

// ── Lines + size quantities ──────────────────────────────────────────────────────────────────
describe('lines and dynamic size quantities', () => {
  test('quantities are stored per Work Order variant key and bound back by size identity, not position', async () => {
    const w = await workOrder(grid('MIXED ECRU', ['03M', '06M', '09M', '12M'], [117, 418, 0, 321]));
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    // Sizes deliberately sent in a different order than the Work Order's.
    const saved = await svc.saveLines(pl.id, [
      { startBox: 1, endBox: 1, color: 'MIXED ECRU', styleWeight: 0.1425, packageWeight: 1.068, quantities: { '12M': 4, '03M': 90, '09M': 0, '06M': 0 } },
      { startBox: 2, endBox: 3, color: 'mixed ecru', quantities: { '06M': 40 } },
    ], USER);
    assert.deepEqual(saved.sizes, ['03M', '06M', '09M', '12M']);
    assert.deepEqual(saved.lines[0].quantities, { '03M': 90, '06M': 0, '09M': 0, '12M': 4 });
    assert.deepEqual(saved.lines[1].quantities, { '03M': 0, '06M': 40, '09M': 0, '12M': 0 });
    assert.equal(saved.lines[1].color, 'MIXED ECRU', 'color canonicalized to the Work Order spelling');
    assert.equal(saved.lines[0].workOrderItemId, w.itemId);
    const rows = await sizeRows(saved.lines[0].id);
    assert.deepEqual(rows.map((r) => r.variantKey), ['MIXED ECRU‖03M', 'MIXED ECRU‖06M', 'MIXED ECRU‖09M', 'MIXED ECRU‖12M']);
    const reloaded = await svc.getLines(pl.id);
    assert.deepEqual(reloaded.lines.map((l) => l.quantities), saved.lines.map((l) => l.quantities));
  });
  test('editing a line updates in place; a size dropped from the payload is set to 0, never deleted', async () => {
    const w = await workOrder(grid('RED', ['S', 'M'], [10, 10]));
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const first = await svc.saveLines(pl.id, [{ startBox: 1, endBox: 2, color: 'RED', quantities: { S: 3, M: 4 } }], USER);
    const lineId = first.lines[0].id;
    const second = await svc.saveLines(pl.id, [{ id: lineId, startBox: 1, endBox: 5, color: 'RED', quantities: { S: 6 } }], USER);
    assert.equal(second.lines[0].id, lineId);
    assert.equal(second.lines[0].endBox, 5);
    assert.deepEqual(second.lines[0].quantities, { S: 6, M: 0 });
    assert.equal((await sizeRows(lineId)).length, 2, 'both size rows still exist');
  });
  test('removing a line soft-deletes it', async () => {
    const w = await workOrder(grid('RED', ['S'], [10]));
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const s = await svc.saveLines(pl.id, [{ startBox: 1, endBox: 1, color: 'RED', quantities: { S: 1 } }, { startBox: 2, endBox: 2, color: 'RED', quantities: { S: 2 } }], USER);
    const after = await svc.saveLines(pl.id, [{ id: s.lines[0].id, startBox: 1, endBox: 1, color: 'RED', quantities: { S: 1 } }], USER);
    assert.equal(after.lines.length, 1);
    const [{ deleted }] = await prisma.$queryRaw<any[]>`SELECT "IsDeleted"::int AS deleted FROM "IM_PackagingListItem" WHERE "RecId" = ${s.lines[1].id}`;
    assert.equal(deleted, 1);
  });
  test('each line keeps its own color and quantities', async () => {
    const w = await workOrder([['ECRU', 'S', 5], ['ECRU', 'M', 5], ['NAVY', 'S', 5], ['NAVY', 'M', 5]]);
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const s = await svc.saveLines(pl.id, [
      { startBox: 1, endBox: 1, color: 'ECRU', quantities: { S: 1, M: 2 } },
      { startBox: 2, endBox: 2, color: 'NAVY', quantities: { S: 3, M: 4 } },
    ], USER);
    assert.deepEqual(s.lines.map((l) => [l.color, l.quantities]), [['ECRU', { S: 1, M: 2 }], ['NAVY', { S: 3, M: 4 }]]);
  });
  test('invalid input is rejected and nothing is written', async () => {
    const w = await workOrder(grid('RED', ['S', 'M'], [1, 1]));
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const bad = async (line: any, re: RegExp) => expectStatus(svc.saveLines(pl.id, [line], USER), 400, re);
    await bad({ startBox: 1, endBox: 1, color: 'RED', quantities: { S: -1 } }, /non-negative/);
    await bad({ startBox: 1, endBox: 1, color: 'RED', quantities: { S: 'abc' } }, /non-negative/);
    await bad({ startBox: 1, endBox: 1, color: 'RED', quantities: { XXL: 1 } }, /not one of this Work Order's sizes/);
    await bad({ startBox: 1, endBox: 1, color: 'GREEN', quantities: { S: 1 } }, /not on this Work Order/);
    await bad({ startBox: 3, endBox: 2, color: 'RED', quantities: { S: 1 } }, /To \(Box\)/);
    await bad({ startBox: 0, endBox: 2, color: 'RED', quantities: { S: 1 } }, /From \(Box\)/);
    await bad({ startBox: 1, endBox: 1, color: '', quantities: { S: 1 } }, /Color is required/);
    await bad({ startBox: 1, endBox: 1, color: 'RED', styleWeight: -2, quantities: { S: 1 } }, /Style Weight/);
    await expectStatus(svc.saveLines(pl.id, [{ id: 99999999, startBox: 1, endBox: 1, color: 'RED', quantities: {} }] as any, USER), 400, /does not belong/);
    assert.equal((await svc.getLines(pl.id)).lines.length, 0);
  });
  test('a variant key cannot be stored twice for one line (unique index)', async () => {
    const w = await workOrder(grid('RED', ['S'], [1]));
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const s = await svc.saveLines(pl.id, [{ startBox: 1, endBox: 1, color: 'RED', quantities: { S: 1 } }], USER);
    // Postgres SQLSTATE in Prisma's raw-query error meta: 23505 unique_violation, 23514 check_violation.
    const pgCode = (code: string) => (e: any) => { assert.equal(e?.meta?.code, code, JSON.stringify(e?.meta)); return true; };
    await assert.rejects(prisma.$executeRaw`INSERT INTO "PackingListItemSize" ("packingListItemId", "variantKey", "quantity") VALUES (${s.lines[0].id}, ${'RED‖S'}, 2)`, pgCode('23505'));
    await svc.saveLines(pl.id, [{ id: s.lines[0].id, startBox: 1, endBox: 1, color: 'RED', quantities: { S: 9 } }], USER);
    const rows = await sizeRows(s.lines[0].id);
    assert.deepEqual(rows, [{ variantKey: 'RED‖S', q: 9 }]);
    await assert.rejects(prisma.$executeRaw`INSERT INTO "PackingListItemSize" ("packingListItemId", "variantKey", "quantity") VALUES (${s.lines[0].id}, ${'RED‖M'}, -1)`, pgCode('23514'));
  });
});

// ── Work Order change ────────────────────────────────────────────────────────────────────────
describe('changing the Work Order', () => {
  test('sizes follow the new Work Order; quantities of sizes it lacks are surfaced, not hidden or lost', async () => {
    const a = await workOrder(grid('RED', ['03M', '06M'], [1, 1]));
    const b = await workOrder(grid('RED', ['S', '06M', 'L'], [1, 1, 1]));
    const pl: any = await svc.create({ workOrderId: a.id }, USER);
    await svc.saveLines(pl.id, [{ startBox: 1, endBox: 1, color: 'RED', quantities: { '03M': 5, '06M': 7 } }], USER);
    await svc.update(pl.id, { workOrderId: b.id }, USER);
    const r = await svc.getLines(pl.id);
    assert.deepEqual(r.sizes, ['S', '06M', 'L'], 'no size column inherited from Work Order A');
    assert.deepEqual(r.lines[0].quantities, { S: 0, '06M': 7, L: 0 }, 'the compatible size keeps its quantity');
    assert.deepEqual(r.lines[0].otherQuantities, { 'RED‖03M': 5 }, 'the incompatible one is reported');
    const saved = await svc.saveLines(pl.id, [{ id: r.lines[0].id, startBox: 1, endBox: 1, color: 'RED', quantities: r.lines[0].quantities }], USER);
    assert.deepEqual(saved.lines[0].otherQuantities, {}, 'saving under the new Work Order zeroes the old size explicitly');
    assert.equal(saved.lines[0].workOrderItemId, b.itemId);
  });
});

// ── Summary ──────────────────────────────────────────────────────────────────────────────────
describe('summary', () => {
  test('Order / Will Be Cut / Cut / Packed / Shipment per size, on the same size array as the grid', async () => {
    const w = await workOrder([['ECRU', '03M', 117], ['ECRU', '06M', 418], ['NAVY', '03M', 3]], 5);
    await prisma.cuttingCard.create({
      data: {
        workOrderId: w.id, productionColor: 'ECRU', materialKey: 'fabric:card:1', materialLabel: 'MAIN FAB',
        entries: { create: [{ sizes: { create: [{ sizeCode: '03M', quantity: 100 }, { sizeCode: '06M', quantity: 400 }] } }] },
      },
    });
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    await svc.saveLines(pl.id, [
      { startBox: 1, endBox: 1, color: 'ECRU', styleWeight: 0.1425, packageWeight: 1.068, quantities: { '03M': 90 } },
      { startBox: 2, endBox: 3, color: 'ECRU', styleWeight: 0.1425, packageWeight: 1.068, quantities: { '06M': 40 } },
    ], USER);
    let s: any = await svc.summary(pl.id);
    const { sizes } = await svc.getLines(pl.id);
    assert.deepEqual(s.sizes, sizes);
    assert.deepEqual(s.sizes, ['03M', '06M']);
    assert.deepEqual(s.rows.order, { '03M': 120, '06M': 418 });
    // CuttingCardService's own rule: ceil(qty × 1.05) per color and size — 117→123 + 3→4, 418→439.
    assert.deepEqual(s.rows.willBeCut, { '03M': 127, '06M': 439 });
    assert.deepEqual(s.rows.cut, { '03M': 100, '06M': 400 });
    assert.deepEqual(s.rows.packed, { '03M': 90, '06M': 80 });
    assert.deepEqual(s.rows.shipment, { '03M': 0, '06M': 0 }, 'not shipped until an Inventory Receipt is referenced');
    assert.equal(s.totals.packed, 170);
    assert.ok(Math.abs(s.weights.netWeight - 170 * 0.1425) < 1e-9);
    assert.equal(s.weights.boxes, 3);

    await svc.update(pl.id, { inventoryReceiptId: await receipt() }, USER);
    s = await svc.summary(pl.id);
    assert.deepEqual(s.rows.shipment, { '03M': 90, '06M': 80 });
    assert.deepEqual(s.rows.orderMinusShipment, { '03M': 30, '06M': 338 });
    assert.equal(s.rows.orderMinusShipmentPercent['03M'], 25);
    assert.deepEqual(s.rows.cutMinusShipped, { '03M': 10, '06M': 320 });

    // A second shipped list for the same Work Order adds to Shipment, not to this list's Packed.
    const other: any = await svc.create({ workOrderId: w.id, inventoryReceiptId: await receipt() }, USER);
    await svc.saveLines(other.id, [{ startBox: 1, endBox: 1, color: 'NAVY', quantities: { '03M': 3 } }], USER);
    s = await svc.summary(pl.id);
    assert.equal(s.rows.shipment['03M'], 93);
    assert.equal(s.rows.packed['03M'], 90);
  });
});

// ── Approval ─────────────────────────────────────────────────────────────────────────────────
describe('approval', () => {
  test('approve needs lines; an approved list is locked until unapproved', async () => {
    const w = await workOrder(grid('RED', ['S'], [1]));
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    await expectStatus(svc.setApproved(pl.id, true, USER), 400, /at least one line/);
    await svc.saveLines(pl.id, [{ startBox: 1, endBox: 1, color: 'RED', quantities: { S: 1 } }], USER);
    const approved: any = await svc.setApproved(pl.id, true, USER);
    assert.equal(approved.isApproved, true);
    assert.equal(approved.approvedBy, USER);
    await expectStatus(svc.update(pl.id, { documentNo: 'X' }, USER), 409);
    await expectStatus(svc.saveLines(pl.id, [], USER), 409);
    await expectStatus(svc.remove(pl.id, USER), 409);
    const reopened: any = await svc.setApproved(pl.id, false, USER);
    assert.equal(reopened.isApproved, false);
    await svc.remove(pl.id, USER);
    await expectStatus(svc.get(pl.id), 404);
  });
});

// ── Permissions (server-side) ────────────────────────────────────────────────────────────────
describe('permissions', () => {
  const route = (name: keyof PackingListController, method: string) => {
    const handler = (PackingListController.prototype as any)[name];
    const get = <T>(key: string) => (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, PackingListController)) as T;
    return resolveRequiredPermissions(get, method);
  };
  test('writes require packing-lists create / update / delete; approval requires approval:approve', () => {
    assert.deepEqual(route('create', 'POST'), { kind: 'permissions', source: 'module', permissions: [{ module: 'packing-lists', action: 'create' }] });
    assert.deepEqual(route('update', 'PUT'), { kind: 'permissions', source: 'module', permissions: [{ module: 'packing-lists', action: 'update' }] });
    assert.deepEqual(route('saveLines', 'PUT'), { kind: 'permissions', source: 'module', permissions: [{ module: 'packing-lists', action: 'update' }] });
    assert.deepEqual(route('remove', 'DELETE'), { kind: 'permissions', source: 'module', permissions: [{ module: 'packing-lists', action: 'delete' }] });
    assert.deepEqual(route('approve', 'POST'), { kind: 'permissions', source: 'explicit', permissions: [{ module: 'approval', action: 'approve' }] });
    assert.deepEqual(route('unapprove', 'POST'), { kind: 'permissions', source: 'explicit', permissions: [{ module: 'approval', action: 'approve' }] });
    assert.equal(route('get', 'GET').kind, 'authenticated');
  });
});

// ── Data safety / no hardcoded sizes ─────────────────────────────────────────────────────────
describe('data safety', () => {
  test('the legacy packing variant table is never written; the legacy variant master is not used', async () => {
    const [{ n }] = await prisma.$queryRaw<any[]>`SELECT count(*)::int AS n FROM "IM_PackagingListItemVariant"`;
    assert.equal(n, 0);
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/modules/legacy-erp/packing-list.service.ts'), 'utf8');
    assert.ok(!/INSERT INTO "IM_PackagingListItemVariant"|INSERT INTO "IM_ItemVariant"/.test(src));
    assert.ok(!/\bDELETE FROM\b|\bDROP\b|\bTRUNCATE\b/i.test(src), 'no hard deletes / DDL in the service');
  });
  test('no size codes are hardcoded in Packing List code', () => {
    const files = [
      '../../src/modules/legacy-erp/packing-list.service.ts',
      '../../src/modules/legacy-erp/packing-list.calc.ts',
      '../../../frontend/lib/legacy-erp/packing-list-calc.ts',
      '../../../frontend/app/dashboard/(auth)/legacy-erp/packing-lists/page.tsx',
      '../../../frontend/app/dashboard/(auth)/legacy-erp/packing-lists-list/page.tsx',
    ];
    const sizeLiteral = /["'`](?:\d{2}[MY]|X{0,3}S|M|X{0,3}L|XXL|XXXL)["'`]/;
    for (const f of files) {
      const src = fs.readFileSync(path.resolve(__dirname, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      assert.ok(!sizeLiteral.test(src), `${f} contains a hardcoded size literal: ${src.match(sizeLiteral)?.[0]}`);
    }
  });
});
