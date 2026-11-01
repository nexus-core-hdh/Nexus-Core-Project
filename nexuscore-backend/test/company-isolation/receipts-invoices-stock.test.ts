// Company isolation — receipts (every route the receipt screens use), receipt lines / variants /
// attachments, receipt traceability, invoices, stock on hand, valuation, the item statement and the
// report builder's Legacy ERP sources, between two real legacy companies on the throwaway test
// database (`npm run test:company-isolation`). Company A = legacy company 1, company B = a legacy
// company created here. Each side: its own documents are stamped with its company + workplace,
// the other side's are "not found" (never 403 — ids can't be probed), its masters / orders /
// source receipts can't be linked, and stock and value only count its own receipts.
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
import { InventoryReceiptService } from '../../src/modules/legacy-erp/inventory-receipt.service';
import { InventoryReceiptAttachmentsService } from '../../src/modules/legacy-erp/inventory-receipt-attachments.service';
import { InvoiceService } from '../../src/modules/legacy-erp/invoice.service';
import { InventoryCardService, loadStockValuations } from '../../src/modules/legacy-erp/inventory-card.service';
import { ItemStatementService } from '../../src/modules/legacy-erp/item-statement.service';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { LegacyCompanyContext } from '../../src/modules/legacy-erp/legacy-company-context.service';
import { runAsLegacyCompany, setNonHttpLegacyCompanyDefault } from '../../src/modules/legacy-erp/legacy-company-scope';

let prisma: PrismaService;
let receipts: InventoryReceiptService;
let attachments: InventoryReceiptAttachmentsService;
let invoices: InvoiceService;
let cards: InventoryCardService;
let statement: ItemStatementService;
let reports: ReportBuilderService;
let A: LegacyCompanyContext;
let B: LegacyCompanyContext;
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const as = <T>(ctx: LegacyCompanyContext, fn: () => Promise<T>) => runAsLegacyCompany(ctx, fn);
const status = (p: Promise<unknown>): Promise<string> => p.then(() => 'ok', (e: any) => String(e?.getStatus?.() ?? e?.message));

/** One company's masters: account, warehouse, item (stamped with that company, as the app does). */
async function masters(ctx: LegacyCompanyContext) {
  const account = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${ctx.legacyCompanyId}, ${uniq('S')}, 'Supplier', 0) RETURNING "RecId" as id`);
  const warehouse = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (${ctx.legacyCompanyId}, ${uniq('W')}, 'Store', 0) RETURNING "RecId" as id`);
  const item = await one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${ctx.legacyCompanyId}, ${uniq('YRN-')}, 'Yarn', 'YARN', 0) RETURNING "RecId" as id`);
  return { account, warehouse, item };
}
let mA: Awaited<ReturnType<typeof masters>>;
let mB: Awaited<ReturnType<typeof masters>>;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  // No default company inside this suite: every call runs explicitly as A or B.
  setNonHttpLegacyCompanyDefault(null);
  for (const t of ['MD_Company', 'MD_Workplace']) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'RecId'), GREATEST((SELECT MAX("RecId") FROM "${t}"), 1))`);
  }
  const bId = await one(Prisma.sql`INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID") VALUES (${uniq('B').slice(0, 25)}, 'Company B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
  const bWp = await one(Prisma.sql`INSERT INTO "MD_Workplace" ("CompanyId", "WorkplaceCode", "WorkplaceName", "InUse", "IsDeleted", "UUID") VALUES (${bId}, ${uniq('WB').slice(0, 25)}, 'B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
  const coA = await prisma.company.create({ data: { name: uniq('A'), slug: uniq('a').toLowerCase() } });
  const coB = await prisma.company.create({ data: { name: uniq('B'), slug: uniq('b').toLowerCase() } });
  const brB = await prisma.branch.create({ data: { companyId: coB.id, name: 'B HQ' } });
  A = { companyId: coA.id, legacyCompanyId: 1, workplaceId: 1 };
  B = { companyId: coB.id, legacyCompanyId: bId, workplaceId: bWp };
  const audit = new AuditService(prisma);
  receipts = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), new LegacyMasterLookupService(prisma, null as any), new DeleteDependencyService(prisma), new ReceiptTraceabilityService(prisma), audit);
  attachments = new InventoryReceiptAttachmentsService(prisma);
  invoices = new InvoiceService(prisma, audit);
  cards = new InventoryCardService(prisma);
  statement = new ItemStatementService(prisma, cards);
  reports = new ReportBuilderService(prisma as any, { recordSafe: async () => undefined } as any);
  mA = await masters(A);
  mB = await masters(B);
  (globalThis as any).__brB = brB.id;
  // Receipt screens without an Approval Configuration here.
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { startsWith: '/legacy-erp/inventory-receipts-list' } } });
});
after(async () => {
  setNonHttpLegacyCompanyDefault({ companyId: 'test-default', legacyCompanyId: 1, workplaceId: 1 });
  await prisma.$disconnect();
});

