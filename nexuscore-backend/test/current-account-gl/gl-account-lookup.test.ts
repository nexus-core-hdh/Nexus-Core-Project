// Current Account card -> Customer / Supplier GL Account Code. Both fields are FI_Account integer
// FKs into GL_Account (the legacy Chart of Accounts), picked through the generic Master Lookup
// "gl-account" key. Runs on the throwaway test database (`npm run test:current-account-gl`).
// Checks: the picker searches GL_Account by code/name, active-only and company-scoped; the Chart
// of Accounts service (the only write path) lists/creates/edits/deactivates with company isolation
// and validation; the two selections are saved to their own columns, survive a reopen, and can be
// cleared independently.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { LegacyMasterLookupService } from '../../src/modules/legacy-erp/legacy-master-lookup.service';
import { AccountService } from '../../src/modules/legacy-erp/account.service';
import { GlAccountService } from '../../src/modules/legacy-erp/gl-account.service';
import { InventoryReceiptService } from '../../src/modules/legacy-erp/inventory-receipt.service';
import { ApprovalService } from '../../src/modules/approval/approval.service';
import { ReceiptTraceabilityService } from '../../src/modules/legacy-erp/receipt-traceability.service';
import { CreateGlAccountDto } from '../../src/modules/legacy-erp/dto/gl-account.dto';
import { DeleteDependencyService, GL_ACCOUNT_REFERENCES } from '../../src/modules/legacy-erp/delete-dependency.service';
import { GlAccountController } from '../../src/modules/legacy-erp/gl-account.controller';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LegacyCompanyContext } from '../../src/modules/legacy-erp/legacy-company-context.service';
import { runAsLegacyCompany, setNonHttpLegacyCompanyDefault } from '../../src/modules/legacy-erp/legacy-company-scope';

let prisma: PrismaService;
let lookup: LegacyMasterLookupService;
let accounts: AccountService;
let glAccounts: GlAccountService;
const audits: any[] = [];
let A: LegacyCompanyContext;
let B: LegacyCompanyContext;
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const as = <T = any>(ctx: LegacyCompanyContext, fn: () => Promise<T>): Promise<T> => runAsLegacyCompany(ctx, fn);
const gl = (c: number, code: string, name: string, inUse = 1) =>
  one(Prisma.sql`INSERT INTO "GL_Account" ("CompanyId", "AccountCode", "AccountName", "InUse", "IsDeleted") VALUES (${c}, ${code}, ${name}, ${inUse}, 0) RETURNING "RecId" as id`);

