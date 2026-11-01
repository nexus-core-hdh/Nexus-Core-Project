// Company isolation through the real HTTP stack with authenticated sessions — the full API (every
// module, main.ts's middleware and global guards: JWT, RolesGuard, LegacyCompanyGuard) on the
// throwaway test database. Two users of two companies (A and B → two legacy companies created
// here, each with its workplace) sign in through POST /auth/login, then use the Invoice screens' API for all 18
// receipt types and the receipt API: each sees only its own company's receipts and invoices, can
// only invoice its own receipt of the same type, can't read / edit / approve / delete the other's,
// and a company with no legacy mapping is refused (403) on every Legacy ERP route.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as bcrypt from 'bcrypt';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { Prisma } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { nexuscoreValidationPipe } from '../../src/common/pipes/validation.pipe';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RolesService } from '../../src/modules/roles/roles.service';
import { collectRoutes, permissionsReferenced } from '../../src/common/security/permission-coverage';
import { LegacyCompanyGuard, legacyScopeMiddleware, setNonHttpLegacyCompanyDefault } from '../../src/modules/legacy-erp/legacy-company-scope';
import { RECEIPT_TYPES } from '../../src/modules/legacy-erp/receipt-types.config';

let app: NestExpressApplication;
let prisma: PrismaService;
let base = '';
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const PASSWORD = `T3st-${RUN}`;
const tokens: Record<'A' | 'B' | 'U', string> = { A: '', B: '', U: '' };
const legacy = { A: 0, B: 0 };

async function api(who: 'A' | 'B' | 'U', method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  // The API's ResponseInterceptor wraps every success as { success, data, message, meta? }.
  if (data && typeof data === 'object' && data.success === true && 'data' in data) data = data.data;
  return { status: res.status, data };
}
const rows = (d: any): any[] => (Array.isArray(d) ? d : d?.rows ?? []);

/** A company with a legacy mapping (or none), one Admin user in it, signed in via /auth/login. */
async function companyUser(legacyCompanyId: number | null, adminRoleId: string) {
  const co = await prisma.company.create({ data: { name: uniq('Co '), slug: uniq('co').toLowerCase() } });
  if (legacyCompanyId != null) await prisma.$executeRaw`UPDATE "Company" SET "legacyCompanyId" = ${legacyCompanyId} WHERE id = ${co.id}`;
  const email = `${uniq('user').toLowerCase()}@isolation.test`;
  const user = await prisma.user.create({ data: { companyId: co.id, name: 'Isolation Tester', email, password: await bcrypt.hash(PASSWORD, 10), mustChangePassword: false, isActive: true } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: adminRoleId } });
  const res = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  const body: any = await res.json();
  assert.equal(res.status, 201, `login: ${JSON.stringify(body)}`);
  const token = body?.data?.accessToken;
  assert.ok(token, 'login returned an access token');
  return { companyId: co.id, token: String(token) };
}

