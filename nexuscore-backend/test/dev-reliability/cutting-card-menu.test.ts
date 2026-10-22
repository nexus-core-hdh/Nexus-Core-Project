// Cutting Card in the navigation: scripts/seed-cutting-card-menu-item.ts (a step of prisma/setup.ts)
// adds exactly one top-level "Legacy ERP" MenuItem — what the sidebar and "Search screens…" read via
// GET /menu-items — and running it again changes nothing. Access stays with the API's own
// 'cutting-cards' permission. Runs the real script against the throwaway test database.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME, TEST_DATABASE_URL } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MenuItemsService } from '../../src/modules/menu-items/menu-items.service';
import { CuttingCardController } from '../../src/modules/legacy-erp/cutting-card.controller';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';

const HREF = '/legacy-erp/cutting-card';
const BACKEND = path.resolve(__dirname, '../..');
let prisma: PrismaService;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
});
after(async () => { await prisma.$disconnect(); });

const runSeed = () => execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', 'scripts/seed-cutting-card-menu-item.ts'], {
  cwd: BACKEND, env: { ...process.env, NEXUSCORE_DATABASE_URL: TEST_DATABASE_URL }, encoding: 'utf8',
});
const flatten = (items: any[]): any[] => items.flatMap((i) => [i, ...flatten(i.children ?? i.items ?? [])]);

describe('Cutting Card menu entry', () => {
  test('the seed adds exactly one top-level Legacy ERP entry; re-running it changes nothing', async () => {
    const othersBefore = await prisma.menuItem.findMany({ where: { href: { not: HREF } }, orderBy: { id: 'asc' } });
    runSeed();
    const out = runSeed();
    assert.match(out, /skip \(exists\)/);

    const rows = await prisma.menuItem.findMany({ where: { href: { startsWith: HREF } } });
    assert.equal(rows.length, 1, 'one entry, and no Cutting Entry (/entry) entry');
    assert.equal(rows[0].title, 'Cutting Card');
    assert.equal(rows[0].group, 'Legacy ERP');
    assert.equal(rows[0].parentId, null);
    assert.equal(rows[0].isActive, true);
    assert.equal(rows[0].companyId, null, 'company-wide, like every other Legacy ERP screen');

    const othersAfter = await prisma.menuItem.findMany({ where: { href: { not: HREF } }, orderBy: { id: 'asc' } });
    assert.deepEqual(othersAfter, othersBefore, 'no other menu entry (or saved order) touched');
  });

  test('GET /menu-items returns it for any company/branch', async () => {
    const company = await prisma.company.create({ data: { name: `Cutting Menu ${Date.now()}` } });
    const branch = await prisma.branch.create({ data: { name: 'CM', companyId: company.id } });
    const svc = new MenuItemsService(prisma);
    for (const [c, b] of [[company.id, branch.id], [company.id, undefined], [undefined, undefined]] as const) {
      const hits = flatten(await svc.getMenuItems(c, b)).filter((i) => i.href === HREF);
      assert.equal(hits.length, 1);
    }
  });

  test('access is unchanged: every Cutting Card write still needs the cutting-cards permission', () => {
    const reflector = new Reflector();
    const writes = Object.getOwnPropertyNames(CuttingCardController.prototype)
      .map((name) => ({ name, method: Reflect.getMetadata(METHOD_METADATA, (CuttingCardController.prototype as any)[name]) }))
      .filter((h) => [RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE].includes(h.method));
    assert.ok(writes.length > 0);
    for (const h of writes) {
      const handler = (CuttingCardController.prototype as any)[h.name];
      const get = <T>(key: string) => reflector.getAllAndOverride<T>(key, [handler, CuttingCardController]);
      const res: any = resolveRequiredPermissions(get, RequestMethod[h.method]);
      assert.equal(res.kind, 'permissions', h.name);
      assert.ok(res.permissions.every((p: any) => p.module === 'cutting-cards'), h.name);
    }
  });
});
