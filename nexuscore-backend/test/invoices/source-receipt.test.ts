// Invoice Create New → Source Receipt (InvoiceService.sourceReceiptTypes / sourceReceipts /
// sourceReceipt, and create() with copyReceiptHeader): for every one of the 18 invoice types the
// only source receipt type is its own (the existing IM_Invoice.ReceiptType = IM_Receipt.ReceiptType
// rule); the Receipt No. list holds only that type's saved receipts with lines, of the running
// company, searchable; an already-invoiced receipt carries its invoice; the picked receipt's saved
// header becomes the new invoice's (reviewed fields kept, the rest copied), its lines stay the
// receipt's, a second invoice for it is refused, and the saved invoice reopens with the same data.
// Throwaway test database only (`npm run test:invoices`).
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
import { RECEIPT_TYPES, invoiceSourceReceiptTypes } from '../../src/modules/legacy-erp/receipt-types.config';
import { LegacyCompanyContext } from '../../src/modules/legacy-erp/legacy-company-context.service';
import { runAsLegacyCompany } from '../../src/modules/legacy-erp/legacy-company-scope';

let prisma: PrismaService;
let receipts: InventoryReceiptService;
let invoices: InvoiceService;
let account: number;
let shipTo: number;
let wh: number;
let outWh: number;
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const SCREEN_KEYS = RECEIPT_TYPES.map((t) => screenKeyFor(t.receiptType));
let savedConfigs: any[] = [];
const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.rows ?? []);
const page = { page: 1, pageSize: 50, sortBy: 'receiptNo', sortDir: 'asc' } as any;
const statusOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: any) => String(e?.getStatus?.() ?? e?.message));

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  receipts = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), new LegacyMasterLookupService(prisma, null as any),
    new DeleteDependencyService(prisma), new ReceiptTraceabilityService(prisma), audit);
  invoices = new InvoiceService(prisma, audit);
  account = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('S-')}, ${uniq('Source Supplier ')}, 0) RETURNING "RecId" as id`);
  shipTo = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('C-')}, 'Ship To', 0) RETURNING "RecId" as id`);
  wh = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (1, ${uniq('W')}, 'source store', 0) RETURNING "RecId" as id`);
  outWh = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (1, ${uniq('W')}, 'out store', 0) RETURNING "RecId" as id`);
  savedConfigs = await prisma.approvalConfiguration.findMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
});
after(async () => {
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  for (const c of savedConfigs) await prisma.approvalConfiguration.create({ data: c });
  await prisma.$disconnect();
});