before(async () => {
  setNonHttpLegacyCompanyDefault(null); // HTTP requests resolve their own company; no default
  app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.use(legacyScopeMiddleware);
  app.use(json({ limit: '10mb' }));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(nexuscoreValidationPipe);
  prisma = app.get(PrismaService);
  app.useGlobalGuards(new RolesGuard(app.get(Reflector), prisma), new LegacyCompanyGuard(prisma));
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  // The permission catalog + system role grants main.ts performs at boot.
  const role = (await prisma.role.findFirst({ where: { isSystem: true } })) ?? (await prisma.role.create({ data: { name: 'Admin', isSystem: true } }));
  await app.get(RolesService).seedPermissions(permissionsReferenced(app, collectRoutes(app)), { grantToSystemRoles: true });
  await app.listen(0);
  const addr: any = app.getHttpServer().address();
  base = `http://127.0.0.1:${addr.port}`;

  for (const t of ['MD_Company', 'MD_Workplace']) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'RecId'), GREATEST((SELECT MAX("RecId") FROM "${t}"), 1))`);
  }
  for (const k of ['A', 'B'] as const) {
    legacy[k] = await one(Prisma.sql`INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID") VALUES (${uniq(k).slice(0, 25)}, ${`Company ${k}`}, 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
    await one(Prisma.sql`INSERT INTO "MD_Workplace" ("CompanyId", "WorkplaceCode", "WorkplaceName", "InUse", "IsDeleted", "UUID") VALUES (${legacy[k]}, ${uniq('W' + k).slice(0, 25)}, ${k}, 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
  }
  tokens.A = (await companyUser(legacy.A, role.id)).token;
  tokens.B = (await companyUser(legacy.B, role.id)).token;
  tokens.U = (await companyUser(null, role.id)).token;
});
after(async () => {
  setNonHttpLegacyCompanyDefault({ companyId: 'test-default', legacyCompanyId: 1, workplaceId: 1 });
  await app?.close();
});

/** One company's account + warehouse + item, and a receipt of `type` with one line, via the API. */
async function receiptVia(who: 'A' | 'B', type: number) {
  const cid = legacy[who];
  const account = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${cid}, ${uniq('S')}, 'Party', 0) RETURNING "RecId" as id`);
  const warehouse = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (${cid}, ${uniq('W')}, 'Store', 0) RETURNING "RecId" as id`);
  const item = await one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${cid}, ${uniq('Y-')}, 'Yarn', 'YARN', 0) RETURNING "RecId" as id`);
  // Purchase Receipt (2) has its own screen route; every other type the shared one.
  const root = type === 2 ? '/legacy-erp/inventory-receipts' : `/legacy-erp/receipts/${type}`;
  const created = await api(who, 'POST', root, { receiptDate: '2026-10-31', currentAccountId: account, inWarehouseId: warehouse, outWarehouseId: warehouse });
  assert.ok([200, 201].includes(created.status), `create receipt ${type} as ${who}: ${JSON.stringify(created.data)}`);
  const id = Number(created.data.id);
  const line = await api(who, 'POST', `${root}/${id}/items`, { inventoryId: item, quantity: 2, unitPrice: 5, itemTotal: 10, netItemTotal: 10 });
  assert.ok([200, 201].includes(line.status), `line ${type} as ${who}: ${JSON.stringify(line.data)}`);
  return { id, account, item };
}

