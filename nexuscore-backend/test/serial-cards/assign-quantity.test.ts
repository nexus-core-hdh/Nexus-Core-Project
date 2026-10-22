// Serial Cards "Assign to Qty" (SerialCardService.assignQuantityEqually) and the full-row Update
// the Serial Cards screen's Copy Column relies on. Runs against the throwaway full-schema test
// database shared with the Packing List suite (`npm run test:serial-cards`). Every test seeds its
// own uniquely-coded rows; nothing is deleted.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../../src/modules/audit/audit.service';
import { SerialCardService } from '../../src/modules/legacy-erp/serial-card.service';
import { makeSerialCardService } from './make-service';

let prisma: PrismaService;
let svc: SerialCardService;
let userId: string;
let companyId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}-${RUN}-${++seq}`;
const one = async (sql: string, ...params: unknown[]) => Number((await prisma.$queryRawUnsafe<any[]>(sql, ...params))[0].id);

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  svc = makeSerialCardService(prisma);
  const company = await prisma.company.create({ data: { name: `Serial Card Test ${RUN}` } });
  const user = await prisma.user.create({ data: { companyId: company.id, name: 'serial-card-test', email: `sc-${RUN}@test.invalid`, password: 'x' } });
  userId = user.id;
  companyId = company.id;
});
after(async () => { await prisma.$disconnect(); });

// --- seed helpers ----------------------------------------------------------------------------
const item = () => one(`INSERT INTO "IM_Item" ("InventoryCode","InventoryName","AccessCode","IsDeleted") VALUES ($1,'serial item','FABRIC',0) RETURNING "RecId" AS id`, uniq('FAB'));
async function receiptLine(quantity: number) {
  const inventoryId = await item();
  const receiptId = await one(`INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo","ReceiptDate","CompanyId","WorkplaceId","IsDeleted") VALUES (2,$1,'2026-03-01'::date,1,1,0) RETURNING "RecId" AS id`, uniq('R'));
  const lineId = await one(`INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId","ReceiptType","InventoryId","Quantity","IsDeleted") VALUES ($1,2,$2,$3,0) RETURNING "RecId" AS id`, receiptId, inventoryId, quantity);
  return { inventoryId, receiptId, lineId };
}
/** A card the way produce() writes it: IM_SerialCard + its TransactionType=1 receipt link (unless `linkTo` is null). */
async function card(inventoryId: number, linkTo: number | null, quantity: number, extra: { partyNo?: string; width?: number; quantityMT?: number; deleted?: boolean } = {}) {
  const id = await one(
    `INSERT INTO "IM_SerialCard" ("CompanyId","SerialCode","InventoryId","InUse","PartyNo","Width","Quantity","QuantityMT","InsertedAt","InsertedBy","IsDeleted","UUID")
     VALUES (1,$1,$2,1,$3,$4,$5,$6,now(),1,$7,gen_random_uuid()) RETURNING "RecId" AS id`,
    uniq('SC').slice(0, 30), inventoryId, extra.partyNo ?? null, extra.width ?? null, quantity, extra.quantityMT ?? null, extra.deleted ? 1 : 0,
  );
  if (linkTo != null) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "IM_SerialTransaction" ("SerialCardId","TransactionType","ReceiptItemId","Quantity","InsertedAt","InsertedBy","IsDeleted","UUID") VALUES ($1,1,$2,0,now(),1,0,gen_random_uuid())`,
      id, linkTo,
    );
  }
  return id;
}
const row = async (id: number) => (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "IM_SerialCard" WHERE "RecId" = $1`, id))[0];
const qty = async (id: number) => Number((await row(id)).Quantity);
const rejects = (p: Promise<unknown>, status: number, re: RegExp) =>
  assert.rejects(p, (e: any) => { assert.equal(e?.getStatus?.(), status); assert.match(e.message, re); return true; });

