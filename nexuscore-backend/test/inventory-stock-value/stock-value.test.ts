// Inventory card Stock Value (inventory-card.service.ts loadStockValuations/withStockValuation) and
// Customized Worklist name display (worklist-rows.service.ts displayColumnSql). Runs against the
// throwaway full-schema test database shared with the Packing List suite
// (`npm run test:stock-value`). Every test seeds its own uniquely-coded rows; nothing is deleted.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loadStockValuations, InventoryCardService } from '../../src/modules/legacy-erp/inventory-card.service';
import { YarnCardService } from '../../src/modules/legacy-erp/yarn-card.service';
import { FabricCardService } from '../../src/modules/legacy-erp/fabric-card.service';
import { TrimInventoryCardService } from '../../src/modules/legacy-erp/trim-inventory-card.service';
import { WorklistRowsService } from '../../src/modules/legacy-erp/worklist-rows.service';
import { WorklistFieldsService } from '../../src/modules/legacy-erp/worklist-fields.service';
import { screenKeyFor } from '../../src/modules/legacy-erp/inventory-receipt.service';

let prisma: PrismaService;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}-${RUN}-${++seq}`;
const one = async (sql: string, ...params: unknown[]) => Number((await prisma.$queryRawUnsafe<any[]>(sql, ...params))[0].id);

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
});
after(async () => { await prisma.$disconnect(); });

// --- seed helpers ----------------------------------------------------------------------------
const unitSetItem = (name: string) => one(`INSERT INTO "MD_UnitSetItem" ("UnitCode","UnitName","IsDeleted") VALUES ($1,$2,0) RETURNING "RecId" AS id`, uniq(name).slice(0, 20), name);
const account = (name: string) => one(`INSERT INTO "FI_Account" ("CurrentAccountCode","CurrentAccountName","IsDeleted") VALUES ($1,$2,0) RETURNING "RecId" AS id`, uniq('ACC'), name);
const item = (accessCode: string, currentAccountId: number | null = null) =>
  one(`INSERT INTO "IM_Item" ("InventoryCode","InventoryName","AccessCode","CurrentAccountId","IsDeleted") VALUES ($1,$2,$3,$4,0) RETURNING "RecId" AS id`, uniq(accessCode), `${accessCode} item`, accessCode, currentAccountId);
/** Unit tab row: 1 <unit> = factor/divisor... in the conversion's terms (base qty = qty * divisor / factor). */
const itemUnit = (inventoryId: number, unitItemId: number, factor: number, divisor: number, main: boolean) =>
  prisma.$executeRawUnsafe(`INSERT INTO "IM_ItemUnitItemSize" ("InventoryId","UnitItemId","UnitFactor","UnitDivisor","IsMainUnit","IsDeleted") VALUES ($1,$2,$3,$4,$5,0)`, inventoryId, unitItemId, factor, divisor, main ? 1 : 0);
const receipt = (receiptType: number, date: string, opts: { deleted?: boolean; currentAccountId?: number } = {}) =>
  one(`INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo","ReceiptDate","CompanyId","WorkplaceId","CurrentAccountId","IsDeleted") VALUES ($1,$2,$3::date,1,1,$4,$5) RETURNING "RecId" AS id`,
    receiptType, uniq('R'), date, opts.currentAccountId ?? null, opts.deleted ? 1 : 0);
const line = (receiptId: number, receiptType: number, inventoryId: number, unitId: number, quantity: number, unitPrice: number | null) =>
  one(`INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId","ReceiptType","InventoryId","UnitId","Quantity","UnitPrice","IsDeleted") VALUES ($1,$2,$3,$4,$5,$6,0) RETURNING "RecId" AS id`,
    receiptId, receiptType, inventoryId, unitId, quantity, unitPrice);
const value = async (id: number) => (await loadStockValuations(prisma, [id])).get(id)!;

/** An item with a KG base unit and a BAG unit where 1 BAG = 50 KG. */
async function kgItem(accessCode = 'YARN') {
  const kg = await unitSetItem('KG');
  const bag = await unitSetItem('BAG');
  const id = await item(accessCode);
  await itemUnit(id, kg, 1, 1, true);
  await itemUnit(id, bag, 1, 50, false); // base qty = bags * 50 / 1
  return { id, kg, bag };
}

