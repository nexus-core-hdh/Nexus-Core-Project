// One-off: fills the legacy currency master MD_Forex — the Forex dropdown of the Costing Sheet
// grids (and Purchase Order / Inventory Receipt / Work Order) lists it through the generic
// 'forex' lookup (legacy-master-lookup.service.ts: not deleted, InUse 1, by ItemOrder). The table
// had no rows, so every Forex dropdown was empty. MD_Forex has no create screen/API, so the rows
// are inserted like the other legacy masters: code, name, IntlCode, ItemOrder, InUse 1,
// IsDeleted 0, InsertedAt, InsertedBy 1, UUID. No CompanyId column — the list is shared.
//
// Order = the old ERP's Forex dropdown: PKR, Usdollar, EUR, GBP, then the rest. "Usdollar" is the
// legacy name the Costing Sheet header already saves (its default), kept so saved values match.
//
// Safety: dry run by default (read-only). --apply refuses if a live row already uses one of the
// codes or names (MD_Forex has no unique constraint — checked here, case-insensitive); one
// transaction, checks repeated inside it. Inserts only; touches no existing row. Prints the new
// RecIds (undo = delete those).
//
// Run:   npx ts-node scripts/seed-forex-currencies.ts
//        npx ts-node scripts/seed-forex-currencies.ts --apply
import { Prisma, PrismaClient } from '@prisma/client';

export type ForexPlan = { code: string; name: string; intl: string }[];

export const FOREX_CURRENCIES: ForexPlan = [
  { code: 'PKR', name: 'Pakistani Rupee', intl: 'PKR' },
  { code: 'Usdollar', name: 'Usdollar', intl: 'USD' },
  { code: 'EUR', name: 'Euro', intl: 'EUR' },
  { code: 'GBP', name: 'British Pound', intl: 'GBP' },
  { code: 'USD', name: 'US Dollar', intl: 'USD' },
  { code: 'AUD', name: 'Australian Dollar', intl: 'AUD' },
  { code: 'DKK', name: 'Danish Krone', intl: 'DKK' },
  { code: 'CHF', name: 'Swiss Franc', intl: 'CHF' },
  { code: 'SEK', name: 'Swedish Krona', intl: 'SEK' },
  { code: 'CAD', name: 'Canadian Dollar', intl: 'CAD' },
  { code: 'KWD', name: 'Kuwaiti Dinar', intl: 'KWD' },
  { code: 'NOK', name: 'Norwegian Krone', intl: 'NOK' },
  { code: 'SAR', name: 'Saudi Riyal', intl: 'SAR' },
  { code: 'JPY', name: 'Japanese Yen', intl: 'JPY' },
  { code: 'AED', name: 'UAE Dirham', intl: 'AED' },
  { code: 'QAR', name: 'Qatari Riyal', intl: 'QAR' },
  { code: 'OMR', name: 'Omani Rial', intl: 'OMR' },
  { code: 'BHD', name: 'Bahraini Dinar', intl: 'BHD' },
  { code: 'CNY', name: 'Chinese Yuan', intl: 'CNY' },
  { code: 'HKD', name: 'Hong Kong Dollar', intl: 'HKD' },
  { code: 'SGD', name: 'Singapore Dollar', intl: 'SGD' },
  { code: 'MYR', name: 'Malaysian Ringgit', intl: 'MYR' },
  { code: 'KRW', name: 'South Korean Won', intl: 'KRW' },
  { code: 'INR', name: 'Indian Rupee', intl: 'INR' },
  { code: 'BDT', name: 'Bangladeshi Taka', intl: 'BDT' },
  { code: 'LKR', name: 'Sri Lankan Rupee', intl: 'LKR' },
  { code: 'TRY', name: 'Turkish Lira', intl: 'TRY' },
  { code: 'RUB', name: 'Russian Ruble', intl: 'RUB' },
  { code: 'PLN', name: 'Polish Zloty', intl: 'PLN' },
  { code: 'CZK', name: 'Czech Koruna', intl: 'CZK' },
  { code: 'HUF', name: 'Hungarian Forint', intl: 'HUF' },
  { code: 'RON', name: 'Romanian Leu', intl: 'RON' },
  { code: 'BGN', name: 'Bulgarian Lev', intl: 'BGN' },
  { code: 'NZD', name: 'New Zealand Dollar', intl: 'NZD' },
  { code: 'ZAR', name: 'South African Rand', intl: 'ZAR' },
  { code: 'BRL', name: 'Brazilian Real', intl: 'BRL' },
  { code: 'MXN', name: 'Mexican Peso', intl: 'MXN' },
];

