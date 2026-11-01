// Create Invoice from an Inventory Receipt (its right-click menu → InvoiceService.createFromReceipt):
// the invoice is created once and linked both ways, its header is the receipt's SAVED header (every
// shared column, compared column by column against the database row), its lines / quantities /
// rates / amounts are the receipt's own (no copy) with matching totals, repeating the action opens
// the same invoice, each receipt type lands on its own invoice type, ineligible / other-company
// receipts are refused, a simultaneous double click still makes one invoice, and nothing touches
// the receipt lines or stock. Throwaway test database only (`npm run test:invoices`).
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ApprovalService } from '../../src/modules/approval/approval.service';
import { LegacyMasterLookupService } from '../../src/modules/legacy-erp/legacy-master-lookup.service';
import { DeleteDependencyService } from '../../src/modules/legacy-erp/delete-dependency.service';
import { ReceiptTraceabilityService } from '../../src/modules/legacy-erp/receipt-traceability.service';
import { InventoryReceiptService, screenKeyFor } from '../../src/modules/legacy-erp/inventory-receipt.service';
import { InvoiceService } from '../../src/modules/legacy-erp/invoice.service';
import { loadStockValuations } from '../../src/modules/legacy-erp/inventory-card.service';
import { RECEIPT_TYPES } from '../../src/modules/legacy-erp/receipt-types.config';
import { LegacyCompanyContext } from '../../src/modules/legacy-erp/legacy-company-context.service';
import { runAsLegacyCompany } from '../../src/modules/legacy-erp/legacy-company-scope';

let prisma: PrismaService;
let receipts: InventoryReceiptService;
let invoices: InvoiceService;
let account: number;
let shipTo: number;
let inWh: number;
let outWh: number;
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const SCREEN_KEYS = RECEIPT_TYPES.map((t) => screenKeyFor(t.receiptType));
let savedConfigs: any[] = [];
const statusOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: any) => `${e?.getStatus?.() ?? ''} ${e?.message}`.trim());

// The header columns the action must carry from the receipt (invoice.service.ts RECEIPT_HEADER_COPY).
const COPIED = ['WorkplaceId', 'ReceiptSubType', 'ReceiptDate', 'ReceiptTime', 'DocumentNo', 'CurrentAccountId', 'AddressId',
  'ShipToCurrentAccountId', 'ShipToAddressId', 'InWarehouseId', 'OutWarehouseId', 'CostCenterId', 'DealerId', 'CustomerId',
  'CustomerAddressId', 'PaymentPlanId', 'CustomerOrderNo', 'SpecialCode', 'AccessCode', 'EximInvoiceNo', 'ProjectId',
  'EmployeeId', 'ContactId', 'CashId', 'TransporterId', 'VehicleId', 'HasNegativeEffect', 'Explanation', 'IsTaxExempted',
  'WithholdingTypeId', 'WithholdingFactor', 'WithholdingDivisor', 'Rate1', 'Rate2', 'Rate3', 'Rate4', 'Rate5',
  'ForexId', 'ForexRate', 'IsEximReceipt', 'TypeOfShipment'];

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  receipts = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), new LegacyMasterLookupService(prisma, null as any),
    new DeleteDependencyService(prisma), new ReceiptTraceabilityService(prisma), audit);
  invoices = new InvoiceService(prisma, audit);
  account = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('S-')}, 'zain industries', 0) RETURNING "RecId" as id`);
  shipTo = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('C-')}, 'Ship To Party', 0) RETURNING "RecId" as id`);
  inWh = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (1, ${uniq('W')}, 'cutting store', 0) RETURNING "RecId" as id`);
  outWh = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (1, ${uniq('W')}, 'main store', 0) RETURNING "RecId" as id`);
  savedConfigs = await prisma.approvalConfiguration.findMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
});
after(async () => {
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  for (const c of savedConfigs) await prisma.approvalConfiguration.create({ data: c });
  await prisma.$disconnect();
});