describe('Assign to Qty — split the receipt line\'s unassigned quantity equally', () => {
  test('single card takes everything not already on the line\'s other cards', async () => {
    const l = await receiptLine(100);
    const other = await card(l.inventoryId, l.lineId, 40);
    const c = await card(l.inventoryId, l.lineId, 0);
    const out = await svc.assignQuantityEqually([c], userId, companyId);
    assert.equal(out.length, 1);
    assert.equal(await qty(c), 60);
    assert.equal(await qty(other), 40, 'unselected card untouched');
  });

  test('multiple cards: equal 4-decimal shares, remainder on the last, line total exact', async () => {
    const l = await receiptLine(100);
    const ids = [await card(l.inventoryId, l.lineId, 5), await card(l.inventoryId, l.lineId, 0), await card(l.inventoryId, l.lineId, 0)];
    await svc.assignQuantityEqually([ids[2], ids[0], ids[1]], userId, companyId); // order of ids doesn't matter
    assert.deepEqual(await Promise.all(ids.map(qty)), [33.3333, 33.3333, 33.3334]);
  });

  test('selected cards\' current quantities are re-shared (not added to)', async () => {
    const l = await receiptLine(90);
    const a = await card(l.inventoryId, l.lineId, 80);
    const b = await card(l.inventoryId, l.lineId, 10);
    await svc.assignQuantityEqually([a, b], userId, companyId);
    assert.deepEqual([await qty(a), await qty(b)], [45, 45]);
  });

  test('deleted cards on the line do not count against it', async () => {
    const l = await receiptLine(50);
    await card(l.inventoryId, l.lineId, 50, { deleted: true });
    const c = await card(l.inventoryId, l.lineId, 0);
    await svc.assignQuantityEqually([c], userId, companyId);
    assert.equal(await qty(c), 50);
  });

  test('cards of two receipt lines in one call: each line is split on its own', async () => {
    const l1 = await receiptLine(10);
    const l2 = await receiptLine(7);
    const a = await card(l1.inventoryId, l1.lineId, 0);
    const b = await card(l1.inventoryId, l1.lineId, 0);
    const c = await card(l2.inventoryId, l2.lineId, 0);
    await svc.assignQuantityEqually([a, b, c], userId, companyId);
    assert.deepEqual([await qty(a), await qty(b), await qty(c)], [5, 5, 7]);
  });

  test('only Quantity changes — every other field is kept, and an UPDATE audit is written', async () => {
    const l = await receiptLine(12);
    const c = await card(l.inventoryId, l.lineId, 1, { partyNo: 'P-77', width: 150, quantityMT: 3.5 });
    const before = await row(c);
    await svc.assignQuantityEqually([c], userId, companyId);
    const after = await row(c);
    assert.equal(Number(after.Quantity), 12);
    for (const k of Object.keys(before)) {
      if (['Quantity', 'UpdatedAt', 'UpdatedBy'].includes(k)) continue;
      assert.deepEqual(after[k], before[k], `${k} unchanged`);
    }
    const audits = await prisma.auditLog.findMany({ where: { entityType: 'SerialCard', entityId: String(c) } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, AUDIT_ACTIONS.UPDATE);
    assert.equal(audits[0].parentEntityId, String(l.lineId));
  });

  test('nothing left on the line → conflict, and no card is changed', async () => {
    const l = await receiptLine(20);
    await card(l.inventoryId, l.lineId, 20);
    const c = await card(l.inventoryId, l.lineId, 0);
    await rejects(svc.assignQuantityEqually([c], userId, companyId), 409, /no unassigned quantity/);
    assert.equal(await qty(c), 0);
  });

  test('all-or-nothing: one full line blocks the whole selection', async () => {
    const ok = await receiptLine(10);
    const full = await receiptLine(5);
    await card(full.inventoryId, full.lineId, 5);
    const a = await card(ok.inventoryId, ok.lineId, 0);
    const b = await card(full.inventoryId, full.lineId, 0);
    await rejects(svc.assignQuantityEqually([a, b], userId, companyId), 409, /no unassigned quantity/);
    assert.equal(await qty(a), 0, 'the other line was rolled back too');
  });

  test('a card with no receipt link, a deleted card, or an empty selection is rejected', async () => {
    const l = await receiptLine(10);
    const unlinked = await card(l.inventoryId, null, 0);
    await rejects(svc.assignQuantityEqually([unlinked], userId, companyId), 400, /Not linked to a receipt line/);
    const gone = await card(l.inventoryId, l.lineId, 0, { deleted: true });
    await rejects(svc.assignQuantityEqually([gone], userId, companyId), 404, /no longer exist/);
    await rejects(svc.assignQuantityEqually([], userId, companyId), 400, /Select at least one/);
  });
});

describe('Copy Column — full-row Update keeps the other fields', () => {
  test('a complete DTO with one field changed writes only that field', async () => {
    const l = await receiptLine(30);
    const src = await card(l.inventoryId, l.lineId, 10, { partyNo: 'SRC', width: 140, quantityMT: 2 });
    const dst = await card(l.inventoryId, l.lineId, 10, { partyNo: 'DST', width: 160, quantityMT: 4 });
    // What the screen sends for "Copy Column → Party No": the target's own full row, PartyNo from the source.
    await svc.update([{ id: dst, partyNo: 'SRC', width: 160, quantity: 10, quantityMT: 4 } as any], userId, companyId);
    const after = await row(dst);
    assert.equal(after.PartyNo, 'SRC');
    assert.equal(Number(after.Width), 160);
    assert.equal(Number(after.QuantityMT), 4);
    assert.equal((await row(src)).PartyNo, 'SRC');
  });

  test('copying Quantity is no longer capped at the receipt line\'s Quantity', async () => {
    const l = await receiptLine(30);
    await card(l.inventoryId, l.lineId, 20);
    const dst = await card(l.inventoryId, l.lineId, 5);
    await svc.update([{ id: dst, quantity: 20 } as any], userId, companyId);
    assert.equal(await qty(dst), 20);
    const [line] = await prisma.$queryRawUnsafe<any[]>(`SELECT "Quantity" FROM "IM_ReceiptItem" WHERE "RecId" = $1`, l.lineId);
    assert.equal(Number(line.Quantity), 30, 'receipt line untouched');
  });
});