const header = (m: typeof mA, extra: Record<string, any> = {}) => ({ receiptDate: '2026-10-31', currentAccountId: m.account, inWarehouseId: m.warehouse, ...extra });
/** A purchase receipt of `qty` of the company's item at `price`. */
async function purchase(ctx: LegacyCompanyContext, m: typeof mA, qty: number, price: number) {
  return as(ctx, async () => {
    const r: any = await receipts.create(header(m), USER, 2, 'IR');
    const line: any = await receipts.createItem(r.id, { inventoryId: m.item, quantity: qty, unitPrice: price, itemTotal: qty * price, netItemTotal: qty * price }, USER, 2);
    return { id: Number(r.id), no: r.receiptNo as string, lineId: Number(line.id) };
  });
}

describe('receipts', () => {
  test("new receipts are stamped with the creating company's legacy company and workplace", async () => {
    const a = await purchase(A, mA, 10, 5);
    const b = await purchase(B, mB, 7, 3);
    const rows = await prisma.$queryRaw<any[]>`SELECT "RecId"::int id, "CompanyId"::int c, "WorkplaceId"::int w FROM "IM_Receipt" WHERE "RecId" IN (${a.id}, ${b.id}) ORDER BY "RecId"`;
    assert.deepEqual(rows.map((r) => [r.id, r.c, r.w]), [[a.id, 1, 1], [b.id, B.legacyCompanyId, B.workplaceId]]);
  });

  test("every receipt route: the other company's receipt, lines, variants and attachments are 'not found'", async () => {
    const b = await purchase(B, mB, 4, 2);
    const vLine = await one(Prisma.sql`INSERT INTO "IM_ReceiptItemVariant" ("InventoryReceiptItemId", "ReceiptType", "InventoryId", "Quantity", "IsDeleted") VALUES (${b.lineId}, 2, ${mB.item}, 1, 0) RETURNING "RecId" as id`);
    const fromA = await as(A, async () => ({
      get: await status(receipts.get(b.id, 2)),
      byNo: await status(receipts.getByReceiptNo(b.no, 2)),
      listed: ((await receipts.list(b.no, 2)) as any[]).some((r) => r.id === b.id) ? 'listed' : 'hidden',
      items: await status(receipts.listItems(b.id)),
      update: await status(receipts.update(b.id, { documentNo: 'X' }, USER, 2)),
      remove: await status(receipts.remove(b.id, USER, 2)),
      approve: await status(receipts.approve(b.id, 'u', undefined, 2)),
      unapprove: await status(receipts.unapprove(b.id, 'u', 2)),
      approvalStatus: await status(receipts.getApprovalStatus(b.id, 2)),
      related: await status(receipts.listRelatedReceipts(b.id, 2)),
      addLine: await status(receipts.createItem(b.id, { inventoryId: mA.item, quantity: 1 }, USER, 2)),
      editLine: await status(receipts.updateItem(b.lineId, { quantity: 99 }, USER, b.id, 2)),
      deleteLine: await status(receipts.removeItem(b.lineId, USER, b.id)),
      variants: await status(receipts.listItemVariantLines(b.lineId)),
      editVariant: await status(receipts.updateItemVariantLine(vLine, { quantity: 9 }, USER)),
      deleteVariant: await status(receipts.removeItemVariantLine(vLine, USER)),
      attList: await status(attachments.list(b.id, 'document')),
      attUpload: await status(attachments.upload(b.id, { kind: 'document', fileName: 'x.pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' }, USER)),
    }));
    assert.deepEqual(fromA, {
      get: '404', byNo: '404', listed: 'hidden', items: '404', update: '404', remove: '404', approve: '404', unapprove: '404',
      approvalStatus: '404', related: '404', addLine: '404', editLine: '404', deleteLine: '404', variants: '404', editVariant: '404',
      deleteVariant: '404', attList: '404', attUpload: '404',
    });
    // Nothing of B's changed.
    const [row] = await prisma.$queryRaw<any[]>`SELECT "IsDeleted"::int d, COALESCE("IsApproved",0)::int a, "DocumentNo" doc FROM "IM_Receipt" WHERE "RecId" = ${b.id}`;
    assert.deepEqual([row.d, row.a, row.doc], [0, 0, null]);
    const [line] = await prisma.$queryRaw<any[]>`SELECT "Quantity"::float q, "IsDeleted"::int d FROM "IM_ReceiptItem" WHERE "RecId" = ${b.lineId}`;
    assert.deepEqual([line.q, line.d], [4, 0]);
    // B itself still has full access.
    assert.equal(await status(as(B, () => receipts.listItems(b.id))), 'ok');
  });

  test("the other company's account, warehouse, item, Subcontract Order and colour can't be used", async () => {
    const soA = await one(Prisma.sql`INSERT INTO "IM_OrderReceipt" ("CompanyId", "ReceiptNo", "ReceiptType", "IsDeleted") VALUES (1, ${uniq('SO-')}, 3, 0) RETURNING "RecId" as id`);
    const b = await purchase(B, mB, 1, 1);
    const colorA = await prisma.colorCard.create({ data: { code: uniq('CA'), name: 'A colour', color: '#111111', branchId: (await prisma.branch.create({ data: { companyId: A.companyId, name: 'A HQ' } })).id } });
    const results = await as(B, async () => ({
      account: await status(receipts.create(header(mB, { currentAccountId: mA.account }), USER, 2, 'IR')),
      warehouse: await status(receipts.create(header(mB, { inWarehouseId: mA.warehouse }), USER, 2, 'IR')),
      order: await status(receipts.update(b.id, { scriptId: soA }, USER, 2)),
      item: await status(receipts.createItem(b.id, { inventoryId: mA.item, quantity: 1 }, USER, 2)),
      colour: await status(receipts.createItem(b.id, { inventoryId: mB.item, quantity: 1, colorCardId: colorA.id }, USER, 2)),
    }));
    assert.deepEqual(results, { account: '400', warehouse: '400', order: '400', item: '400', colour: '400' });
  });

  test("a Purchase Return can't import the other company's receipt lines (not offered, and refused)", async () => {
    const a = await purchase(A, mA, 5, 1);
    const offeredToB = await as(B, () => receipts.listRelatedImportable(mA.account));
    assert.equal(offeredToB.length, 0, "A's lines are not offered to B (even for A's account id)");
    const ret: any = await as(B, () => receipts.create(header(mB), USER, 122, 'PRN'));
    assert.equal(await status(as(B, () => receipts.createItem(ret.id, { inventoryId: mB.item, quantity: 1, purchaseReceiptItemId: a.lineId }, USER, 122))), '400');
  });
});

