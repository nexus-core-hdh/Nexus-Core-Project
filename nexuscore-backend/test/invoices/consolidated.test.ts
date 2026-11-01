// Consolidated invoices (one IM_Invoice covering several IM_Receipt rows through the legacy
// IM_Receipt.InvoiceId link; IM_Invoice.InventoryReceiptId = the first) and the Current Account
// filter on the receipt lists: only the chosen account's receipts are offered; receipts are
// combined only for one type, one account and one company; totals / VAT are the sums of all
// included receipts' lines (no lines copied, stock unchanged); a receipt is never on two invoices
// (single, consolidated, Create Invoice, or two saves at once); approval locks every included
// receipt; the receipts can't be regrouped on update; delete frees them all.
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
import { loadStockValuations } from '../../src/modules/legacy-erp/inventory-card.service';
import { RECEIPT_TYPES } from '../../src/modules/legacy-erp/receipt-types.config';
import { LegacyCompanyContext } from '../../src/modules/legacy-erp/legacy-company-context.service';
import { runAsLegacyCompany } from '../../src/modules/legacy-erp/legacy-company-scope';

let prisma: PrismaService;
let receipts: InventoryReceiptService;
let invoices: InvoiceService;
let accA: number;
let accB: number;
let wh: number;
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
const items: number[] = [];

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  receipts = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), new LegacyMasterLookupService(prisma, null as any),
    new DeleteDependencyService(prisma), new ReceiptTraceabilityService(prisma), audit);
  invoices = new InvoiceService(prisma, audit);
  accA = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('A-')}, ${uniq('Account A ')}, 0) RETURNING "RecId" as id`);
  accB = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('B-')}, ${uniq('Account B ')}, 0) RETURNING "RecId" as id`);
  wh = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (1, ${uniq('W')}, 'store', 0) RETURNING "RecId" as id`);
  savedConfigs = await prisma.approvalConfiguration.findMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
});
after(async () => {
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  for (const c of savedConfigs) await prisma.approvalConfiguration.create({ data: c });
  await prisma.$disconnect();
});

/** A saved receipt of `type` for `account` with lines [quantity, price, vat%] (VAT exclusive). */
async function receiptOf(type: number, account: number, doc: string, lines: [number, number, number][] = [[2, 100, 0]]) {
  const prefix = RECEIPT_TYPES.find((t) => t.receiptType === type)!.numberPrefix;
  const r: any = await receipts.create({ receiptDate: '2026-08-23', documentNo: doc, currentAccountId: account, inWarehouseId: wh }, USER, type, prefix);
  for (const [q, p, vat] of lines) {
    const item = await one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (1, ${uniq('I-')}, 'Item', 'TRIM', 0) RETURNING "RecId" as id`);
    items.push(item);
    const total = q * p;
    await receipts.createItem(r.id, { inventoryId: item, quantity: q, unitPrice: p, itemTotal: total, vatRate: vat, netItemTotal: total * (1 + vat / 100) }, USER, type);
  }
  return { id: Number(r.id), no: r.receiptNo as string };
}
const form = (account: number, ids: number[], doc = uniq('INV-')) => ({ receiptDate: '2026-08-24', documentNo: doc, currentAccountId: account, inWarehouseId: wh, inventoryReceiptIds: ids });
const linesOf = (ids: number[]) => prisma.$queryRaw<any[]>`SELECT "RecId", "InventoryReceiptId", "Quantity"::float q, "UnitPrice"::float p, "ItemTotal"::float t, "NetItemTotal"::float n, COALESCE("IsDeleted",0) d FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" IN (${Prisma.join(ids)}) ORDER BY 1`;
const invoiceIdOf = async (receiptId: number) => (await prisma.$queryRaw<any[]>`SELECT "InvoiceId" FROM "IM_Receipt" WHERE "RecId" = ${receiptId}`)[0].InvoiceId;

