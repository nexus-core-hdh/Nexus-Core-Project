// Invoices — the legacy IM_Invoice header linked to one Inventory Receipt (invoice.service.ts), on
// every receipt type: numbering, linking (same type, one invoice per receipt, back-link
// IM_Receipt.InvoiceId), Current Account / Warehouse defaults, header fields saved and reopened,
// totals from the receipt's lines, relinking, Approve / Unapprove with the lock (invoice header,
// attachments, delete, and the receipt's lines), delete, the receipt delete guard, the Subcontract
// Order shown from the receipt, and permissions. Throwaway test database only (`npm run test:invoices`).
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
import { InvoiceController } from '../../src/modules/legacy-erp/invoice.controller';
import { InvoiceAttachmentsService } from '../../src/modules/legacy-erp/invoice-attachments.service';
import { RECEIPT_TYPES } from '../../src/modules/legacy-erp/receipt-types.config';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';
import { receiptTotals } from '../../../frontend/lib/legacy-erp/receipt-totals';

let prisma: PrismaService;
let receipts: InventoryReceiptService;
let invoices: InvoiceService;
let attachments: InvoiceAttachmentsService;
let account: number;
let warehouse: number;
let user: { id: string; companyId: string };
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const SCREEN_KEYS = RECEIPT_TYPES.map((t) => screenKeyFor(t.receiptType));
let savedConfigs: any[] = [];

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  receipts = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), new LegacyMasterLookupService(prisma, null as any),
    new DeleteDependencyService(prisma), new ReceiptTraceabilityService(prisma), audit);
  invoices = new InvoiceService(prisma, audit);
  attachments = new InvoiceAttachmentsService(prisma);
  const company = await prisma.company.create({ data: { name: `Invoices ${RUN}` } });
  const u = await prisma.user.create({ data: { companyId: company.id, name: 'invoicer', email: `invoicer-${RUN}@test.invalid`.toLowerCase(), password: 'x' } });
  user = { id: u.id, companyId: company.id };
  account = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('S-')}, 'Bhanero Textile Mills Limited', 0) RETURNING "RecId" as id`);
  warehouse = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (1, ${uniq('W')}, 'Yarn Store', 0) RETURNING "RecId" as id`);
  // Receipt screens without an Approval Configuration (put back after).
  savedConfigs = await prisma.approvalConfiguration.findMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
});
after(async () => {
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  for (const c of savedConfigs) await prisma.approvalConfiguration.create({ data: c });
  await prisma.$disconnect();
});

