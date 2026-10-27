// Style Card BOM header Route → Route Code (PlmCardsService). Throwaway full-schema test database
// (`npm run test:style-route`). The Style Card's selected Route (bomRouteCardId → RouteCard) comes
// back with its master code on get, list (the Work Order's Style lookup) and update, so the
// frontend can show / carry the Route Code; saving the BOM header changes only its own fields.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PlmCardsService } from '../../src/modules/plm/plm-cards.service';

let prisma: PrismaService;
let svc: PlmCardsService;
let branchId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
const ids: Record<string, string> = {};

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  // Only prisma is used by the get / list / update paths under test.
  svc = new PlmCardsService(prisma, null as any, null as any, null as any);
  const company = await prisma.company.create({ data: { name: `Route ${RUN}` } });
  branchId = (await prisma.branch.create({ data: { name: 'RT', companyId: company.id } })).id;
  ids.standard = (await prisma.routeCard.create({ data: { code: `03-${RUN}`, name: 'STANDARD ROUTE', branchId } })).id;
  ids.wash = (await prisma.routeCard.create({ data: { code: `07-${RUN}`, name: 'WASH ROUTE', branchId, inUse: false } })).id;
  const style = (n: string, data: Record<string, unknown>) => prisma.styleCard.create({ data: { styleNumber: `SC-${RUN}-${n}`, title: n, branchId, createdBy: 'u1', ...data } });
  ids.blankCode = (await style('blank', { bomRouteCardId: ids.standard })).id; // existing record: Route set, Route Code blank
  ids.ownCode = (await style('own', { bomRouteCardId: ids.standard, bomRouteCode: 'R-77' })).id;
  ids.noRoute = (await style('none', {})).id;
});
after(async () => { await prisma.$disconnect(); });

test('get: the selected Route comes with its master code; a saved Route Code is untouched', async () => {
  const blank: any = await svc.getStyleCard(ids.blankCode);
  assert.deepEqual([blank.bomRouteCode, blank.bomRouteCard], [null, { id: ids.standard, name: 'STANDARD ROUTE', code: `03-${RUN}` }]);
  const own: any = await svc.getStyleCard(ids.ownCode);
  assert.deepEqual([own.bomRouteCode, own.bomRouteCard.code], ['R-77', `03-${RUN}`]);
  const none: any = await svc.getStyleCard(ids.noRoute);
  assert.deepEqual([none.bomRouteCode, none.bomRouteCard], [null, null]);
});

test('list (the Work Order Style lookup) carries the Route master code', async () => {
  const res: any = await svc.listStyleCards(branchId, { search: RUN, limit: '50' });
  const rows: any[] = Array.isArray(res) ? res : res.data;
  const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
  assert.equal(byTitle.blank.bomRouteCard.code, `03-${RUN}`);
  assert.equal(byTitle.own.bomRouteCode, 'R-77');
  assert.equal(byTitle.none.bomRouteCard, null);
});

test('saving the BOM header (Route change + derived Route Code) changes only those fields; an inactive Route keeps its code', async () => {
  const before: any = await prisma.styleCard.findUniqueOrThrow({ where: { id: ids.blankCode } });
  // What the BOM tab sends on Save: its header fields only.
  const updated: any = await svc.updateStyleCard(ids.blankCode, { bomRouteCardId: ids.wash, bomRouteCode: `07-${RUN}`, bomEmbroideryRoute: '', bomCmtPrice: 0, bomRunningQuantity: 0 });
  assert.deepEqual(updated.bomRouteCard, { id: ids.wash, name: 'WASH ROUTE', code: `07-${RUN}` });
  const after: any = await svc.getStyleCard(ids.blankCode);
  assert.equal(after.bomRouteCode, `07-${RUN}`, 'saved and restored on reopen');
  for (const k of ['styleNumber', 'title', 'status', 'season', 'specialCode', 'accessCode', 'inUse', 'branchId', 'createdBy']) {
    assert.deepEqual(after[k], before[k], `${k} unchanged`);
  }
});