describe('consolidated invoices and the Current Account filter', () => {
  test('the receipt lists show only the chosen Current Account\'s receipts (by account id)', async () => {
    const doc = uniq('ACC-');
    const a1 = await receiptOf(2, accA, doc);
    const a2 = await receiptOf(2, accA, doc);
    const b1 = await receiptOf(2, accB, doc);
    const ids = async (acc?: number) => rowsOf(await invoices.sourceReceipts(2, 2, doc, page, acc)).map((r) => Number(r.id)).sort();
    assert.deepEqual(await ids(accA), [a1.id, a2.id].sort());
    assert.deepEqual(await ids(accB), [b1.id]);
    assert.deepEqual(await ids(), [a1.id, a2.id, b1.id].sort(), 'no account chosen yet: every account');
    const cand = async (acc: number) => rowsOf(await invoices.receiptCandidates(2, doc, undefined, page, acc)).map((r) => Number(r.id)).sort();
    assert.deepEqual(await cand(accA), [a1.id, a2.id].sort());
    assert.deepEqual(await cand(accB), [b1.id]);
  });

  test('one invoice for two receipts of one account: both linked both ways, totals and VAT summed, lines and stock untouched; reopened the same', async () => {
    const doc = uniq('CON-');
    const r1 = await receiptOf(2, accA, doc, [[2, 100, 18], [1, 50, 0]]);
    const r2 = await receiptOf(2, accA, doc, [[3, 10, 18]]);
    const linesBefore = await linesOf([r1.id, r2.id]);
    const stockBefore = JSON.stringify([...(await loadStockValuations(prisma, items)).entries()]);
    const inv: any = await invoices.create(2, form(accA, [r1.id, r2.id]), USER, undefined, { copyReceiptHeader: true });
    const id = Number(inv.id);
    assert.equal(Number(inv.inventoryReceiptId), r1.id, 'first receipt = IM_Invoice.InventoryReceiptId');
    assert.deepEqual([Number(await invoiceIdOf(r1.id)), Number(await invoiceIdOf(r2.id))], [id, id], 'IM_Receipt.InvoiceId on each');
    // Subtotal 200 + 50 + 30 = 280; VAT 18% of 200 and of 30 = 36 + 5.4; Grand = 321.4
    assert.deepEqual([Number(inv.subTotal), Math.round(Number(inv.vatAmount) * 100) / 100, Math.round(Number(inv.grandTotal) * 100) / 100], [280, 41.4, 321.4]);
    assert.equal(inv.inventoryReceiptNo, `${r1.no}, ${r2.no}`);
    assert.deepEqual(inv.receipts.map((r: any) => [Number(r.id), r.receiptNo, Number(r.lines)]), [[r1.id, r1.no, 2], [r2.id, r2.no, 1]]);
    assert.deepEqual(await linesOf([r1.id, r2.id]), linesBefore, 'no line added, copied or changed');
    assert.equal(JSON.stringify([...(await loadStockValuations(prisma, items)).entries()]), stockBefore, 'stock unchanged');
    const reopened: any = await invoices.get(id, 2);
    assert.deepEqual([reopened.inventoryReceiptIds, Number(reopened.grandTotal), reopened.receiptCount], [[r1.id, r2.id], Number(inv.grandTotal), 2]);
    // Found in the list by either receipt's number.
    for (const no of [r1.no, r2.no]) assert.deepEqual(rowsOf(await invoices.list(2, no, page)).map((r) => Number(r.id)), [id], no);
    // Neither receipt is offered again; the picker shows both as on this invoice.
    assert.equal(rowsOf(await invoices.receiptCandidates(2, doc, undefined, page, accA)).length, 0);
    assert.deepEqual(rowsOf(await invoices.sourceReceipts(2, 2, doc, page, accA)).map((r) => Number(r.invoiceId)), [id, id]);
  });

  test('refused: different accounts, an invoice account that is not the receipts\', another type, a deleted or empty receipt, another company', async () => {
    const doc = uniq('BAD-');
    const a = await receiptOf(2, accA, doc);
    const a2 = await receiptOf(2, accA, doc);
    const b = await receiptOf(2, accB, doc);
    const t11 = await receiptOf(11, accA, doc);
    const empty = await receiptOf(2, accA, doc, []);
    const gone = await receiptOf(2, accA, doc);
    await prisma.$executeRaw`UPDATE "IM_Receipt" SET "IsDeleted" = 1 WHERE "RecId" = ${gone.id}`;
    assert.equal(await statusOf(invoices.create(2, form(accA, [a.id, b.id]), USER)), '400', 'two accounts');
    assert.equal(await statusOf(invoices.create(2, form(accB, [a.id, a2.id]), USER)), '400', 'invoice account ≠ receipts');
    assert.equal(await statusOf(invoices.create(2, form(accA, [a.id, t11.id]), USER)), '400', 'another type');
    assert.equal(await statusOf(invoices.create(2, form(accA, [a.id, empty.id]), USER)), '400', 'no lines');
    assert.equal(await statusOf(invoices.create(2, form(accA, [a.id, gone.id]), USER)), '400', 'deleted');
    const bId = await one(Prisma.sql`INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID") VALUES (${uniq('B').slice(0, 25)}, 'B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
    const B: LegacyCompanyContext = { companyId: 'b', legacyCompanyId: bId, workplaceId: 1 };
    assert.equal(await runAsLegacyCompany(B, () => statusOf(invoices.create(2, form(accA, [a.id, a2.id]), USER))), '400', "another company's receipts don't exist for it");
    assert.equal(rowsOf(await runAsLegacyCompany(B, () => invoices.sourceReceipts(2, 2, doc, page, accA))).length, 0);
    for (const r of [a, a2, b, t11]) assert.equal(await invoiceIdOf(r.id), null, 'nothing linked by a refused create');
    assert.equal((await prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM "IM_Invoice" WHERE "DocumentNo" LIKE ${`%${doc}%`}`)[0].n, 0);
  });

  test('a receipt is never on two invoices: single after consolidated, Create Invoice, another consolidated, and simultaneous saves', async () => {
    const doc = uniq('DUP-');
    const [x, y, z, w] = [await receiptOf(2, accA, doc), await receiptOf(2, accA, doc), await receiptOf(2, accA, doc), await receiptOf(2, accA, doc)];
    const inv: any = await invoices.create(2, form(accA, [x.id, y.id]), USER);
    assert.equal(await statusOf(invoices.create(2, form(accA, [y.id]), USER)), '409', 'single for an included receipt');
    assert.equal(await statusOf(invoices.create(2, form(accA, [z.id, y.id]), USER)), '409', 'another consolidated with it');
    const fromReceipt: any = await invoices.createFromReceipt(2, y.id, USER);
    assert.deepEqual([fromReceipt.created, Number(fromReceipt.invoice.id)], [false, Number(inv.id)], 'Create Invoice opens the consolidated invoice');
    // Two saves at once over overlapping receipts: exactly one wins.
    const results = await Promise.all([invoices.create(2, form(accA, [z.id, w.id]), USER), invoices.create(2, form(accA, [w.id, z.id]), USER)].map(statusOf));
    assert.deepEqual(results.sort(), ['409', 'ok']);
    // Repeated clicks on the same set: one invoice.
    const v = await receiptOf(2, accA, doc);
    const u = await receiptOf(2, accA, doc);
    const again = await Promise.all([1, 2, 3].map(() => statusOf(invoices.create(2, form(accA, [v.id, u.id]), USER))));
    assert.equal(again.filter((s) => s === 'ok').length, 1, again.join());
    for (const r of [x, y, z, w, v, u]) {
      const [{ n }] = await prisma.$queryRaw<any[]>`SELECT count(DISTINCT v."RecId")::int n FROM "IM_Invoice" v JOIN "IM_Receipt" r ON r."RecId" = ${r.id}
        WHERE COALESCE(v."IsDeleted", 0) = 0 AND (v."RecId" = r."InvoiceId" OR v."InventoryReceiptId" = r."RecId")`;
      assert.equal(n, 1, `${r.no} is on exactly one invoice`);
    }
  });

  test('approval locks every included receipt; the receipts can\'t be regrouped; delete frees them all; a receipt on it can\'t be deleted', async () => {
    const doc = uniq('APP-');
    const r1 = await receiptOf(2, accA, doc);
    const r2 = await receiptOf(2, accA, doc, [[5, 20, 18]]);
    const inv: any = await invoices.create(2, form(accA, [r1.id, r2.id]), USER);
    const id = Number(inv.id);
    assert.equal(await statusOf(receipts.remove(r2.id, USER, 2)), '409', 'receipt on a consolidated invoice cannot be deleted');
    const upd: any = await invoices.update(id, 2, { documentNo: `${doc}-EDIT` }, USER);
    assert.deepEqual([upd.documentNo, upd.inventoryReceiptIds], [`${doc}-EDIT`, [r1.id, r2.id]], 'header edit keeps both receipts');
    assert.equal(await statusOf(invoices.update(id, 2, { inventoryReceiptId: r2.id }, USER)), '409', 'regrouping refused');
    assert.equal(await statusOf(invoices.update(id, 2, { currentAccountId: accB }, USER)), '400', 'account must stay the receipts\'');
    const approved: any = await invoices.approve(id, 2, String(USER));
    assert.equal(Number(approved.isApproved), 1);
    assert.equal(Math.round(Number(approved.grandTotal) * 100) / 100, 200 + 118);
    const item = await one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (1, ${uniq('I-')}, 'Item', 'TRIM', 0) RETURNING "RecId" as id`);
    for (const r of [r1, r2]) {
      assert.equal(await statusOf(receipts.createItem(r.id, { inventoryId: item, quantity: 1, unitPrice: 1, itemTotal: 1, netItemTotal: 1 }, USER, 2)), '409', `${r.no} locked`);
    }
    await invoices.unapprove(id, 2, String(USER));
    await invoices.remove(id, 2, USER);
    assert.deepEqual([await invoiceIdOf(r1.id), await invoiceIdOf(r2.id)], [null, null], 'both receipts freed');
    assert.equal(rowsOf(await invoices.receiptCandidates(2, doc, undefined, page, accA)).length, 2, 'both can be invoiced again');
  });

  test('a single-receipt invoice still works as before', async () => {
    const doc = uniq('ONE-');
    const r = await receiptOf(16, accA, doc);
    const inv: any = await invoices.create(16, { ...form(accA, []), inventoryReceiptIds: undefined, inventoryReceiptId: r.id }, USER);
    assert.deepEqual([Number(inv.inventoryReceiptId), inv.inventoryReceiptIds, inv.receiptCount, inv.inventoryReceiptNo], [r.id, [r.id], 1, r.no]);
    assert.equal(Number(await invoiceIdOf(r.id)), Number(inv.id));
  });
});