const item = () => one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (1, ${uniq('YRN-')}, '30/1 CVC R', 'YARN', 0) RETURNING "RecId" as id`);
const prefix = (type: number) => RECEIPT_TYPES.find((t) => t.receiptType === type)!.numberPrefix;
const status = (p: Promise<unknown>) => p.then(() => 200, (e: any) => e?.getStatus?.() ?? e?.message);
/** A receipt of `type` with the reference line: 23 × 51,000 at 18% VAT Exclusive. */
async function receipt(type: number, extra: Record<string, any> = {}) {
  const r: any = await receipts.create({ receiptDate: '2026-04-27', shipmentDate: '2026-01-29', documentNo: '340-B', currentAccountId: account, inWarehouseId: warehouse, ...extra }, USER, type, prefix(type));
  const line: any = await receipts.createItem(r.id, { inventoryId: await item(), quantity: 23, unitPrice: 51000, vatRate: 18, vatIncluded: 0, itemTotal: 1173000, netItemTotal: 1384140 }, USER, type);
  return { id: Number(r.id), no: r.receiptNo as string, lineId: Number(line.id) };
}
const backLink = async (receiptId: number) => (await prisma.$queryRaw<any[]>`SELECT "InvoiceId" AS v FROM "IM_Receipt" WHERE "RecId" = ${receiptId}`)[0].v;

describe('every receipt type has its own invoice screen data', () => {
  for (const t of RECEIPT_TYPES) {
    test(`${t.receiptType} ${t.label}: create from a receipt, save, reopen, totals, approve locks, unapprove, delete`, async () => {
      const type = t.receiptType;
      const r = await receipt(type);
      // Create: numbered per type; Current Account / Warehouse default from the receipt.
      const inv: any = await invoices.create(type, { inventoryReceiptId: r.id, documentNo: 'INV-DOC', explanation: 'First invoice', eximInvoiceNo: 'EXP-1', customerOrderNo: 'CO-1', isEximReceipt: 1 }, USER, user);
      assert.match(inv.receiptNo, new RegExp(`^INV${type}-\\d{8}$`));
      assert.deepEqual([Number(inv.receiptType), Number(inv.currentAccountId), Number(inv.inWarehouseId), Number(inv.inventoryReceiptId)], [type, account, warehouse, r.id]);
      assert.equal(Number(await backLink(r.id)), Number(inv.id), 'IM_Receipt.InvoiceId back-link');
      // The receipt's own values the invoice shows; totals = the receipt's lines (reference figures).
      const re: any = await invoices.get(inv.id, type);
      // Shipment Date is the receipt's, exactly as the receipt itself returns it.
      const own: any = await receipts.get(r.id, type);
      assert.equal(new Date(re.shipmentDate).getTime(), new Date(own.shipmentDate).getTime());
      assert.deepEqual([re.inventoryReceiptNo, re.receiptDocumentNo, re.documentNo, re.explanation, re.eximInvoiceNo, re.customerOrderNo, Number(re.isEximReceipt)],
        [r.no, '340-B', 'INV-DOC', 'First invoice', 'EXP-1', 'CO-1', 1]);
      assert.deepEqual([Number(re.subTotal), Number(re.vatAmount), Number(re.grandTotal)], [1173000, 211140, 1384140]);
      assert.equal(re.isApproved, 0, 'saving does not approve');

      // Edit and reopen; a line added on the receipt changes the stored totals on the next save.
      await receipts.createItem(r.id, { inventoryId: await item(), quantity: 2, unitPrice: 100, vatRate: 0, vatIncluded: 1, itemTotal: 200, netItemTotal: 200 }, USER, type);
      const edited: any = await invoices.update(inv.id, type, { documentNo: 'INV-DOC-2', specialCode: 'SC', isEximReceipt: 0 }, USER, user);
      assert.deepEqual([edited.documentNo, edited.specialCode, Number(edited.isEximReceipt), Number(edited.subTotal), Number(edited.grandTotal)], ['INV-DOC-2', 'SC', 0, 1173200, 1384340]);

      // Approve: locked header, attachments, delete — and the receipt's lines.
      const approved: any = await invoices.approve(inv.id, type, user.id, user);
      assert.equal(approved.isApproved, 1);
      assert.ok(approved.approvedAt);
      assert.deepEqual({
        header: await status(invoices.update(inv.id, type, { documentNo: 'X' }, USER)),
        remove: await status(invoices.remove(inv.id, type, USER)),
        attach: await status(invoices.assertAttachable(inv.id, type, true)),
        line: await status(receipts.updateItem(r.lineId, { quantity: 1 }, USER, r.id, type)),
        addLine: await status(receipts.createItem(r.id, { inventoryId: await item(), quantity: 1 }, USER, type)),
      }, { header: 409, remove: 409, attach: 409, line: 409, addLine: 409 });
      await assert.rejects(receipts.updateItem(r.lineId, { quantity: 1 }, USER, r.id, type), /on approved invoice/);
      assert.equal(await status(invoices.assertAttachable(inv.id, type, false)), 200, 'attachments still readable');

      // Unapprove restores editing (invoice and lines); delete clears the receipt's back-link.
      await invoices.unapprove(inv.id, type, user.id, user);
      await receipts.updateItem(r.lineId, { quantity: 24 }, USER, r.id, type);
      assert.equal(await status(receipts.remove(r.id, USER, type)), 409, 'a receipt on a live invoice cannot be deleted');
      await invoices.remove(inv.id, type, USER, user);
      assert.equal(await backLink(r.id), null);
      assert.equal(await status(invoices.get(inv.id, type)), 404);
    });
  }
});

describe('linking rules', () => {
  test('one invoice per receipt; the receipt must be of the invoice type; required; candidates list only free receipts', async () => {
    const r = await receipt(2);
    const inv: any = await invoices.create(2, { inventoryReceiptId: r.id }, USER, user);
    await assert.rejects(invoices.create(2, { inventoryReceiptId: r.id }, USER), /already on invoice/);
    await assert.rejects(invoices.create(122, { inventoryReceiptId: r.id }, USER), /is not a Purchase Return/);
    await assert.rejects(invoices.create(2, {}, USER), /Select the Inventory Receipt/);
    const free = await invoices.receiptCandidates(2, r.no) as any[];
    assert.equal(free.length, 0, 'an invoiced receipt is not offered');
    assert.equal((await invoices.receiptCandidates(2, r.no, inv.id) as any[]).length, 1, 'except to its own invoice');
  });

  test('relinking moves the back-link; server fields cannot be written; unknown masters refused', async () => {
    const a = await receipt(11);
    const b = await receipt(11);
    const inv: any = await invoices.create(11, { inventoryReceiptId: a.id }, USER);
    await invoices.update(inv.id, 11, { inventoryReceiptId: b.id }, USER);
    assert.deepEqual([await backLink(a.id), Number(await backLink(b.id))], [null, Number(inv.id)]);
    for (const k of ['isApproved', 'receiptNo', 'grandTotal']) assert.equal(await status(invoices.update(inv.id, 11, { [k]: 1 }, USER)), 403, k);
    assert.equal(await status(invoices.update(inv.id, 11, { currentAccountId: 987654321 }, USER)), 400);
  });

  test("Integration -> Order is the receipt's Subcontract Order (IM_Receipt.ScriptId -> IM_OrderReceipt type 3)", async () => {
    const so = await one(Prisma.sql`INSERT INTO "IM_OrderReceipt" ("CompanyId", "ReceiptNo", "ReceiptType", "CurrentAccountId", "IsDeleted") VALUES (1, ${uniq('SO-')}, 3, ${account}, 0) RETURNING "RecId" as id`);
    const r = await receipt(11, { scriptId: so });
    const inv: any = await invoices.create(11, { inventoryReceiptId: r.id }, USER);
    const [{ no }] = await prisma.$queryRaw<any[]>`SELECT "ReceiptNo" AS no FROM "IM_OrderReceipt" WHERE "RecId" = ${so}`;
    assert.deepEqual([Number(inv.orderId), inv.orderNo], [so, no]);
    // A Purchase Order (type 1) is not accepted as the receipt's Order (receipt rule, unchanged).
    const po = await one(Prisma.sql`INSERT INTO "IM_OrderReceipt" ("CompanyId", "ReceiptNo", "ReceiptType", "IsDeleted") VALUES (1, ${uniq('PO-')}, 1, 0) RETURNING "RecId" as id`);
    assert.equal(await status(receipts.update(r.id, { scriptId: po }, USER, 11)), 400);
  });

  test('approval needs lines; attachments are stored per invoice', async () => {
    const empty: any = await receipts.create({ receiptDate: '2026-04-27', currentAccountId: account, inWarehouseId: warehouse }, USER, 134, prefix(134));
    const inv: any = await invoices.create(134, { inventoryReceiptId: empty.id }, USER);
    await assert.rejects(invoices.approve(inv.id, 134, user.id), /no lines/);
    const up: any = await attachments.upload(inv.id, { kind: 'document', fileName: 'bill.pdf', dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF').toString('base64')}` }, USER);
    assert.deepEqual((await attachments.list(inv.id, 'document')).map((a: any) => a.fileName), ['bill.pdf']);
    assert.equal((await attachments.content(inv.id, up.id)).buffer.toString(), '%PDF');
  });

  test('the totals shown on screen use the same rule as the stored header totals', () => {
    const t = receiptTotals([{ quantity: 23, grossQuantity: null, itemTotal: 1173000, netItemTotal: 1384140 }, { quantity: 2, grossQuantity: '', itemTotal: 200, netItemTotal: 200 }]);
    assert.deepEqual(t, { items: 2, totalQuantity: 25, totalGrossQuantity: 0, subTotal: 1173200, vatTotal: 211140, grandTotal: 1384340 });
  });

  test('permissions: writes need invoices:*, Approve / Unapprove need approval:approve', () => {
    const route = (name: string, method: string) => {
      const handler = (InvoiceController.prototype as any)[name];
      const get = <T>(key: string) => (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, InvoiceController)) as T;
      return resolveRequiredPermissions(get, method);
    };
    assert.deepEqual(route('create', 'POST'), { kind: 'permissions', source: 'module', permissions: [{ module: 'invoices', action: 'create' }] });
    assert.deepEqual(route('update', 'PUT'), { kind: 'permissions', source: 'module', permissions: [{ module: 'invoices', action: 'update' }] });
    assert.deepEqual(route('remove', 'DELETE'), { kind: 'permissions', source: 'module', permissions: [{ module: 'invoices', action: 'delete' }] });
    for (const name of ['approve', 'unapprove']) assert.deepEqual(route(name, 'POST'), { kind: 'permissions', source: 'explicit', permissions: [{ module: 'approval', action: 'approve' }] });
  });
});

