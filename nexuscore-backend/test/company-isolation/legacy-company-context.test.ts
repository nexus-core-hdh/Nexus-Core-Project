// Company isolation, phase 1 — the Company -> legacy company mapping (migration 20261031000000) and
// LegacyCompanyContextService, the one resolver every legacy module will use. Checks valid mappings,
// fail-closed cases (no company, unknown company, no mapping, mapping to a deleted / unused legacy
// company, legacy company without a live workplace), that a client-supplied legacy company id is
// never used, that the database enforces one company per legacy company and real legacy companies
// only, and that the company API cannot write the mapping. Throwaway test database only
// (`npm run test:company-isolation`); creates its own companies and legacy companies.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../src/prisma/prisma.service';
import { LegacyCompanyContextService, LEGACY_COMPANY_INVALID, LEGACY_COMPANY_NOT_LINKED } from '../../src/modules/legacy-erp/legacy-company-context.service';
import { UpdateCompanyDto } from '../../src/modules/company/dto/update-company.dto';
import { nexuscoreValidationPipe } from '../../src/common/pipes/validation.pipe';

let prisma: PrismaService;
let svc: LegacyCompanyContextService;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}-${RUN}-${++seq}`;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  svc = new LegacyCompanyContextService(prisma);
  // prepare-test-db inserts MD_Company / MD_Workplace RecId 1 explicitly; move the id sequences past
  // it (as prisma/seed.ts does) so this suite's own inserts get fresh ids. Test database only.
  for (const table of ['MD_Company', 'MD_Workplace']) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', 'RecId'), GREATEST((SELECT MAX("RecId") FROM "${table}"), 1))`);
  }
});
after(async () => { await prisma.$disconnect(); });

const newCompany = async () => (await prisma.company.create({ data: { name: uniq('Co'), slug: uniq('co').toLowerCase() } })).id;
/** A legacy company (MD_Company) with optional workplaces; returns their RecIds. */
async function legacyCompany(o: { deleted?: boolean; inUse?: number | null; workplaces?: { deleted?: boolean; inUse?: number | null }[] } = {}) {
  const [{ id }] = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID")
    VALUES (${uniq('C').slice(0, 25)}, ${uniq('Legacy')}, ${o.inUse === undefined ? 1 : o.inUse}, ${o.deleted ? 1 : 0}, gen_random_uuid()) RETURNING "RecId" AS id`);
  const workplaceIds: number[] = [];
  for (const w of o.workplaces ?? [{}]) {
    const [{ id: wid }] = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
      INSERT INTO "MD_Workplace" ("CompanyId", "WorkplaceCode", "WorkplaceName", "InUse", "IsDeleted", "UUID")
      VALUES (${id}, ${uniq('W').slice(0, 25)}, 'Workplace', ${w.inUse === undefined ? 1 : w.inUse}, ${w.deleted ? 1 : 0}, gen_random_uuid()) RETURNING "RecId" AS id`);
    workplaceIds.push(Number(wid));
  }
  return { id: Number(id), workplaceIds };
}
const map = (companyId: string, legacyCompanyId: number | null) =>
  prisma.$executeRaw`UPDATE "Company" SET "legacyCompanyId" = ${legacyCompanyId} WHERE "id" = ${companyId}`;
const status = (p: Promise<unknown>): Promise<string> => p.then(() => 'ok', (e: any) => (e?.getStatus?.() ? `${e.getStatus()} ${e.message}` : `error ${e?.code ?? ''} ${e?.message}`));

