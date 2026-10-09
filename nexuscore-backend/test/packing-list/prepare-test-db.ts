// Creates (once) and brings up to date the throwaway Packing List test database. Only ever
// connects to the server's maintenance database (to CREATE DATABASE if missing) and to the test
// database itself — the development database is never touched.
//
// The schema is built exactly the way DEPLOYMENT.md builds a fresh installation:
// `prisma migrate deploy` (the legacy ERP baseline, every later migration, and
// 20261009000000_add_packing_list_item_size). Re-running only applies what is pending.
import { execFileSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_NAME, TEST_DATABASE_URL, assertSafeTestDatabase } from './test-db';

const BACKEND = path.resolve(__dirname, '../..');
const PRISMA_CLI = require.resolve('prisma/build/index.js', { paths: [BACKEND] });

async function main() {
  assertSafeTestDatabase();

  const maintenanceUrl = new URL(TEST_DATABASE_URL);
  maintenanceUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: maintenanceUrl.toString() } } });
  try {
    const exists = await admin.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_database WHERE datname = ${TEST_DATABASE_NAME}`;
    if (!exists[0].n) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DATABASE_NAME.replace(/"/g, '')}"`);
      console.log(`[packing-test-db] created database ${TEST_DATABASE_NAME}`);
    }
  } finally {
    await admin.$disconnect();
  }

  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
    cwd: BACKEND,
    env: { ...process.env, NEXUSCORE_DATABASE_URL: TEST_DATABASE_URL },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  const check = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    const [{ db }] = await check.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    assertSafeTestDatabase(db);
    // Every legacy-erp service writes CompanyId = 1 / WorkplaceId = 1 (FK-checked on
    // IM_PackagingList), which an installed database always has; a fresh one has no rows yet.
    await check.$executeRawUnsafe(`INSERT INTO "MD_Company" ("RecId") SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM "MD_Company" WHERE "RecId" = 1)`);
    await check.$executeRawUnsafe(`INSERT INTO "MD_Workplace" ("RecId") SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM "MD_Workplace" WHERE "RecId" = 1)`);
    console.log(`[packing-test-db] ready: ${db}`);
  } finally {
    await check.$disconnect();
  }
}

main().catch((e) => {
  console.error(e?.stderr || e?.stdout || e);
  process.exit(1);
});
