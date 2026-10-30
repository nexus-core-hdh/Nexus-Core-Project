// Packing List — several box ranges in one Packing List: adding rows, saving, reopening, editing,
// removing, the totals / summary over all rows, and the one-line-per-box rule (overlapping From/To
// ranges are refused, adjacent ones are fine). Runs against the throwaway test database only
// (`npm run test:packing-list`); every test seeds its own Work Order under a unique number.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from './test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { WorkOrderService } from '../../src/modules/legacy-erp/work-order.service';
import { CuttingCardService } from '../../src/modules/legacy-erp/cutting-card.service';
import { PackingListService } from '../../src/modules/legacy-erp/packing-list.service';
import * as calc from '../../src/modules/legacy-erp/packing-list.calc';
import * as uiCalc from '../../../frontend/lib/legacy-erp/packing-list-calc';

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
  svc = new PackingListService(prisma, new CuttingCardService(prisma, workOrders, null as any, null as any, audit), workOrders);
});
after(async () => { await prisma.$disconnect(); });

const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
/** A Work Order with RED and NAVY in S / M / L (Order quantities per color and size). */
async function workOrder() {
  const id = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "IsDeleted") VALUES (${uniq('W/O')}, 0) RETURNING "RecId" as id`);
  const itemId = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${id}, 1, 0) RETURNING "RecId" as id`);
  let subNo = 0;
  for (const color of ['RED', 'NAVY']) {
    for (const [size, qty] of [['S', 100], ['M', 200], ['L', 50]] as const) {
      await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "Quantity", "SubNo", "IsDeleted") VALUES (${itemId}, ${`${color}‖${size}`}, ${qty}, ${++subNo}, 0)`;
    }
  }
  return { id, itemId };
}
const rejects400 = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => {
  assert.equal(e?.getStatus?.(), 400, String(e?.message));
  assert.match(String(e.message), re);
  return true;
});
const view = (lines: any[]) => lines.map((l) => [l.startBox, l.endBox, l.color, l.quantities]);

// Three box ranges: 1–5 RED (S 2, M 4 per box), 6 NAVY (L 10), 7–10 RED (M 6, L 1), with weights.
const THREE = [
  { startBox: 1, endBox: 5, color: 'RED', styleWeight: 0.2, packageWeight: 1, quantities: { S: 2, M: 4, L: 0 } },
  { startBox: 6, endBox: 6, color: 'NAVY', styleWeight: 0.25, packageWeight: 1.5, quantities: { S: 0, M: 0, L: 10 } },
  { startBox: 7, endBox: 10, color: 'RED', styleWeight: 0.2, packageWeight: 1, quantities: { S: 0, M: 6, L: 1 } },
];

describe('the one-line-per-box rule (packing-list.calc.ts, mirrored in the UI)', () => {
  test('overlapping ranges are found pairwise; adjacent and invalid ranges are not', () => {
    const r = (startBox: unknown, endBox: unknown) => ({ startBox, endBox });
    const cases: [ReturnType<typeof r>[], [number, number][]][] = [
      [[r(1, 5), r(6, 9)], []],
      [[r(1, 5), r(5, 6)], [[0, 1]]],
      [[r(1, 1), r(1, 1)], [[0, 1]]],
      [[r(3, 8), r(1, 10), r(11, 12)], [[0, 1]]],
      [[r(1, 10), r(2, 2), r(9, 12)], [[0, 1], [0, 2]]],
      [[r(1, 5), r(4, 2), r('', ''), r(0, 3)], []],
      [[r('2', '4'), r(4, 4)], [[0, 1]]],
    ];
    for (const [lines, expected] of cases) {
      assert.deepEqual(calc.overlappingBoxRanges(lines), expected, JSON.stringify(lines));
      assert.deepEqual(uiCalc.overlappingBoxRanges(lines), expected, `UI: ${JSON.stringify(lines)}`);
    }
  });
  test('the UI summary formulas match the server; the live summary of unchanged lines is the server summary', () => {
    const sizes = ['S', 'M'];
    const inp = { order: { S: 10, M: 0 }, willBeCut: { S: 11, M: 1 }, cut: { S: 9, M: 0 }, packed: { S: 4, M: 2 }, shipped: { S: 7, M: 3 } };
    const server = calc.sizeSummary(sizes, inp);
    assert.deepEqual(uiCalc.sizeSummary(sizes, inp), server);
    for (const shipped of [false, true]) {
      assert.deepEqual(uiCalc.liveSizeSummary(sizes, server, server.rows.packed, { wasShipped: shipped, isShipped: shipped }), server);
    }
    // This list (shipped) packs 2 more S: Packed and Shipment both move by 2.
    const live = uiCalc.liveSizeSummary(sizes, server, { S: 6, M: 2 }, { wasShipped: true, isShipped: true });
    assert.equal(live.rows.packed.S, 6);
    assert.equal(live.rows.shipment.S, 9);
    assert.equal(live.rows.orderMinusShipment.S, 1);
    // Not shipped: Shipment stays the other lists' figure.
    assert.equal(uiCalc.liveSizeSummary(sizes, server, { S: 6, M: 2 }, { wasShipped: false, isShipped: false }).rows.shipment.S, 7);
  });
});

describe('several box ranges in one Packing List', () => {
  test('adding three rows: saved, reopened in box order with their own color / quantities / weights, totalled', async () => {
    const w = await workOrder();
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    // Sent out of box order — reopened sorted by From (Box).
    const saved = await svc.saveLines(pl.id, [THREE[2], THREE[0], THREE[1]], USER);
    assert.equal(saved.lines.length, 3);

    const reopened = await svc.getLines(pl.id);
    assert.deepEqual(view(reopened.lines), view(THREE));
    assert.deepEqual(reopened.lines.map((l) => [Number(l.styleWeight), Number(l.packageWeight)]), [[0.2, 1], [0.25, 1.5], [0.2, 1]]);
    assert.ok(reopened.lines.every((l) => l.workOrderItemId === w.itemId), 'every row on the Order Line');

    const s: any = await svc.summary(pl.id);
    // Packed per size = quantity per box × boxes, summed over the rows: S 2×5; M 4×5 + 6×4; L 10×1 + 1×4.
    assert.deepEqual(s.rows.packed, { S: 10, M: 44, L: 14 });
    assert.equal(s.totals.packed, 68);
    assert.equal(s.weights.boxes, 10);
    assert.equal(s.weights.totalQuantity, 68);
    // Net = 30 pcs × 0.2 + 10 × 0.25 + 28 × 0.2; package = 5×1 + 1×1.5 + 4×1.
    assert.ok(Math.abs(s.weights.netWeight - (6 + 2.5 + 5.6)) < 1e-9);
    assert.ok(Math.abs(s.weights.totalPackageWeight - 10.5) < 1e-9);
    assert.ok(Math.abs(s.weights.grossWeight - (14.1 + 10.5)) < 1e-9);
    assert.deepEqual(s.rows.order, { S: 200, M: 400, L: 100 });
  });

  test('adding a row to a saved list keeps the existing rows (same ids); editing and removing rows re-totals', async () => {
    const w = await workOrder();
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const first = await svc.saveLines(pl.id, [THREE[0]], USER);
    const firstId = first.lines[0].id;

    // Reopen, add two more boxes after the last one (what Add Box does), save.
    const kept = first.lines.map((l) => ({ id: l.id, startBox: l.startBox, endBox: l.endBox, color: l.color, styleWeight: l.styleWeight, packageWeight: l.packageWeight, quantities: l.quantities }));
    const second = await svc.saveLines(pl.id, [...kept, THREE[1], THREE[2]], USER);
    assert.equal(second.lines.length, 3);
    assert.equal(second.lines[0].id, firstId, 'the existing row is updated in place, not re-created');
    assert.deepEqual(view((await svc.getLines(pl.id)).lines), view(THREE));
    assert.equal(((await svc.summary(pl.id)) as any).weights.boxes, 10);

    // Edit the NAVY box to 2 boxes (6–6 → 6–6 stays; change its L to 12) and remove the last range.
    const [a, b] = second.lines;
    const third = await svc.saveLines(pl.id, [
      { id: a.id, startBox: 1, endBox: 5, color: 'RED', quantities: a.quantities },
      { id: b.id, startBox: 6, endBox: 6, color: 'NAVY', quantities: { L: 12 } },
    ], USER);
    assert.deepEqual(third.lines.map((l) => l.id), [a.id, b.id]);
    const s: any = await svc.summary(pl.id);
    assert.deepEqual(s.rows.packed, { S: 10, M: 20, L: 12 });
    assert.equal(s.weights.boxes, 6);
    const [{ deleted }] = await prisma.$queryRaw<any[]>`SELECT "IsDeleted"::int AS deleted FROM "IM_PackagingListItem" WHERE "RecId" = ${second.lines[2].id}`;
    assert.equal(deleted, 1, 'the removed row is soft-deleted');
  });

  test('overlapping or duplicate box ranges are refused and nothing is written; adjacent ranges save', async () => {
    const w = await workOrder();
    const pl: any = await svc.create({ workOrderId: w.id }, USER);
    const saved = await svc.saveLines(pl.id, THREE, USER);
    const before = view((await svc.getLines(pl.id)).lines);
    const ids = saved.lines.map((l) => l.id);

    // A new row on boxes already packed (5–6 overlaps 1–5 and 6).
    await rejects400(svc.saveLines(pl.id, [...saved.lines.map((l, i) => ({ ...THREE[i], id: ids[i] })), { ...THREE[0], startBox: 5, endBox: 6 }], USER),
      /Line 4: boxes 5–6 overlap Line 1 \(boxes 1–5\)/);
    // The same box range twice.
    await rejects400(svc.saveLines(pl.id, [THREE[1], THREE[1]], USER), /Line 2: boxes 6–6 overlap Line 1 \(boxes 6–6\)/);
    // Editing an existing row onto another row's boxes.
    await rejects400(svc.saveLines(pl.id, [{ ...THREE[0], id: ids[0] }, { ...THREE[1], id: ids[1], startBox: 4, endBox: 6 }, { ...THREE[2], id: ids[2] }], USER), /overlap/);
    assert.deepEqual(view((await svc.getLines(pl.id)).lines), before, 'nothing written by a refused save');

    // Adjacent ranges (and a gap) are fine.
    const ok = await svc.saveLines(pl.id, [...saved.lines.map((l, i) => ({ ...THREE[i], id: ids[i] })), { ...THREE[1], startBox: 12, endBox: 13 }], USER);
    assert.equal(ok.lines.length, 4);
    assert.equal(((await svc.summary(pl.id)) as any).weights.boxes, 12);
  });
});
