// Throwaway database for the Packing List test suite — same rules as test/udf/test-db.ts:
//  - PACKING_TEST_DATABASE_URL if set, else NEXUSCORE_DATABASE_URL with the database name
//    suffixed "_packing_test" (same server, separate database);
//  - every entry point refuses to run unless the target database name ends in "_test" and differs
//    from the development database.
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const devUrl = process.env.NEXUSCORE_DATABASE_URL_ORIGINAL ?? process.env.NEXUSCORE_DATABASE_URL;
if (!devUrl && !process.env.PACKING_TEST_DATABASE_URL) {
  throw new Error('Set PACKING_TEST_DATABASE_URL (or NEXUSCORE_DATABASE_URL to derive it from).');
}

const dbNameOf = (url: string) => new URL(url).pathname.replace(/^\//, '');

function deriveTestUrl(): string {
  if (process.env.PACKING_TEST_DATABASE_URL) return process.env.PACKING_TEST_DATABASE_URL;
  const u = new URL(devUrl!);
  u.pathname = `/${dbNameOf(devUrl!)}_packing_test`;
  return u.toString();
}

export const TEST_DATABASE_URL = deriveTestUrl();
export const TEST_DATABASE_NAME = dbNameOf(TEST_DATABASE_URL);
export const DEV_DATABASE_NAME = devUrl ? dbNameOf(devUrl) : null;

export function assertSafeTestDatabase(name: string = TEST_DATABASE_NAME) {
  if (!/_test$/.test(name) || (devUrl && name === dbNameOf(devUrl))) {
    throw new Error(`Refusing to use database "${name}" for tests — it must end in "_test" and not be the development database.`);
  }
}

assertSafeTestDatabase();

/** Points this process's Prisma clients at the test database. Call before any client is built. */
export function useTestDatabase() {
  if (!process.env.NEXUSCORE_DATABASE_URL_ORIGINAL && process.env.NEXUSCORE_DATABASE_URL) {
    process.env.NEXUSCORE_DATABASE_URL_ORIGINAL = process.env.NEXUSCORE_DATABASE_URL;
  }
  process.env.NEXUSCORE_DATABASE_URL = TEST_DATABASE_URL;
}