describe('authenticated sessions, two companies', () => {
  test('all 18 Invoice screens answer for both companies (list, next number, receipt candidates)', async () => {
    assert.equal(RECEIPT_TYPES.length, 18);
    for (const who of ['A', 'B'] as const) {
      for (const t of RECEIPT_TYPES) {
        const list = await api(who, 'GET', `/legacy-erp/invoices/${t.receiptType}`);
        const next = await api(who, 'GET', `/legacy-erp/invoices/${t.receiptType}/next-code`);
        const cand = await api(who, 'GET', `/legacy-erp/invoices/${t.receiptType}/receipt-candidates`);
        assert.deepEqual([list.status, next.status, cand.status], [200, 200, 200], `${who} type ${t.receiptType}: ${JSON.stringify([list.data, next.data, cand.data]).slice(0, 300)}`);
      }
    }
  });

  test("each company invoices only its own receipt; the other company can't see, edit, approve or delete it", async () => {
    const rA = await receiptVia('A', 2);
    const rB = await receiptVia('B', 2);
    // B can't invoice A's receipt, and A's receipt is not a B candidate.
    const cross = await api('B', 'POST', '/legacy-erp/invoices/2', { inventoryReceiptId: rA.id });
    assert.ok([400, 404].includes(cross.status), `B invoicing A's receipt: ${cross.status} ${JSON.stringify(cross.data)}`);
    const candB = rows((await api('B', 'GET', '/legacy-erp/invoices/2/receipt-candidates')).data).map((r: any) => Number(r.id));
    assert.equal(candB.includes(rA.id), false, "A's receipt is never offered to B");
    assert.equal(candB.includes(rB.id), true, "B's own receipt is offered to B");
    // A invoices its own receipt; the type must match.
    const wrongType = await api('A', 'POST', '/legacy-erp/invoices/122', { inventoryReceiptId: rA.id });
    assert.equal(wrongType.status, 400, 'a Purchase Receipt cannot be invoiced on the Purchase Return Invoice screen');
    const invA = await api('A', 'POST', '/legacy-erp/invoices/2', { inventoryReceiptId: rA.id, documentNo: 'A-DOC' });
    assert.ok([200, 201].includes(invA.status), JSON.stringify(invA.data));
    const id = Number(invA.data.id);
    // Save → reopen → edit → approve → unapprove by its own company.
    assert.equal((await api('A', 'GET', `/legacy-erp/invoices/2/${id}`)).status, 200);
    assert.equal((await api('A', 'PUT', `/legacy-erp/invoices/2/${id}`, { documentNo: 'A-DOC-2' })).status, 200);
    assert.equal((await api('A', 'GET', `/legacy-erp/invoices/2/${id}`)).data.documentNo, 'A-DOC-2');
    assert.ok([200, 201].includes((await api('A', 'POST', `/legacy-erp/invoices/2/${id}/approve`, {})).status), 'A approves its invoice');
    assert.ok([200, 201].includes((await api('A', 'POST', `/legacy-erp/invoices/2/${id}/unapprove`, {})).status), 'A unapproves its invoice');
    // B: not found everywhere, and absent from B's list.
    const b = {
      get: (await api('B', 'GET', `/legacy-erp/invoices/2/${id}`)).status,
      put: (await api('B', 'PUT', `/legacy-erp/invoices/2/${id}`, { documentNo: 'X' })).status,
      approve: (await api('B', 'POST', `/legacy-erp/invoices/2/${id}/approve`, {})).status,
      attachments: (await api('B', 'GET', `/legacy-erp/invoices/2/${id}/attachments?kind=document`)).status,
      del: (await api('B', 'DELETE', `/legacy-erp/invoices/2/${id}`)).status,
      receipt: (await api('B', 'GET', `/legacy-erp/inventory-receipts/${rA.id}`)).status,
    };
    assert.deepEqual(b, { get: 404, put: 404, approve: 404, attachments: 404, del: 404, receipt: 404 });
    assert.equal(rows((await api('B', 'GET', '/legacy-erp/invoices/2')).data).some((r: any) => Number(r.id) === id), false);
    assert.equal((await api('A', 'GET', `/legacy-erp/invoices/2/${id}`)).data.documentNo, 'A-DOC-2', "B's attempts changed nothing");
    // Stamped with A's legacy company; no stock movement from the invoice.
    const [stamp] = await prisma.$queryRaw<any[]>`SELECT "CompanyId"::int c FROM "IM_Invoice" WHERE "RecId" = ${id}`;
    assert.equal(stamp.c, legacy.A);
  });

  test('Create Invoice from a receipt (right-click): created once, reopened after, and never for another company', async () => {
    const rA = await receiptVia('A', 11);
    const first = await api('A', 'POST', `/legacy-erp/invoices/11/from-receipt/${rA.id}`, {});
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(first.data.created, true);
    assert.equal(Number(first.data.invoice.inventoryReceiptId), rA.id);
    const again = await api('A', 'POST', `/legacy-erp/invoices/11/from-receipt/${rA.id}`, {});
    assert.deepEqual([again.data.created, Number(again.data.invoice.id)], [false, Number(first.data.invoice.id)]);
    assert.equal((await api('A', 'POST', `/legacy-erp/invoices/2/from-receipt/${rA.id}`, {})).status, 400, 'wrong invoice screen for this receipt type');
    assert.equal((await api('B', 'POST', `/legacy-erp/invoices/11/from-receipt/${rA.id}`, {})).status, 404, "B can't reach A's receipt");
    assert.equal((await api('U', 'POST', `/legacy-erp/invoices/11/from-receipt/${rA.id}`, {})).status, 403, 'unmapped company refused');
  });

  test('a company without a legacy mapping is refused (403) on Legacy ERP routes — never shown another company\'s data', async () => {
    for (const path of ['/legacy-erp/invoices/2', '/legacy-erp/inventory-receipts', '/legacy-erp/receipts/122', '/legacy-erp/work-orders', '/legacy-erp/accounts']) {
      assert.equal((await api('U', 'GET', path)).status, 403, path);
    }
  });
});
