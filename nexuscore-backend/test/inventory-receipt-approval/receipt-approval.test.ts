// Inventory Receipts — the Approve / Unapprove lock (same workflow as the Packing List) on every
// receipt type the shared Inventory Receipt screen serves (receipt-types.config.ts RECEIPT_TYPES).
// Saving never approves; Approve needs a line and records ApprovedAt; an approved receipt rejects
// every header / line / variant / delete write (HTTP 409) straight through the service, i.e. a direct
// API call can't bypass it; Unapprove restores editing; re-approval locks again; all of it survives
// reopening. With an Approval Configuration, Unapprove sends the receipt back to Pending Approval
// (and, for Purchase Receipt, out of stock until re-approved). Throwaway test database only
// (`npm run test:receipt-approval`); Approval Configuration rows for receipt screens are put back
// exactly as found.
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
import { InventoryReceiptController } from '../../src/modules/legacy-erp/inventory-receipt.controller';
import { ReceiptTypeController } from '../../src/modules/legacy-erp/receipt-type.controller';
import { stockApprovalGateSql } from '../../src/modules/legacy-erp/inventory-card.service';
import { RECEIPT_TYPES } from '../../src/modules/legacy-erp/receipt-types.config';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';

let prisma: PrismaService;
let svc: InventoryReceiptService;
let companyId: string;
let account: number;
let warehouse: number;
const USER = 7;
let ALICE = '';
let BOB = '';
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
  svc = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), new LegacyMasterLookupService(prisma, null as any),
    new DeleteDependencyService(prisma), new ReceiptTraceabilityService(prisma), audit);
  companyId = (await prisma.company.create({ data: { name: `Receipt Approval ${RUN}` } })).id;
  // Two real users (the audit log and approval requests reference User): ALICE saves, BOB approves.
  const newUser = async (n: string) => (await prisma.user.create({ data: { companyId, name: n, email: `${n}-${RUN}@test.invalid`.toLowerCase(), password: 'x' } })).id;
  ALICE = await newUser('alice');
  BOB = await newUser('bob');
  account = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${uniq('A')}, 'Supplier', 0) RETURNING "RecId" as id`);
  warehouse = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (1, ${uniq('W')}, 'Main', 0) RETURNING "RecId" as id`);
  // Every receipt screen starts without an Approval Configuration; the originals come back after.
  savedConfigs = await prisma.approvalConfiguration.findMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
});
after(async () => {
  await prisma.approvalConfiguration.deleteMany({ where: { screenKey: { in: SCREEN_KEYS } } });
  for (const c of savedConfigs) await prisma.approvalConfiguration.create({ data: c });
  await prisma.$disconnect();
});