describe('Stock Value = Stock In Hand × existing receipt price', () => {
  test('the requirement example: 500 KG in hand, receipt price Rs 250/KG → Rs 125,000', async () => {
    const it = await kgItem();
    await line(await receipt(2, '2026-01-10'), 2, it.id, it.kg, 500, 250);
    const v = await value(it.id);
    assert.equal(v.stockOnHand, 500);
    assert.equal(v.stockUnit, 'KG');
    assert.equal(v.stockUnitPrice, 250);
    assert.equal(v.stockValue, 125_000);
  });

  test('multiple receipts: the latest receipt\'s existing price is used (no averaging/FIFO)', async () => {
    const it = await kgItem();
    await line(await receipt(2, '2026-01-10'), 2, it.id, it.kg, 200, 200); // 40,000
    const r2 = await receipt(2, '2026-02-10');
    await line(r2, 2, it.id, it.kg, 300, 250); // 75,000
    const v = await value(it.id);
    assert.equal(v.stockOnHand, 500);
    assert.equal(v.stockUnitPrice, 250);
    assert.equal(v.stockValue, 125_000);
    const [{ no }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "ReceiptNo" no FROM "IM_Receipt" WHERE "RecId" = $1`, r2);
    assert.equal(v.stockPriceReceiptNo, no);
    assert.equal(v.stockPriceReceiptDate, '2026-02-10');
  });

  test('a price entered per BAG is expressed per Base Unit (KG) before multiplying', async () => {
    const it = await kgItem();
    await line(await receipt(2, '2026-01-10'), 2, it.id, it.bag, 10, 5_000); // 10 BAG = 500 KG, Rs 5,000/BAG = Rs 100/KG
    const v = await value(it.id);
    assert.equal(v.stockOnHand, 500);
    assert.equal(v.stockUnitPrice, 100);
    assert.equal(v.stockValue, 50_000);
  });

  test('issues reduce stock; the value follows the stock in hand', async () => {
    const it = await kgItem();
    await line(await receipt(2, '2026-01-10'), 2, it.id, it.kg, 500, 250);
    await line(await receipt(122, '2026-01-20'), 122, it.id, it.kg, 100, 250); // Purchase Return (OUT)
    const v = await value(it.id);
    assert.equal(v.stockOnHand, 400);
    assert.equal(v.stockUnitPrice, 250, 'an OUT document\'s price is never the stock price');
    assert.equal(v.stockValue, 100_000);
  });

  test('zero stock → 0; stock without any priced receipt → null; negative stock → 0', async () => {
    const empty = await kgItem('FABRIC');
    assert.deepEqual([(await value(empty.id)).stockOnHand, (await value(empty.id)).stockValue], [0, 0]);

    const unpriced = await kgItem('TRIM');
    await line(await receipt(2, '2026-01-10'), 2, unpriced.id, unpriced.kg, 30, null);
    const u = await value(unpriced.id);
    assert.equal(u.stockOnHand, 30);
    assert.equal(u.stockUnitPrice, null);
    assert.equal(u.stockValue, null, 'never a made-up 0 when stock exists but no price does');

    const negative = await kgItem();
    await line(await receipt(2, '2026-01-10'), 2, negative.id, negative.kg, 10, 250);
    await line(await receipt(122, '2026-01-11'), 122, negative.id, negative.kg, 25, 250);
    const n = await value(negative.id);
    assert.equal(n.stockOnHand, -15);
    assert.equal(n.stockValue, 0, 'nothing in hand → no stock value');
  });

  test('deleted and unapproved receipts move neither stock nor price', async () => {
    const it = await kgItem();
    await line(await receipt(2, '2026-01-10'), 2, it.id, it.kg, 100, 200);
    await line(await receipt(2, '2026-03-01', { deleted: true }), 2, it.id, it.kg, 999, 9_999);
    const pending = await receipt(2, '2026-04-01');
    await line(pending, 2, it.id, it.kg, 50, 7_777);
    await prisma.approvalRequest.create({
      data: { screenKey: screenKeyFor(2), transactionId: String(pending), status: 'pending_approval', submittedBy: 'stock-value-test' },
    });
    const v = await value(it.id);
    assert.equal(v.stockOnHand, 100);
    assert.equal(v.stockUnitPrice, 200);
    assert.equal(v.stockValue, 20_000);
  });

  test('one valuation query for a whole batch of items', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) {
      const it = await kgItem();
      await line(await receipt(2, '2026-01-10'), 2, it.id, it.kg, i + 1, 10);
      ids.push(it.id);
    }
    let queries = 0;
    (prisma as any).$on('query', () => { queries++; });
    const start = queries;
    const map = await loadStockValuations(prisma, ids);
    assert.equal(queries - start, 1);
    assert.equal(map.size, 12);
    assert.equal(map.get(ids[11])!.stockValue, 120);
  });
});

describe('Yarn / Fabric / Trim card lists and detail reads carry Stock Value', () => {
  const services = () => ({
    yarn: new YarnCardService(prisma, null as any, null as any, null as any),
    fabric: new FabricCardService(prisma, null as any, null as any, null as any, null as any),
    trim: new TrimInventoryCardService(prisma, null as any, null as any, null as any),
  });

  for (const [kind, accessCode] of [['yarn', 'YARN'], ['fabric', 'FABRIC'], ['trim', 'TRIM']] as const) {
    test(`${kind}: list page rows and the card's own read`, async () => {
      const it = await kgItem(accessCode);
      await line(await receipt(2, '2026-01-10'), 2, it.id, it.kg, 40, 25);
      const svc: any = services()[kind];
      const [{ code }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "InventoryCode" code FROM "IM_Item" WHERE "RecId" = $1`, it.id);
      const paged = await svc.list(code, { page: 1, pageSize: 50 });
      const row = paged.rows.find((r: any) => r.id === it.id);
      assert.ok(row, 'item listed');
      assert.deepEqual([row.stockOnHand, row.stockUnit, row.stockUnitPrice, row.stockValue], [40, 'KG', 25, 1000]);
      const legacy = await svc.list(code);
      assert.equal(legacy.find((r: any) => r.id === it.id).stockValue, 1000, 'unpaged list too');
      const card = await svc.getWithStock(it.id);
      assert.equal(card.stockValue, 1000);
      assert.equal((await svc.getByCodeWithStock(code)).stockValue, 1000);
      // The plain read (used by updates and audit snapshots) stays free of computed stock fields.
      const plain = await svc.get(it.id);
      assert.equal('stockValue' in plain, false);
    });
  }

  test('the combined Inventory Card list carries Stock Value next to its existing Stock On Hand', async () => {
    const it = await kgItem('FABRIC');
    await line(await receipt(2, '2026-01-10'), 2, it.id, it.kg, 8, 12.5);
    const [{ code }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "InventoryCode" code FROM "IM_Item" WHERE "RecId" = $1`, it.id);
    const res: any = await new InventoryCardService(prisma).list({ search: code }, { page: 1, pageSize: 50 } as any);
    const row = res.rows.find((r: any) => r.id === it.id);
    assert.equal(Number(row.stockOnHand), 8);
    assert.equal(row.stockValue, 100);
  });
});

describe('Customized Worklist shows names for Unit / Current Account ids', () => {
  const rows = () => new WorklistRowsService(prisma, new WorklistFieldsService());

  test('Yarn card: UnitId shows the Base Unit name from the Unit tab; CurrentAccountId shows the account name', async () => {
    const acc = await account('Acme Yarns Ltd');
    const kg = await unitSetItem('KG');
    const id = await item('YARN', acc);
    await itemUnit(id, kg, 1, 1, true);
    const [{ code }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "InventoryCode" code FROM "IM_Item" WHERE "RecId" = $1`, id);
    const res: any = await rows().resolve('yarn-card-list', [{ source: 'yarn-card', key: 'UnitId' }, { source: 'yarn-card', key: 'CurrentAccountId' }], code, { page: 1, pageSize: 10 } as any);
    const r = res.rows.find((x: any) => Number(x.RecId) === id);
    assert.equal(r['yarn-card:UnitId'], 'KG', 'the legacy IM_Item.UnitId is empty — the unit comes from the Unit tab');
    assert.equal(r['yarn-card:CurrentAccountId'], 'Acme Yarns Ltd');
    assert.equal(Number(r.CurrentAccountId), acc, 'the raw id stays on the row');
  });

  test('Fabric and Trim cards now offer Unit, shown as the Base Unit name', async () => {
    for (const [primary, source, accessCode] of [['fabric-card-list', 'fabric-card', 'FABRIC'], ['trim-inventory-card-list', 'trim-inventory-card', 'TRIM']] as const) {
      assert.ok(new WorklistFieldsService().list(primary).find((s) => s.source === source)!.fields.includes('UnitId'));
      const m = await unitSetItem('MTR');
      const id = await item(accessCode);
      await itemUnit(id, m, 1, 1, true);
      const [{ code }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "InventoryCode" code FROM "IM_Item" WHERE "RecId" = $1`, id);
      const res: any = await rows().resolve(primary, [{ source, key: 'UnitId' }], code, { page: 1, pageSize: 10 } as any);
      assert.equal(res.rows.find((x: any) => Number(x.RecId) === id)[`${source}:UnitId`], 'MTR');
    }
  });

  test('an item with no unit anywhere shows blank, not a misleading value', async () => {
    const id = await item('YARN');
    const [{ code }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "InventoryCode" code FROM "IM_Item" WHERE "RecId" = $1`, id);
    const res: any = await rows().resolve('yarn-card-list', [{ source: 'yarn-card', key: 'UnitId' }], code, { page: 1, pageSize: 10 } as any);
    assert.equal(res.rows.find((x: any) => Number(x.RecId) === id)['yarn-card:UnitId'], null);
  });

  test('receipt lists (self source) and Receipt & Master Data (joined source) show the account name', async () => {
    const acc = await account('Global Fabrics Co');
    const rid = await receipt(2, '2026-01-10', { currentAccountId: acc });
    const [{ no }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "ReceiptNo" no FROM "IM_Receipt" WHERE "RecId" = $1`, rid);
    const self: any = await rows().resolve('purchase-receipt', [{ source: 'purchase-receipt', key: 'CurrentAccountId' }], no, { page: 1, pageSize: 10 } as any);
    assert.equal(self.rows.find((x: any) => Number(x.RecId) === rid)['purchase-receipt:CurrentAccountId'], 'Global Fabrics Co');
    const joined: any = await rows().resolve('purchase-receipt', [{ source: 'current-account', key: 'CurrentAccountName' }], no, { page: 1, pageSize: 10 } as any);
    assert.equal(joined.rows.find((x: any) => Number(x.RecId) === rid)['current-account:CurrentAccountName'], 'Global Fabrics Co', 'existing joined fields unchanged');
  });

  test('Unit and Current Account are selectable on every inventory card worklist', () => {
    const fields = (primary: string, source: string) => new WorklistFieldsService().list(primary).find((s) => s.source === source)!.fields;
    for (const [primary, source] of [['yarn-card-list', 'yarn-card'], ['fabric-card-list', 'fabric-card'], ['trim-inventory-card-list', 'trim-inventory-card']]) {
      assert.ok(fields(primary, source).includes('UnitId'), `${source} offers Unit`);
      assert.ok(fields(primary, source).includes('CurrentAccountId'), `${source} offers Current Account`);
    }
    for (const key of ['unit', 'currentAccount', 'stockOnHand', 'stockValue']) {
      assert.ok(fields('inventory-card-list', 'inventory-card').includes(key), `Inventory Card list offers ${key}`);
    }
  });

  test('the combined Inventory Card list rows carry the Current Account name and the Unit name', async () => {
    const acc = await account('Combined List Supplier');
    const kg = await unitSetItem('KG');
    const id = await item('TRIM', acc);
    await itemUnit(id, kg, 1, 1, true);
    const [{ code }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "InventoryCode" code FROM "IM_Item" WHERE "RecId" = $1`, id);
    const res: any = await new InventoryCardService(prisma).list({ search: code }, { page: 1, pageSize: 10 } as any);
    const row = res.rows.find((r: any) => r.id === id);
    assert.equal(row.currentAccount, 'Combined List Supplier');
    assert.equal(row.unit, 'KG');
    assert.equal(row.stockUnit, 'KG');
  });

  test('other columns are untouched', async () => {
    const id = await item('YARN');
    const [{ code }] = await prisma.$queryRawUnsafe<any[]>(`SELECT "InventoryCode" code FROM "IM_Item" WHERE "RecId" = $1`, id);
    const res: any = await rows().resolve('yarn-card-list', [{ source: 'yarn-card', key: 'InventoryCode' }], code, { page: 1, pageSize: 10 } as any);
    assert.equal(res.rows.find((x: any) => Number(x.RecId) === id)['yarn-card:InventoryCode'], code);
  });
});