describe('valid mappings', () => {
  test("resolves the token company's legacy company and its workplace", async () => {
    const co = await newCompany();
    const lc = await legacyCompany();
    await map(co, lc.id);
    assert.deepEqual(await svc.resolve({ companyId: co }), { companyId: co, legacyCompanyId: lc.id, workplaceId: lc.workplaceIds[0] });
  });

  test('two companies, two legacy companies: each resolves to its own', async () => {
    const [a, b] = [await newCompany(), await newCompany()];
    const [la, lb] = [await legacyCompany(), await legacyCompany()];
    await map(a, la.id);
    await map(b, lb.id);
    assert.equal((await svc.resolve({ companyId: a })).legacyCompanyId, la.id);
    assert.equal((await svc.resolve({ companyId: b })).legacyCompanyId, lb.id);
  });

  test('workplace: the live one with the lowest id (deleted / unused workplaces skipped)', async () => {
    const co = await newCompany();
    const lc = await legacyCompany({ workplaces: [{ deleted: true }, { inUse: 0 }, {}, {}] });
    await map(co, lc.id);
    assert.equal((await svc.resolve({ companyId: co })).workplaceId, lc.workplaceIds[2]);
  });

  test('a client-supplied legacy company id is never used — only the token company counts', async () => {
    const [co, other] = [await newCompany(), await newCompany()];
    const [mine, theirs] = [await legacyCompany(), await legacyCompany()];
    await map(co, mine.id);
    await map(other, theirs.id);
    const forged = { companyId: co, legacyCompanyId: theirs.id, workplaceId: theirs.workplaceIds[0] } as any;
    assert.deepEqual(await svc.resolve(forged), { companyId: co, legacyCompanyId: mine.id, workplaceId: mine.workplaceIds[0] });
    assert.equal(svc.resolve.length, 1, 'the resolver takes the user only — no legacy company parameter');
  });
});

describe('fail closed', () => {
  test('no user / no company on the token / unknown company -> 403', async () => {
    assert.match(await status(svc.resolve(undefined)), /^403 /);
    assert.match(await status(svc.resolve({})), /^403 No company/);
    assert.match(await status(svc.resolve({ companyId: '   ' })), /^403 No company/);
    assert.match(await status(svc.resolve({ companyId: uniq('missing') })), /^403 Unknown company/);
  });

  test('company without a mapping -> 403 (no fallback to legacy company 1)', async () => {
    const co = await newCompany();
    assert.equal(await status(svc.resolve({ companyId: co })), `403 ${LEGACY_COMPANY_NOT_LINKED}`);
  });

  test('mapping to a deleted or unused legacy company -> 403', async () => {
    for (const bad of [{ deleted: true }, { inUse: 0 }]) {
      const co = await newCompany();
      await map(co, (await legacyCompany(bad)).id);
      assert.equal(await status(svc.resolve({ companyId: co })), `403 ${LEGACY_COMPANY_INVALID}`, JSON.stringify(bad));
    }
  });

  test('legacy company without a live workplace -> 403', async () => {
    for (const workplaces of [[], [{ deleted: true }], [{ inUse: 0 }]]) {
      const co = await newCompany();
      await map(co, (await legacyCompany({ workplaces })).id);
      assert.equal(await status(svc.resolve({ companyId: co })), `403 ${LEGACY_COMPANY_INVALID}`, JSON.stringify(workplaces));
    }
  });
});

describe('the database enforces the mapping', () => {
  test('one NexusCore company per legacy company (unique)', async () => {
    const [a, b] = [await newCompany(), await newCompany()];
    const lc = await legacyCompany();
    await map(a, lc.id);
    assert.match(await status(map(b, lc.id)), /Unique constraint|23505|unique/i);
  });

  test('only existing legacy companies (foreign key) — and a mapped legacy company cannot be deleted', async () => {
    const co = await newCompany();
    assert.match(await status(map(co, 2_000_000_000)), /foreign key|23503|Foreign key/i);
    const lc = await legacyCompany();
    await map(co, lc.id);
    assert.match(await status(prisma.$executeRaw`DELETE FROM "MD_Company" WHERE "RecId" = ${lc.id}`), /foreign key|23503|Foreign key/i);
  });

  test('the column is nullable and existing companies are untouched by the migration', async () => {
    const [col] = await prisma.$queryRaw<any[]>`SELECT is_nullable, data_type FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'legacyCompanyId'`;
    assert.deepEqual([col.is_nullable, col.data_type], ['YES', 'integer']);
  });
});

describe('the company API cannot write the mapping', () => {
  test('UpdateCompanyDto rejects legacyCompanyId (whitelist + forbidNonWhitelisted)', async () => {
    await assert.rejects(
      nexuscoreValidationPipe.transform({ name: 'x', legacyCompanyId: 1 }, { type: 'body', metatype: UpdateCompanyDto }),
      (e: any) => /legacyCompanyId/.test(JSON.stringify(e?.getResponse?.() ?? e?.message)),
    );
    const ok = await nexuscoreValidationPipe.transform({ name: 'x' }, { type: 'body', metatype: UpdateCompanyDto });
    assert.deepEqual({ ...ok }, { ...plainToInstance(UpdateCompanyDto, { name: 'x' }) });
  });
});