let receivable: { id: number; code: string; name: string };
let payable: { id: number; code: string; name: string };
let inactive: { id: number; code: string };
let otherCompany: { id: number; code: string };

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  setNonHttpLegacyCompanyDefault(null);
  for (const t of ['MD_Company', 'MD_Workplace']) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'RecId'), GREATEST((SELECT MAX("RecId") FROM "${t}"), 1))`);
  }
  const bId = await one(Prisma.sql`INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID") VALUES (${uniq('B').slice(0, 25)}, 'Company B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
  const bWp = await one(Prisma.sql`INSERT INTO "MD_Workplace" ("CompanyId", "WorkplaceCode", "WorkplaceName", "InUse", "IsDeleted", "UUID") VALUES (${bId}, ${uniq('WB').slice(0, 25)}, 'B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
  const coA = await prisma.company.create({ data: { name: uniq('A'), slug: uniq('a').toLowerCase() } });
  const coB = await prisma.company.create({ data: { name: uniq('B'), slug: uniq('b').toLowerCase() } });
  A = { companyId: coA.id, legacyCompanyId: 1, workplaceId: 1 };
  B = { companyId: coB.id, legacyCompanyId: bId, workplaceId: bWp };

  lookup = new LegacyMasterLookupService(prisma, null as any);
  accounts = new AccountService(prisma, lookup, new AuditService(prisma));
  glAccounts = new GlAccountService(prisma, new DeleteDependencyService(prisma), { recordSafe: async (p: any) => { audits.push(p); } } as any);

  receivable = { code: uniq('120-'), name: uniq('Trade Receivables '), id: 0 };
  receivable.id = await gl(1, receivable.code, receivable.name);
  payable = { code: uniq('320-'), name: uniq('Trade Payables '), id: 0 };
  payable.id = await gl(1, payable.code, payable.name);
  inactive = { code: uniq('199-'), id: 0 };
  inactive.id = await gl(1, inactive.code, 'Closed account', 0);
  otherCompany = { code: uniq('120-'), id: 0 };
  otherCompany.id = await gl(bId, otherCompany.code, 'B receivables');
});
after(async () => {
  setNonHttpLegacyCompanyDefault({ companyId: 'test-default', legacyCompanyId: 1, workplaceId: 1 });
  await prisma.$disconnect();
});

describe('gl-account lookup', () => {
  test('type-ahead searches GL_Account by code and by name, returning id/code/name', async () => {
    const byCode = await as(A, () => lookup.search('gl-account', receivable.code));
    assert.deepEqual(byCode.map((r: any) => ({ id: r.id, code: r.code, name: r.name })), [receivable]);
    const byName = await as(A, () => lookup.search('gl-account', payable.name.toLowerCase()));
    assert.deepEqual(byName.map((r: any) => r.id), [payable.id]);
  });

  test('inactive accounts are not offered; another company\'s accounts are never offered', async () => {
    const ids = (await as(A, () => lookup.search('gl-account', RUN))).map((r: any) => r.id);
    assert.ok(ids.includes(receivable.id) && ids.includes(payable.id));
    assert.ok(!ids.includes(inactive.id), 'inactive GL account must not be selectable');
    assert.ok(!ids.includes(otherCompany.id), "company B's GL account must not leak to A");
  });

  test('a saved reference resolves for display even if the account was deactivated since', async () => {
    const r = await as(A, () => lookup.getById('gl-account', inactive.id, { includeInactive: true }));
    assert.equal(r?.code, inactive.code);
    assert.equal(await as(A, () => lookup.getById('gl-account', otherCompany.id, { includeInactive: true })), null);
  });

  test('the generic Master Lookup screen cannot maintain GL accounts (Chart of Accounts is the only write path)', async () => {
    assert.throws(() => lookup.meta('gl-account'), /not a manageable master/);
    await assert.rejects(as(A, () => lookup.create('gl-account', { code: uniq('X'), name: uniq('X') }, USER)), /not a manageable master/);
  });
});

describe('Chart of Accounts (GL_Account) service', () => {
  test('create stamps the current company, defaults to active, and returns the real RecId', async () => {
    const code = uniq('600-');
    const created = await as(B, () => glAccounts.create({ accountCode: ` ${code} `, accountName: 'Domestic Sales', accountType: 3, explanation: 'Sales' }, USER));
    assert.equal(created.accountCode, code, 'code is trimmed');
    assert.equal(created.inUse, true);
    assert.equal(created.accountType, 3);
    assert.equal(created.cdType, null);
    const [row] = await prisma.$queryRaw<any[]>`SELECT "RecId"::int id, "CompanyId"::int c, "WorkplaceId"::int w, "InUse"::int a, "IsDeleted"::int d FROM "GL_Account" WHERE "RecId" = ${created.id}`;
    assert.deepEqual(row, { id: created.id, c: B.legacyCompanyId, w: B.workplaceId, a: 1, d: 0 });
  });

  test('list is company-scoped, ordered by code, searchable by code or name, and includes inactive accounts', async () => {
    const all = await as(A, () => glAccounts.list());
    const ids = all.map((r: any) => r.id);
    assert.ok(ids.includes(receivable.id) && ids.includes(payable.id) && ids.includes(inactive.id));
    assert.ok(!ids.includes(otherCompany.id));
    assert.ok(ids.indexOf(receivable.id) < ids.indexOf(payable.id), 'ordered by account code (120-… before 320-…)');
    assert.deepEqual((await as(A, () => glAccounts.list(receivable.code))).map((r: any) => r.id), [receivable.id]);
    assert.deepEqual((await as(A, () => glAccounts.list(payable.name.toUpperCase()))).map((r: any) => r.id), [payable.id]);
  });

  test("another company's account is not found for get or update", async () => {
    await assert.rejects(as(A, () => glAccounts.get(otherCompany.id)), (e: any) => e.getStatus() === 404);
    await assert.rejects(as(A, () => glAccounts.update(otherCompany.id, { accountName: 'hijack' }, USER)), (e: any) => e.getStatus() === 404);
    const [row] = await prisma.$queryRaw<any[]>`SELECT "AccountName" n FROM "GL_Account" WHERE "RecId" = ${otherCompany.id}`;
    assert.equal(row.n, 'B receivables');
  });

  test('account code must be unique within the company (case-insensitive) but may repeat across companies', async () => {
    await assert.rejects(as(A, () => glAccounts.create({ accountCode: receivable.code.toLowerCase(), accountName: 'Dup' }, USER)), (e: any) => e.getStatus() === 409);
    const other = await as(A, () => glAccounts.create({ accountCode: uniq('700-'), accountName: 'Other' }, USER));
    await assert.rejects(as(A, () => glAccounts.update(other.id, { accountCode: payable.code }, USER)), (e: any) => e.getStatus() === 409);
    // Same code as company B's account is fine for company A.
    const sameAsB = await as(A, () => glAccounts.create({ accountCode: `${otherCompany.code}A`, accountName: 'x' }, USER));
    await as(B, () => glAccounts.create({ accountCode: `${otherCompany.code}A`, accountName: 'x' }, USER));
    assert.ok(sameAsB.id);
  });

  test('required fields are enforced and the DTO enforces real column lengths / smallint range', async () => {
    await assert.rejects(as(A, () => glAccounts.create({ accountCode: '  ', accountName: 'x' }, USER)), /Account Code is required/);
    await assert.rejects(as(A, () => glAccounts.create({ accountCode: uniq('C'), accountName: '' }, USER)), /Account Name is required/);
    const errs = await validate(plainToInstance(CreateGlAccountDto, {
      accountCode: 'x'.repeat(26), accountName: 'n'.repeat(251), explanation: 'e'.repeat(101), specialCode: 's'.repeat(16), accountType: 40000, cdType: 1.5,
    }));
    assert.deepEqual(errs.map((e) => e.property).sort(), ['accountCode', 'accountName', 'accountType', 'cdType', 'explanation', 'specialCode']);
    assert.deepEqual(await validate(plainToInstance(CreateGlAccountDto, { accountCode: 'x'.repeat(25), accountName: 'ok', accountType: null })), []);
  });

  test('edit changes only sent fields, clears optional ones, and deactivation hides the account from pickers only', async () => {
    const acc = await as(A, () => glAccounts.create({ accountCode: uniq('800-'), accountName: 'Misc', explanation: 'note', specialCode: 'SP' }, USER));
    const renamed = await as(A, () => glAccounts.update(acc.id, { accountName: 'Misc Income', explanation: '', inUse: null as any }, USER));
    assert.equal(renamed.accountName, 'Misc Income');
    assert.equal(renamed.explanation, null);
    assert.equal(renamed.specialCode, 'SP');
    assert.equal(renamed.inUse, true, 'status is never set to NULL');

    const off = await as(A, () => glAccounts.update(acc.id, { inUse: false }, USER));
    assert.equal(off.inUse, false);
    assert.ok(!(await as(A, () => lookup.search('gl-account', acc.accountCode))).some((r: any) => r.id === acc.id));
    assert.equal((await as(A, () => lookup.getById('gl-account', acc.id, { includeInactive: true })))?.name, 'Misc Income');
    assert.ok((await as(A, () => glAccounts.list(acc.accountCode))).some((r: any) => r.id === acc.id), 'still listed on the Chart of Accounts');
  });
});

describe('Current Account GL fields', () => {
  test('customer and supplier GL accounts save to their own columns and survive a reopen', async () => {
    const created = await as(A, () => accounts.create({
      currentAccountName: uniq('Party '), currentAccountType: '0',
      customerGLAccountId: String(receivable.id), supplierGLAccountId: String(payable.id),
    }, USER));
    assert.equal(Number(created.customerGLAccountId), receivable.id);
    assert.equal(Number(created.supplierGLAccountId), payable.id);

    const [raw] = await prisma.$queryRaw<any[]>`SELECT "CustomerGLAccountId"::int cu, "SupplierGLAccountId"::int su FROM "FI_Account" WHERE "RecId" = ${created.id}`;
    assert.deepEqual(raw, { cu: receivable.id, su: payable.id });

    const reopened = await as(A, () => accounts.get(created.id));
    assert.equal(Number(reopened.customerGLAccountId), receivable.id);
    assert.equal(Number(reopened.supplierGLAccountId), payable.id);
    const byCode = await as(A, () => accounts.getByCode(created.currentAccountCode));
    assert.equal(Number(byCode.supplierGLAccountId), payable.id);
  });

  test('changing or clearing one field leaves the other and the rest of the record untouched', async () => {
    const name = uniq('Party ');
    const created = await as(A, () => accounts.create({
      currentAccountName: name, currentAccountType: '1', taxNo: 'TX-1',
      customerGLAccountId: String(receivable.id), supplierGLAccountId: String(payable.id),
    }, USER));
    // Form sends its full state; the picker's clear sets the field to "".
    const swapped = await as(A, () => accounts.update(created.id, { ...created, customerGLAccountId: String(payable.id) }, USER));
    assert.equal(Number(swapped.customerGLAccountId), payable.id);
    assert.equal(Number(swapped.supplierGLAccountId), payable.id);

    const cleared = await as(A, () => accounts.update(created.id, { ...swapped, customerGLAccountId: '' }, USER));
    assert.equal(cleared.customerGLAccountId, null);
    assert.equal(Number(cleared.supplierGLAccountId), payable.id);
    assert.equal(cleared.currentAccountName, name);
    assert.equal(cleared.taxNo, 'TX-1');
    assert.equal(cleared.currentAccountCode, created.currentAccountCode);
  });
});

describe('Chart of Accounts delete (soft delete, blocked while referenced)', () => {
  const newAccount = (ctx: LegacyCompanyContext, name = 'Temp') =>
    as(ctx, () => glAccounts.create({ accountCode: uniq('900-'), accountName: uniq(`${name} `) }, USER));
  const rowOf = async (id: number) =>
    (await prisma.$queryRaw<any[]>`SELECT "IsDeleted"::int d, "DeletedBy"::int by, ("DeletedAt" IS NOT NULL) at, "AccountName" n FROM "GL_Account" WHERE "RecId" = ${id}`)[0];

  test('the reference list covers every live foreign key into GL_Account', async () => {
    const fks = await prisma.$queryRaw<{ t: string; c: string }[]>`
      SELECT replace(k.conrelid::regclass::text, '"', '') t, a.attname c FROM pg_constraint k
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f' AND k.confrelid = '"GL_Account"'::regclass`;
    const covered = new Set(GL_ACCOUNT_REFERENCES.flatMap(([, t, cols]) => cols.map((c) => `${t}.${c}`)));
    covered.add('GL_AccountTotal.AccountId');
    const missing = fks.map((r) => `${r.t}.${r.c}`).filter((k) => !covered.has(k));
    assert.equal(fks.length, 31);
    assert.deepEqual(missing, []);
  });

  test('every referencing column blocks deletion (each reference inserted and rolled back)', async () => {
    const acc = await newAccount(A);
    const guard = new DeleteDependencyService(prisma);
    const cases: Array<[string, string, string]> = [
      ...GL_ACCOUNT_REFERENCES.flatMap(([label, t, cols]) => cols.map((c) => [label, t, c] as [string, string, string])),
      ['Account balance', 'GL_AccountTotal', 'AccountId'],
    ];
    for (const [label, table, col] of cases) {
      const hasIsDeleted = table !== 'GL_AccountTotal';
      let labels: string[] = [];
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "${table}" ("${col}"${hasIsDeleted ? ', "IsDeleted"' : ''}) VALUES ($1${hasIsDeleted ? ', 0' : ''})`, acc.id,
        );
        const r = await guard.checkDependencies('GL_Account', acc.id, tx);
        labels = r.dependencies.filter((d) => d.blocked).map((d) => d.label);
        throw new Error('rollback');
      }).catch((e: any) => { if (e?.message !== 'rollback') throw e; });
      assert.deepEqual(labels, [label], `${table}.${col}`);
    }
    assert.equal((await guard.checkDependencies('GL_Account', acc.id)).blocked, false, 'all test references rolled back');
  });

  test('a GL Integration rule naming the account code (same company) blocks deletion', async () => {
    const acc = await newAccount(A);
    await prisma.$executeRaw`INSERT INTO "GL_Integration" ("CompanyId", "GLAccountCode2", "IsDeleted") VALUES (${A.legacyCompanyId}, ${acc.accountCode.toLowerCase()}, 0)`;
    await assert.rejects(as(A, () => glAccounts.remove(acc.id, USER)), /GL Integration rule/);
    // The same code configured for another company does not count.
    const accB = await as(B, () => glAccounts.create({ accountCode: uniq('901-'), accountName: 'x' }, USER));
    await prisma.$executeRaw`INSERT INTO "GL_Integration" ("CompanyId", "GLAccountCode", "IsDeleted") VALUES (${A.legacyCompanyId}, ${accB.accountCode}, 0)`;
    await as(B, () => glAccounts.remove(accB.id, USER));
    assert.equal((await rowOf(accB.id)).d, 1);
  });

  test('an unused account is soft-deleted (row kept, IsDeleted/DeletedAt/DeletedBy set, audit recorded)', async () => {
    const acc = await newAccount(A, 'Unused');
    audits.length = 0;
    assert.deepEqual(await as(A, () => glAccounts.remove(acc.id, USER, 'user-uuid', A.companyId)), { message: 'Deleted' });
    assert.deepEqual(await rowOf(acc.id), { d: 1, by: USER, at: true, n: acc.accountName });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'delete');
    assert.equal(audits[0].documentNo, acc.accountCode);

    // Gone from the Chart of Accounts list, view, edit, pickers and a second delete.
    assert.ok(!(await as(A, () => glAccounts.list(acc.accountCode))).some((r: any) => r.id === acc.id));
    await assert.rejects(as(A, () => glAccounts.get(acc.id)), (e: any) => e.getStatus() === 404);
    await assert.rejects(as(A, () => glAccounts.update(acc.id, { accountName: 'x' }, USER)), (e: any) => e.getStatus() === 404);
    await assert.rejects(as(A, () => glAccounts.remove(acc.id, USER)), (e: any) => e.getStatus() === 404);
    assert.deepEqual(await as(A, () => lookup.search('gl-account', acc.accountCode)), []);
    // Its code is free for a new account.
    assert.ok((await as(A, () => glAccounts.create({ accountCode: acc.accountCode, accountName: 'Reused code' }, USER))).id);
  });

  test('an account used by a Current Account cannot be deleted; nothing is changed', async () => {
    const acc = await newAccount(A, 'Used');
    const party = await as(A, () => accounts.create({ currentAccountName: uniq('Party '), currentAccountType: '1', customerGLAccountId: String(acc.id) }, USER));
    await assert.rejects(as(A, () => glAccounts.remove(acc.id, USER)), (e: any) =>
      e.getStatus() === 409 && /is in use \(Current Account \(Customer\/Supplier GL\)\) and cannot be deleted/.test(e.message));
    assert.equal((await rowOf(acc.id)).d, 0);
    assert.equal(Number((await as(A, () => accounts.get(party.id))).customerGLAccountId), acc.id);
    // Edit and Activate/Deactivate still work on a referenced account.
    assert.equal((await as(A, () => glAccounts.update(acc.id, { inUse: false }, USER))).inUse, false);
    assert.equal((await as(A, () => glAccounts.update(acc.id, { inUse: true, accountName: 'Used renamed' }, USER))).accountName, 'Used renamed');
  });

  test('a soft-deleted referencing record does not block; its historical reference is kept intact', async () => {
    const acc = await newAccount(A);
    const party = await as(A, () => accounts.create({ currentAccountName: uniq('Old '), currentAccountType: '2', supplierGLAccountId: String(acc.id) }, USER));
    await as(A, () => accounts.remove(party.id, USER));
    await as(A, () => glAccounts.remove(acc.id, USER));
    const [row] = await prisma.$queryRaw<any[]>`SELECT "SupplierGLAccountId"::int s, "IsDeleted"::int d FROM "FI_Account" WHERE "RecId" = ${party.id}`;
    assert.deepEqual(row, { s: acc.id, d: 1 });
  });

  test("company isolation: another company's account answers 404 and is left untouched", async () => {
    const accB = await as(B, () => glAccounts.create({ accountCode: uniq('902-'), accountName: 'B only' }, USER));
    await assert.rejects(as(A, () => glAccounts.remove(accB.id, USER)), (e: any) => e.getStatus() === 404);
    assert.equal((await rowOf(accB.id)).d, 0);
  });

  test('race: a reference saved concurrently (uncommitted when delete starts) is seen and blocks the delete', async () => {
    const acc = await newAccount(A);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let inserted!: () => void;
    const insertedP = new Promise<void>((r) => { inserted = r; });
    const writer = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "CustomerGLAccountId", "IsDeleted") VALUES (1, ${uniq('RC-')}, 'racer', ${acc.id}, 0)`;
      inserted();
      await gate; // hold the transaction open (and its FK KEY SHARE lock on the account row)
    }, { timeout: 20000 });
    await insertedP;
    const del = as(A, () => glAccounts.remove(acc.id, USER)).then(() => 'deleted', (e: any) => String(e.getStatus?.() ?? e.message));
    await new Promise((r) => setTimeout(r, 300)); // delete is now waiting on the row lock
    release();
    await writer;
    assert.equal(await del, '409');
    assert.equal((await rowOf(acc.id)).d, 0);
  });

  test('DELETE route requires the existing master-data:delete permission', () => {
    const reflector = new Reflector();
    const get = <T>(key: string) => reflector.getAllAndOverride<T>(key, [GlAccountController.prototype.remove, GlAccountController]);
    assert.deepEqual(resolveRequiredPermissions(get, 'DELETE'), { kind: 'permissions', permissions: [{ module: 'master-data', action: 'delete' }], source: 'module' });
  });
});

