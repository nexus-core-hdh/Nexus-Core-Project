// Serial Cards list — Party No column filter applied to the query (listAll partyNos) and its
// option list (partyNoOptions). Throwaway full-schema test database (`npm run test:serial-cards`).
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SerialCardService } from '../../src/modules/legacy-erp/serial-card.service';
import { makeSerialCardService } from './make-service';

let prisma: PrismaService;
let svc: SerialCardService;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();
const one = async (sql: string, ...params: unknown[]) => Number((await prisma.$queryRawUnsafe<any[]>(sql, ...params))[0].id);

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  svc = makeSerialCardService(prisma);
});
after(async () => { await prisma.$disconnect(); });

/** One receipt line with cards carrying the given Party Nos (null = no Party No). */
async function lineWithCards(partyNos: (string | null)[], opts: { deleted?: boolean } = {}) {
  const inv = await one(`INSERT INTO "IM_Item" ("InventoryCode","InventoryName","AccessCode","IsDeleted") VALUES ($1,'f','FABRIC',0) RETURNING "RecId" AS id`, uniq('FAB'));
  const receiptId = await one(`INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo","ReceiptDate","CompanyId","WorkplaceId","IsDeleted") VALUES (2,$1,'2026-05-01'::date,1,1,0) RETURNING "RecId" AS id`, uniq('IR-'));
  const lineId = await one(`INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId","ReceiptType","InventoryId","Quantity","IsDeleted") VALUES ($1,2,$2,10,0) RETURNING "RecId" AS id`, receiptId, inv);
  for (const p of partyNos) {
    const id = await one(
      `INSERT INTO "IM_SerialCard" ("CompanyId","SerialCode","InventoryId","InUse","PartyNo","Quantity","InsertedAt","InsertedBy","IsDeleted","UUID") VALUES (1,$1,$2,1,$3,0,now(),1,$4,gen_random_uuid()) RETURNING "RecId" AS id`,
      uniq('PN').slice(0, 30), inv, p, opts.deleted ? 1 : 0,
    );
    await prisma.$executeRawUnsafe(`INSERT INTO "IM_SerialTransaction" ("SerialCardId","TransactionType","ReceiptItemId","Quantity","InsertedAt","InsertedBy","IsDeleted","UUID") VALUES ($1,1,$2,0,now(),1,0,gen_random_uuid())`, id, lineId);
  }
  return { lineId, inv };
}
const parties = (rows: any[]) => rows.map((r) => r.PartyNo);

describe('Party No filter on the Serial Cards query', () => {
  test('filters every matching card (trimmed, exact), multi-select, and clears', async () => {
    const a = uniq('P');
    const b = uniq('P');
    const { lineId } = await lineWithCards([a, ` ${a} `, b, null, '', '  ', `${a}X`]);
    const all = await svc.listAll({ receiptItemId: lineId });
    assert.equal(all.total, 7);
    assert.deepEqual(all.partyNoOptions, [a, `${a}X`, b].sort(), 'distinct, trimmed, blanks excluded');

    const onlyA = await svc.listAll({ receiptItemId: lineId, partyNos: [a] });
    assert.equal(onlyA.total, 2, 'padded value matches; a longer value does not');
    assert.ok(parties(onlyA.rows).every((p) => p.trim() === a));
    assert.deepEqual(onlyA.partyNoOptions, all.partyNoOptions, 'options are not narrowed by the Party No filter itself');

    assert.equal((await svc.listAll({ receiptItemId: lineId, partyNos: [a, b] })).total, 3);
    assert.equal((await svc.listAll({ receiptItemId: lineId, partyNos: ['NO-SUCH-PARTY'] })).total, 0);
    assert.equal((await svc.listAll({ receiptItemId: lineId, partyNos: [] })).total, 7, 'cleared');
    assert.equal((await svc.listAll({ receiptItemId: lineId, partyNos: ['', '  '] })).total, 7, 'blank values are ignored, not matched');
  });

  test('works across pages and together with the other filters', async () => {
    const p = uniq('P');
    const { lineId, inv } = await lineWithCards([p, p, p, p, p, uniq('Q'), null]);
    await lineWithCards([p], { deleted: true });
    const page1 = await svc.listAll({ receiptItemId: lineId, partyNos: [p], skip: 0, take: 2 });
    const page3 = await svc.listAll({ receiptItemId: lineId, partyNos: [p], skip: 4, take: 2 });
    assert.equal(page1.total, 5, 'total counts every page, deleted cards excluded');
    assert.equal(page1.rows.length, 2);
    assert.equal(page3.rows.length, 1);
    const ids = new Set([...page1.rows, ...page3.rows].map((r) => r.RecId));
    assert.equal(ids.size, 3);
    // combined with an inventory filter and the status filter
    assert.equal((await svc.listAll({ inventoryId: inv, partyNos: [p], status: 'none' })).total, 5);
    assert.equal((await svc.listAll({ inventoryId: inv, partyNos: [p], status: 'has' })).total, 0);
    assert.equal((await svc.listAll({ serialNo: 'NO-SUCH-SERIAL', partyNos: [p] })).total, 0);
  });
});
