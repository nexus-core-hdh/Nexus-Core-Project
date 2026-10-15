// Generate Serial Cards: no receipt-quantity cap, a unique Serial No (= barcode) per card, scan
// lookup, and the production details (Work Order, Style, Fabric, Yarn Recipe) read from the
// card's real linked records. Throwaway full-schema test database (`npm run test:serial-cards`);
// every test seeds its own uniquely-coded rows; nothing is deleted.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SerialCardService } from '../../src/modules/legacy-erp/serial-card.service';
import { loadStockValuations } from '../../src/modules/legacy-erp/inventory-card.service';
import { makeSerialCardService } from './make-service';

let prisma: PrismaService;
let svc: SerialCardService;
let userId: string;
let companyId: string;
let branchId: string;
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
  const company = await prisma.company.create({ data: { name: `Serial Barcode Test ${RUN}` } });
  const branch = await prisma.branch.create({ data: { name: 'SB', companyId: company.id } });
  const user = await prisma.user.create({ data: { companyId: company.id, name: 'serial-barcode-test', email: `sb-${RUN}@test.invalid`, password: 'x' } });
  userId = user.id;
  companyId = company.id;
  branchId = branch.id;
});
after(async () => { await prisma.$disconnect(); });

// --- seed helpers ----------------------------------------------------------------------------
const master = (table: string, codeCol: string, nameCol: string, name: string) =>
  one(`INSERT INTO "${table}" ("${codeCol}","${nameCol}","InUse","IsDeleted") VALUES ($1,$2,1,0) RETURNING "RecId" AS id`, uniq('M').slice(0, 20), name);
async function fabric(opts: { composition?: string; gsm?: string; width?: number; weight?: number } = {}) {
  const comp = opts.composition ? await master('MD_Composition', 'CompositionCode', 'CompositionName', opts.composition) : null;
  const gsm = opts.gsm ? await master('MD_FinishGSM', 'FinishGSMCode', 'FinishGSMName', opts.gsm) : null;
  return one(
    `INSERT INTO "IM_Item" ("InventoryCode","InventoryName","AccessCode","UD_FabComposition","UD_FabGSM","FWidth","FWeight","IsDeleted") VALUES ($1,'Rib 1x1','FABRIC',$2,$3,$4,$5,0) RETURNING "RecId" AS id`,
    uniq('FAB'), comp != null ? String(comp) : null, gsm != null ? String(gsm) : null, opts.width ?? null, opts.weight ?? null,
  );
}
const yarn = (name: string) => one(`INSERT INTO "IM_Item" ("InventoryCode","InventoryName","AccessCode","IsDeleted") VALUES ($1,$2,'YARN',0) RETURNING "RecId" AS id`, uniq('YRN'), name);
const color = async (name: string) => (await prisma.colorCard.create({ data: { code: uniq('C'), name, color: '#123456', branchId } })).id;
/** A Work Order (optionally linked to a Style Card) with one item, as Work Order entry creates them. */
async function workOrder(styleCardId: string | null) {
  const woId = await one(`INSERT INTO "MA_WorkOrder" ("WorkOrderNo","StyleCardId","IsDeleted") VALUES ($1,$2,0) RETURNING "RecId" AS id`, uniq('W/O-'), styleCardId);
  const itemId = await one(`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId","ItemOrderNo","IsDeleted") VALUES ($1,1,0) RETURNING "RecId" AS id`, woId);
  return { woId, itemId };
}
async function style(fabricLines: { fabricInventoryId: number; colorCardId?: string | null }[]) {
  const s = await prisma.styleCard.create({ data: { styleNumber: uniq('ST-'), title: 'Polo Shirt', branchId, createdBy: 'u1' } });
  for (const [i, l] of fabricLines.entries()) {
    await prisma.styleBomLine.create({ data: { styleCardId: s.id, lineType: 'fabric', sortOrder: i + 1, fabricInventoryId: l.fabricInventoryId, colorCardId: l.colorCardId ?? null, quantity: 1 } as any });
  }
  return s;
}
const recipe = (fabricInventoryId: number, lines: { yarnInventoryId: number; pct: number }[], colorCardId: string | null = null) =>
  prisma.fabricYarnRecipeLine.createMany({
    data: lines.map((l, i) => ({ fabricInventoryId, colorCardId, yarnInventoryId: l.yarnInventoryId, yarnCode: 'stale', yarnName: 'stale', percentage: l.pct, sortOrder: i })),
  });