describe('Receipt / invoice detail lines show their GL account (IM_ReceiptItem.GLAccountId)', () => {
  let receipts: InventoryReceiptService;
  let receiptId: number;
  const line: Record<string, number> = {};
  let deletedAcc: { id: number; code: string; name: string };

  before(async () => {
    const audit = new AuditService(prisma);
    receipts = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), lookup, new DeleteDependencyService(prisma), new ReceiptTraceabilityService(prisma), audit);
    const d = await as(A, () => glAccounts.create({ accountCode: uniq('950-'), accountName: 'Retired account' }, USER));
    await as(A, () => glAccounts.remove(d.id, USER)); // unused when deleted; referenced only below, as history
    deletedAcc = { id: d.id, code: d.accountCode, name: d.accountName };
    receiptId = await one(Prisma.sql`INSERT INTO "IM_Receipt" ("CompanyId", "WorkplaceId", "ReceiptType", "ReceiptNo", "ReceiptDate", "IsDeleted") VALUES (1, 1, 2, ${uniq('IR-GL-')}, now(), 0) RETURNING "RecId" as id`);
    const add = (order: number, gl: number | null) =>
      one(Prisma.sql`INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId", "ReceiptType", "ItemOrderNo", "Quantity", "UnitPrice", "GLAccountId", "IsDeleted") VALUES (${receiptId}, 2, ${order}, 5, 10, ${gl}, 0) RETURNING "RecId" as id`);
    line.receivable = await add(1, receivable.id);
    line.payable = await add(2, payable.id);
    line.none = await add(3, null);
    line.inactive = await add(4, inactive.id);
    line.deleted = await add(5, deletedAcc.id);
    line.foreign = await add(6, otherCompany.id);
  });

  const byId = (rows: any[]) => new Map(rows.map((r) => [Number(r.id), r]));
  const gl = (r: any) => [r.glAccountId, r.glAccountCode, r.glAccountName];

  test('each line shows its own account; null stays empty; inactive / soft-deleted accounts stay readable', async () => {
    const rows = byId(await as(A, () => receipts.listItems(receiptId)));
    assert.deepEqual(gl(rows.get(line.receivable)), [receivable.id, receivable.code, receivable.name]);
    assert.deepEqual(gl(rows.get(line.payable)), [payable.id, payable.code, payable.name]);
    assert.deepEqual(gl(rows.get(line.none)), [null, null, null]);
    assert.deepEqual(gl(rows.get(line.inactive)), [inactive.id, inactive.code, 'Closed account']);
    assert.deepEqual(gl(rows.get(line.deleted)), [deletedAcc.id, deletedAcc.code, deletedAcc.name]);
    // Lines keep their existing fields and order.
    assert.deepEqual([...rows.values()].map((r) => r.itemOrderNo), [1, 2, 3, 4, 5, 6]);
    assert.equal(Number(rows.get(line.receivable).quantity), 5);
  });

  test("company isolation: another company's GL account is never shown; another company can't read the lines", async () => {
    const rows = byId(await as(A, () => receipts.listItems(receiptId)));
    assert.deepEqual(gl(rows.get(line.foreign)), [otherCompany.id, null, null], 'id kept, no code/name from company B');
    await assert.rejects(as(B, () => receipts.listItems(receiptId)), (e: any) => e.getStatus() === 404);
  });

  const stored = async (id: number) => (await prisma.$queryRaw<any[]>`SELECT "GLAccountId"::int g FROM "IM_ReceiptItem" WHERE "RecId" = ${id}`)[0].g;

  test('editing another field returns the GL fields and leaves the stored account unchanged', async () => {
    const updated = await as(A, () => receipts.updateItem(line.receivable, { explanation: 'edited' }, USER, receiptId));
    assert.equal(updated.explanation, 'edited');
    assert.deepEqual(gl(updated), [receivable.id, receivable.code, receivable.name]);
    assert.equal(await stored(line.receivable), receivable.id);
  });

  test('a user picks an account per line: saved as the RecId, returned with code/name, survives reload; clearing works', async () => {
    const picked = await as(A, () => receipts.updateItem(line.none, { glAccountId: payable.id }, USER, receiptId));
    assert.deepEqual(gl(picked), [payable.id, payable.code, payable.name]);
    assert.equal(await stored(line.none), payable.id);
    const reloaded = byId(await as(A, () => receipts.listItems(receiptId)));
    assert.deepEqual(gl(reloaded.get(line.none)), [payable.id, payable.code, payable.name]);
    assert.deepEqual(gl(reloaded.get(line.receivable)), [receivable.id, receivable.code, receivable.name], 'other lines untouched');
    // Quantities / prices are not touched by an account pick.
    assert.equal(Number(reloaded.get(line.none).quantity), 5);
    assert.equal(Number(reloaded.get(line.none).unitPrice), 10);

    const cleared = await as(A, () => receipts.updateItem(line.none, { glAccountId: null }, USER, receiptId));
    assert.deepEqual(gl(cleared), [null, null, null]);
    assert.equal(await stored(line.none), null);
  });

  test("a new pick must be an active account of the company: inactive, deleted, other company's or unknown ids are refused", async () => {
    for (const bad of [inactive.id, deletedAcc.id, otherCompany.id, 99999999]) {
      await assert.rejects(as(A, () => receipts.updateItem(line.none, { glAccountId: bad }, USER, receiptId)), /GL Account is not an active account/, String(bad));
    }
    // The raw ITEM_COLUMNS key is validated too.
    await assert.rejects(as(A, () => receipts.updateItem(line.none, { gLAccountId: inactive.id }, USER, receiptId)), /not an active account/);
    assert.equal(await stored(line.none), null, 'nothing written');
  });

  test('a line already pointing at a since-deactivated account can still be edited (unchanged value not re-checked)', async () => {
    const updated = await as(A, () => receipts.updateItem(line.inactive, { glAccountId: inactive.id, explanation: 'still editable' }, USER, receiptId));
    assert.equal(updated.explanation, 'still editable');
    assert.equal(await stored(line.inactive), inactive.id);
  });

  test("another company cannot change a line's account", async () => {
    await assert.rejects(as(B, () => receipts.updateItem(line.receivable, { glAccountId: null }, USER, receiptId)));
    assert.equal(await stored(line.receivable), receivable.id);
  });

  test('a GL account picked on a receipt line can no longer be deleted', async () => {
    await assert.rejects(as(A, () => glAccounts.remove(receivable.id, USER)), /Inventory Receipt line/);
  });
});

