// One-off: gives the four STANDARD ROUTE processes that have no legacy process (01 KNITTING,
// 02 GARMENT DYEING, 08 PRINTING, 07 PACKING) a legacy MA_Process each and links them through the
// explicit ProcessCard.legacyProcessId — so Order Manufacturing Entry can record them (03 SEWING is
// already linked to 12 Sewing). MA_Process has no create screen/API (the 'process' Master Lookup is
// search-only), so the rows are inserted the way the Master Lookup creates its masters and exactly
// like the two existing rows: code, name, InUse 1, IsDeleted 0, InsertedAt, InsertedBy 1, UUID.
//
// Safety:
//  - Dry run by default (read-only): prints every check and the exact rows/links it would write.
//  - --apply requires --backup=<pg_dump file> written in the last 60 minutes.
//  - Refuses if any Process Card is missing, renamed or already linked, or if a live MA_Process
//    already uses one of the codes or names (MA_Process has no unique constraint — checked here,
//    case-insensitive, like the Master Lookup). Never links by matching names.
//  - One transaction; the checks are repeated inside it. Touches only the 4 new MA_Process rows,
//    those 4 ProcessCard.legacyProcessId values and the `sequence` of Route 03's 5 lines (KNITTING,
//    SEWING, GARMENT DYEING, PRINTING, PACKING = 0..4; refused unless the Route has exactly those
//    lines) — no existing MA_Process row, manufacturing entry or other Route.
//
// Run:   npx ts-node scripts/link-standard-route-legacy-processes.ts
//        npx ts-node scripts/link-standard-route-legacy-processes.ts --apply --backup=<file>
import * as fs from 'fs';
import { Prisma, PrismaClient } from '@prisma/client';

export type LinkPlan = { processCardCode: string; processCardName: string; code: string; name: string }[];

export const STANDARD_ROUTE_PLAN: LinkPlan = [
  { processCardCode: '01', processCardName: 'KNITTING', code: '01', name: 'Knitting' },
  { processCardCode: '02', processCardName: 'GARMENT DYEING', code: '02', name: 'Garment Dyeing' },
  { processCardCode: '08', processCardName: 'PRINTING', code: '08', name: 'Printing' },
  { processCardCode: '07', processCardName: 'PACKING', code: '07', name: 'Packing' },
];

/** A Route whose saved order is written as RouteCardLine.sequence (0, 1, ...) — its lines must be
 *  exactly these Process Card codes, each once (the Route Card screen never stored sequence before). */
export type RouteOrder = { routeCode: string; routeName: string; processCardCodes: string[] };

export const STANDARD_ROUTE_ORDER: RouteOrder = { routeCode: '03', routeName: 'STANDARD ROUTE', processCardCodes: ['01', '03', '02', '08', '07'] };

type Tx = Prisma.TransactionClient | PrismaClient;

/** Reasons the Route order must not be written (empty = safe), and the line ids in the wanted order. */
export async function checkRouteOrder(db: Tx, order: RouteOrder): Promise<{ problems: string[]; lineIds: string[] }> {
  const routes = await db.$queryRaw<any[]>`SELECT "id", "name" FROM "RouteCard" WHERE "code" = ${order.routeCode}`;
  if (routes.length !== 1) return { problems: [`expected one Route Card ${order.routeCode}, found ${routes.length}.`], lineIds: [] };
  if (String(routes[0].name).trim().toUpperCase() !== order.routeName) return { problems: [`Route Card ${order.routeCode} is "${routes[0].name}", expected "${order.routeName}".`], lineIds: [] };
  const lines = await db.$queryRaw<any[]>`
    SELECT l."id", pc."code" FROM "RouteCardLine" l JOIN "ProcessCard" pc ON pc."id" = l."processId" WHERE l."routeCardId" = ${routes[0].id}`;
  const codes = lines.map((l) => String(l.code)).sort();
  const wanted = [...order.processCardCodes].sort();
  if (JSON.stringify(codes) !== JSON.stringify(wanted)) return { problems: [`Route ${order.routeCode} lines are [${codes.join(', ')}], expected exactly [${wanted.join(', ')}].`], lineIds: [] };
  return { problems: [], lineIds: order.processCardCodes.map((c) => String(lines.find((l) => String(l.code) === c)!.id)) };
}

/** Every reason the plan must not be applied (empty = safe), and the Process Cards it would link. */
export async function checkPlan(db: Tx, plan: LinkPlan): Promise<{ problems: string[]; cards: Map<string, { id: string; name: string; legacyProcessId: number | null }> }> {
  const problems: string[] = [];
  const cards = new Map<string, { id: string; name: string; legacyProcessId: number | null }>();
  for (const p of plan) {
    const rows = await db.$queryRaw<any[]>`SELECT "id", "name", "legacyProcessId" FROM "ProcessCard" WHERE "code" = ${p.processCardCode}`;
    const card = rows[0];
    if (!card) { problems.push(`Process Card ${p.processCardCode} does not exist.`); continue; }
    if (String(card.name).trim().toUpperCase() !== p.processCardName) problems.push(`Process Card ${p.processCardCode} is "${card.name}", expected "${p.processCardName}".`);
    if (card.legacyProcessId != null) problems.push(`Process Card ${p.processCardCode} ${card.name} is already linked to MA_Process ${card.legacyProcessId}.`);
    cards.set(p.processCardCode, { id: card.id, name: card.name, legacyProcessId: card.legacyProcessId == null ? null : Number(card.legacyProcessId) });
    const clash = await db.$queryRaw<any[]>`
      SELECT "RecId" as id, "ProcessCode" as code, "ProcessName" as name FROM "MA_Process"
      WHERE COALESCE("IsDeleted", 0) = 0 AND (LOWER("ProcessCode") = LOWER(${p.code}) OR LOWER("ProcessName") = LOWER(${p.name}))`;
    for (const c of clash) problems.push(`MA_Process ${c.id} "${c.code} ${c.name}" already uses the code or name of "${p.code} ${p.name}".`);
  }
  return { problems, cards };
}