describe('audit: receipt type enforcement and duplicate prevention', () => {
  test("each type's endpoints only reach that type's invoices", async () => {
    const r = await receipt(17);
    const inv: any = await invoices.create(17, { inventoryReceiptId: r.id }, USER);
    for (const other of [2, 18, 122]) {
      assert.equal(await status(invoices.get(inv.id, other)), 404, `get as ${other}`);
      assert.equal(await status(invoices.update(inv.id, other, { documentNo: 'X' }, USER)), 404, `update as ${other}`);
      assert.equal(await status(invoices.approve(inv.id, other, user.id)), 404, `approve as ${other}`);
      assert.equal(await status(invoices.remove(inv.id, other, USER)), 404, `delete as ${other}`);
      assert.ok(!((await invoices.list(other, inv.receiptNo)) as any[]).some((x) => x.id === inv.id), `list as ${other}`);
    }
    assert.equal(await status(invoices.list(999)), 404, 'unknown invoice type');
  });

  test('simultaneous saves cannot link two invoices to the same receipt (row lock inside the transaction)', async () => {
    const r = await receipt(2);
    // Separate database connections (one PrismaService each), so the saves really run at the same time.
    const clients = [new PrismaService(), new PrismaService(), new PrismaService(), new PrismaService()];
    try {
      const audit = new AuditService(prisma);
      const results = await Promise.allSettled(clients.map((c) => new InvoiceService(c, audit).create(2, { inventoryReceiptId: r.id }, USER)));
      assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1, 'exactly one invoice created');
    } finally { await Promise.all(clients.map((c) => c.$disconnect())); }
    const [{ n }] = await prisma.$queryRaw<any[]>`SELECT count(*)::int AS n FROM "IM_Invoice" WHERE "InventoryReceiptId" = ${r.id} AND COALESCE("IsDeleted", 0) = 0`;
    assert.equal(n, 1);
    // Relinking two invoices onto one free receipt at the same time: only one wins.
    const [a, b, free] = [await receipt(2), await receipt(2), await receipt(2)];
    const ia: any = await invoices.create(2, { inventoryReceiptId: a.id }, USER);
    const ib: any = await invoices.create(2, { inventoryReceiptId: b.id }, USER);
    const [c1, c2] = [new PrismaService(), new PrismaService()];
    const audit2 = new AuditService(prisma);
    const moved = await Promise.allSettled([new InvoiceService(c1, audit2).update(ia.id, 2, { inventoryReceiptId: free.id }, USER), new InvoiceService(c2, audit2).update(ib.id, 2, { inventoryReceiptId: free.id }, USER)]);
    await Promise.all([c1.$disconnect(), c2.$disconnect()]);
    assert.equal(moved.filter((x) => x.status === 'fulfilled').length, 1);
    const [{ m }] = await prisma.$queryRaw<any[]>`SELECT count(*)::int AS m FROM "IM_Invoice" WHERE "InventoryReceiptId" = ${free.id} AND COALESCE("IsDeleted", 0) = 0`;
    assert.equal(m, 1);
  });

  test('the receipt is never copied: invoice create / update / delete leave IM_Receipt and IM_ReceiptItem row counts unchanged', async () => {
    const r = await receipt(140);
    const count = async () => (await prisma.$queryRaw<any[]>`SELECT (SELECT count(*)::int FROM "IM_Receipt") AS h, (SELECT count(*)::int FROM "IM_ReceiptItem") AS l`)[0];
    const before = await count();
    const inv: any = await invoices.create(140, { inventoryReceiptId: r.id }, USER);
    await invoices.update(inv.id, 140, { documentNo: 'D' }, USER);
    await invoices.approve(inv.id, 140, user.id);
    await invoices.unapprove(inv.id, 140, user.id);
    await invoices.remove(inv.id, 140, USER);
    assert.deepEqual(await count(), before);
  });
});