describe('stock, valuation, item statement', () => {
  test("each company's stock and value count only its own receipts; A's figures are unchanged by B's activity", async () => {
    const itemA = mA.item;
    const before = await as(A, async () => ({ stock: await cards.getStockOnHand(itemA), val: (await loadStockValuations(prisma, [itemA])).get(itemA) }));
    // B receives stock of its own item — and also at a price that would win "latest price" if mixed.
    await purchase(B, mB, 100, 999);
    const after = await as(A, async () => ({ stock: await cards.getStockOnHand(itemA), val: (await loadStockValuations(prisma, [itemA])).get(itemA) }));
    assert.deepEqual(after, before, "A's stock and value unchanged");
    // B's item: stock is only B's receipts; A sees none of it.
    const bStock = await as(B, () => cards.getStockOnHand(mB.item));
    const [{ q }] = await prisma.$queryRaw<any[]>`SELECT COALESCE(SUM(ri."Quantity"),0)::float q FROM "IM_ReceiptItem" ri JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" WHERE ri."InventoryId" = ${mB.item} AND ri."IsDeleted" = 0 AND r."IsDeleted" = 0 AND r."ReceiptType" = 2`;
    assert.equal(bStock, q, "B's stock = B's purchase receipts of its item");
    assert.equal(await as(A, () => cards.getStockOnHand(mB.item)), 0, "A counts none of B's receipts");
    // Combined: the per-company figures add up to the unscoped total of the item's receipts.
    assert.equal((await as(A, () => cards.getStockOnHand(mB.item))) + bStock, q);
  });

  test("inventory card list and item statement: each company sees only its own items and movements", async () => {
    const listA = await as(A, () => cards.list({ search: 'YRN-' + RUN } as any)) as any[];
    const listB = await as(B, () => cards.list({ search: 'YRN-' + RUN } as any)) as any[];
    assert.ok(listA.every((i) => i.id !== mB.item) && listA.some((i) => i.id === mA.item));
    assert.ok(listB.every((i) => i.id !== mA.item) && listB.some((i) => i.id === mB.item));
    assert.equal(await status(as(A, () => statement.getStatement(mB.item))), '404', "B's item statement is not found for A");
    const stB: any = await as(B, () => statement.getStatement(mB.item));
    assert.ok(stB.currentStockOnHand > 0);
  });
});

