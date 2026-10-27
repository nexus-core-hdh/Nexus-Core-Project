// Order Manufacturing Entry — the Process dropdown from the Work Order's Route
// (OrderManufacturingService.allowedProcesses / saveEntries). Throwaway full-schema test database
// (`npm run test:om-route`); the tests seed their own processes in both masters, the explicit
// ProcessCard.legacyProcessId links, Route Cards, Style Cards, Work Orders and entries — modelled
// on the live STANDARD ROUTE (Knitting / Sewing / Garment Dyeing / Printing / Packing, where only
// Sewing has a legacy process, under another code). Route Card master data is only created here.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { LegacyMasterLookupService } from '../../src/modules/legacy-erp/legacy-master-lookup.service';
import { WorkOrderService } from '../../src/modules/legacy-erp/work-order.service';
import { OrderManufacturingService, resolveRouteProcesses } from '../../src/modules/legacy-erp/order-manufacturing.service';

let prisma: PrismaService;
let svc: OrderManufacturingService;
let companyId: string;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<{ id: number }[]>(sql))[0].id);
const ids: Record<string, any> = {};
const CUT = `Cutting ${RUN}`;
const SEW = `Sewing ${RUN}`;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  const lookup = new LegacyMasterLookupService(prisma, null as any);
  // Real Work Order service; the cutting / requirements services only feed the screen summary
  // saveEntries returns (colour matrix, cut totals, BOM materials) — minimal read-only stubs.
  const cuttingStub = {
    getColorMatrix: async () => ({ colors: [{ color: 'RED', bySize: { S: { orderQty: 0, willBeCutQty: 0 } } }], sizes: ['S'], extraCuttingPercent: 0 }),
    getCutTotalsByColor: async () => new Map(),
  };
  svc = new OrderManufacturingService(prisma, audit, new WorkOrderService(prisma, audit, lookup), cuttingStub as any, { resolveBomLines: async () => [] } as any);
  companyId = (await prisma.company.create({ data: { name: `OM Route ${RUN}` } })).id;
  const branchId = (await prisma.branch.create({ data: { name: 'OMR', companyId } })).id;

  // Legacy process master (what entries store).
  const maProcess = (code: string, name: string, deleted = 0) => one(Prisma.sql`INSERT INTO "MA_Process" ("ProcessCode", "ProcessName", "IsDeleted") VALUES (${code}, ${name}, ${deleted}) RETURNING "RecId" as id`);
  ids.cut = await maProcess(`05${RUN}`.slice(0, 20), CUT);
  ids.sew = await maProcess(`12${RUN}`.slice(0, 20), SEW);
  ids.goneLegacy = await maProcess(`99${RUN}`.slice(0, 20), `Dyeing ${RUN}`, 1); // deleted
  // PLM process master (what Route Card lines name), linked explicitly — codes unlike the legacy ones.
  const card = async (code: string, name: string, legacyProcessId: number | null) => {
    const id = (await prisma.processCard.create({ data: { code: `${code}-${RUN}`, name } })).id;
    await prisma.$executeRaw`UPDATE "ProcessCard" SET "legacyProcessId" = ${legacyProcessId} WHERE "id" = ${id}`;
    return id;
  };
  ids.pcKnit = await card('01', 'KNITTING', null);
  ids.pcSew = await card('03', 'SEWING', ids.sew); // 03 here, 12 in MA_Process
  ids.pcDye = await card('02', 'GARMENT DYEING', ids.goneLegacy); // linked to a deleted legacy process
  ids.pcPrint = await card('08', 'PRINTING', null);
  ids.pcPack = await card('07', 'PACKING', null);
  ids.pcCut = await card('05', 'CUTTING', ids.cut);
  const route = async (code: string, lines: [string, number, boolean?][]) => {
    const r = await prisma.routeCard.create({ data: { code: `${code}-${RUN}`, name: `${code} ROUTE`, branchId } });
    for (const [processId, sequence, isActive = true] of lines) await prisma.routeCardLine.create({ data: { routeCardId: r.id, processId, sequence, isActive } });
    return r.id;
  };
  ids.rStd = await route('STD', [[ids.pcKnit, 1], [ids.pcSew, 2], [ids.pcDye, 3], [ids.pcPrint, 4], [ids.pcPack, 5]]);
  ids.rCut = await route('CUT', [[ids.pcCut, 1]]);
  ids.rSew = await route('SEW', [[ids.pcSew, 1], [ids.pcCut, 2, false]]); // Cutting line inactive
  ids.rBoth = await route('BOTH', [[ids.pcCut, 2], [ids.pcSew, 1]]); // route order: Sewing, Cutting
  ids.rEmpty = await route('EMPTY', []);
  ids.rKnit = await route('KNIT', [[ids.pcKnit, 1]]);

  const style = async (n: string, routeId: string | null) => (await prisma.styleCard.create({ data: { styleNumber: `SC-${RUN}-${n}`, title: n, branchId, createdBy: 'u1', bomRouteCardId: routeId } })).id;
  const workOrder = async (n: string, styleId: string | null) => {
    const id = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("WorkOrderNo", "StyleCardId", "IsDeleted") VALUES (${`W/O-${n}${RUN}`.slice(0, 25)}, ${styleId}, 0) RETURNING "RecId" as id`);
    const item = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${id}, 1, 0) RETURNING "RecId" as id`);
    await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "IsDeleted") VALUES (${item}, ${'RED‖S'}, 0)`;
    return id;
  };
  for (const [k, r] of [['Std', ids.rStd], ['Cut', ids.rCut], ['Sew', ids.rSew], ['Both', ids.rBoth], ['Empty', ids.rEmpty], ['Knit', ids.rKnit], ['None', null]] as const) {
    ids[`style${k}`] = await style(k, r);
    ids[`wo${k}`] = await workOrder(`${k[0]}${k[1]}`, ids[`style${k}`]);
  }
  ids.factory = await one(Prisma.sql`INSERT INTO "FI_Account" ("CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${`F${RUN}`}, 'Factory', 0) RETURNING "RecId" as id`);
});
after(async () => { await prisma.$disconnect(); });

