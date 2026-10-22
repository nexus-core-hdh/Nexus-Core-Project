// Company registration (POST /companies) and platform-level company reads: allowed only for a user
// holding the companies:* permission whose OWN company is the platform owner; creates the company
// and its default branch atomically, with no users; validates fields and unique Company URLs.
// Throwaway full-schema test database (`npm run test:company`); every test seeds its own rows.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { CompanyProvisioningService, PROVISIONING_PERMISSIONS } from '../../src/modules/company/company-provisioning.service';
import { CompaniesController } from '../../src/modules/company/companies.controller';
import { CreateCompanyDto } from '../../src/modules/company/dto/create-company.dto';
import { nexuscoreValidationPipe } from '../../src/common/pipes/validation.pipe';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';

let prisma: PrismaService;
let svc: CompanyProvisioningService;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}-${RUN}-${++seq}`.toLowerCase();

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  svc = new CompanyProvisioningService(prisma, new AuditService(prisma));
  delete process.env.COMPANY_TRIAL_DAYS; // access() reports the trial default; these tests expect none
});
after(async () => { await prisma.$disconnect(); });

/** A company (optionally the platform owner) with one user holding the given companies:* actions. */
async function actor(opts: { owner: boolean; actions?: ('create' | 'read')[] }) {
  const company = await prisma.company.create({ data: { name: `Co ${uniq('')}`, slug: uniq('co'), isPlatformOwner: opts.owner, metaAppSecret: 'secret-value' } });
  const branch = await prisma.branch.create({ data: { name: 'HQ', companyId: company.id } });
  const user = await prisma.user.create({ data: { companyId: company.id, branchId: branch.id, name: 'u', email: `${uniq('u')}@test.invalid`, password: 'x' } });
  if (opts.actions?.length) {
    const role = await prisma.role.create({ data: { name: uniq('role') } });
    for (const action of opts.actions) {
      const perm = await prisma.permission.upsert({ where: { module_action: { module: 'companies', action } }, create: { module: 'companies', action }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, companyId: company.id };
}
const dto = (over: Partial<CreateCompanyDto> = {}) => Object.assign(new CreateCompanyDto(), { name: 'Acme Apparel', slug: uniq('acme'), ...over });
const validate = (body: any) => nexuscoreValidationPipe.transform(body, { type: 'body', metatype: CreateCompanyDto });
/** The validation pipe's 400, matched on its field messages. */
const invalid = (body: any, re: RegExp) =>
  assert.rejects(validate(body), (e: any) => { assert.equal(e?.getStatus?.(), 400); assert.match(JSON.stringify(e.getResponse()), re); return true; });
const rejects = (p: Promise<unknown>, status: number, re: RegExp) =>
  assert.rejects(p, (e: any) => { assert.equal(e?.getStatus?.(), status); assert.match(JSON.stringify(e.getResponse?.() ?? e.message), re); return true; });

describe('Authorization', () => {
  test('every route requires its companies:* permission (RolesGuard), not just a login', () => {
    const reflector = new Reflector();
    const need = (name: string, method: string) => {
      const handler = (CompaniesController.prototype as any)[name];
      return resolveRequiredPermissions(<T>(k: string) => reflector.getAllAndOverride<T>(k, [handler, CompaniesController]), method);
    };
    assert.deepEqual(need('create', 'POST'), { kind: 'permissions', permissions: [PROVISIONING_PERMISSIONS.create], source: 'explicit' });
    assert.deepEqual(need('list', 'GET'), { kind: 'permissions', permissions: [PROVISIONING_PERMISSIONS.read], source: 'explicit' });
    assert.deepEqual(need('get', 'GET'), { kind: 'permissions', permissions: [PROVISIONING_PERMISSIONS.read], source: 'explicit' });
    assert.deepEqual(need('access', 'GET'), { kind: 'authenticated' });
  });

  test('a user whose company is not the platform owner is refused, even holding the permission', async () => {
    const a = await actor({ owner: false, actions: ['create', 'read'] });
    const before = await prisma.company.count();
    await rejects(svc.create(a, dto()), 403, /platform owner/);
    await rejects(svc.list(a), 403, /platform owner/);
    await rejects(svc.get(a, a.companyId), 403, /platform owner/);
    assert.equal(await prisma.company.count(), before, 'nothing created');
    assert.deepEqual((await svc.access(a)).data, { isPlatformOwner: false, canCreate: false, canViewAll: false, canInviteAdmin: false, trialDefaultDays: null });
  });

  test('the Create button is offered only to platform-owner users holding companies:create', async () => {
    assert.deepEqual((await svc.access(await actor({ owner: true, actions: ['create', 'read'] }))).data, { isPlatformOwner: true, canCreate: true, canViewAll: true, canInviteAdmin: false, trialDefaultDays: null });
    assert.deepEqual((await svc.access(await actor({ owner: true }))).data, { isPlatformOwner: true, canCreate: false, canViewAll: false, canInviteAdmin: false, trialDefaultDays: null });
  });

  test('a client can never set isPlatformOwner, an id, a plan or any other unlisted field', async () => {
    for (const extra of [{ isPlatformOwner: true }, { id: 'x' }, { plan: 'Enterprise' }, { companyId: 'x' }]) {
      await assert.rejects(validate({ name: 'X', slug: 'x-co', ...extra }), (e: any) => e?.getStatus?.() === 400);
    }
  });
});

describe('Registering a company', () => {
  test('creates the company and its default branch, with one audit event and no users', async () => {
    const owner = await actor({ owner: true, actions: ['create'] });
    const input = await validate({ name: '  Acme Apparel ', slug: ` ${uniq('Acme-Apparel')} `, email: ` Ops-${RUN}@Acme.test `, phone: '+92 300', address: '', industry: 'Apparel', website: 'acme.test' });
    const res: any = await svc.create(owner, input);
    const c = res.data;
    assert.equal(c.name, 'Acme Apparel');
    assert.match(c.slug, /^acme-apparel-/);
    assert.equal(c.email, `ops-${RUN}@acme.test`);
    assert.equal(c.address, null, 'blank optional field is not stored');
    assert.equal(c.isPlatformOwner, false);
    assert.deepEqual(c.branches.map((b: any) => b.name), ['Main Branch']);
    assert.equal(c._count.users, 0, 'no user created or moved');
    assert.ok(!('metaAppSecret' in c));
    const events = await prisma.auditLog.findMany({ where: { entityType: 'Company', entityId: c.id } });
    assert.deepEqual(events.map((e) => [e.action, e.companyId, e.changedBy, e.documentNo]), [['create', owner.companyId, owner.id, c.slug]]);
    assert.equal(await prisma.user.count({ where: { companyId: owner.companyId } }), 1, "the platform owner's users are untouched");
  });

  test('required fields and formats are validated server-side', async () => {
    await invalid({ slug: 'a-co' }, /Company Name is required|name/);
    await invalid({ name: '   ', slug: 'a-co' }, /Company Name is required/);
    await invalid({ name: 'A' }, /Company URL is required|slug/);
    for (const slug of ['Has Space', 'under_score', '-lead', 'trail-', 'double--hyphen']) {
      await invalid({ name: 'A', slug }, /lowercase letters, numbers and single hyphens/);
    }
    await invalid({ name: 'A', slug: 'a-co', email: 'not-an-email' }, /valid email/);
    await invalid({ name: 'A', slug: 'a-co', website: 'not a url' }, /valid URL/);
  });

  test('a taken or reserved Company URL, or a taken email, is refused and creates nothing', async () => {
    const owner = await actor({ owner: true, actions: ['create'] });
    const first: any = await svc.create(owner, dto({ email: `${uniq('dup')}@test.invalid` }));
    const before = await prisma.company.count();
    await rejects(svc.create(owner, dto({ slug: first.data.slug })), 409, /already in use/);
    await rejects(svc.create(owner, dto({ email: first.data.email })), 409, /already exists/);
    await rejects(svc.create(owner, dto({ slug: 'legacy-erp' })), 400, /reserved/);
    assert.equal(await prisma.company.count(), before);
  });

  test('a failure part-way through leaves no company and no branch behind', async () => {
    const owner = await actor({ owner: true, actions: ['create'] });
    const slug = uniq('rollback');
    // The audit event (inside the same transaction) fails: its user does not exist.
    await assert.rejects(svc.create({ ...owner, id: '00000000-0000-0000-0000-000000000000' }, dto({ slug })));
    assert.equal(await prisma.company.count({ where: { slug } }), 0);
    assert.equal(await prisma.branch.count({ where: { company: { slug } } }), 0);
  });
});

describe('Company isolation', () => {
  test('only the platform owner lists or opens other companies, and never sees their secrets', async () => {
    const owner = await actor({ owner: true, actions: ['read'] });
    const other = await actor({ owner: false });
    const listed: any = await svc.list(owner);
    assert.ok(listed.data.some((c: any) => c.id === other.companyId));
    assert.ok(listed.data.every((c: any) => !('metaAppSecret' in c) && !('metaAppId' in c)));
    const one: any = await svc.get(owner, other.companyId);
    assert.equal(one.data.id, other.companyId);
    await rejects(svc.get(owner, '00000000-0000-0000-0000-000000000000'), 404, /not found/);
    await rejects(svc.get(other, owner.companyId), 403, /platform owner/);
  });
});
