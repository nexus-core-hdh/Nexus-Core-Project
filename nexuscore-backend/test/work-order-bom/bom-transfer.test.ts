// Work Order BOM — "Transfer from Style Card" must not persist until the Work Order is saved.
// Runs against the throwaway test database (`npm run test:bom-transfer`, shared with the Packing
// List suite's harness). Every test seeds its own Style Card + Work Order; nothing is deleted.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { WorkOrderService, BOM_LINE_TYPES } from '../../src/modules/legacy-erp/work-order.service';
import { WorkOrderController } from '../../src/modules/legacy-erp/work-order.controller';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';

let prisma: PrismaService;
let svc: WorkOrderService;
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}-${RUN}-${++seq}`;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  svc = new WorkOrderService(prisma, new AuditService(prisma), null as any);
});
after(async () => { await prisma.$disconnect(); });

const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const item = (code: string) => one(Prisma.sql`INSERT INTO "IM_Item" ("InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${code}, ${`${code} name`}, 'FABRIC', 0) RETURNING "RecId" as id`);

/** A Work Order with Production Colors (Manufacturing Quantities) and a Style Card whose BOM has
 *  one line per type — every field the transfer maps is set to a distinctive value. */
async function world() {
  const fabricId = await item(uniq('FAB'));
  const trimId = await item(uniq('TRM'));
  const style = await prisma.styleCard.create({ data: { styleNumber: uniq('SC'), title: 'Transfer test', branchId: 'b1', createdBy: 'u1' } });
  const base = { styleCardId: style.id, unitId: null, colorCardId: null };
  await prisma.styleBomLine.createMany({
    data: [
      { ...base, lineType: 'fabric', sortOrder: 1, fabricInventoryId: fabricId, explanation: 'Body fabric', variant: 'MAIN FAB', willBeCut: true, mainFabric: true,
        quantity: 1.25, unitPrice: 4.5, wastePct: 3, dyeWastagePct: 2, printWastagePct: 1, otherWastagePct: 0.5,
        component: 'BODY', dia: '30', gauge: '24', finishWidth: '72', finishRoute: 'RT-1', revision: 'R2', placement: 'FRONT', process: 'DYE',
        notForRequirement: true, useFixQuantity: true },
      { ...base, lineType: 'trim', sortOrder: 1, fabricInventoryId: trimId, explanation: 'Label', variant: 'LABEL', quantity: 2, unitPrice: 0.1, wastePct: 5, useFixQuantity: true },
      { ...base, lineType: 'ornament', sortOrder: 1, explanation: 'Print', variant: 'PRINT', quantity: 1 },
      { ...base, lineType: 'process', sortOrder: 1, explanation: 'Wash', variant: 'WASH', quantity: 1 },
    ] as any,
  });
  const woId = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "IsDeleted") VALUES (${uniq('W/O')}, 0) RETURNING "RecId" as id`);
  const itemId = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${woId}, 1, 0) RETURNING "RecId" as id`);
  for (const [i, color] of ['ECRU', 'NAVY'].entries()) {
    await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "Quantity", "SubNo", "IsDeleted") VALUES (${itemId}, ${`${color}‖S`}, 10, ${i + 1}, 0)`;
  }
  return { woId, styleCardId: style.id, fabricId, trimId };
}

/** The saved BOM exactly as the database holds it (every live MA_RecipeItem row of the Work Order). */
const savedBom = async (woId: number) => {
  const byType: Record<string, any[]> = {};
  for (const lt of BOM_LINE_TYPES) byType[lt] = await svc.listBom(woId, lt);
  return byType;
};
const recipeRowCounts = async () => (await prisma.$queryRaw<any[]>`
  SELECT (SELECT count(*)::int FROM "MA_Recipe") AS recipes, (SELECT count(*)::int FROM "MA_RecipeItem") AS items`)[0];

describe('Transfer from Style Card is read only', () => {
  test('returns the Style BOM mapped to Work Order lines — every transferred field kept', async () => {
    const w = await world();
    const r = await svc.previewBomTransferFromStyleCard(w.woId, w.styleCardId);
    assert.deepEqual(r.lineTypes, [...BOM_LINE_TYPES]);
    const [fabric] = r.lines.fabric;
    assert.equal(fabric.inventoryId, w.fabricId);
    assert.equal(fabric.explanation, 'Body fabric');
    assert.equal(fabric.variant1, 'MAIN FAB');
    assert.equal(fabric.isCutting, 1);
    assert.equal(fabric.isMaster, 1);
    assert.equal(Number(fabric.quantity), 1.25);
    assert.equal(Number(fabric.price), 4.5);
    assert.equal(fabric.wastage, 6.5, 'Waste + Dye + Print + Other, as the transfer has always combined them');
    assert.equal(fabric.notForRequirement, 1);
    assert.equal(fabric.isFixQuantity, 1);
    assert.deepEqual(
      [fabric.uD_Component, fabric.uD_Dia, fabric.uD_Guage, fabric.uD_FinishWidth, fabric.uD_FinishRoute, fabric.uD_Revision, fabric.uD_Placement, fabric.uD_Remarks],
      ['BODY', '30', '24', '72', 'RT-1', 'R2', 'FRONT', 'DYE'],
    );
    assert.equal(r.lines.trim[0].inventoryId, w.trimId);
    assert.equal(r.lines.trim[0].isFixQuantity, 1);
    assert.equal(r.lines.ornament.length, 1);
    assert.equal(r.lines.process.length, 1);
  });

  test('one line type can be requested on its own', async () => {
    const w = await world();
    const r = await svc.previewBomTransferFromStyleCard(w.woId, w.styleCardId, 'trim');
    assert.deepEqual(r.lineTypes, ['trim']);
    assert.deepEqual(Object.keys(r.lines), ['trim']);
    assert.equal(r.lines.trim[0].variant1, 'LABEL');
  });

  test('bad input is rejected', async () => {
    const w = await world();
    await assert.rejects(svc.previewBomTransferFromStyleCard(w.woId, ''), (e: any) => e.getStatus?.() === 400);
    await assert.rejects(svc.previewBomTransferFromStyleCard(w.woId, w.styleCardId, 'bogus' as any), (e: any) => e.getStatus?.() === 400);
    await assert.rejects(svc.previewBomTransferFromStyleCard(99999999, w.styleCardId), (e: any) => e.getStatus?.() === 404);
  });

  test('transfer → no Save → reload: the saved BOM and every recipe table row are exactly unchanged', async () => {
    const w = await world();
    // An already-saved BOM the transfer must not touch.
    await svc.upsertBom(w.woId, 'fabric', [{ inventoryId: w.fabricId, explanation: 'Original saved line', variant1: 'ORIG', quantity: 9 }], USER);
    const before = await savedBom(w.woId);
    const countsBefore = await recipeRowCounts();
    for (const lt of [undefined, ...BOM_LINE_TYPES] as const) await svc.previewBomTransferFromStyleCard(w.woId, w.styleCardId, lt);
    assert.deepEqual(await savedBom(w.woId), before);
    assert.deepEqual(await recipeRowCounts(), countsBefore);
    assert.equal(before.fabric[0].explanation, 'Original saved line');
  });
});

describe('the Work Order Save persists the transferred BOM', () => {
  test('transfer → Save (upsertBom per type, as BomTab.save does) → reload: transferred BOM is saved', async () => {
    const w = await world();
    const { lines } = await svc.previewBomTransferFromStyleCard(w.woId, w.styleCardId);
    for (const lt of BOM_LINE_TYPES) await svc.upsertBom(w.woId, lt, lines[lt], USER);
    const saved = await savedBom(w.woId);
    assert.equal(saved.fabric.length, 1);
    assert.equal(saved.fabric[0].explanation, 'Body fabric');
    assert.equal(Number(saved.fabric[0].wastage), 6.5);
    assert.equal(Number(saved.fabric[0].notForRequirement), 1);
    assert.equal(Number(saved.fabric[0].isFixQuantity), 1);
    assert.equal(saved.trim[0].variant1, 'LABEL');
    assert.equal(saved.ornament.length, 1);
    assert.equal(saved.process.length, 1);
  });

  test('transfer → edit one line → Save → reload: both the transfer and the edit are saved', async () => {
    const w = await world();
    const { lines } = await svc.previewBomTransferFromStyleCard(w.woId, w.styleCardId);
    lines.fabric[0] = { ...lines.fabric[0], quantity: 3.75, explanation: 'Edited after transfer' };
    for (const lt of BOM_LINE_TYPES) await svc.upsertBom(w.woId, lt, lines[lt], USER);
    const saved = await savedBom(w.woId);
    assert.equal(Number(saved.fabric[0].quantity), 3.75);
    assert.equal(saved.fabric[0].explanation, 'Edited after transfer');
    assert.equal(saved.trim[0].variant1, 'LABEL');
  });
});

// The five Work Order screen options (frontend STYLE_CARD_TRANSFER_OPTIONS): All Detail = every type,
// otherwise only that type.
const OPTIONS: [label: string, lineType: (typeof BOM_LINE_TYPES)[number] | undefined][] = [
  ['Transfer Recipe All Detail', undefined],
  ['Transfer Fabric Recipe Detail', 'fabric'],
  ['Transfer Trim Recipe Detail', 'trim'],
  ['Transfer Ornament Details', 'ornament'],
  ['Transfer Process Details', 'process'],
];

/** A Work Order whose saved BOM already has one line of every type ("saved <type>"). */
async function worldWithSavedBom() {
  const w = await world();
  for (const lt of BOM_LINE_TYPES) {
    await svc.upsertBom(w.woId, lt, [{ inventoryId: lt === 'fabric' ? w.fabricId : lt === 'trim' ? w.trimId : undefined, explanation: `saved ${lt}`, quantity: 9 }], USER);
  }
  return w;
}
const explanations = async (woId: number) =>
  Object.fromEntries(await Promise.all(BOM_LINE_TYPES.map(async (lt) => [lt, (await svc.listBom(woId, lt)).map((l: any) => l.explanation)])));
const STYLE = { fabric: ['Body fabric'], trim: ['Label'], ornament: ['Print'], process: ['Wash'] } as const;

describe('each of the five transfer options', () => {
  for (const [label, lineType] of OPTIONS) {
    test(`${label}: no Save → reload leaves the saved BOM unchanged`, async () => {
      const w = await worldWithSavedBom();
      const before = await savedBom(w.woId);
      const r = await svc.previewBomTransferFromStyleCard(w.woId, w.styleCardId, lineType);
      assert.deepEqual(r.lineTypes, lineType ? [lineType] : [...BOM_LINE_TYPES]);
      assert.deepEqual(await savedBom(w.woId), before);
    });

    test(`${label}: Save → reload persists exactly ${lineType ? `the ${lineType} lines` : 'every type'}`, async () => {
      const w = await worldWithSavedBom();
      const { lines } = await svc.previewBomTransferFromStyleCard(w.woId, w.styleCardId, lineType);
      // BomTab.save(): the transferred types carry the transferred rows; the others are unchanged.
      for (const lt of Object.keys(lines) as (typeof BOM_LINE_TYPES)[number][]) await svc.upsertBom(w.woId, lt, lines[lt], USER);
      const after = await explanations(w.woId);
      for (const lt of BOM_LINE_TYPES) {
        const transferred = !lineType || lineType === lt;
        assert.deepEqual(after[lt], transferred ? [...STYLE[lt]] : [`saved ${lt}`], lt);
      }
    });
  }
});

describe('API surface', () => {
  const route = (name: string, method: string) => {
    const handler = (WorkOrderController.prototype as any)[name];
    const get = <T>(key: string) => (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, WorkOrderController)) as T;
    return resolveRequiredPermissions(get, method);
  };
  test('the transfer is a GET (read) route; the old persisting POST transfer route is gone', () => {
    assert.equal(typeof (WorkOrderController.prototype as any).previewBomTransferFromStyleCard, 'function');
    assert.equal((WorkOrderController.prototype as any).transferBomFromStyleCard, undefined);
    assert.equal((WorkOrderService.prototype as any).transferBomFromStyleCard, undefined);
    assert.equal(Reflect.getMetadata('method', (WorkOrderController.prototype as any).previewBomTransferFromStyleCard), 0, 'RequestMethod.GET');
    assert.equal(route('previewBomTransferFromStyleCard', 'GET').kind, 'authenticated');
  });
});