type Tx = Prisma.TransactionClient | PrismaClient;

/** Every reason the plan must not be applied (empty = safe). */
export async function checkForex(db: Tx, plan: ForexPlan): Promise<string[]> {
  const problems: string[] = [];
  const codes = new Set<string>();
  const names = new Set<string>();
  for (const f of plan) {
    if (codes.has(f.code.toLowerCase()) || names.has(f.name.toLowerCase())) problems.push(`"${f.code} ${f.name}" is listed twice.`);
    codes.add(f.code.toLowerCase());
    names.add(f.name.toLowerCase());
    const clash = await db.$queryRaw<any[]>`
      SELECT "RecId" as id, "ForexCode" as code, "ForexName" as name FROM "MD_Forex"
      WHERE COALESCE("IsDeleted", 0) = 0 AND (LOWER("ForexCode") = LOWER(${f.code}) OR LOWER("ForexName") = LOWER(${f.name}))`;
    for (const c of clash) problems.push(`MD_Forex ${c.id} "${c.code} ${c.name}" already uses the code or name of "${f.code} ${f.name}".`);
  }
  return problems;
}

/** Inserts the plan's rows in one transaction (checks repeated inside it); returns their RecIds. */
export async function addForex(prisma: PrismaClient, plan: ForexPlan) {
  return prisma.$transaction(async (tx) => {
    const problems = await checkForex(tx, plan);
    if (problems.length) throw new Error(`checks failed inside the transaction: ${problems.join(' | ')}`);
    const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`SELECT MAX("ItemOrder") as max FROM "MD_Forex" WHERE COALESCE("IsDeleted", 0) = 0`;
    let order = Number(max ?? 0);
    const out: { id: number; code: string; name: string }[] = [];
    for (const f of plan) {
      order += 1;
      const [row] = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO "MD_Forex" ("ForexCode", "ForexName", "IntlCode", "ItemOrder", "InUse", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
        VALUES (${f.code}, ${f.name}, ${f.intl}, ${order}, 1, now(), 1, 0, gen_random_uuid()) RETURNING "RecId" as id`;
      out.push({ id: Number(row.id), code: f.code, name: f.name });
    }
    return out;
  });
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const prisma = new PrismaClient();
  try {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    console.log(`database: ${db} — ${apply ? 'APPLY' : 'dry run (read-only)'}`);
    const current = await prisma.$queryRaw<any[]>`SELECT "RecId" as id, "ForexCode" as code FROM "MD_Forex" WHERE COALESCE("IsDeleted", 0) = 0 ORDER BY "ItemOrder" NULLS LAST, "RecId"`;
    console.log(`current MD_Forex rows: ${current.length ? current.map((r) => `${r.code} (${r.id})`).join(', ') : 'none'}`);
    for (const f of FOREX_CURRENCIES) console.log(`  + MD_Forex "${f.code}" "${f.name}" (${f.intl}, InUse 1)`);
    const problems = await checkForex(prisma, FOREX_CURRENCIES);
    if (problems.length) {
      console.log('\nREFUSED — checks failed:');
      for (const m of problems) console.log(`  - ${m}`);
      process.exitCode = 1;
      return;
    }
    console.log('\nall checks passed: codes and names free among live MD_Forex rows.');
    if (!apply) { console.log('dry run: nothing written. Re-run with --apply to apply.'); return; }
    const created = await addForex(prisma, FOREX_CURRENCIES);
    console.log(`\napplied (${created.length} rows):`);
    console.log(`  RecIds ${created.map((c) => `${c.code}=${c.id}`).join(', ')}`);
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