const routeNames = async (wo: number) => (await svc.allowedProcesses(wo)).routeProcesses.map((r) => r.routeProcess.name);
const selectable = async (wo: number) => (await svc.allowedProcesses(wo)).processes.map((p) => p.name);

test('resolving: only through the explicit link; no link / a deleted link is kept and flagged', () => {
  const legacy = new Map([[12, { id: 12, code: '12', name: 'Sewing' }]]);
  const line = (code: string, name: string, legacyProcessId: number | null) => ({ processCardId: code, code, name, legacyProcessId });
  const r = resolveRouteProcesses([line('01', 'KNITTING', null), line('03', 'SEWING', 12), line('02', 'GARMENT DYEING', 77)], legacy);
  assert.deepEqual(r.map((x) => [x.routeProcess.name, x.legacy?.name ?? null, x.problem]),
    [['KNITTING', null, 'not-linked'], ['SEWING', 'Sewing', null], ['GARMENT DYEING', null, 'linked-process-missing']]);
  assert.equal(resolveRouteProcesses([line('09', 'Sewing', null)], legacy)[0].problem, 'not-linked', 'a same name alone is not a link');
});

test('STANDARD-like route: all five processes in route order; SEWING (03) resolves to its legacy process (12); the others are reported', async () => {
  const a = await svc.allowedProcesses(ids.woStd);
  assert.equal(a.restricted, true);
  assert.deepEqual(a.routeProcesses.map((r) => `${r.routeProcess.code.split('-')[0]} ${r.routeProcess.name}`), ['01 KNITTING', '03 SEWING', '02 GARMENT DYEING', '08 PRINTING', '07 PACKING']);
  const sew = a.routeProcesses[1];
  assert.deepEqual([sew.legacy?.id, sew.legacy?.code, sew.problem], [ids.sew, `12${RUN}`.slice(0, 20), null], 'different codes, explicit link');
  assert.deepEqual(a.processes.map((p) => p.id), [ids.sew], 'only Sewing can be recorded');
  assert.deepEqual(a.routeProcesses.map((r) => r.problem), ['not-linked', null, 'linked-process-missing', 'not-linked', 'not-linked']);
  assert.equal(a.diagnostics.length, 4, 'one diagnostic per unavailable process — none silently omitted');
  for (const n of ['KNITTING', 'GARMENT DYEING', 'PRINTING', 'PACKING']) assert.ok(a.diagnostics.some((d) => d.includes(n)), n);
});

test('Cutting only / Sewing only (inactive line ignored) / both in route order', async () => {
  assert.deepEqual(await selectable(ids.woCut), [CUT]);
  assert.deepEqual(await routeNames(ids.woSew), ['SEWING'], 'an inactive route line does not count');
  assert.deepEqual(await selectable(ids.woBoth), [SEW, CUT], 'Sewing (seq 1) before Cutting (seq 2)');
});

