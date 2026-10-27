// Report Builder — Legacy ERP database-table sources (legacy-schema-catalog.ts) against the real
// database: discovery from pg_catalog, FK joins, one-to-many aggregates, restricted tables and
// columns, stale field keys, and running generated queries. Read-only: nothing is written.
//
// Run: npm run test:report-builder (uses the *_packing_test database, like the other suites)
import { test, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { LegacySchemaCatalog, MAX_TO_ONE_HOPS, humanize } from '../../src/modules/reports/legacy-schema-catalog';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { useTestDatabase } from '../packing-list/test-db';

// The Packing List throwaway database (full legacy schema); never the development database.
useTestDatabase();

const prisma = new PrismaClient();
const schema = new LegacySchemaCatalog(prisma as any);
const reports = new ReportBuilderService(prisma as any, { recordSafe: async () => undefined } as any);
const user = { id: 'test', companyId: 'test' };

after(() => prisma.$disconnect());

test('humanize turns identifiers into labels', () => {
  assert.equal(humanize('InventoryCode'), 'Inventory Code');
  assert.equal(humanize('WarehouseId'), 'Warehouse ID');
  assert.equal(humanize('RecId'), 'Record ID');
  assert.equal(humanize('UD_Brands'), 'UD Brands');
});

test('sources come from the catalog: legacy tables only, restricted ones left out', async () => {
  const sources = await schema.sources();
  const tables = new Set(sources.map((s) => s.table));
  assert.ok(tables.has('IM_Item') && tables.has('IM_Warehouse') && tables.has('MA_WorkOrder'));
  assert.ok(sources.length > 300, `expected hundreds of tables, got ${sources.length}`);
  for (const t of tables) assert.match(t, /^[A-Z]{2}_[A-Za-z0-9]+$/, `${t} is not a legacy table`);
  for (const restricted of ['MD_User', 'MD_UserRight', 'LC_Activation', 'MD_Location', 'HR_Employee', 'MD_DBVersion']) {
    assert.ok(!tables.has(restricted), `${restricted} must not be offered`);
  }
  assert.ok(!tables.has('StyleCard') && !tables.has('User'), 'Prisma application tables are not offered');
  assert.equal(sources.find((s) => s.table === 'IM_Item')?.label, 'Inventory Card');
});

test('sensitive and binary columns are never offered', async () => {
  const { groups } = await schema.describe('table:MD_Company');
  const columns = groups[0].fields.map((f) => f.column);
  assert.ok(!columns.includes('Password'));
  const all = (await schema.sources()).map((s) => s.key);
  for (const key of all.slice(0, 600)) {
    const { groups: [own] } = await schema.describe(key);
    for (const f of own.fields) assert.doesNotMatch(String(f.column), /pass(word)?|pwd|secret|token|hash/i, `${key}.${f.column}`);
  }
});

test('base table, its referenced tables (to-one) and referencing tables (to-many counts) are grouped', async () => {
  const { groups } = await schema.describe('table:IM_Item');
  const [base] = groups;
  assert.equal(base.relation, 'base');
  assert.ok(base.fields.some((f) => f.key === 'InventoryCode' && f.type === 'string'));
  assert.ok(base.fields.some((f) => f.key === 'HasVariant' && f.type === 'boolean'), 'UdtBool columns are booleans');
  assert.ok(!base.fields.some((f) => f.key === 'IsDeleted'));

  const warehouse = groups.find((g) => g.relation === 'to-one' && g.table === 'IM_Warehouse');
  assert.ok(warehouse, 'IM_Item → IM_Warehouse is discovered from its FK');
  assert.match(warehouse!.via!, /IM_Item\.WarehouseId → IM_Warehouse\.RecId/);
  assert.ok(warehouse!.fields.some((f) => f.key.endsWith('/WarehouseName')));

  const lines = groups.find((g) => g.relation === 'to-many' && g.table === 'IM_ReceiptItem');
  assert.ok(lines, 'IM_ReceiptItem → IM_Item is discovered as an incoming one-to-many link');
  assert.deepEqual(lines!.fields.map((f) => f.label), ['Number of Rows']);
  assert.ok(lines!.expandable);
});

test('several FKs to the same table are told apart by their column', async () => {
  const { groups } = await schema.describe('table:IM_Receipt');
  const warehouses = groups.filter((g) => g.relation === 'to-one' && g.table === 'IM_Warehouse');
  assert.ok(warehouses.length >= 2);
  assert.equal(new Set(warehouses.map((g) => g.label)).size, warehouses.length, 'each link has its own label');
  assert.equal(new Set(warehouses.map((g) => g.id)).size, warehouses.length, 'each link has its own path');
});

test('expanding a to-many group lists totals; expanding a to-one group goes one link further', async () => {
  const { groups } = await schema.describe('table:IM_Item');
  const lines = groups.find((g) => g.relation === 'to-many' && g.table === 'IM_ReceiptItem')!;
  const { groups: [full] } = await schema.describe('table:IM_Item', lines.id);
  assert.ok(full.fields.some((f) => f.key === `${lines.id}/#sum:Quantity`));
  assert.ok(!full.fields.some((f) => /#sum:(RecId|InventoryId)$/.test(f.key)), 'keys are not summed');

  const warehouse = groups.find((g) => g.relation === 'to-one' && g.table === 'IM_Warehouse')!;
  const { groups: deeper } = await schema.describe('table:IM_Item', warehouse.id);
  assert.ok(deeper.length > 0);
  assert.ok(deeper.every((g) => g.id.startsWith(`${warehouse.id}/`)));
  assert.ok(!deeper.some((g) => g.id === `${warehouse.id}/<IM_Item~${warehouse.id.slice(1)}`), 'no link straight back');
});

test('field keys are validated against the catalog; stale or forged keys are rejected', async () => {
  const { fields, missing } = await schema.resolveFields('table:IM_Item', [
    'InventoryCode', 'NoSuchColumn', '>FK_Nope/Name', 'IsDeleted', 'InventoryCode"; DROP TABLE x; --',
  ]);
  assert.deepEqual(fields.map((f) => f.key), ['InventoryCode']);
  assert.equal(missing.length, 4);
  await assert.rejects(schema.buildSource('table:IM_Item', ['NoSuchColumn']), /no longer available/);
  await assert.rejects(schema.buildSource('table:MD_User', ['Name']), /not available/);
  await assert.rejects(schema.buildSource('table:"IM_Item"; --', []), /not available/);
});

test('a to-many link cannot be followed further or used for a plain column', async () => {
  const { groups } = await schema.describe('table:IM_Item');
  const lines = groups.find((g) => g.relation === 'to-many' && g.table === 'IM_ReceiptItem')!;
  const { missing } = await schema.resolveFields('table:IM_Item', [`${lines.id}/Quantity`, `${lines.id}/>FK_X/Name`]);
  assert.equal(missing.length, 2);
});

test(`links are limited to ${MAX_TO_ONE_HOPS} hops`, async () => {
  // A chain of linked tables that each have links of their own: Inventory Card → Current Account → ...
  let path = '';
  for (let i = 0; i < MAX_TO_ONE_HOPS; i++) {
    const { groups } = await schema.describe('table:IM_Item', path);
    const candidates = groups.filter((g) => g.relation === 'to-one' && g.expandable);
    let next: (typeof candidates)[number] | undefined;
    for (const g of candidates) {
      if (i === MAX_TO_ONE_HOPS - 1 || (await schema.describe('table:IM_Item', g.id)).groups.some((x) => x.relation === 'to-one')) { next = g; break; }
    }
    if (i === MAX_TO_ONE_HOPS - 1) next ??= groups.find((g) => g.relation === 'to-one');
    assert.ok(next, `a to-one link at depth ${i + 1}`);
    assert.equal(next!.depth, i + 1);
    path = next!.id;
  }
  const deepest = await schema.describe('table:IM_Item', path).catch(() => ({ groups: [] }));
  assert.equal(deepest.groups.length, 0, `nothing beyond ${MAX_TO_ONE_HOPS} links`);
  const { missing } = await schema.resolveFields('table:IM_Item', [`${path}/>FK_Any/RecId`]);
  assert.equal(missing.length, 1);
});

test('generated query runs: one row per base row, joins and aggregates included', async () => {
  const { groups } = await schema.describe('table:IM_Item');
  const warehouse = groups.find((g) => g.relation === 'to-one' && g.table === 'IM_Warehouse')!;
  const lines = groups.find((g) => g.relation === 'to-many' && g.table === 'IM_ReceiptItem')!;
  const definition = {
    name: 'Test',
    dataSource: 'table:IM_Item',
    columns: [
      { field: 'RecId' }, { field: 'InventoryCode' }, { field: `${warehouse.id}/WarehouseName` },
      { field: `${lines.id}/#count` }, { field: `${lines.id}/#sum:Quantity`, total: true },
    ],
    filters: [{ id: 'f1', field: 'InventoryCode', operator: 'contains', value: "'; DROP TABLE x; --" }],
    sorting: [{ field: `${warehouse.id}/WarehouseName`, direction: 'asc' as const }],
  };
  const filtered = await reports.preview('legacy-erp', definition, {}, user);
  assert.equal(filtered.rowCount, 0, 'filter value is a bound parameter, not SQL');

  const all = await reports.preview('legacy-erp', { ...definition, filters: [] }, {}, user);
  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "IM_Item" WHERE "IsDeleted" = 0`;
  assert.equal(all.rowCount, Math.min(n, 50));
  const ids = all.rows.map((r) => r.RecId);
  assert.equal(new Set(ids).size, ids.length, 'no row is multiplied');
  assert.ok(all.rows.every((r) => typeof r[`${lines.id}/#count`] === 'number'));
});

test('validate lists the relationship path; table sources are only for Legacy ERP', async () => {
  const { groups } = await schema.describe('table:IM_Item');
  const warehouse = groups.find((g) => g.relation === 'to-one' && g.table === 'IM_Warehouse')!;
  const result = await reports.validate('legacy-erp', {
    name: '', dataSource: 'table:IM_Item', columns: [{ field: `${warehouse.id}/WarehouseName` }],
  });
  assert.equal(result.valid, true);
  assert.match(result.joinPaths[0], /IM_Item\.WarehouseId → IM_Warehouse\.RecId/);
  await assert.rejects(reports.validate('plm', { name: 'x', dataSource: 'table:IM_Item', columns: [{ field: 'InventoryCode' }] }), /valid data source/);
});

test('every discovered table runs: its columns, linked-table columns and row counts', async () => {
  const failures: string[] = [];
  const sources = await schema.sources();
  for (const s of sources) {
    const { groups } = await schema.describe(s.key);
    const [own, ...related] = groups;
    const toOne = related.filter((g) => g.relation === 'to-one' && g.fields.length).slice(0, 8);
    const toMany = related.filter((g) => g.relation === 'to-many').slice(0, 6);
    const columns = [
      ...own.fields.slice(0, 40).map((f) => ({ field: f.key })),
      ...toOne.map((g) => ({ field: g.fields[0].key })),
      ...toMany.map((g) => ({ field: g.fields[0].key })),
    ];
    if (!columns.length) continue;
    const sortable = own.fields.find((f) => f.type === 'string') ?? own.fields[0];
    try {
      const r = await reports.preview('legacy-erp', {
        name: 'Sweep', dataSource: s.key, columns,
        sorting: sortable ? [{ field: sortable.key, direction: 'asc' }] : [],
        filters: sortable?.type === 'string' ? [{ id: 'f', field: sortable.key, operator: 'isNotEmpty' }] : [],
      }, {}, user);
      assert.equal(r.columns.length, columns.length);
    } catch (e) {
      failures.push(`${s.table}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  assert.deepEqual(failures, [], `${failures.length} of ${sources.length} tables failed`);
});

test('curated sources still validate and run as before', async () => {
  const result = await reports.preview('legacy-erp', {
    name: 'Test', dataSource: 'inventory-items', columns: [{ field: 'code' }, { field: 'warehouse.name' }],
  }, {}, user);
  assert.deepEqual(result.columns.map((c) => c.key), ['code', 'warehouse.name']);
});