/** A saved receipt of `type` (document `doc`) with `lines` lines. */
async function receiptOf(type: number, doc: string, lines = 1) {
  const prefix = RECEIPT_TYPES.find((t) => t.receiptType === type)!.numberPrefix;
  const r: any = await receipts.create({ receiptDate: '2026-08-23', documentNo: doc, currentAccountId: account, inWarehouseId: wh }, USER, type, prefix);
  for (let i = 0; i < lines; i++) {
    const item = await one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (1, ${uniq('I-')}, 'Item', 'TRIM', 0) RETURNING "RecId" as id`);
    await receipts.createItem(r.id, { inventoryId: item, quantity: 2, unitPrice: 10, itemTotal: 20, netItemTotal: 20 }, USER, type);
  }
  return { id: Number(r.id), no: r.receiptNo as string };
}

describe('invoice Create New → Source Receipt', () => {
  test('mapping: each of the 18 invoice types has exactly one source receipt type — its own', () => {
    assert.equal(RECEIPT_TYPES.length, 18);
    for (const t of RECEIPT_TYPES) {
      assert.deepEqual(invoices.sourceReceiptTypes(t.receiptType), [{ receiptType: t.receiptType, label: t.label }], `type ${t.receiptType}`);
      assert.deepEqual(invoiceSourceReceiptTypes(t.receiptType), [t.receiptType]);
    }
    assert.throws(() => invoices.sourceReceiptTypes(999), /Unknown receipt type/);
  });

  test("all 18 types: Receipt No. lists only that type's saved receipts with lines (no other type, no empty or deleted receipt)", async () => {
    const doc = uniq('SRC-');
    const made = new Map<number, { id: number; no: string }>();
    for (const t of RECEIPT_TYPES) made.set(t.receiptType, await receiptOf(t.receiptType, doc));
    const empty = await receiptOf(2, doc, 0);
    const deleted = await receiptOf(2, doc);
    await prisma.$executeRaw`UPDATE "IM_Receipt" SET "IsDeleted" = 1 WHERE "RecId" = ${deleted.id}`;
    for (const t of RECEIPT_TYPES) {
      const res: any = await invoices.sourceReceipts(t.receiptType, t.receiptType, doc, page);
      const rows = rowsOf(res);
      assert.deepEqual(rows.map((r) => Number(r.id)), [made.get(t.receiptType)!.id], `type ${t.receiptType}`);
      assert.equal(rows[0].receiptNo, made.get(t.receiptType)!.no);
      assert.equal(Number(rows[0].lines), 1);
      assert.equal(rows[0].invoiceId ?? null, null);
    }
    // Another type as the source of a Purchase Receipt invoice is refused, not listed.
    assert.equal(await statusOf(invoices.sourceReceipts(2, 11, doc, page)), '400');
    assert.ok(!rowsOf(await invoices.sourceReceipts(2, 2, doc, page)).some((r) => [empty.id, deleted.id].includes(Number(r.id))));
  });

  test('search by receipt no, document and current account', async () => {
    const doc = uniq('FIND-');
    const a = await receiptOf(11, doc);
    for (const term of [a.no, doc]) assert.deepEqual(rowsOf(await invoices.sourceReceipts(11, 11, term, page)).map((r) => Number(r.id)), [a.id], term);
    const [acc] = await prisma.$queryRaw<any[]>`SELECT "CurrentAccountName" n FROM "FI_Account" WHERE "RecId" = ${account}`;
    assert.ok(rowsOf(await invoices.sourceReceipts(11, 11, acc.n, page)).some((r) => Number(r.id) === a.id));
  });

  test("picking a receipt: its saved header and lines become the invoice's; saved, it reopens the same; no second invoice", async () => {
    const doc = uniq('PICK-');
    const r = await receiptOf(11, doc, 2);
    await prisma.$executeRaw`UPDATE "IM_Receipt" SET "Explanation" = 'from receipt', "SpecialCode" = 'SC-9', "ShipToCurrentAccountId" = ${shipTo}, "OutWarehouseId" = ${outWh}, "ReceiptTime" = '2026-08-23 10:30:00' WHERE "RecId" = ${r.id}`;
    const linesBefore = await prisma.$queryRaw<any[]>`SELECT "RecId", "Quantity"::float q, "NetItemTotal"::float t FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${r.id} ORDER BY 1`;

    const pre: any = await invoices.sourceReceipt(11, r.id);
    assert.equal(pre.receiptNo, r.no);
    assert.equal(pre.documentNo, doc);
    assert.equal(Number(pre.currentAccountId), account);
    assert.equal(Number(pre.inWarehouseId), wh);
    assert.equal(pre.explanation, 'from receipt');
    assert.equal(pre.specialCode, 'SC-9');
    assert.equal(Number(pre.lines), 2);
    assert.equal(pre.invoiceId ?? null, null);

    // The screen's Save: the reviewed fields (one edited) plus copyReceiptHeader.
    const inv: any = await invoices.create(11, {
      receiptDate: '2026-08-23', documentNo: `${doc}-REV`, currentAccountId: account, inWarehouseId: wh, inventoryReceiptId: r.id,
      explanation: pre.explanation, specialCode: pre.specialCode, eximInvoiceNo: null, customerOrderNo: null, isEximReceipt: 0,
    }, USER, undefined, { copyReceiptHeader: true });
    const [row] = await prisma.$queryRaw<any[]>`SELECT * FROM "IM_Invoice" WHERE "RecId" = ${Number(inv.id)}`;
    assert.equal(row.DocumentNo, `${doc}-REV`, 'the reviewed value is kept');
    assert.equal(Number(row.ShipToCurrentAccountId), shipTo, 'other saved header columns are copied');
    assert.equal(Number(row.OutWarehouseId), outWh);
    assert.equal(new Date(row.ReceiptTime).getTime(), new Date(String((await prisma.$queryRaw<any[]>`SELECT "ReceiptTime" t FROM "IM_Receipt" WHERE "RecId" = ${r.id}`)[0].t)).getTime());
    assert.equal(Number(row.ReceiptType), 11);
    assert.equal(Number(row.GrandTotal), 40, 'totals from the receipt lines');

    const reopened: any = await invoices.get(Number(inv.id), 11);
    assert.equal(Number(reopened.inventoryReceiptId), r.id);
    assert.equal(reopened.documentNo, `${doc}-REV`);
    assert.equal(reopened.inventoryReceiptNo, r.no);
    assert.deepEqual(await prisma.$queryRaw<any[]>`SELECT "RecId", "Quantity"::float q, "NetItemTotal"::float t FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${r.id} ORDER BY 1`, linesBefore, 'lines untouched, none copied');

    // Now invoiced: listed with its invoice, the header lookup says so, and a second invoice is refused.
    const [listed] = rowsOf(await invoices.sourceReceipts(11, 11, r.no, page));
    assert.deepEqual([Number(listed.invoiceId), listed.invoiceNo], [Number(inv.id), inv.receiptNo]);
    assert.equal(Number((await invoices.sourceReceipt(11, r.id) as any).invoiceId), Number(inv.id));
    assert.equal(await statusOf(invoices.create(11, { inventoryReceiptId: r.id }, USER, undefined, { copyReceiptHeader: true })), '409');
    const [{ n }] = await prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM "IM_Invoice" WHERE "InventoryReceiptId" = ${r.id} AND COALESCE("IsDeleted", 0) = 0`;
    assert.equal(n, 1);
  });

  test("another type's receipt can't be picked; another company sees none of these receipts", async () => {
    const doc = uniq('ISO-');
    const r = await receiptOf(2, doc);
    assert.equal(await statusOf(invoices.sourceReceipt(11, r.id)), '400');
    const bId = await one(Prisma.sql`INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID") VALUES (${uniq('B').slice(0, 25)}, 'B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
    const B: LegacyCompanyContext = { companyId: 'b', legacyCompanyId: bId, workplaceId: 1 };
    assert.equal(rowsOf(await runAsLegacyCompany(B, () => invoices.sourceReceipts(2, 2, doc, page))).length, 0);
    assert.equal(await runAsLegacyCompany(B, () => statusOf(invoices.sourceReceipt(2, r.id))), '404');
  });
});