test('a linked Route never falls back to every process; no Route keeps the full list', async () => {
  const empty = await svc.allowedProcesses(ids.woEmpty);
  assert.deepEqual([empty.restricted, empty.reason, empty.processes.length], [true, 'no-route-processes', 0]);
  assert.match(empty.diagnostics[0], /has no active processes/);
  const knit = await svc.allowedProcesses(ids.woKnit);
  assert.deepEqual([knit.restricted, knit.processes.length, knit.routeProcesses.length], [true, 0, 1], 'unlinked-only route: listed, nothing selectable, no fallback');
  const total = Number((await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) as n FROM "MA_Process" WHERE COALESCE("IsDeleted", 0) = 0`)[0].n);
  const none = await svc.allowedProcesses(ids.woNone);
  assert.deepEqual([none.restricted, none.reason, none.processes.length, none.routeProcesses.length], [false, 'no-route', total, 0]);
  await assert.rejects(svc.allowedProcesses(-1), /Work order not found/);
});

test('changing the Style Card\'s Route, or the Work Order\'s Style Card, changes the options', async () => {
  await prisma.styleCard.update({ where: { id: ids.styleCut }, data: { bomRouteCardId: ids.rSew } });
  assert.deepEqual(await selectable(ids.woCut), [SEW]);
  await prisma.styleCard.update({ where: { id: ids.styleCut }, data: { bomRouteCardId: ids.rCut } });
  await prisma.$executeRaw`UPDATE "MA_WorkOrder" SET "StyleCardId" = ${ids.styleStd} WHERE "RecId" = ${ids.woCut}`;
  assert.deepEqual(await routeNames(ids.woCut), ['KNITTING', 'SEWING', 'GARMENT DYEING', 'PRINTING', 'PACKING']);
  await prisma.$executeRaw`UPDATE "MA_WorkOrder" SET "StyleCardId" = ${ids.styleCut} WHERE "RecId" = ${ids.woCut}`;
  assert.deepEqual(await selectable(ids.woCut), [CUT]);
});

test('saving: Route processes (other codes) accepted; off-Route rejected; historical entries stay editable', async () => {
  const row = (qty: number, doc: string, id?: number) => ({ ...(id ? { id } : {}), factoryId: ids.factory, date: '2026-10-01', documentNo: doc, sizes: { S: qty } });
  const save = (wo: number, processId: number, rows: any[]) => svc.saveEntries({ workOrderId: wo, processId, color: 'RED', mode: 'out', rows }, '1', companyId);
  const entries = async (wo: number, processId: number) => ((await (svc as any).loadEntries(wo, processId, 'RED', 'out')) as any[])
    .map((e) => ({ ...e, total: Object.values(e.sizes as Record<string, number>).reduce((a, b) => a + b, 0) }));

  // A historical Cutting entry on the STANDARD-like Work Order (recorded before the Route said otherwise).
  const pid = await one(Prisma.sql`INSERT INTO "MA_WorkOrderProduction" ("WorkOrderItemId", "ProductionType", "ProcessId", "CurrentAccountId", "DocumentNo", "InOut", "IsRepair", "ProductionDate", "Quantity", "IsDeleted")
    SELECT it."RecId", 1, ${ids.cut}, ${ids.factory}, 'HIST-1', 2, 0, '2026-09-01'::date, 10, 0 FROM "MA_WorkOrderItem" it WHERE it."WorkOrderId" = ${ids.woStd} RETURNING "RecId" as id`);
  const v = await one(Prisma.sql`SELECT iv."RecId" as id FROM "MA_WorkOrderItemVariant" iv JOIN "MA_WorkOrderItem" it ON it."RecId" = iv."WorkOrderItemId" WHERE it."WorkOrderId" = ${ids.woStd}`);
  await prisma.$executeRaw`INSERT INTO "MA_WorkOrderProductionVariant" ("WorkOrderProductionId", "WorkOrderItemVariantId", "Quantity", "IsDeleted") VALUES (${pid}, ${v}, 10, 0)`;

  await save(ids.woStd, ids.sew, [row(6, 'SEW-1')]);
  assert.deepEqual((await entries(ids.woStd, ids.sew)).map((e) => [e.documentNo, e.total]), [['SEW-1', 6]], 'Route process (03 SEWING → 12 Sewing) saves');
  await assert.rejects(save(ids.woStd, ids.cut, [row(5, 'NEW-1')]), /is not on this Work Order's Route \(STD ROUTE\).*Sewing/, 'off-Route process rejected, naming what is allowed');
  const [hist] = await entries(ids.woStd, ids.cut);
  assert.deepEqual([hist.documentNo, hist.total], ['HIST-1', 10], 'historical entry still readable');
  await save(ids.woStd, ids.cut, [row(12, 'HIST-1', hist.id)]);
  assert.equal((await entries(ids.woStd, ids.cut))[0].total, 12, 'and editable');
  await assert.rejects(save(ids.woKnit, ids.sew, [row(1, 'K-1')]), /none is linked yet/, 'a Route with nothing linked accepts no new entry');
  await save(ids.woNone, ids.cut, [row(4, 'NR-1')]);
  assert.equal((await entries(ids.woNone, ids.cut)).length, 1, 'no Route: any process, as before');
  const agg = await (svc as any).loadAggregates(ids.woStd, ids.sew);
  assert.equal(agg.bySizeByColor.get('red').S.sent, 6, 'the screen\'s own totals are unchanged');
});

test('Process Card link (the Legacy Process selector): validated, one-to-one, and it makes the Route process recordable', async () => {
  const { PlmDefinitionsService } = await import('../../src/modules/plm/plm-definitions.service');
  const defs = new PlmDefinitionsService(prisma);
  await assert.rejects(defs.updateProcessCard(ids.pcKnit, { legacyProcessId: 'abc' }), /Choose a valid Legacy Process/);
  await assert.rejects(defs.updateProcessCard(ids.pcKnit, { legacyProcessId: 999999999 }), /does not exist/);
  await assert.rejects(defs.updateProcessCard(ids.pcKnit, { legacyProcessId: ids.goneLegacy }), /does not exist/, 'a deleted legacy process cannot be linked');
  await assert.rejects(defs.updateProcessCard(ids.pcKnit, { legacyProcessId: ids.sew }), /already linked to Process 03-.* SEWING/, 'one legacy process stands for one Route process');
  const before = await prisma.processCard.findUniqueOrThrow({ where: { id: ids.pcKnit } });
  await defs.updateProcessCard(ids.pcKnit, { name: before.name }); // a save without the field keeps the link as it is
  assert.equal((await prisma.processCard.findUniqueOrThrow({ where: { id: ids.pcKnit } })).legacyProcessId, null);

  // Linking KNITTING to a (new, test-only) legacy process makes it selectable and saveable on the STANDARD-like route.
  const knitLegacy = await one(Prisma.sql`INSERT INTO "MA_Process" ("ProcessCode", "ProcessName", "IsDeleted") VALUES (${`01${RUN}`.slice(0, 20)}, ${`Knitting ${RUN}`}, 0) RETURNING "RecId" as id`);
  await defs.updateProcessCard(ids.pcKnit, { legacyProcessId: String(knitLegacy) });
  const a = await svc.allowedProcesses(ids.woStd);
  assert.deepEqual(a.processes.map((p) => p.id), [knitLegacy, ids.sew], 'route order: KNITTING (1), SEWING (2)');
  assert.equal(a.diagnostics.length, 3, 'only GARMENT DYEING / PRINTING / PACKING still reported');
  await svc.saveEntries({ workOrderId: ids.woStd, processId: knitLegacy, color: 'RED', mode: 'out', rows: [{ factoryId: ids.factory, date: '2026-10-02', documentNo: 'KN-1', sizes: { S: 3 } }] }, '1', companyId);
  assert.equal(((await (svc as any).loadEntries(ids.woStd, knitLegacy, 'RED', 'out')) as any[]).length, 1);
  // Clearing the link takes it out again (its saved entry stays).
  await defs.updateProcessCard(ids.pcKnit, { legacyProcessId: '' });
  assert.deepEqual((await svc.allowedProcesses(ids.woStd)).processes.map((p) => p.id), [ids.sew]);
  assert.equal(((await (svc as any).loadEntries(ids.woStd, knitLegacy, 'RED', 'out')) as any[]).length, 1, 'historical entry kept');
});

test('every linked process of a Route saves; an off-Route process does not', async () => {
  const save = (processId: number, doc: string) => svc.saveEntries({ workOrderId: ids.woBoth, processId, color: 'RED', mode: 'out', rows: [{ factoryId: ids.factory, date: '2026-10-03', documentNo: doc, sizes: { S: 2 } }] }, '1', companyId);
  await save(ids.sew, 'B-SEW'); // 03 SEWING → 12 Sewing
  await save(ids.cut, 'B-CUT'); // 05 CUTTING → 05 Cutting
  const unrelated = await one(Prisma.sql`INSERT INTO "MA_Process" ("ProcessCode", "ProcessName", "IsDeleted") VALUES (${`77${RUN}`.slice(0, 20)}, ${`Washing ${RUN}`}, 0) RETURNING "RecId" as id`);
  await assert.rejects(save(unrelated, 'B-X'), /is not on this Work Order's Route \(BOTH ROUTE\)/);
});