const item = (code: string, name: string) => one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (1, ${uniq(code)}, ${name}, 'TRIM', 0) RETURNING "RecId" as id`);
const prefix = (type: number) => RECEIPT_TYPES.find((t) => t.receiptType === type)!.numberPrefix;

/** A saved receipt with a full header and two different lines (items, colors, quantities, rates, VAT). */
async function richReceipt(type: number) {
  const r: any = await receipts.create({
    receiptDate: '2026-08-23', shipmentDate: '2026-08-25', documentNo: uniq('DOC-'), plateNumber: 'LES-4411', driverName: 'Akram',
    currentAccountId: account, inWarehouseId: inWh,
  }, USER, type, prefix(type));
  // Header columns the receipt screen doesn't edit but legacy receipts carry — saved on the row so
  // the transfer of every shared column is checked against real values, not NULLs.
  await prisma.$executeRaw`UPDATE "IM_Receipt" SET "OutWarehouseId" = ${outWh}, "Explanation" = 'Thread for cutting', "SpecialCode" = 'SP-7',
    "CustomerOrderNo" = 'CO-991', "EximInvoiceNo" = 'EX-12', "ShipToCurrentAccountId" = ${shipTo}, "TypeOfShipment" = 2,
    "ReceiptSubType" = 3, "ForexRate" = 278.5, "Rate1" = 2.5, "IsEximReceipt" = 1 WHERE "RecId" = ${Number(r.id)}`;
  const lineA: any = await receipts.createItem(r.id, { inventoryId: await item('TRIM-', 'sweeing thread 50/3'), itemOrderNo: 1, quantity: 20, unitPrice: 600, vatRate: 0, vatIncluded: 0, itemTotal: 12000, netItemTotal: 12000, explanation: 'RED' }, USER, type);
  const lineB: any = await receipts.createItem(r.id, { inventoryId: await item('TRIM-', 'label woven'), itemOrderNo: 2, quantity: 7.5, unitPrice: 40, vatRate: 18, vatIncluded: 0, itemTotal: 300, netItemTotal: 354, explanation: 'NAVY' }, USER, type);
  return { id: Number(r.id), no: r.receiptNo as string, lines: [Number(lineA.id), Number(lineB.id)] };
}
const lineSnapshot = (receiptId: number) => prisma.$queryRaw<any[]>`
  SELECT "RecId", "InventoryId", "ItemOrderNo", "Quantity"::text q, "UnitPrice"::text p, "ItemTotal"::text t, "NetItemTotal"::text n, "Explanation", "IsDeleted"
  FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${receiptId} ORDER BY "RecId"`;

describe('Create Invoice from an Inventory Receipt', () => {
  test("creates one linked invoice whose header is the receipt's saved header; lines and totals are the receipt's", async () => {
    const r = await richReceipt(2);
    const linesBefore = await lineSnapshot(r.id);
    const res: any = await invoices.createFromReceipt(2, r.id, USER);
    assert.equal(res.created, true);
    assert.equal(res.receiptType, 2);
    const inv = res.invoice;
    assert.match(inv.receiptNo, /^INV2-/);
    assert.equal(Number(inv.inventoryReceiptId), r.id, 'linked to the receipt');
    assert.equal((await prisma.$queryRaw<any[]>`SELECT "InvoiceId"::int v FROM "IM_Receipt" WHERE "RecId" = ${r.id}`)[0].v, Number(inv.id), 'back-link on the receipt');

    // Every copied header column equals the receipt's saved value (database row against database row).
    const [cmp] = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.raw(COPIED.map((c) => `(v."${c}" IS NOT DISTINCT FROM r."${c}") AS "${c}"`).join(', '))},
        v."CompanyId" = r."CompanyId" AS "CompanyId", v."ReceiptType" = r."ReceiptType" AS "ReceiptType"
      FROM "IM_Invoice" v JOIN "IM_Receipt" r ON r."RecId" = v."InventoryReceiptId" WHERE v."RecId" = ${Number(inv.id)}`);
    const different = Object.entries(cmp).filter(([, same]) => !same).map(([c]) => c);
    assert.deepEqual(different, [], `header columns differing from the receipt: ${different.join(', ')}`);
    // ...and they are the values the user saved (not defaults).
    const [h] = await prisma.$queryRaw<any[]>`SELECT "DocumentNo", "OutWarehouseId"::int o, "ShipToCurrentAccountId"::int s, "CustomerOrderNo", "EximInvoiceNo", "Explanation", "SpecialCode", "TypeOfShipment"::int t, to_char("ReceiptDate", 'YYYY-MM-DD') d FROM "IM_Invoice" WHERE "RecId" = ${Number(inv.id)}`;
    assert.deepEqual([h.o, h.s, h.CustomerOrderNo, h.EximInvoiceNo, h.Explanation, h.SpecialCode, h.t], [outWh, shipTo, 'CO-991', 'EX-12', 'Thread for cutting', 'SP-7', 2]);
    assert.equal(inv.currentAccountId, account);
    assert.equal(inv.inWarehouseId, inWh);
    // Receipt-only fields (no IM_Invoice column) come through the link.
    assert.deepEqual([inv.vehicleNo, inv.driverName, inv.inventoryReceiptNo], ['LES-4411', 'Akram', r.no]);
    assert.ok(String(inv.shipmentDate ?? '').length > 0, 'Shipment Date shown from the receipt');
    // Totals = the receipt's lines: Subtotal 12,000 + 300; Grand 12,000 + 354; VAT 54.
    assert.deepEqual([Number(inv.subTotal), Number(inv.grandTotal), Number(inv.vatAmount)], [12300, 12354, 54]);
    // No line copies, receipt lines untouched.
    assert.deepEqual(await lineSnapshot(r.id), linesBefore);
  });

  test('repeating the action opens the same invoice — no second invoice, no duplicated lines, no stock change', async () => {
    const r = await richReceipt(2);
    const itemIds = (await lineSnapshot(r.id)).map((l) => Number(l.InventoryId));
    const stockBefore = JSON.stringify([...(await loadStockValuations(prisma, itemIds)).entries()]);
    const first: any = await invoices.createFromReceipt(2, r.id, USER);
    const again: any = await invoices.createFromReceipt(2, r.id, USER);
    assert.deepEqual([first.created, again.created], [true, false]);
    assert.equal(Number(again.invoice.id), Number(first.invoice.id));
    assert.equal((await prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM "IM_Invoice" WHERE "InventoryReceiptId" = ${r.id} AND "IsDeleted" = 0`)[0].n, 1);
    assert.equal((await lineSnapshot(r.id)).length, 2);
    // Edits on the invoice survive a repeat (the existing invoice is opened, not rebuilt).
    await invoices.update(Number(first.invoice.id), 2, { documentNo: 'EDITED' }, USER);
    assert.equal((await invoices.createFromReceipt(2, r.id, USER) as any).invoice.documentNo, 'EDITED');
    assert.equal(JSON.stringify([...(await loadStockValuations(prisma, itemIds)).entries()]), stockBefore, 'stock unchanged');
  });

  test('a simultaneous double click still makes exactly one invoice', async () => {
    const r = await richReceipt(2);
    const [a, b]: any[] = await Promise.all([invoices.createFromReceipt(2, r.id, USER), invoices.createFromReceipt(2, r.id, USER)]);
    assert.equal(Number(a.invoice.id), Number(b.invoice.id));
    assert.equal((await prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM "IM_Invoice" WHERE "InventoryReceiptId" = ${r.id} AND "IsDeleted" = 0`)[0].n, 1);
  });

  test('each receipt type creates its own invoice type (opened on that type\'s screen)', async () => {
    for (const type of [11, 122, 134, 22]) {
      const r = await richReceipt(type);
      const res: any = await invoices.createFromReceipt(type, r.id, USER);
      assert.equal(res.receiptType, type);
      assert.equal(Number((await prisma.$queryRaw<any[]>`SELECT "ReceiptType"::int t FROM "IM_Invoice" WHERE "RecId" = ${Number(res.invoice.id)}`)[0].t), type);
      assert.match(res.invoice.receiptNo, new RegExp(`^INV${type}-`));
    }
  });

  test('ineligible receipts are refused with a clear message and nothing is created', async () => {
    const empty: any = await receipts.create({ receiptDate: '2026-08-23', currentAccountId: account, inWarehouseId: inWh }, USER, 2, 'IR');
    assert.match(await statusOf(invoices.createFromReceipt(2, Number(empty.id), USER)), /^400 .*has no lines/);
    const r = await richReceipt(11);
    assert.match(await statusOf(invoices.createFromReceipt(2, r.id, USER)), /^400 .*is not a Purchase Receipt/);
    const gone = await richReceipt(2);
    await prisma.$executeRaw`UPDATE "IM_Receipt" SET "IsDeleted" = 1 WHERE "RecId" = ${gone.id}`;
    assert.match(await statusOf(invoices.createFromReceipt(2, gone.id, USER)), /^404/);
    const n = await prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM "IM_Invoice" WHERE "InventoryReceiptId" IN (${Number(empty.id)}, ${r.id}, ${gone.id})`;
    assert.equal(n[0].n, 0);
  });

  test("another company can't create (or open) the invoice of this company's receipt", async () => {
    const r = await richReceipt(2);
    const bId = await one(Prisma.sql`INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID") VALUES (${uniq('B').slice(0, 25)}, 'B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
    const B: LegacyCompanyContext = { companyId: 'b', legacyCompanyId: bId, workplaceId: 1 };
    assert.match(await statusOf(runAsLegacyCompany(B, () => invoices.createFromReceipt(2, r.id, USER))), /^404/);
    assert.equal((await prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM "IM_Invoice" WHERE "InventoryReceiptId" = ${r.id}`)[0].n, 0);
    const mine: any = await invoices.createFromReceipt(2, r.id, USER);
    assert.match(await statusOf(runAsLegacyCompany(B, () => invoices.createFromReceipt(2, r.id, USER))), /^404/, 'nor open it once it exists');
    assert.equal((await prisma.$queryRaw<any[]>`SELECT "CompanyId"::int c FROM "IM_Invoice" WHERE "RecId" = ${Number(mine.invoice.id)}`)[0].c, 1);
  });
});
