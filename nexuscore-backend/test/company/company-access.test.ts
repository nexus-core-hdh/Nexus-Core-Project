// Companies screen backing API: GET /company only ever returns the caller's OWN company (the
// token's companyId — never a client-chosen id), editing it needs the company:update permission,
// and the /company routes never list, create or delete companies (registering is /companies, platform owner only).
// Throwaway full-schema test database (`npm run test:company`); nothing is deleted.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CompanyService } from '../../src/modules/company/company.service';
import { CompanyController } from '../../src/modules/company/company.controller';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';

let prisma: PrismaService;
let ctl: CompanyController;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  ctl = new CompanyController(new CompanyService(prisma));
});
after(async () => { await prisma.$disconnect(); });

async function company(name: string) {
  const c = await prisma.company.create({ data: { name: `${name} ${RUN}`, slug: `${name.toLowerCase()}-${RUN}` } });
  await prisma.branch.create({ data: { name: `${name} HQ`, companyId: c.id } });
  await prisma.user.create({ data: { companyId: c.id, name: `${name} user`, email: `${name.toLowerCase()}-${RUN}@test.invalid`, password: 'x' } });
  return c;
}

const routes = () => Object.getOwnPropertyNames(CompanyController.prototype)
  .map((name) => ({ name, handler: (CompanyController.prototype as any)[name] }))
  .filter((r) => Reflect.getMetadata(METHOD_METADATA, r.handler) !== undefined)
  .map((r) => ({ ...r, method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, r.handler)], path: Reflect.getMetadata(PATH_METADATA, r.handler) }));

describe('Company details (View company)', () => {
  test('returns exactly the caller\'s own company, with its branches and user count', async () => {
    const a = await company('Alpha');
    const b = await company('Beta');
    const res: any = await ctl.getCompany(a.id);
    assert.equal(res.data.id, a.id);
    assert.equal(res.data.name, a.name);
    assert.deepEqual(res.data.branches.map((x: any) => x.name), ['Alpha HQ']);
    assert.equal(res.data._count.users, 1);
    assert.equal((await ctl.getCompany(b.id) as any).data.id, b.id, 'each caller only ever gets its own');
  });

  test('the company is taken from the signed-in user, never from the request', () => {
    const get = routes().find((r) => r.method === 'GET' && (r.path === '/' || r.path === ''));
    assert.ok(get, 'GET /company exists');
    const params = Reflect.getMetadata('__routeArguments__', CompanyController, get!.name) ?? {};
    const sources = Object.keys(params).map((k) => k.split(':')[0]);
    assert.ok(sources.some((s) => s.includes('__customRouteArgs__')), 'the company id comes from @CurrentUser (the token)');
    assert.ok(!sources.some((s) => ['3', '4', '5'].includes(s)), 'no @Body/@Query/@Param (RouteParamtypes BODY=3, QUERY=4, PARAM=5) on GET /company');
  });

  test('an unknown company is a 404, never another company', async () => {
    await assert.rejects(ctl.getCompany('00000000-0000-0000-0000-000000000000'), (e: any) => e?.getStatus?.() === 404);
  });
});

describe('Company management routes', () => {
  test('/company (own company) has no list, create or delete route — those are /companies, platform owner only (company-provisioning.test.ts) — and nothing deletes a company', () => {
    const all = routes().map((r) => `${r.method} ${r.path}`).sort();
    assert.deepEqual(all, ['GET /', 'POST meta-config', 'PUT /'].sort());
    assert.ok(!routes().some((r) => r.method === 'DELETE'));
  });

  test('editing the company needs the company:update permission (not just a login)', () => {
    const reflector = new Reflector();
    const put = routes().find((r) => r.method === 'PUT')!;
    const get = <T>(key: string) => reflector.getAllAndOverride<T>(key, [put.handler, CompanyController]);
    assert.deepEqual(resolveRequiredPermissions(get, 'PUT'), { kind: 'permissions', permissions: [{ module: 'company', action: 'update' }], source: 'module' });
  });

  test('reading company details leaves every company, branch and user intact', async () => {
    const a = await company('Gamma');
    const before = await Promise.all([prisma.company.count(), prisma.branch.count(), prisma.user.count()]);
    await ctl.getCompany(a.id);
    assert.deepEqual(await Promise.all([prisma.company.count(), prisma.branch.count(), prisma.user.count()]), before);
  });
});