describe('Current Account rejects stale or foreign GL picks', () => {
  test('a newly chosen deleted, inactive or other-company account is refused; an unchanged saved reference is kept', async () => {
    const live = await as(A, () => glAccounts.create({ accountCode: uniq('910-'), accountName: 'Live' }, USER));
    const party = await as(A, () => accounts.create({ currentAccountName: uniq('Party '), currentAccountType: '0', customerGLAccountId: String(live.id) }, USER));

    const gone = await as(A, () => glAccounts.create({ accountCode: uniq('911-'), accountName: 'Gone' }, USER));
    await as(A, () => glAccounts.remove(gone.id, USER));
    await assert.rejects(as(A, () => accounts.update(party.id, { supplierGLAccountId: String(gone.id) }, USER)), /Supplier GL Account is not an active account/);
    await assert.rejects(as(A, () => accounts.update(party.id, { supplierGLAccountId: String(inactive.id) }, USER)), /not an active account/);
    await assert.rejects(as(A, () => accounts.update(party.id, { supplierGLAccountId: String(otherCompany.id) }, USER)), /not an active account/);
    await assert.rejects(as(A, () => accounts.create({ currentAccountName: 'x', currentAccountType: '1', customerGLAccountId: String(gone.id) }, USER)), /Customer GL Account/);

    // Deactivating the saved account later doesn't stop the record from being saved unchanged.
    await as(A, () => glAccounts.update(live.id, { inUse: false }, USER));
    const saved = await as(A, () => accounts.update(party.id, { customerGLAccountId: String(live.id), taxNo: 'T-9' }, USER));
    assert.equal(Number(saved.customerGLAccountId), live.id);
    assert.equal(saved.taxNo, 'T-9');
  });
});
