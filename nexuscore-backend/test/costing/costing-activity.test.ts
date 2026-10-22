// A created Costing Sheet is recorded as one CREATE audit event and shows in the dashboard's Recent
// Activity for its own company only. Throwaway full-schema test database (`npm run test:costing`);
// every test seeds its own company/branch/user, so Recent Activity is scoped to just that seed.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../../src/modules/audit/audit.service';
import { CostingService } from '../../src/modules/costing/costing.service';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';

let prisma: PrismaService;
let audit: AuditService;
let costing: CostingService;
let dashboard: DashboardService;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`.toUpperCase();

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  audit = new AuditService(prisma);
  costing = new CostingService(prisma, null as any, audit); // sheet creation never reads masters
  dashboard = new DashboardService(prisma, null as any, null as any, null as any); // recentActivity reads prisma only
});
after(async () => { await prisma.$disconnect(); });

async function tenant() {
  const company = await prisma.company.create({ data: { name: `Costing Activity ${uniq('')}` } });
  const branch = await prisma.branch.create({ data: { name: 'CA', companyId: company.id } });
  const user = await prisma.user.create({ data: { companyId: company.id, branchId: branch.id, name: 'Costing User', email: `${uniq('ca')}@test.invalid`, password: 'x' } });
  return { companyId: company.id, branchId: branch.id, userId: user.id };
}
const events = (entityId: string) => prisma.auditLog.findMany({ where: { entityType: 'CostingSheet', entityId } });

describe('Costing Sheet creation is recorded for Recent Activity', () => {
  test('create persists the sheet and exactly one CREATE event, attributed to the user and company', async () => {
    const t = await tenant();
    const costingNo = uniq('CS-');
    const sheet = await costing.create({ costingNo, styleCode: 'ST-1' }, t.branchId, t.userId, t.companyId);
    const saved = await prisma.costingSheet.findUnique({ where: { id: sheet.id } });
    assert.equal(saved?.costingNo, costingNo);
    assert.equal(saved?.branchId, t.branchId);
    const rows = await events(sheet.id);
    assert.equal(rows.length, 1, 'exactly one event');
    assert.equal(rows[0].action, AUDIT_ACTIONS.CREATE);
    assert.equal(rows[0].changedBy, t.userId);
    assert.equal(rows[0].companyId, t.companyId);
    assert.equal(rows[0].documentNo, costingNo);
    assert.equal(rows[0].screenKey, '/plm/costing-sheets');
  });

  test('Recent Activity lists the new sheet first, for its own company only', async () => {
    const t = await tenant();
    // older activity of the kinds already on the dashboard (Work Order, receipt) — more than one page
    for (let i = 0; i < 10; i++) {
      await audit.record({ userId: t.userId, companyId: t.companyId, entityType: i % 2 ? 'MA_WorkOrder' : 'IM_Receipt', entityId: String(i), action: AUDIT_ACTIONS.CREATE, documentNo: `OLD-${i}` });
    }
    const sheet = await costing.create({ costingNo: uniq('CS-') }, t.branchId, t.userId, t.companyId);

    const feed = await dashboard.recentActivity(t.companyId, t.branchId, 8);
    assert.equal(feed.length, 8);
    assert.equal(feed[0].documentNo, sheet.costingNo, 'newest event first, inside the first page');
    assert.equal(feed[0].action, 'created');
    assert.equal(feed[0].userName, 'Costing User');
    assert.match(feed[0].label, /Costing Sheet/);
    assert.equal(feed.filter((e) => e.documentNo === sheet.costingNo).length, 1, 'shown once');
    assert.ok(feed.some((e) => e.label === 'Work Order') && feed.some((e) => e.label === 'Receipt'), 'existing Work Order / receipt events still listed');

    const other = await tenant();
    const otherFeed = await dashboard.recentActivity(other.companyId, other.branchId, 20);
    assert.ok(!otherFeed.some((e) => e.documentNo === sheet.costingNo), 'another company never sees it');
    assert.deepEqual(await dashboard.recentActivity('', undefined, 20), [], 'no company -> nothing');
  });

  test('issuing from a Style Card or Sample Card is recorded with the card as its parent', async () => {
    const t = await tenant();
    const style = await prisma.styleCard.create({ data: { styleNumber: uniq('ST-'), title: 'Polo', branchId: t.branchId, createdBy: t.userId } });
    const fromStyle = await costing.issueForStyleCard(style.id, {}, t.branchId, t.userId, t.companyId);
    const [s] = await events(fromStyle.id);
    assert.equal(s.action, AUDIT_ACTIONS.CREATE);
    assert.equal(s.parentEntityType, 'StyleCard');
    assert.equal(s.parentDocumentNo, style.styleNumber);

    const sampleType = await prisma.styleSampleType.create({ data: { name: 'Proto', code: uniq('STY') } });
    const sample = await prisma.sampleCard.create({ data: { sampleNumber: uniq('SM-'), sampleTypeId: sampleType.id, title: 'Proto', branchId: t.branchId, createdBy: t.userId } });
    const fromSample = await costing.issueForSampleCard(sample.id, {}, t.branchId, t.userId, t.companyId);
    const [m] = await events(fromSample.id);
    assert.equal(m.parentEntityType, 'SampleCard');
    assert.equal(m.parentDocumentNo, sample.sampleNumber);
  });

  test('a failed save leaves neither a sheet nor an event; a failed event leaves no sheet', async () => {
    const t = await tenant();
    const before = await prisma.auditLog.count({ where: { companyId: t.companyId } });

    const badDate = uniq('CS-');
    await assert.rejects(costing.create({ costingNo: badDate, costingDate: 'not-a-date' }, t.branchId, t.userId, t.companyId));
    assert.equal(await prisma.costingSheet.count({ where: { costingNo: badDate } }), 0);

    const badUser = uniq('CS-');
    await assert.rejects(costing.create({ costingNo: badUser }, t.branchId, '00000000-0000-0000-0000-000000000000', t.companyId));
    assert.equal(await prisma.costingSheet.count({ where: { costingNo: badUser } }), 0, 'rolled back with its event');

    assert.equal(await prisma.auditLog.count({ where: { companyId: t.companyId } }), before, 'no misleading events');
    assert.equal((await dashboard.recentActivity(t.companyId, t.branchId, 20)).length, 0);
  });
});