describe('invoices', () => {
  test("stamped, scoped, and an invoice can only link its own company's receipt of the same type", async () => {
    const a = await purchase(A, mA, 3, 10);
    const b = await purchase(B, mB, 2, 10);
    const invB: any = await as(B, () => invoices.create(2, { inventoryReceiptId: b.id }, USER));
    const [row] = await prisma.$queryRaw<any[]>`SELECT "CompanyId"::int c, "WorkplaceId"::int w FROM "IM_Invoice" WHERE "RecId" = ${invB.id}`;
    assert.deepEqual([row.c, row.w], [B.legacyCompanyId, B.workplaceId]);
    const fromA = await as(A, async () => ({
      get: await status(invoices.get(invB.id, 2)),
      listed: ((await invoices.list(2, invB.receiptNo)) as any[]).some((v) => v.id === invB.id) ? 'listed' : 'hidden',
      update: await status(invoices.update(invB.id, 2, { documentNo: 'X' }, USER)),
      approve: await status(invoices.approve(invB.id, 2, 'u')),
      remove: await status(invoices.remove(invB.id, 2, USER)),
      attach: await status(invoices.assertAttachable(invB.id, 2, true)),
      candidatesHaveB: ((await invoices.receiptCandidates(2)) as any[]).some((r) => r.id === b.id) ? 'yes' : 'no',
      linkB: await status(invoices.create(2, { inventoryReceiptId: b.id }, USER)),
    }));
    assert.deepEqual(fromA, { get: '404', listed: 'hidden', update: '404', approve: '404', remove: '404', attach: '404', candidatesHaveB: 'no', linkB: '400' });
    assert.equal(await status(as(B, () => invoices.create(2, { inventoryReceiptId: a.id }, USER))), '400', "B can't link A's receipt");
  });

  test('an invoice never creates or changes a stock movement', async () => {
    const b = await purchase(B, mB, 6, 4);
    const stock = () => as(B, () => cards.getStockOnHand(mB.item));
    const lines = () => prisma.$queryRaw<any[]>`SELECT count(*)::int n, md5(string_agg(x::text, '' ORDER BY x."RecId")) h FROM "IM_ReceiptItem" x WHERE x."InventoryReceiptId" = ${b.id}`;
    const [s0, l0] = [await stock(), await lines()];
    const inv: any = await as(B, () => invoices.create(2, { inventoryReceiptId: b.id }, USER));
    await as(B, () => invoices.update(inv.id, 2, { documentNo: 'D' }, USER));
    await as(B, () => invoices.approve(inv.id, 2, 'u'));
    await as(B, () => invoices.unapprove(inv.id, 2, 'u'));
    await as(B, () => invoices.remove(inv.id, 2, USER));
    assert.equal(await stock(), s0);
    assert.deepEqual(await lines(), l0);
  });
});

describe('report builder (Legacy ERP sources)', () => {
  test("Inventory Receipts / Inventory Items reports return only the running company's rows", async () => {
    const a = await purchase(A, mA, 1, 1);
    const b = await purchase(B, mB, 1, 1);
    // Filtered to one document number at a time (a preview returns at most 50 rows).
    const count = async (ctx: LegacyCompanyContext, dataSource: string, field: string, value: string) => ((await as(ctx, () => reports.preview('legacy-erp', {
      name: 'P', dataSource, columns: [{ field }], filters: [{ id: 'f', field, operator: 'equals', value }],
    } as any, {}, { id: 'u', companyId: ctx.companyId }))) as any).rows.length;
    assert.deepEqual([await count(A, 'inventory-receipts', 'receiptNo', a.no), await count(A, 'inventory-receipts', 'receiptNo', b.no)], [1, 0], "A: its receipt, not B's");
    assert.deepEqual([await count(B, 'inventory-receipts', 'receiptNo', b.no), await count(B, 'inventory-receipts', 'receiptNo', a.no)], [1, 0], "B: its receipt, not A's");
    const [{ codeA }] = await prisma.$queryRaw<any[]>`SELECT "InventoryCode" "codeA" FROM "IM_Item" WHERE "RecId" = ${mA.item}`;
    const [{ codeB }] = await prisma.$queryRaw<any[]>`SELECT "InventoryCode" "codeB" FROM "IM_Item" WHERE "RecId" = ${mB.item}`;
    assert.deepEqual([await count(B, 'inventory-items', 'code', codeB), await count(B, 'inventory-items', 'code', codeA)], [1, 0], "B's item report: its item, none of A's");
  });

  test('without a company the scoped report refuses to run (fail closed)', async () => {
    await assert.rejects(reports.preview('legacy-erp', { name: 'P', dataSource: 'inventory-receipts', columns: [{ field: 'receiptNo' }] } as any, {}, { id: 'u', companyId: 'x' }), /company/i);
  });
});