async function receiptLine(inventoryId: number, quantity: number, opts: { workOrderItemId?: number | null; colorCardId?: string | null } = {}) {
  const receiptId = await one(`INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo","ReceiptDate","CompanyId","WorkplaceId","IsDeleted") VALUES (2,$1,'2026-04-01'::date,1,1,0) RETURNING "RecId" AS id`, uniq('IR-'));
  const lineId = await one(
    `INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId","ReceiptType","InventoryId","Quantity","UnitPrice","WorkOrderReceiptItemId","ColorCardId","IsDeleted") VALUES ($1,2,$2,$3,100,$4,$5,0) RETURNING "RecId" AS id`,
    receiptId, inventoryId, quantity, opts.workOrderItemId ?? null, opts.colorCardId ?? null,
  );
  return { receiptId, lineId };
}
const produce = (l: { receiptId: number; lineId: number }, dto: any) => svc.produce(l.receiptId, l.lineId, dto, userId, companyId) as Promise<any[]>;
const rejects = (p: Promise<unknown>, status: number, re: RegExp) =>
  assert.rejects(p, (e: any) => { assert.equal(e?.getStatus?.(), status); assert.match(e.message, re); return true; });

describe('No receipt-quantity cap on Generate Serial Cards', () => {
  test('10 rolls of 45 on a 14-unit line (the reported case) are produced as requested', async () => {
    const fab = await fabric();
    const l = await receiptLine(fab, 14);
    const lineBefore = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "IM_ReceiptItem" WHERE "RecId" = $1`, l.lineId))[0];
    const stockBefore = (await loadStockValuations(prisma, [fab])).get(fab);
    const cards = await produce(l, { count: 10, quantity: 45 });
    assert.equal(cards.length, 10);
    assert.ok(cards.every((c) => Number(c.Quantity) === 45), 'requested quantity kept on every card');
    const lineAfter = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "IM_ReceiptItem" WHERE "RecId" = $1`, l.lineId))[0];
    assert.deepEqual(lineAfter, lineBefore, 'receipt line row unchanged');
    assert.deepEqual((await loadStockValuations(prisma, [fab])).get(fab), stockBefore, 'Stock In Hand / value unchanged');
    // and they stay editable past the line quantity
    await svc.update([{ id: cards[0].RecId, quantity: 60 } as any], userId, companyId);
  });

  test('other validations still apply', async () => {
    const l = await receiptLine(await fabric(), 10);
    await rejects(produce(l, { count: 0 }), 400, /positive integer/);
    await rejects(produce(l, { count: 501 }), 400, /max 500/);
    await rejects(produce(l, { count: 2, serialNo: uniq('FIX') }), 400, /only be used when Serials Count is 1/);
    const yarnLine = await receiptLine(await yarn('y'), 10);
    await rejects(produce(yarnLine, { count: 1 }), 400, /only available for Fabric/);
  });
});

describe('Repeated Produce on one receipt line (Generate Serial Cards sessions)', () => {
  test('each batch returns only its own new cards; earlier cards are untouched', async () => {
    const fab = await fabric();
    const l = await receiptLine(fab, 14);
    const lineBefore = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "IM_ReceiptItem" WHERE "RecId" = $1`, l.lineId))[0];
    const stockBefore = (await loadStockValuations(prisma, [fab])).get(fab);

    const first = await produce(l, { count: 3, quantity: 20, partyNo: '211' }); // a line with no cards yet
    assert.equal(first.length, 3);
    const snapshot = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "IM_SerialCard" WHERE "RecId" = ANY($1::int[]) ORDER BY "RecId"`, first.map((c) => c.RecId));

    const second = await produce(l, { count: 2, quantity: 19 }); // a line that already has cards
    assert.equal(second.length, 2, 'only the new batch is returned');
    assert.ok(second.every((c) => !first.some((f) => f.RecId === c.RecId)));
    const codes = [...first, ...second].map((c) => c.SerialCode);
    assert.equal(new Set(codes).size, 5, 'all Serial Nos unique');

    const after = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "IM_SerialCard" WHERE "RecId" = ANY($1::int[]) ORDER BY "RecId"`, first.map((c) => c.RecId));
    assert.deepEqual(after, snapshot, 'first batch unchanged by the second Produce');
    const listed = await svc.list(l.lineId);
    assert.equal(listed.length, 5, 'View Serial Cards / List shows both batches');
    assert.equal((await svc.getContext(l.receiptId, l.lineId) as any).existingSerialCount, 5);

    const lineAfter = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "IM_ReceiptItem" WHERE "RecId" = $1`, l.lineId))[0];
    assert.deepEqual(lineAfter, lineBefore, 'receipt line unchanged');
    assert.deepEqual((await loadStockValuations(prisma, [fab])).get(fab), stockBefore, 'stock / value unchanged');
  });
});

