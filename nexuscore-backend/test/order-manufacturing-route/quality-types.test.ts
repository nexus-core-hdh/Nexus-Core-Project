// Order Manufacturing Entry — the Type (Quality Type) of a Manufacturing IN entry. Its options are
// the legacy master MA_QualityType (no enum, no hardcoded list); an entry stores the chosen RecId in
// MA_WorkOrderProduction.ProductionSubType. Adds Hole, Defected, Rejected and Others with the real
// one-off (scripts/add-manufacturing-quality-types.ts) on the throwaway test database
// (`npm run test:om-route`) and checks: the Type options and their order, saving and reopening an
// entry of every type (and none), existing A / B Quality entries unchanged, the screen's per-type
// totals, the Process Follow-up report's mapping, and duplicate prevention. The rows this test adds
// are soft-deleted afterwards so other suites on the same database see the master unchanged.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { LegacyMasterLookupService } from '../../src/modules/legacy-erp/legacy-master-lookup.service';
import { WorkOrderService } from '../../src/modules/legacy-erp/work-order.service';
import { OrderManufacturingService } from '../../src/modules/legacy-erp/order-manufacturing.service';
import { QUALITY_COLUMNS } from '../../src/modules/legacy-erp/process-follow-up.service';
import { MANUFACTURING_QUALITY_TYPES, addQualityTypes, checkQualityTypes } from '../../scripts/add-manufacturing-quality-types';

let prisma: PrismaService;
let svc: OrderManufacturingService;
let companyId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<{ id: number }[]>(sql))[0].id);
const ids: Record<string, number> = {};
const added: number[] = [];

/** Soft-deletes the four types (left over by an interrupted run, or added by this one). */
const retireTestTypes = () => prisma.$executeRaw`
  UPDATE "MA_QualityType" SET "IsDeleted" = 1, "DeletedAt" = now()
  WHERE COALESCE("IsDeleted", 0) = 0 AND "QualityName" IN (${Prisma.join(MANUFACTURING_QUALITY_TYPES.map((t) => t.name))})`;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  await retireTestTypes();
  const audit = new AuditService(prisma);
  const cuttingStub = {
    getColorMatrix: async () => ({ colors: [{ color: 'RED', bySize: { S: { orderQty: 100, willBeCutQty: 105 } } }], sizes: ['S'], extraCuttingPercent: 5 }),
    getCutTotalsByColor: async () => new Map(),
  };
  svc = new OrderManufacturingService(prisma, audit, new WorkOrderService(prisma, audit, new LegacyMasterLookupService(prisma, null as any)), cuttingStub as any, { resolveBomLines: async () => [] } as any);
  companyId = (await prisma.company.create({ data: { name: `OM Types ${RUN}` } })).id;
  // A Work Order without a Route (every process allowed), one RED/S variant, a factory, a process.
  ids.process = await one(Prisma.sql`INSERT INTO "MA_Process" ("ProcessCode", "ProcessName", "IsDeleted") VALUES (${`T${RUN}`.slice(0, 20)}, ${`Printing ${RUN}`}, 0) RETURNING "RecId" as id`);
  ids.wo = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("CompanyId", "WorkOrderNo", "IsDeleted") VALUES (1, ${`W/O-Q${RUN}`.slice(0, 25)}, 0) RETURNING "RecId" as id`);
  const item = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${ids.wo}, 1, 0) RETURNING "RecId" as id`);
  await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "IsDeleted") VALUES (${item}, ${'RED‖S'}, 0)`;
  ids.factory = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (1, ${`Q${RUN}`}, 'Factory', 0) RETURNING "RecId" as id`);
  // A Quality / B Quality as in the live master (codes A / B) — only if this database has none yet.
  for (const [code, name] of [['A', 'A Quality'], ['B', 'B Quality']]) {
    const existing = await prisma.$queryRaw<{ id: number }[]>`SELECT "RecId" as id FROM "MA_QualityType" WHERE COALESCE("IsDeleted", 0) = 0 AND "QualityName" = ${name} ORDER BY "RecId" LIMIT 1`;
    ids[code] = existing[0] ? Number(existing[0].id) : await one(Prisma.sql`INSERT INTO "MA_QualityType" ("QualityCode", "QualityName", "InUse", "IsDeleted") VALUES (${code}, ${name}, 1, 0) RETURNING "RecId" as id`);
  }
});
after(async () => {
  if (added.length) await prisma.$executeRaw`UPDATE "MA_QualityType" SET "IsDeleted" = 1, "DeletedAt" = now() WHERE "RecId" IN (${Prisma.join(added)})`;
  await prisma.$disconnect();
});

const saveIn = (qualityTypeId: number | null, doc: string, qty: number) => svc.saveEntries({
  workOrderId: ids.wo, processId: ids.process, color: 'RED', mode: 'in',
  rows: [{ factoryId: ids.factory, date: '2026-10-30', documentNo: doc, qualityTypeId, sizes: { S: qty } }],
}, '1', companyId);
const reopen = async () => (await svc.getEntries(ids.wo, ids.process, 'RED', 'in')).entries;

