// Creates (once) and brings up to date the throwaway UDF test database — see test-db.ts for how it
// is chosen and guarded. Only ever connects to the server's maintenance database (to CREATE
// DATABASE if missing) and to the test database itself; the development database is untouched.
//
//  1. CREATE DATABASE <test db> if it does not exist.
//  2. Apply the Prisma schema: `prisma migrate diff` from the test database's current state to
//     prisma/schema.prisma, executed with `prisma db execute --url <test db>`. The CustomField code
//     index is created NULLS NOT DISTINCT, exactly as migration
//     20261003000000_add_custom_field_administration creates it in real databases.
//  3. Minimal stand-ins for the three legacy tables UDF record resolution reads (IM_Receipt,
//     FI_Receipt, IM_Item) — just the columns custom-field-records.ts selects.
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_NAME, TEST_DATABASE_URL, assertSafeTestDatabase } from './test-db';

const BACKEND = path.resolve(__dirname, '../..');
const PRISMA_CLI = require.resolve('prisma/build/index.js', { paths: [BACKEND] });

const prisma = (args: string[]) =>
  execFileSync(process.execPath, [PRISMA_CLI, ...args], { cwd: BACKEND, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const LEGACY_TABLES = `
CREATE TABLE IF NOT EXISTS "IM_Receipt" (
  "RecId" BIGSERIAL PRIMARY KEY, "ReceiptType" SMALLINT NOT NULL, "ReceiptNo" VARCHAR(50),
  "CompanyId" INTEGER NOT NULL DEFAULT 1, "IsDeleted" SMALLINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "FI_Receipt" (
  "RecId" BIGSERIAL PRIMARY KEY, "ReceiptType" SMALLINT NOT NULL, "ReceiptNo" VARCHAR(50),
  "CompanyId" INTEGER NOT NULL DEFAULT 1, "IsDeleted" SMALLINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "IM_Item" (
  "RecId" BIGSERIAL PRIMARY KEY, "AccessCode" VARCHAR(20), "InventoryCode" VARCHAR(50),
  "CompanyId" INTEGER NOT NULL DEFAULT 1, "IsDeleted" SMALLINT NOT NULL DEFAULT 0
);
`;

async function main() {
  assertSafeTestDatabase();

  const maintenanceUrl = new URL(TEST_DATABASE_URL);
  maintenanceUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: maintenanceUrl.toString() } } });
  try {
    const exists = await admin.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_database WHERE datname = ${TEST_DATABASE_NAME}`;
    if (!exists[0].n) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DATABASE_NAME.replace(/"/g, '')}"`);
      console.log(`[udf-test-db] created database ${TEST_DATABASE_NAME}`);
    }
  } finally {
    await admin.$disconnect();
  }

  let sql = prisma(['migrate', 'diff', '--from-url', TEST_DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--script']);
  sql = sql.replace(
    /CREATE UNIQUE INDEX "CustomField_entity_code_companyId_branchId_key" ON "CustomField"\("entity", "code", "companyId", "branchId"\);/,
    'CREATE UNIQUE INDEX "CustomField_entity_code_companyId_branchId_key" ON "CustomField"("entity", "code", "companyId", "branchId") NULLS NOT DISTINCT;',
  );
  const file = path.join(os.tmpdir(), `udf-test-db-${process.pid}.sql`);
  fs.writeFileSync(file, `${sql}\n${LEGACY_TABLES}`);
  try {
    prisma(['db', 'execute', '--url', TEST_DATABASE_URL, '--file', file]);
  } finally {
    fs.rmSync(file, { force: true });
  }

  const check = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    const [{ db }] = await check.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    assertSafeTestDatabase(db);
    console.log(`[udf-test-db] ready: ${db}`);
  } finally {
    await check.$disconnect();
  }
}

main().catch((e) => {
  console.error(e?.stderr || e);
  process.exit(1);
});