describe('Unique barcode (Serial No) per card', () => {
  test('auto-generated: every card distinct, next batch continues after the highest', async () => {
    const l = await receiptLine(await fabric(), 1);
    const a = (await produce(l, { count: 10 })).map((c) => c.SerialCode);
    const b = (await produce(l, { count: 5 })).map((c) => c.SerialCode);
    assert.equal(new Set([...a, ...b]).size, 15);
    assert.ok(a.every((c) => /^\d{8,}$/.test(c)));
    assert.equal(BigInt(b[0]), BigInt(a[9]) + 1n);
  });

  test('template: a second batch continues numbering instead of colliding', async () => {
    const l = await receiptLine(await fabric(), 1);
    const prefix = uniq('T').slice(-8);
    const a = (await produce(l, { count: 3, serialNo: `${prefix}####` })).map((c) => c.SerialCode);
    const b = (await produce(l, { count: 2, serialNo: `${prefix}####` })).map((c) => c.SerialCode);
    assert.deepEqual([...a, ...b], [1, 2, 3, 4, 5].map((n) => `${prefix}${String(n).padStart(4, '0')}`));
    await rejects(produce(l, { count: 100, serialNo: `${prefix}##` }), 400, /no numbers left/);
  });

  test('concurrent Produce calls never hand out the same number', async () => {
    const l1 = await receiptLine(await fabric(), 1);
    const l2 = await receiptLine(await fabric(), 1);
    const [a, b] = await Promise.all([produce(l1, { count: 6 }), produce(l2, { count: 6 })]);
    assert.equal(new Set([...a, ...b].map((c) => c.SerialCode)).size, 12);
  });

  test('a deleted card\'s Serial No is never reused; case-insensitive duplicates are refused', async () => {
    const l = await receiptLine(await fabric(), 1);
    const code = uniq('DEL');
    const [c] = await produce(l, { count: 1, serialNo: code });
    await svc.remove(c.RecId, userId, companyId);
    await rejects(produce(l, { count: 1, serialNo: code }), 409, /already exists/);
    await rejects(produce(l, { count: 1, serialNo: code.toLowerCase() }), 409, /already exists/);
  });

  test('a Serial No that cannot be printed as a barcode is refused', async () => {
    const l = await receiptLine(await fabric(), 1);
    await rejects(produce(l, { count: 1, serialNo: 'ROLL-ü1' }), 400, /barcode/);
    await rejects(produce(l, { count: 1, serialNo: 'X'.repeat(31) }), 400, /longer than 30/);
  });

  test('editing, reloading and rescanning keep the barcode; scan finds the card', async () => {
    const l = await receiptLine(await fabric(), 1);
    const [c] = await produce(l, { count: 1 });
    await svc.update([{ id: c.RecId, partyNo: 'P-9', quantity: 12, width: 180 } as any], userId, companyId);
    const scanned: any = await svc.getByCode(c.SerialCode);
    assert.equal(scanned.RecId, c.RecId);
    assert.equal(scanned.SerialCode, c.SerialCode, 'unchanged by Update');
    assert.equal(scanned.PartyNo, 'P-9');
    assert.equal((await svc.getDetail(c.RecId) as any).SerialCode, c.SerialCode);
    assert.equal((await svc.getByCode(` ${c.SerialCode} `) as any).RecId, c.RecId, 'scanner whitespace trimmed');
    const lettered = (await produce(l, { count: 1, serialNo: uniq('LC') }))[0];
    assert.equal((await svc.getByCode(lettered.SerialCode.toLowerCase()) as any).RecId, lettered.RecId, 'letter case tolerated');
    await rejects(svc.getByCode('NO-SUCH-SERIAL'), 404, /No serial card/);
    await svc.remove(c.RecId, userId, companyId);
    await rejects(svc.getByCode(c.SerialCode), 404, /No serial card/);
  });
});

