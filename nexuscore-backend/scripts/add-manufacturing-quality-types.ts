// One-off: adds the Quality Types Hole, Defected, Rejected and Others to the legacy master
// MA_QualityType — the Type dropdown of Order Manufacturing Entry's Manufacturing IN / OUT / Repair
// screens lists that master (OrderManufacturingService.qualityTypes: not deleted, in use, by RecId),
// entries store the chosen RecId in MA_WorkOrderProduction.ProductionSubType, and saving accepts
// only an existing one. The 'quality-type' Master Lookup is search-only (no create screen/API), so
// the rows are inserted exactly like the two existing ones (A Quality / B Quality): code, name,
// InUse 1, IsDeleted 0, InsertedAt, InsertedBy 1, UUID — codes in their one-letter style.
//
// The names are the ones the Process Follow-up report already recognises for its Hole, Defected,
// Rejection and Others columns (process-follow-up.service.ts QUALITY_COLUMNS).
//
// Safety: dry run by default (read-only). --apply requires --backup=<pg_dump file> written in the last
// 60 minutes; refuses if a live row already uses one of the codes or names (MA_QualityType has no
// unique constraint — checked here, case-insensitive); one transaction, checks repeated inside it.
// Touches no existing row and no manufacturing entry.
//
// Run:   npx ts-node scripts/add-manufacturing-quality-types.ts
//        npx ts-node scripts/add-manufacturing-quality-types.ts --apply --backup=<file>
import * as fs from 'fs';
import { Prisma, PrismaClient } from '@prisma/client';

export type QualityTypePlan = { code: string; name: string }[];

/** In this order — after A Quality and B Quality — as the dropdown lists them (by RecId). */
export const MANUFACTURING_QUALITY_TYPES: QualityTypePlan = [
  { code: 'H', name: 'Hole' },
  { code: 'D', name: 'Defected' },
  { code: 'R', name: 'Rejected' },
  { code: 'O', name: 'Others' },
];

type Tx = Prisma.TransactionClient | PrismaClient;

/** Every reason the plan must not be applied (empty = safe). */
export async function checkQualityTypes(db: Tx, plan: QualityTypePlan): Promise<string[]> {
  const problems: string[] = [];
  const codes = new Set<string>();
  const names = new Set<string>();
  for (const t of plan) {
    if (codes.has(t.code.toLowerCase()) || names.has(t.name.toLowerCase())) problems.push(`"${t.code} ${t.name}" is listed twice.`);
    codes.add(t.code.toLowerCase());
    names.add(t.name.toLowerCase());
    const clash = await db.$queryRaw<any[]>`
      SELECT "RecId" as id, "QualityCode" as code, "QualityName" as name FROM "MA_QualityType"
      WHERE COALESCE("IsDeleted", 0) = 0 AND (LOWER("QualityCode") = LOWER(${t.code}) OR LOWER("QualityName") = LOWER(${t.name}))`;
    for (const c of clash) problems.push(`MA_QualityType ${c.id} "${c.code} ${c.name}" already uses the code or name of "${t.code} ${t.name}".`);
  }
  return problems;
}

/** Inserts the plan's rows in one transaction (checks repeated inside it); returns their RecIds. */
export async function addQualityTypes(prisma: PrismaClient, plan: QualityTypePlan) {
  return prisma.$transaction(async (tx) => {
    const problems = await checkQualityTypes(tx, plan);
    if (problems.length) throw new Error(`checks failed inside the transaction: ${problems.join(' | ')}`);
    const out: { id: number; code: string; name: string }[] = [];
    for (const t of plan) {
      const [row] = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO "MA_QualityType" ("QualityCode", "QualityName", "InUse", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
        VALUES (${t.code}, ${t.name}, 1, now(), 1, 0, gen_random_uuid()) RETURNING "RecId" as id`;
      out.push({ id: Number(row.id), ...t });
    }
    return out;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const backup = args.find((a) => a.startsWith('--backup='))?.slice('--backup='.length);
  const prisma = new PrismaClient();
  try {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    console.log(`database: ${db} — ${apply ? 'APPLY' : 'dry run (read-only)'}`);
    const current = await prisma.$queryRaw<any[]>`SELECT "RecId" as id, "QualityCode" as code, "QualityName" as name FROM "MA_QualityType" WHERE COALESCE("IsDeleted", 0) = 0 AND COALESCE("InUse", 1) <> 0 ORDER BY "RecId"`;
    console.log(`current Type options: — , ${current.map((r) => `${r.name} (${r.code}, ${r.id})`).join(', ')}`);
    for (const t of MANUFACTURING_QUALITY_TYPES) console.log(`  + MA_QualityType "${t.code}" "${t.name}" (InUse 1, IsDeleted 0)`);
    const problems = await checkQualityTypes(prisma, MANUFACTURING_QUALITY_TYPES);
    if (problems.length) {
      console.log('\nREFUSED — checks failed:');
      for (const m of problems) console.log(`  - ${m}`);
      process.exitCode = 1;
      return;
    }
    console.log('\nall checks passed: codes and names free among live MA_QualityType rows.');
    if (!apply) { console.log('dry run: nothing written. Re-run with --apply --backup=<pg_dump file> to apply.'); return; }
    if (!backup || !fs.existsSync(backup) || fs.statSync(backup).size === 0 || Date.now() - fs.statSync(backup).mtimeMs > 60 * 60_000) {
      console.log('\nREFUSED — --apply needs --backup=<a non-empty pg_dump file written in the last 60 minutes>.');
      process.exitCode = 1;
      return;
    }
    const created = await addQualityTypes(prisma, MANUFACTURING_QUALITY_TYPES);
    console.log('\napplied:');
    for (const c of created) console.log(`  MA_QualityType ${c.id} "${c.code} ${c.name}"`);
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