test('Type options: A Quality, B Quality, then Hole, Defected, Rejected, Others — each once; existing entries unchanged', async () => {
  // An entry saved before the new types exist (as today's live A / B entries).
  await saveIn(ids.A, `OLD-A-${RUN}`.slice(0, 20), 7);
  await saveIn(ids.B, `OLD-B-${RUN}`.slice(0, 20), 3);
  const before = await reopen();

  assert.deepEqual(await checkQualityTypes(prisma, MANUFACTURING_QUALITY_TYPES), [], 'codes and names are free');
  const created = await addQualityTypes(prisma, MANUFACTURING_QUALITY_TYPES);
  added.push(...created.map((c) => c.id));
  assert.deepEqual(created.map((c) => [c.code, c.name]), [['H', 'Hole'], ['D', 'Defected'], ['R', 'Rejected'], ['O', 'Others']]);
  const rows = await prisma.$queryRaw<any[]>`SELECT "QualityCode" as code, "InUse" as "inUse", "IsDeleted" as "isDeleted", "UUID" as uuid FROM "MA_QualityType" WHERE "RecId" IN (${Prisma.join(added)}) ORDER BY "RecId"`;
  assert.ok(rows.every((r) => r.inUse === 1 && r.isDeleted === 0 && r.uuid), 'shaped like the existing rows');

  // The Type dropdown's options (what the Manufacturing IN screen lists, in its order).
  // (This shared test database may hold extra A / B Quality rows from other suites; the live master has one each.)
  const options = (await svc.getEntries(ids.wo, ids.process, 'RED', 'in')).qualityTypes as { id: number; name: string }[];
  const ours = options.filter((q) => [ids.A, ids.B, ...added].includes(q.id)).map((q) => q.name);
  assert.deepEqual(ours, ['A Quality', 'B Quality', 'Hole', 'Defected', 'Rejected', 'Others'], 'A / B first, then the four in order');
  for (const name of ['Hole', 'Defected', 'Rejected', 'Others']) assert.equal(options.filter((q) => q.name === name).length, 1, `${name} listed once`);

  // Duplicates are refused — a second run adds nothing.
  const again = await checkQualityTypes(prisma, MANUFACTURING_QUALITY_TYPES);
  assert.equal(again.length, 4);
  await assert.rejects(addQualityTypes(prisma, MANUFACTURING_QUALITY_TYPES), /checks failed inside the transaction/);
  assert.deepEqual(await reopen(), before, 'existing A / B entries reopen exactly as before');
});

test('every Type (and none) saves and reopens with the chosen type; the screen totals it per type', async () => {
  const byName = new Map(MANUFACTURING_QUALITY_TYPES.map((t, i) => [t.name, added[i]]));
  const types: [string, number | null][] = [['A Quality', ids.A], ['B Quality', ids.B], ...[...byName].map(([n, id]) => [n, id] as [string, number]), ['(none)', null]];
  for (const [i, [name, id]] of types.entries()) {
    await saveIn(id, `T${i}-${RUN}`.slice(0, 20), 10 + i);
    const entry = (await reopen()).find((e) => e.documentNo === `T${i}-${RUN}`.slice(0, 20));
    assert.ok(entry, `${name}: saved`);
    assert.equal(entry!.qualityTypeId, id, `${name}: reopened with its type`);
  }
  // Changing an entry's type keeps it (edit of an existing record).
  const hole = (await reopen()).find((e) => e.qualityTypeId === byName.get('Hole'))!;
  await svc.saveEntries({ workOrderId: ids.wo, processId: ids.process, color: 'RED', mode: 'in', rows: [{ ...hole, qualityTypeId: byName.get('Others')! }] as any }, '1', companyId);
  assert.equal((await reopen()).find((e) => e.id === hole.id)!.qualityTypeId, byName.get('Others'));
  // Order Manufacturing Entry's read model: Received is every IN entry; each type has its own total.
  const ctx: any = await svc.getContext(ids.wo, ids.process);
  const all = await reopen();
  const sumOf = (id: number | null) => all.filter((e) => e.qualityTypeId === id).reduce((t, e) => t + e.sizes.S, 0);
  assert.equal(ctx.rows[0].totals.received, all.reduce((t, e) => t + e.sizes.S, 0));
  for (const id of [ids.A, ids.B, ...added]) assert.equal(ctx.rows[0].byQuality[String(id)] ?? 0, sumOf(id), `type ${id} total`);
  for (const id of added) assert.ok(ctx.qualityColumns.some((q: any) => q.id === id), 'a quality column per new type');
  // An unknown type is still refused.
  await assert.rejects(saveIn(987654, `BAD-${RUN}`.slice(0, 20), 1), /Unknown Type/);
});

test('the Process Follow-up report puts each new type in its own column; A / B Quality unchanged', () => {
  const column = (code: string, name: string) => QUALITY_COLUMNS.find((c) => c.match(code.toLowerCase(), name.toLowerCase()))?.key;
  assert.deepEqual(MANUFACTURING_QUALITY_TYPES.map((t) => column(t.code, t.name)), ['hole', 'defected', 'rejection', 'others']);
  assert.equal(column('A', 'A Quality'), 'aQuality');
  assert.equal(column('B', 'B Quality'), 'bQuality');
});
