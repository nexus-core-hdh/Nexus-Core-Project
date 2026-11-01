// Invoice lists (Legacy ERP → Invoices → <type>, receipt-invoices-list): for every one of the 18
// invoice types the list API returns that type's saved invoices only (with Receipt No, Current
// Account, Document, Status and Grand Total), only the running company's, searchable by invoice /
// receipt / account / document, sortable by every list column, with the record count — and the
// Legacy ERP menu points each type at its list. Throwaway test database (`npm run test:invoices`).
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
import { RECEIPT_TYPES } from '../../src/modules/legacy-erp/receipt-types.config';
import { invoiceMenuHref } from '../../scripts/seed-invoice-menu-items';
import { WorklistFieldsService } from '../../src/modules/legacy-erp/worklist-fields.service';
import { LegacyCompanyContext } from '../../src/modules/legacy-erp/legacy-company-context.service';
import { runAsLegacyCompany } from '../../src/modules/legacy-erp/legacy-company-scope';

let prisma: PrismaService;
let receipts: InventoryReceiptService;
let invoices: InvoiceService;
let account: number;
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const SCREEN_KEYS = RECEIPT_TYPES.map((t) => screenKeyFor(t.receiptType));
let savedConfigs: any[] = [];
const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.rows ?? []);
const page = (sortBy: string, sortDir: 'asc' | 'desc' = 'asc') => ({ page: 1, pageSize: 50, sortBy, sortDir }) as any;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  receipts = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), new LegacyMasterLookupService(prisma, null as any),
    new DeleteDependencyService(prisma), new ReceiptTraceabilityService(prisma), audit);
  invoices = new InvoiceService(prisma, audit);
  account = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('S-')}, ${uniq('List Supplier ')}, 0) RETURNING "RecId" as id`);
  savedConfigs = await prisma.approvalConfiguration.findMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
});
after(async () => {
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  for (const c of savedConfigs) await prisma.approvalConfiguration.create({ data: c });
  await prisma.$disconnect();
});

/** A receipt of `type` with one line worth `amount`, and its invoice (document `doc`). */
async function invoiceOf(type: number, amount: number, doc: string) {
  const prefix = RECEIPT_TYPES.find((t) => t.receiptType === type)!.numberPrefix;
  const r: any = await receipts.create({ receiptDate: '2026-08-23', currentAccountId: account }, USER, type, prefix);
  const item = await one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (1, ${uniq('I-')}, 'Item', 'TRIM', 0) RETURNING "RecId" as id`);
  await receipts.createItem(r.id, { inventoryId: item, quantity: 1, unitPrice: amount, itemTotal: amount, netItemTotal: amount }, USER, type);
  const inv: any = await invoices.create(type, { inventoryReceiptId: r.id, documentNo: doc }, USER);
  return { id: Number(inv.id), no: inv.receiptNo as string, receiptNo: r.receiptNo as string };
}

describe('invoice lists', () => {
  test('all 18 types: each list shows its own saved invoices (with the list columns), never another type\'s', async () => {
    assert.equal(RECEIPT_TYPES.length, 18);
    const doc = uniq('LIST-');
    const made = new Map<number, Awaited<ReturnType<typeof invoiceOf>>>();
    for (const t of RECEIPT_TYPES) made.set(t.receiptType, await invoiceOf(t.receiptType, 100 + t.receiptType, doc));
    for (const t of RECEIPT_TYPES) {
      const res: any = await invoices.list(t.receiptType, doc, page('receiptNo'));
      const rows = rowsOf(res);
      assert.deepEqual(rows.map((r) => Number(r.id)), [made.get(t.receiptType)!.id], `type ${t.receiptType}: only its own invoice`);
      assert.equal(res.total, 1, 'record count');
      const r = rows[0];
      assert.equal(r.receiptNo, made.get(t.receiptType)!.no);
      assert.equal(r.inventoryReceiptNo, made.get(t.receiptType)!.receiptNo);
      assert.match(String(r.currentAccountName), /List Supplier/);
      assert.equal(r.documentNo, doc);
      assert.equal(Number(r.grandTotal), 100 + t.receiptType);
      assert.equal(Number(r.isApproved), 0);
    }
  });

  test('search by invoice no, receipt no, account and document; sort by every list column', async () => {
    const doc = uniq('SRT-');
    const a = await invoiceOf(2, 50, doc);
    const b = await invoiceOf(2, 900, doc);
    await invoices.approve(b.id, 2, String(USER));
    for (const term of [a.no, a.receiptNo]) assert.deepEqual(rowsOf(await invoices.list(2, term, page('receiptNo'))).map((r) => Number(r.id)), [a.id], term);
    assert.equal(rowsOf(await invoices.list(2, doc, page('receiptNo'))).length, 2);
    const ids = async (sortBy: string, dir: 'asc' | 'desc') => rowsOf(await invoices.list(2, doc, page(sortBy, dir))).map((r) => Number(r.id));
    assert.deepEqual(await ids('grandTotal', 'asc'), [a.id, b.id]);
    assert.deepEqual(await ids('grandTotal', 'desc'), [b.id, a.id]);
    assert.deepEqual(await ids('isApproved', 'desc'), [b.id, a.id], 'approved first');
    for (const col of ['receiptNo', 'receiptDate', 'currentAccountName', 'inventoryReceiptNo', 'documentNo']) {
      assert.equal((await ids(col, 'asc')).length, 2, `sortable: ${col}`);
    }
  });

  test("another company's list never shows these invoices", async () => {
    const doc = uniq('ISO-');
    await invoiceOf(2, 10, doc);
    const bId = await one(Prisma.sql`INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID") VALUES (${uniq('B').slice(0, 25)}, 'B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
    const B: LegacyCompanyContext = { companyId: 'b', legacyCompanyId: bId, workplaceId: 1 };
    const res: any = await runAsLegacyCompany(B, () => invoices.list(2, doc, page('receiptNo')));
    assert.deepEqual([rowsOf(res).length, res.total], [0, 0]);
  });

  test('Customize Worklist: the invoice lists offer only the "invoice" source, and every one of its fields is on each list row', async () => {
    const sources = new WorklistFieldsService().list('receipt-invoice-list');
    assert.deepEqual(sources.map((s) => s.source), ['invoice'], 'scoped to the invoice field source');
    const fields = sources[0].fields;
    for (const f of ['ReceiptNo', 'ReceiptDate', 'DocumentNo', 'CurrentAccountId', 'InWarehouseId', 'InventoryReceiptId', 'SubTotal', 'VatAmount', 'GrandTotal', 'IsApproved']) {
      assert.ok(fields.includes(f), `field ${f}`);
    }
    const doc = uniq('WL-');
    await invoiceOf(16, 75, doc);
    const [row] = rowsOf(await invoices.list(16, doc, page('receiptNo')));
    const camel = (c: string) => c[0].toLowerCase() + c.slice(1);
    assert.deepEqual(fields.filter((f) => !(camel(f) in row)), [], 'a custom worklist column is always a field the list row carries');
    // Other screens keep their own sources (the invoice source is never offered there).
    assert.equal(new WorklistFieldsService().list('packing-list-list').some((s) => s.source === 'invoice'), false);
    assert.equal(new WorklistFieldsService().list().some((s) => s.source === 'invoice'), false, 'Receipt & Master Data (unscoped) unchanged');
  });

  test('the Invoices menu opens each type\'s list (not a blank form)', () => {
    for (const t of RECEIPT_TYPES) assert.equal(invoiceMenuHref(t.receiptType), `/legacy-erp/receipt-invoices-list?receiptType=${t.receiptType}`);
  });
});