describe('Production details from the linked records', () => {
  test('Work Order, Style, Fabric, Composition, GSM, width and the Style BOM\'s Yarn Recipe', async () => {
    const fab = await fabric({ composition: '97% CTN 3% LYC', gsm: '320', width: 72, weight: 320 });
    const cotton = await yarn('30/1 Combed Cotton');
    const lycra = await yarn('20D Lycra');
    await recipe(fab, [{ yarnInventoryId: cotton, pct: 97 }, { yarnInventoryId: lycra, pct: 3 }]);
    const s = await style([{ fabricInventoryId: fab }]);
    const wo = await workOrder(s.id);
    const l = await receiptLine(fab, 100, { workOrderItemId: wo.itemId });
    const [c] = await produce(l, { count: 1, quantity: 25, width: 70, weight: 318 });
    const d: any = await svc.getDetail(c.RecId);
    const [woRow] = await prisma.$queryRawUnsafe<any[]>(`SELECT "WorkOrderNo" FROM "MA_WorkOrder" WHERE "RecId" = $1`, wo.woId);
    assert.equal(d.workOrderNo, woRow.WorkOrderNo);
    assert.equal(d.styleNumber, s.styleNumber);
    assert.equal(d.styleName, 'Polo Shirt');
    assert.equal(d.inventoryName, 'Rib 1x1');
    assert.equal(d.fabricComposition, '97% CTN 3% LYC');
    assert.equal(d.fabricGsm, '320');
    assert.equal(Number(d.fabricWidth), 72);
    assert.equal(Number(d.Width), 70, 'the roll\'s own measured width');
    assert.equal(Number(d.Weight), 318);
    assert.equal(d.yarnRecipe.status, 'ok');
    assert.equal(d.yarnRecipe.source, 'common');
    assert.deepEqual(d.yarnRecipe.lines.map((r: any) => [r.yarnName, r.percentage]), [['30/1 Combed Cotton', 97], ['20D Lycra', 3]], 'names read from the Yarn Cards, not the stale copies');
    // the list rows carry the same identity (used by labels)
    const { rows } = await svc.listAll({ receiptItemId: l.lineId });
    assert.equal(rows[0].styleNumber, s.styleNumber);
  });

  test('a Color-Specific recipe applies when the roll\'s BOM line is for that color', async () => {
    const fab = await fabric();
    const navy = await color('Navy');
    const red = await color('Red');
    const y1 = await yarn('Common yarn');
    const y2 = await yarn('Navy yarn');
    await recipe(fab, [{ yarnInventoryId: y1, pct: 100 }]);
    await recipe(fab, [{ yarnInventoryId: y2, pct: 100 }], navy);
    const s = await style([{ fabricInventoryId: fab, colorCardId: navy }, { fabricInventoryId: fab, colorCardId: red }]);
    const wo = await workOrder(s.id);
    const navyRoll: any = (await produce(await receiptLine(fab, 10, { workOrderItemId: wo.itemId, colorCardId: navy }), { count: 1 }))[0];
    const redRoll: any = (await produce(await receiptLine(fab, 10, { workOrderItemId: wo.itemId, colorCardId: red }), { count: 1 }))[0];
    const n: any = await svc.getDetail(navyRoll.RecId);
    assert.equal(n.yarnRecipe.source, 'color');
    assert.deepEqual(n.yarnRecipe.lines.map((r: any) => r.yarnName), ['Navy yarn']);
    const r: any = await svc.getDetail(redRoll.RecId);
    assert.equal(r.yarnRecipe.source, 'common', 'no Red override -> the Common recipe');
    assert.deepEqual(r.yarnRecipe.lines.map((x: any) => x.yarnName), ['Common yarn']);
  });

  test('missing recipe information is reported, never invented', async () => {
    // no Work Order
    const fab = await fabric();
    await recipe(fab, [{ yarnInventoryId: await yarn('y'), pct: 100 }]);
    const noWo: any = (await produce(await receiptLine(fab, 10), { count: 1 }))[0];
    const d1: any = await svc.getDetail(noWo.RecId);
    assert.equal(d1.yarnRecipe.status, 'no-work-order');
    assert.deepEqual(d1.yarnRecipe.lines, []);
    assert.equal(d1.styleNumber, null);

    // Work Order whose BOM does not use this fabric
    const other = await fabric();
    const wo = await workOrder((await style([{ fabricInventoryId: other }])).id);
    const notInBom: any = (await produce(await receiptLine(fab, 10, { workOrderItemId: wo.itemId }), { count: 1 }))[0];
    assert.equal((await svc.getDetail(notInBom.RecId) as any).yarnRecipe.status, 'not-in-bom');

    // fabric on the BOM but no recipe defined
    const bare = await fabric();
    const wo2 = await workOrder((await style([{ fabricInventoryId: bare }])).id);
    const noRecipe: any = (await produce(await receiptLine(bare, 10, { workOrderItemId: wo2.itemId }), { count: 1 }))[0];
    const d3: any = await svc.getDetail(noRecipe.RecId);
    assert.equal(d3.yarnRecipe.status, 'not-defined');
    assert.match(d3.yarnRecipe.message, /No Yarn Recipe/);

    // Work Order without a Style Card and no BOM of its own
    const wo3 = await workOrder(null);
    const noStyle: any = (await produce(await receiptLine(bare, 10, { workOrderItemId: wo3.itemId }), { count: 1 }))[0];
    assert.equal((await svc.getDetail(noStyle.RecId) as any).yarnRecipe.status, 'not-in-bom');
  });
});