const item = () => one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (1, ${uniq('I')}, 'Fabric', 'FABRIC', 0) RETURNING "RecId" as id`);
const status = async (p: Promise<unknown>) => p.then(() => 200, (e: any) => e?.getStatus?.() ?? e?.message);
const lineRows = (id: number) => prisma.$queryRaw<any[]>`
  SELECT "RecId"::int AS id, "Quantity"::float AS qty, "Explanation" AS expl FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${id} AND COALESCE("IsDeleted", 0) = 0 ORDER BY "RecId"`;
const headerRow = async (id: number) => (await prisma.$queryRaw<any[]>`
  SELECT COALESCE("IsApproved", 0)::int AS approved, "ApprovedAt" AS "approvedAt", "DocumentNo" AS doc, COALESCE("IsDeleted", 0)::int AS deleted FROM "IM_Receipt" WHERE "RecId" = ${id}`)[0];
/** A raw variant line on the receipt's line (no IM_ItemVariant master needed to test the lock). */
const variantLine = (itemId: number, inv: number, type: number) => one(Prisma.sql`
  INSERT INTO "IM_ReceiptItemVariant" ("InventoryReceiptItemId", "ReceiptType", "InventoryId", "Quantity", "IsDeleted") VALUES (${itemId}, ${type}, ${inv}, 1, 0) RETURNING "RecId" as id`);

/** Create (as the screen's Save does) with one line; returns ids. */
async function newReceipt(type: number) {
  const cfg = RECEIPT_TYPES.find((t) => t.receiptType === type)!;
  const created: any = await svc.create({ receiptDate: '2026-10-31', currentAccountId: account, inWarehouseId: warehouse }, USER, type, cfg.numberPrefix, ALICE, companyId);
  const inv = await item();
  const line: any = await svc.createItem(created.id, { inventoryId: inv, quantity: 10, explanation: 'first' }, USER, type, ALICE, companyId);
  return { id: Number(created.id), lineId: Number(line.id), inv, created };
}

describe('every receipt type: save ≠ approve; approve locks; unapprove unlocks; re-approve locks again', () => {
  for (const t of RECEIPT_TYPES) {
    test(`${t.receiptType} ${t.label}`, async () => {
      const type = t.receiptType;
      const { id, lineId, inv, created } = await newReceipt(type);
      assert.equal(Number(created.isApproved ?? 0), 0, 'Save (create) leaves it Unapproved');
      await svc.update(id, { documentNo: 'D1' }, USER, type, ALICE, companyId);
      assert.equal((await headerRow(id)).approved, 0, 'Save (update) leaves it Unapproved');
      assert.equal(await status(svc.update(id, { isApproved: true }, USER, type)), 403, 'Is Approved cannot be set by a PUT');
      assert.equal(await status(svc.create({ receiptDate: '2026-10-31', currentAccountId: account, inWarehouseId: warehouse, isApproved: 1 }, USER, type, t.numberPrefix)), 403);

      // Approve: badge data (approvedAt), persisted, and the reopened record says so.
      const approved: any = await svc.approve(id, ALICE, undefined, type, companyId);
      assert.equal(Number(approved.isApproved), 1);
      assert.ok(approved.approvedAt, 'approval date recorded');
      const reopened: any = await svc.get(id, type);
      assert.equal(Number(reopened.isApproved), 1);
      assert.equal(String(reopened.approvedAt), String(approved.approvedAt));

      // Locked: every write the controllers expose is refused with 409, and nothing changes.
      const vLine = await variantLine(lineId, inv, type);
      const before = { header: await headerRow(id), lines: await lineRows(id) };
      const refused = {
        updateHeader: await status(svc.update(id, { documentNo: 'CHANGED' }, USER, type)),
        addLine: await status(svc.createItem(id, { inventoryId: inv, quantity: 1 }, USER, type)),
        editLine: await status(svc.updateItem(lineId, { quantity: 99 }, USER, id, type)),
        deleteLine: await status(svc.removeItem(lineId, USER, id)),
        addVariant: await status(svc.createItemVariantLine(lineId, { inventoryVariantId: 1, quantity: 1 }, USER, type)),
        editVariant: await status(svc.updateItemVariantLine(vLine, { quantity: 5 }, USER)),
        deleteVariant: await status(svc.removeItemVariantLine(vLine, USER)),
        deleteReceipt: await status(svc.remove(id, USER, type)),
        resubmit: await status(svc.submitForApproval(id, ALICE, type)),
      };
      assert.deepEqual(refused, { updateHeader: 409, addLine: 409, editLine: 409, deleteLine: 409, addVariant: 409, editVariant: 409, deleteVariant: 409, deleteReceipt: 409, resubmit: 409 });
      await assert.rejects(svc.update(id, { documentNo: 'X' }, USER, type), /is approved — unapprove it before changing it/);
      assert.deepEqual({ header: await headerRow(id), lines: await lineRows(id) }, before, 'nothing written while approved');
      assert.equal(Number((await svc.approve(id, ALICE, undefined, type, companyId) as any).isApproved), 1, 'approving again is a no-op');

      // Unapprove: editing back — add, change and remove lines, change the header.
      const reopenedForEdit: any = await svc.unapprove(id, ALICE, type, companyId);
      assert.equal(Number(reopenedForEdit.isApproved), 0);
      assert.equal(reopenedForEdit.approvedAt, null);
      await svc.update(id, { documentNo: 'D2' }, USER, type);
      await svc.updateItem(lineId, { quantity: 12, explanation: 'edited' }, USER, id, type);
      const added: any = await svc.createItem(id, { inventoryId: inv, quantity: 3, explanation: 'second' }, USER, type);
      await svc.removeItemVariantLine(vLine, USER);
      const third: any = await svc.createItem(id, { inventoryId: inv, quantity: 1, explanation: 'third' }, USER, type);
      await svc.removeItem(Number(third.id), USER, id);
      assert.deepEqual((await lineRows(id)).map((l) => [l.id, l.qty, l.expl]), [[lineId, 12, 'edited'], [Number(added.id), 3, 'second']]);

      // Re-approve locks again; still locked when reopened.
      await svc.approve(id, ALICE, undefined, type, companyId);
      assert.equal(await status(svc.createItem(id, { inventoryId: inv, quantity: 1 }, USER, type)), 409);
      const final: any = await svc.get(id, type);
      assert.deepEqual([Number(final.isApproved), final.documentNo], [1, 'D2']);
      assert.equal((await svc.listItems(id) as any[]).length, 2);
    });
  }
});

describe('approval rules', () => {
  test('Approve needs at least one line; Unapprove of an unapproved receipt changes nothing', async () => {
    const created: any = await svc.create({ receiptDate: '2026-10-31', currentAccountId: account, inWarehouseId: warehouse }, USER, 2, 'IR');
    await assert.rejects(svc.approve(created.id, ALICE, undefined, 2), /at least one line/);
    assert.equal((await headerRow(created.id)).approved, 0);
    assert.equal(Number((await svc.unapprove(created.id, ALICE, 2) as any).isApproved), 0);
  });

  test('Approve / Unapprove are logged with the real user (Log Tracking)', async () => {
    const { id } = await newReceipt(122);
    await svc.approve(id, ALICE, undefined, 122, companyId);
    await svc.unapprove(id, BOB, 122, companyId);
    const logs = await prisma.auditLog.findMany({ where: { entityType: 'IM_Receipt', entityId: String(id), action: { in: ['approve', 'unapprove'] } }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(logs.map((l: any) => [l.action, l.changedBy]), [['approve', ALICE], ['unapprove', BOB]]);
  });

  test('locking moves no stock on a screen without Approval Configuration (stock is never gated on Is Approved)', async () => {
    const { id } = await newReceipt(2);
    const counted = async () => (await prisma.$queryRaw<any[]>(Prisma.sql`SELECT count(*)::int AS n FROM "IM_Receipt" r WHERE r."RecId" = ${id} AND ${stockApprovalGateSql('r')}`))[0].n;
    assert.equal(await counted(), 1, 'unapproved receipt counts, as before');
    await svc.approve(id, ALICE, undefined, 2, companyId);
    assert.equal(await counted(), 1);
    await svc.unapprove(id, ALICE, 2, companyId);
    assert.equal(await counted(), 1);
  });

  test('with an Approval Configuration: approver approves (locks); Unapprove → Pending (unlocked, out of stock); re-approve', async () => {
    await prisma.approvalConfiguration.create({ data: { screenKey: screenKeyFor(2), approvalRequired: true, selfApprovalAllowed: false } });
    try {
      const { id, lineId } = await newReceipt(2);
      const counted = async () => (await prisma.$queryRaw<any[]>(Prisma.sql`SELECT count(*)::int AS n FROM "IM_Receipt" r WHERE r."RecId" = ${id} AND ${stockApprovalGateSql('r')}`))[0].n;
      const request = () => svc.getApprovalStatus(id, 2) as Promise<any>;
      await svc.submitForApproval(id, ALICE, 2, companyId);
      assert.equal((await request()).status, 'pending_approval');
      assert.equal(await counted(), 0, 'pending: not in stock (unchanged rule)');
      await assert.rejects(svc.approve(id, ALICE, undefined, 2, companyId), /own submission/, 'self-approval still refused');
      await svc.approve(id, BOB, undefined, 2, companyId);
      assert.deepEqual([(await headerRow(id)).approved, (await request()).status, await counted()], [1, 'approved', 1]);
      assert.equal(await status(svc.updateItem(lineId, { quantity: 1 }, USER, id, 2)), 409, 'approved: locked');

      await svc.unapprove(id, BOB, 2, companyId);
      assert.deepEqual([(await headerRow(id)).approved, (await request()).status, await counted()], [0, 'pending_approval', 0], 'back to Pending, out of stock');
      await svc.updateItem(lineId, { quantity: 11 }, USER, id, 2);
      await svc.approve(id, ALICE, undefined, 2, companyId); // BOB reopened it, so ALICE may approve
      assert.deepEqual([(await headerRow(id)).approved, (await request()).status, await counted()], [1, 'approved', 1]);
      assert.equal((await lineRows(id))[0].qty, 11);
    } finally {
      await prisma.approvalConfiguration.deleteMany({ where: { screenKey: screenKeyFor(2) } });
    }
  });

  test('Approve and Unapprove need approval:approve on both receipt routes; writes keep their module permissions', () => {
    const route = (ctrl: any, name: string, method: string) => {
      const handler = ctrl.prototype[name];
      const get = <T>(key: string) => (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, ctrl)) as T;
      return resolveRequiredPermissions(get, method);
    };
    for (const ctrl of [InventoryReceiptController, ReceiptTypeController]) {
      for (const name of ['approve', 'unapprove']) {
        assert.deepEqual(route(ctrl, name, 'POST'), { kind: 'permissions', source: 'explicit', permissions: [{ module: 'approval', action: 'approve' }] }, `${ctrl.name}.${name}`);
      }
      assert.equal((route(ctrl, 'updateItem', 'PUT') as any).source, 'module');
    }
  });
});
