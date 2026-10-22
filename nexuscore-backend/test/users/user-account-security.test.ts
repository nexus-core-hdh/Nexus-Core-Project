// User account changes — PATCH /users/:id and POST /users/set-password/:id: company isolation,
// no takeover of a more privileged account, and an audit entry for every password change that
// never holds a secret. Throwaway full-schema test database (`npm run test:users`, the same
// isolated "_test" database the serial-card / packing-list suites use); every test seeds its own
// uniquely-named companies, roles, permissions and users; nothing is deleted.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import 'reflect-metadata';
import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as bcrypt from 'bcrypt';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { UsersService, type UserActor } from '../../src/modules/users/users.service';
import { UsersController } from '../../src/modules/users/users.controller';
import { PERMISSIONS_KEY } from '../../src/common/decorators/permissions.decorator';

let prisma: PrismaService;
let svc: UsersService;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}-${RUN}-${++seq}`;
const INITIAL_PASSWORD = 'Initial-Pass-123';

/** Rejects with an HttpException of `status`. */
async function rejectsWith(p: Promise<unknown>, status: number, message?: RegExp) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof HttpException, `expected HttpException, got ${e}`);
    assert.equal(e.getStatus(), status, e.message);
    if (message) assert.match(e.message, message);
    return true;
  });
}

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  svc = new UsersService(prisma, new AuditService(prisma));
});
after(async () => { await prisma.$disconnect(); });

// --- fixtures ----------------------------------------------------------------------------------
const permission = (module: string, action: string) =>
  prisma.permission.upsert({ where: { module_action: { module, action } }, create: { module, action }, update: {}, select: { id: true } });

async function role(perms: { id: string }[], isSystem = false) {
  return prisma.role.create({
    data: { name: uniq('role'), isSystem, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } },
    select: { id: true },
  });
}

async function user(companyId: string, roles: { id: string }[] = [], extra: Record<string, unknown> = {}) {
  const u = await prisma.user.create({
    data: {
      companyId, name: uniq('user'), email: `${uniq('u')}@test.invalid`,
      password: await bcrypt.hash(INITIAL_PASSWORD, 4), mustChangePassword: false, ...extra,
      userRoles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
    select: { id: true, companyId: true },
  });
  return u;
}

const actorOf = (u: { id: string; companyId: string }): UserActor => ({ id: u.id, companyId: u.companyId });
const row = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });
const auditRows = (entityId: string) => prisma.auditLog.findMany({ where: { entityType: 'User', entityId }, orderBy: { createdAt: 'asc' } });

/** Two companies, a ladder of roles, and users at each rung. */
async function world() {
  const [usersUpdate, rolesManage] = await Promise.all([permission('users', 'update'), permission('roles', 'manage')]);
  const extra = await permission(uniq('secmod'), 'approve'); // a permission only "plus" accounts hold
  const editor = await role([usersUpdate]);
  const editorPlus = await role([usersUpdate, extra]);
  const manager = await role([usersUpdate, rolesManage]);
  const fullAccess = await role([usersUpdate, extra], true);
  const companyA = await prisma.company.create({ data: { name: uniq('Company A') } });
  const companyB = await prisma.company.create({ data: { name: uniq('Company B') } });
  const branchA = await prisma.branch.create({ data: { name: 'A1', companyId: companyA.id } });
  const branchB = await prisma.branch.create({ data: { name: 'B1', companyId: companyB.id } });
  return {
    companyA, companyB, branchA, branchB,
    aEditor: await user(companyA.id, [editor]),
    aPlain: await user(companyA.id),
    aPlus: await user(companyA.id, [editorPlus]),
    aManager: await user(companyA.id, [manager]),
    aAdmin: await user(companyA.id, [fullAccess]),
    bPlain: await user(companyB.id),
    bManager: await user(companyB.id, [manager]),
  };
}

// --- tests -------------------------------------------------------------------------------------
describe('Routes', () => {
  test('both routes require users:update and take the actor from the session (not the request body)', () => {
    for (const handler of ['update', 'setPassword'] as const) {
      const perms = Reflect.getMetadata(PERMISSIONS_KEY, (UsersController.prototype as any)[handler]);
      assert.deepEqual(perms, [{ module: 'users', action: 'update' }], handler);
    }
    // The service methods are the only way in, and both take the actor first.
    assert.equal(UsersService.prototype.update.length, 3);
    assert.equal(UsersService.prototype.setPassword.length, 3);
  });
});

describe('Same company, authorized', () => {
  test('users:update resets a plain colleague: typed and generated, hashed, change required at next login', async () => {
    const w = await world();
    const typed = await svc.setPassword(actorOf(w.aEditor), w.aPlain.id, { password: 'Typed-New-Pass-1' });
    assert.deepEqual(typed, { message: 'Password reset' }, 'typed password never returned');
    let r = await row(w.aPlain.id);
    assert.ok(await bcrypt.compare('Typed-New-Pass-1', r.password));
    assert.notEqual(r.password, 'Typed-New-Pass-1');
    assert.equal(r.mustChangePassword, true);

    const gen: any = await svc.setPassword(actorOf(w.aEditor), w.aPlain.id, { generateTemporary: true });
    assert.match(gen.temporaryPassword, /^.{14}$/);
    r = await row(w.aPlain.id);
    assert.ok(await bcrypt.compare(gen.temporaryPassword, r.password));
  });

  test('users:update edits a plain colleague and their own account; a branch of their company is accepted', async () => {
    const w = await world();
    const res = await svc.update(actorOf(w.aEditor), w.aPlain.id, { department: 'QA', branchId: w.branchA.id } as any);
    assert.equal(res.data.branchId, w.branchA.id);
    assert.equal((await row(w.aPlain.id)).department, 'QA');
    await svc.update(actorOf(w.aEditor), w.aEditor.id, { phone: '555' } as any);
    assert.equal((await row(w.aEditor.id)).phone, '555');
  });
});

describe('Cross-company — denied, nothing changes', () => {
  test('password reset of another company\'s user: "not found", password and data untouched, no audit', async () => {
    const w = await world();
    const before = await row(w.bPlain.id);
    await rejectsWith(svc.setPassword(actorOf(w.aManager), w.bPlain.id, { password: 'Hijack-Pass-123' }), 404, /User not found/);
    await rejectsWith(svc.setPassword(actorOf(w.aManager), w.bPlain.id, { generateTemporary: true }), 404);
    const afterRow = await row(w.bPlain.id);
    assert.equal(afterRow.password, before.password);
    assert.equal(afterRow.mustChangePassword, before.mustChangePassword);
    assert.equal((await auditRows(w.bPlain.id)).length, 0);
  });

  test('editing another company\'s user (incl. its password) is denied; data untouched', async () => {
    const w = await world();
    const before = await row(w.bPlain.id);
    await rejectsWith(svc.update(actorOf(w.aManager), w.bPlain.id, { name: 'Hijacked', password: 'Hijack-Pass-123' } as any), 404);
    const afterRow = await row(w.bPlain.id);
    assert.equal(afterRow.name, before.name);
    assert.equal(afterRow.password, before.password);
  });

  test('a user cannot be moved into another company or another company\'s branch', async () => {
    const w = await world();
    await rejectsWith(svc.update(actorOf(w.aManager), w.aPlain.id, { companyId: w.companyB.id } as any), 403, /another company/);
    await rejectsWith(svc.update(actorOf(w.aManager), w.aPlain.id, { branchId: w.branchB.id } as any), 400, /Branch does not belong/);
    const r = await row(w.aPlain.id);
    assert.equal(r.companyId, w.companyA.id);
    assert.equal(r.branchId, null);
    // Repeating its own company is harmless.
    await svc.update(actorOf(w.aManager), w.aPlain.id, { companyId: w.companyA.id, location: 'L1' } as any);
    assert.equal((await row(w.aPlain.id)).location, 'L1');
  });

  test('a manager of company B cannot reach company A either (isolation is symmetric)', async () => {
    const w = await world();
    await rejectsWith(svc.setPassword(actorOf(w.bManager), w.aAdmin.id, { password: 'Hijack-Pass-123' }), 404);
  });
});

describe('No takeover of a more privileged account', () => {
  test('users:update alone cannot reset or edit an account with extra permissions or a Full access role', async () => {
    const w = await world();
    const plusBefore = await row(w.aPlus.id);
    const adminBefore = await row(w.aAdmin.id);
    await rejectsWith(svc.setPassword(actorOf(w.aEditor), w.aPlus.id, { password: 'Escalate-Pass-1' }), 403, /permissions you do not have/);
    await rejectsWith(svc.update(actorOf(w.aEditor), w.aPlus.id, { name: 'x', password: 'Escalate-Pass-1' } as any), 403);
    await rejectsWith(svc.setPassword(actorOf(w.aEditor), w.aAdmin.id, { generateTemporary: true }), 403, /administrator/);
    await rejectsWith(svc.update(actorOf(w.aEditor), w.aAdmin.id, { name: 'x' } as any), 403);
    assert.deepEqual(await row(w.aPlus.id), plusBefore);
    assert.deepEqual(await row(w.aAdmin.id), adminBefore);
    assert.equal((await auditRows(w.aPlus.id)).length + (await auditRows(w.aAdmin.id)).length, 0);
  });

  test('an equally privileged account can be changed (same permission set)', async () => {
    const w = await world();
    const peer = await user(w.companyA.id, (await prisma.userRole.findMany({ where: { userId: w.aPlus.id }, select: { roleId: true } })).map((r) => ({ id: r.roleId })));
    await svc.setPassword(actorOf(w.aPlus), peer.id, { password: 'Peer-Pass-1234' });
    assert.ok(await bcrypt.compare('Peer-Pass-1234', (await row(peer.id)).password));
  });
});

describe('Existing administrator workflows still work', () => {
  test('roles:manage holders reset and edit any account of their company, including Full access ones', async () => {
    const w = await world();
    await svc.setPassword(actorOf(w.aManager), w.aAdmin.id, { password: 'Admin-New-Pass-1' });
    assert.ok(await bcrypt.compare('Admin-New-Pass-1', (await row(w.aAdmin.id)).password));
    await svc.update(actorOf(w.aManager), w.aPlus.id, { department: 'Ops' } as any);
    assert.equal((await row(w.aPlus.id)).department, 'Ops');
  });

  test('a Full access administrator resets users within their company', async () => {
    const w = await world();
    await svc.setPassword(actorOf(w.aAdmin), w.aPlus.id, { password: 'Plus-New-Pass-1' });
    assert.ok(await bcrypt.compare('Plus-New-Pass-1', (await row(w.aPlus.id)).password));
  });
});

describe('Audit trail', () => {
  test('every password change is recorded with actor, target, company, time and method — never a secret', async () => {
    const w = await world();
    const t0 = new Date(Date.now() - 1000);
    await svc.setPassword(actorOf(w.aEditor), w.aPlain.id, { password: 'Audit-Typed-Pass-1' });
    const gen: any = await svc.setPassword(actorOf(w.aEditor), w.aPlain.id, { generateTemporary: true });
    await svc.update(actorOf(w.aManager), w.aPlain.id, { password: 'Audit-Update-Pass-1' } as any);
    await svc.update(actorOf(w.aManager), w.aPlain.id, { department: 'No password here' } as any);

    const rows = await auditRows(w.aPlain.id);
    assert.deepEqual(rows.map((r) => [r.action, r.changedBy, (r.newValues as any)?.method]), [
      ['password_reset', w.aEditor.id, 'typed'],
      ['password_reset', w.aEditor.id, 'generated'],
      ['password_reset', w.aManager.id, 'user-update'],
    ], 'one entry per password change; a plain edit adds none');
    const hashNow = (await row(w.aPlain.id)).password;
    for (const r of rows) {
      assert.equal(r.companyId, w.companyA.id);
      assert.equal(r.entityId, w.aPlain.id);
      assert.ok(r.createdAt >= t0);
      assert.equal(r.oldValues, null);
      const stored = JSON.stringify(r);
      for (const secret of ['Audit-Typed-Pass-1', 'Audit-Update-Pass-1', gen.temporaryPassword, hashNow, '$2b$', 'password":']) {
        assert.ok(!stored.includes(secret), `audit row must not contain ${secret === hashNow ? 'the hash' : secret}`);
      }
    }
  });
});