describe('QR link and the scan page\'s data', () => {
  async function seededCard(opts: { styleName?: string; fabricName?: string } = {}) {
    const comp = await master('MD_Composition', 'CompositionCode', 'CompositionName', '97% CTN 3% LYC');
    const gsm = await master('MD_FinishGSM', 'FinishGSMCode', 'FinishGSMName', '320');
    const fab = await one(
      `INSERT INTO "IM_Item" ("InventoryCode","InventoryName","AccessCode","UD_FabComposition","UD_FabGSM","FWidth","FWeight","IsDeleted") VALUES ($1,$2,'FABRIC',$3,$4,72,320,0) RETURNING "RecId" AS id`,
      uniq('FAB'), opts.fabricName ?? 'Rib 1x1', String(comp), String(gsm),
    );
    const cotton = await yarn('30/1 Combed Cotton');
    const lycra = await yarn('20D Lycra');
    await prisma.fabricYarnRecipeLine.createMany({ data: [
      { fabricInventoryId: fab, yarnInventoryId: cotton, percentage: 97, process: 'DYED', variant1: 'NAVY', variant2: 'SLUB', wastePct: 3, dyeWastagePct: 2, sortOrder: 0 },
      { fabricInventoryId: fab, yarnInventoryId: lycra, percentage: 3, process: null, wastePct: 1, dyeWastagePct: 0, sortOrder: 1 },
    ] as any });
    const s = await prisma.styleCard.create({ data: { styleNumber: uniq('ST-'), title: opts.styleName ?? 'Polo Shirt', branchId, createdBy: 'u1' } });
    await prisma.styleBomLine.create({ data: { styleCardId: s.id, lineType: 'fabric', sortOrder: 1, fabricInventoryId: fab, quantity: 1 } as any });
    const wo = await workOrder(s.id);
    const navy = await color('Navy');
    const acc = await one(`INSERT INTO "FI_Account" ("CurrentAccountCode","CurrentAccountName","IsDeleted") VALUES ($1,'Knit Supplier Ltd.',0) RETURNING "RecId" AS id`, uniq('ACC'));
    const l = await receiptLine(fab, 100, { workOrderItemId: wo.itemId, colorCardId: navy });
    const cards = await produce(l, { count: 2, quantity: 45, width: 70, weight: 318, partyNo: '211-1', currentAccountId: acc, manufacturingDate: '2026-10-12', shelfLife: 12, explanation: 'ok' });
    return { cards, style: s, acc };
  }
  const ORIGIN = 'http://192.168.0.28:3000';
  const detailOf = (id: number) => svc.getDetail(id, ORIGIN) as Promise<any>;

  test('the scan page data: every required field carries the actual linked value, plus the complete Yarn Recipe', async () => {
    const { cards, style } = await seededCard();
    const d = await detailOf(cards[0].RecId);
    assert.equal(d.SerialCode, cards[0].SerialCode);
    assert.ok(d.workOrderNo);
    assert.equal(d.styleNumber, style.styleNumber);
    assert.equal(d.styleName, 'Polo Shirt');
    assert.equal(d.inventoryName, 'Rib 1x1');
    assert.equal(d.fabricComposition, '97% CTN 3% LYC');
    assert.equal(d.fabricGsm, '320');
    assert.equal(d.colorName, 'Navy');
    assert.deepEqual([Number(d.Width), Number(d.Weight), Number(d.Quantity)], [70, 318, 45]);
    assert.ok(d.receiptNo);
    assert.equal(d.currentAccountName, 'Knit Supplier Ltd.');
    assert.equal(d.yarnRecipe.status, 'ok');
    assert.deepEqual(d.yarnRecipe.lines.map((l: any) => [l.yarnName, l.process, l.percentage, l.wastePct, l.dyeWastagePct]), [
      ['30/1 Combed Cotton', 'DYED', 97, 3, 2],
      ['20D Lycra', null, 3, 1, 0],
    ]);
    // The scan lookup (what the phone page calls) returns the same card and recipe
    const scanned: any = await svc.getByCode(cards[0].SerialCode, ORIGIN);
    assert.equal(scanned.RecId, cards[0].RecId);
    assert.deepEqual(scanned.yarnRecipe, d.yarnRecipe);
  });

  test('earlier labels: the QR link holds only the Serial No, nothing else', async () => {
    const { cards } = await seededCard();
    const d = await detailOf(cards[0].RecId);
    assert.equal(d.qrPayload, `${ORIGIN}/s/${encodeURIComponent(cards[0].SerialCode)}`);
    assert.ok(d.qrPayload.length < 80, 'short → small, easy-to-scan QR');
    for (const leak of ['Polo', 'Rib', 'Knit Supplier', 'Cotton']) assert.ok(!d.qrPayload.includes(leak), `${leak} not in the QR`);
  });

  test('QR_PUBLIC_BASE_URL wins over the browser origin; unsafe origins are ignored', async () => {
    const { cards } = await seededCard();
    const prev = process.env.QR_PUBLIC_BASE_URL;
    try {
      process.env.QR_PUBLIC_BASE_URL = 'https://erp.example.com/';
      assert.equal((await detailOf(cards[0].RecId)).qrPayload, `https://erp.example.com/s/${cards[0].SerialCode}`);
      delete process.env.QR_PUBLIC_BASE_URL;
      assert.equal((await svc.getDetail(cards[0].RecId, 'javascript:alert(1)') as any).qrPayload, null);
      assert.equal((await svc.getDetail(cards[0].RecId, 'not a url') as any).qrPayload, null);
      // Labels hold the data as text — printing needs no ERP address at all.
      const [label] = await svc.getLabels([cards[0].RecId]) as any[];
      assert.equal(label.RecId, cards[0].RecId);
    } finally {
      if (prev === undefined) delete process.env.QR_PUBLIC_BASE_URL; else process.env.QR_PUBLIC_BASE_URL = prev;
    }
  });

  test('special characters in a Serial No are URL-encoded and round-trip to the card', async () => {
    const l = await receiptLine(await fabric(), 10);
    const code = `${uniq('A')}/B #C?`;
    const [c] = await produce(l, { count: 1, serialNo: code });
    const link = (await detailOf(c.RecId)).qrPayload as string;
    assert.equal(link, `${ORIGIN}/s/${encodeURIComponent(code)}`);
    const serial = decodeURIComponent(new URL(link).pathname.replace(/^\/s\//, ''));
    assert.equal((await svc.getByCode(serial, ORIGIN) as any).RecId, c.RecId);
  });

  test('earlier link labels: the link is stable across reprints and edits (the page shows the current data)', async () => {
    const { cards, acc } = await seededCard();
    const a = (await detailOf(cards[0].RecId)).qrPayload;
    assert.notEqual(a, (await detailOf(cards[1].RecId)).qrPayload);
    await svc.update([{ id: cards[0].RecId, quantity: 50, width: 70, weight: 318, partyNo: '211-1', manufacturingDate: '2026-10-12', shelfLife: 12, explanation: 'ok', currentAccountId: acc } as any], userId, companyId);
    assert.equal((await detailOf(cards[0].RecId)).qrPayload, a, 'an edit never changes an earlier label\'s link');
    assert.equal(Number((await detailOf(cards[0].RecId)).Quantity), 50, 'the page shows the edit');
  });

  test('labels carry everything the offline QR text needs: the full row plus the complete Yarn Recipe', async () => {
    const { cards } = await seededCard();
    const d = await detailOf(cards[0].RecId);
    const [label] = await svc.getLabels([cards[0].RecId]) as any[];
    assert.deepEqual(label.yarnRecipe, d.yarnRecipe);
    for (const k of ['SerialCode', 'workOrderNo', 'styleNumber', 'styleName', 'inventoryCode', 'inventoryName', 'fabricComposition', 'fabricGsm',
      'fabricWidth', 'fabricWeight', 'colorCode', 'colorName', 'variantCode', 'variantName', 'Width', 'Weight', 'Quantity', 'unitCode', 'receiptNo',
      'ManufacturingDate', 'ExpirationDate', 'ShelfLife', 'PartyNo', 'currentAccountCode', 'currentAccountName', 'qualityTypeName', 'resourceCode',
      'ProducerSerialCode', 'Explanation', 'QuantityMT', 'Quantity3', 'RawWidth', 'RawWeight', 'RawLength', 'ProductLength', 'WeightM2', 'WeightMt',
      'Pus', 'Fine', 'PieceCount']) {
      assert.ok(k in label, `${k} on the label row`);
      assert.deepEqual(label[k], d[k], k);
    }
    assert.ok(!('qrPayload' in label), 'no link on new labels');
    for (const secret of ['password', 'Password', 'token', 'accessToken']) assert.ok(!(secret in label), `${secret} never on a label`);
    // SERIAL_CARD_LABEL_FIXTURE=<file>: save this real labels response so the frontend QR decode
    // check (frontend/scripts/serial-card-qr-offline.test.mjs) can run on it.
    if (process.env.SERIAL_CARD_LABEL_FIXTURE) {
      require('node:fs').writeFileSync(process.env.SERIAL_CARD_LABEL_FIXTURE, JSON.stringify(label, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
    }
  });

  test('Product / Expiration Date are stored as entered and survive an edit unchanged', async () => {
    const l = await receiptLine(await fabric(), 10);
    const [c] = await produce(l, { count: 1, manufacturingDate: '2026-10-12', expirationDate: '2027-01-31' });
    const [stored] = await prisma.$queryRawUnsafe<any[]>(`SELECT "ManufacturingDate"::text m, "ExpirationDate"::text e FROM "IM_SerialCard" WHERE "RecId" = $1`, c.RecId);
    assert.deepEqual([stored.m, stored.e], ['2026-10-12 00:00:00', '2027-01-31 00:00:00'], 'no session-timezone shift');
    // The Update form echoes the loaded value back as an ISO string — the date must not move.
    const loaded: any = (await svc.listAll({ id: c.RecId })).rows[0];
    await svc.update([{ id: c.RecId, manufacturingDate: new Date(loaded.ManufacturingDate).toISOString(), expirationDate: '2027-02-01' } as any], userId, companyId);
    const d = await detailOf(c.RecId);
    assert.deepEqual([new Date(d.ManufacturingDate).toISOString().slice(0, 10), new Date(d.ExpirationDate).toISOString().slice(0, 10)], ['2026-10-12', '2027-02-01']);
  });

  test('labels come back in the requested order; bad requests are refused', async () => {
    const { cards } = await seededCard();
    const out = await svc.getLabels([cards[1].RecId, cards[0].RecId]) as any[];
    assert.deepEqual(out.map((c) => c.RecId), [cards[1].RecId, cards[0].RecId]);
    await rejects(svc.getLabels([]), 400, /Select at least one/);
    await rejects(svc.getLabels([999999999]), 404, /no longer exist/);
  });
});