/** Inserts the plan's MA_Process rows and links them (and, given `order`, writes that Route's line
 *  sequence), in one transaction; every check is repeated inside it. */
export async function applyPlan(prisma: PrismaClient, plan: LinkPlan, order?: RouteOrder) {
  return prisma.$transaction(async (tx) => {
    const again = await checkPlan(tx, plan);
    const route = order ? await checkRouteOrder(tx, order) : { problems: [], lineIds: [] };
    const problems = [...again.problems, ...route.problems];
    if (problems.length) throw new Error(`checks failed inside the transaction: ${problems.join(' | ')}`);
    for (const [sequence, lineId] of route.lineIds.entries()) {
      const n = await tx.$executeRaw`UPDATE "RouteCardLine" SET "sequence" = ${sequence} WHERE "id" = ${lineId}`;
      if (n !== 1) throw new Error(`could not order Route line ${lineId}`);
    }
    const out: { code: string; name: string; recId: number; processCardId: string }[] = [];
    for (const p of plan) {
      const card = again.cards.get(p.processCardCode)!;
      const [row] = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO "MA_Process" ("ProcessCode", "ProcessName", "InUse", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
        VALUES (${p.code}, ${p.name}, 1, now(), 1, 0, gen_random_uuid()) RETURNING "RecId" as id`;
      const recId = Number(row.id);
      const linked = await tx.$executeRaw`UPDATE "ProcessCard" SET "legacyProcessId" = ${recId} WHERE "id" = ${card.id} AND "legacyProcessId" IS NULL`;
      if (linked !== 1) throw new Error(`could not link Process Card ${p.processCardCode}`);
      out.push({ code: p.code, name: p.name, recId, processCardId: card.id });
    }
    return out;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const backup = args.find((a) => a.startsWith('--backup='))?.slice('--backup='.length);
  const PLAN = STANDARD_ROUTE_PLAN;
  const prisma = new PrismaClient();
  try {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    console.log(`database: ${db} — ${apply ? 'APPLY' : 'dry run (read-only)'}`);
    const linkCheck = await checkPlan(prisma, PLAN);
    const routeCheck = await checkRouteOrder(prisma, STANDARD_ROUTE_ORDER);
    const problems = [...linkCheck.problems, ...routeCheck.problems];
    console.log('\nplanned changes:');
    for (const p of PLAN) {
      const c = linkCheck.cards.get(p.processCardCode);
      console.log(`  + MA_Process "${p.code}" "${p.name}" (InUse 1, IsDeleted 0)  ->  ProcessCard ${p.processCardCode} ${c?.name ?? '?'} [${c?.id ?? '?'}].legacyProcessId: ${c?.legacyProcessId ?? 'null'} -> <new RecId>`);
    }
    console.log(`  ~ Route ${STANDARD_ROUTE_ORDER.routeCode} ${STANDARD_ROUTE_ORDER.routeName}: RouteCardLine.sequence 0..4 for Process Cards ${STANDARD_ROUTE_ORDER.processCardCodes.join(', ')} (lines ${routeCheck.lineIds.join(', ') || '?'})`);
    if (problems.length) {
      console.log('\nREFUSED — checks failed:');
      for (const m of problems) console.log(`  - ${m}`);
      process.exitCode = 1;
      return;
    }
    console.log('\nall checks passed: Process Cards present, unlinked; codes and names free among live MA_Process rows; Route lines exactly as expected.');
    if (!apply) { console.log('dry run: nothing written. Re-run with --apply --backup=<pg_dump file> to apply.'); return; }

    if (!backup || !fs.existsSync(backup) || fs.statSync(backup).size === 0 || Date.now() - fs.statSync(backup).mtimeMs > 60 * 60_000) {
      console.log('\nREFUSED — --apply needs --backup=<a non-empty pg_dump file written in the last 60 minutes>.');
      process.exitCode = 1;
      return;
    }
    const created = await applyPlan(prisma, PLAN, STANDARD_ROUTE_ORDER);
    console.log('\napplied:');
    for (const c of created) console.log(`  MA_Process ${c.recId} "${c.code} ${c.name}"  <-  ProcessCard ${c.processCardId}`);
    console.log(`  Route ${STANDARD_ROUTE_ORDER.routeCode}: sequence 0..4 = ${STANDARD_ROUTE_ORDER.processCardCodes.join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
