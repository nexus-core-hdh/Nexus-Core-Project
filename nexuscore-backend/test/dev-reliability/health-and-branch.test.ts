// Health endpoints (liveness/readiness for the dev launcher, the dev API proxy and process managers)
// and the costing-sheets branch rule (a user without a branch gets a clear 400 BRANCH_REQUIRED, never
// a raw Prisma error, another branch's sheets or a guessed default branch).
// Readiness runs against the throwaway test database (`npm run test:dev-reliability`).
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HealthController } from '../../src/modules/health/health.controller';
import { CostingController, requireBranch } from '../../src/modules/costing/costing.controller';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';

let prisma: PrismaService;
before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
});
after(async () => { await prisma.$disconnect(); });

describe('health endpoints', () => {
  test('liveness answers without touching the database', () => {
    const res = new HealthController({} as any).live();
    assert.equal(res.status, 'ok');
    assert.equal(typeof res.uptimeSeconds, 'number');
  });

  test('readiness checks the database', async () => {
    assert.equal((await new HealthController(prisma).ready()).status, 'ready');
  });

  test('readiness answers 503 DATABASE_UNAVAILABLE when the database fails or hangs', async () => {
    const failing = new HealthController({ $queryRaw: () => Promise.reject(new Error('connect ECONNREFUSED')) } as any);
    await assert.rejects(failing.ready(), (e: any) => e instanceof ServiceUnavailableException && (e.getResponse() as any).errors.code === 'DATABASE_UNAVAILABLE');
    const hanging = new HealthController({ $queryRaw: () => new Promise(() => {}) } as any);
    const started = Date.now();
    await assert.rejects(hanging.ready(), ServiceUnavailableException);
    assert.ok(Date.now() - started < 5000, 'bounded by the check timeout');
  });

  test('public (no token) and exempt from rate limiting', () => {
    const reflector = new Reflector();
    for (const handler of [HealthController.prototype.live, HealthController.prototype.ready]) {
      const get = <T>(key: string) => reflector.getAllAndOverride<T>(key, [handler, HealthController]);
      assert.deepEqual(resolveRequiredPermissions(get, 'GET'), { kind: 'public' });
    }
    assert.equal(Reflect.getMetadata('THROTTLER:SKIPdefault', HealthController), true);
  });
});

describe('costing sheets need the user\'s own branch', () => {
  test('a user without a branch gets 400 BRANCH_REQUIRED with a clear message', () => {
    for (const user of [{ branchId: null }, { branchId: undefined }, {}, undefined]) {
      assert.throws(() => requireBranch(user as any), (e: any) => {
        assert.ok(e instanceof BadRequestException);
        const body = e.getResponse() as any;
        assert.equal(body.errors.code, 'BRANCH_REQUIRED');
        assert.match(body.message, /no branch assigned/);
        return true;
      });
    }
    assert.equal(requireBranch({ branchId: 'b-1' }), 'b-1');
  });

  test('list/create/issue never reach the service without a branch, and use exactly the user\'s own branch otherwise', async () => {
    const calls: any[] = [];
    const svc = new Proxy({}, { get: (_t, name) => (...args: any[]) => (calls.push([name, ...args]), 'ok') }) as any;
    const ctl = new CostingController(svc);
    const noBranch = { id: 'u1', branchId: null };
    assert.throws(() => ctl.list(noBranch, {}), BadRequestException);
    assert.throws(() => ctl.create({}, noBranch), BadRequestException);
    assert.throws(() => ctl.issueForStyleCard('s1', {}, noBranch), BadRequestException);
    assert.throws(() => ctl.issueForSampleCard('s1', {}, noBranch), BadRequestException);
    assert.deepEqual(calls, [], 'no query ran');

    const user = { id: 'u2', branchId: 'branch-A', companyId: 'company-A' };
    ctl.list(user, { limit: '200' });
    ctl.create({ styleCode: 'X' }, user);
    assert.deepEqual(calls, [['list', 'branch-A', { limit: '200' }], ['create', { styleCode: 'X' }, 'branch-A', 'u2', 'company-A']]);
  });
});
