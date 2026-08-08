import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// The SQL Server -> PostgreSQL migration preserved the original column types as Postgres
// DOMAINs (e.g. "UdtInt8" based on smallint, "UdtBool" based on smallint, "UdtDateTime"
// based on timestamp). Prisma's $queryRaw sends JS strings as `text`, which Postgres will
// not implicitly cast to these domains — every write needs the right JS type up front.
// This is schema-wide (confirmed on both FI_Account and IM_Warehouse), so column-type
// awareness is fetched from pg_catalog once per table and reused, instead of hand-listing
// date/bit/numeric columns per service.

const typeMapCache = new Map<string, Map<string, string>>();

export async function getColumnTypeMap(prisma: PrismaService, table: string): Promise<Map<string, string>> {
  const cached = typeMapCache.get(table);
  if (cached) return cached;

  // table is always an internal constant (never user input) — safe to inline as a quoted
  // identifier so ::regclass resolves the real mixed-case name instead of lowercasing it.
  const rows = await prisma.$queryRaw<{ column: string; typname: string }[]>(Prisma.sql`
    SELECT a.attname AS column, t.typname AS typname
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = ${Prisma.raw(`'"${table}"'`)}::regclass AND a.attnum > 0 AND NOT a.attisdropped
  `);
  const map = new Map(rows.map((r) => [r.column, r.typname]));
  typeMapCache.set(table, map);
  return map;
}

// Classifies a Postgres (domain) type name and converts a raw form value to the JS type
// Postgres needs to accept it without an explicit cast.
export function coerceForPgType(typname: string, value: any): any {
  if (/Bool$/i.test(typname)) return value ? 1 : 0;
  if (/^Udt(Date|Time)/i.test(typname) || typname === 'date' || typname === 'timestamp') return new Date(value);
  // NOTE: UdtExpHuge/Long/Short/Tiny are TEXT domains (base type character varying — used for
  // Explanation-style fields), not numeric, despite the name. Confirmed via pg_catalog. Do not
  // add "Exp" back into this numeric group — an earlier version of this regex did, which
  // silently turned every Explanation field into NaN -> null (caught on MA_YarnTrimCard.Explanation).
  // Full pg_catalog dump of every "Udt*" domain (33 total, confirmed while building Yarn Card)
  // shows Type/Number/Quantity are also int2/int4/numeric-based — missing them here is what let
  // IM_Item.InventoryType (UdtType) silently fail every insert with a text->domain cast error.
  if (/^Udt(Int|RecId|Amount|Percentage|Coordinate|Type|Number|Quantity)/i.test(typname)) return Number(value);
  if (['int2', 'int4', 'int8', 'numeric', 'float4', 'float8'].includes(typname)) return Number(value);
  if (typname === 'bool') return Boolean(value);
  return value;
}

// Returns a (column, value) => dbValue coercer bound to a table's real column types.
// Drop-in replacement for the previous per-service hand-rolled DATE_COLUMNS/BIT_COLUMNS sets.
export function buildDbValueCoercer(columnTypes: Map<string, string>) {
  return (column: string, value: any): any => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const typname = columnTypes.get(column);
    if (!typname) return value; // unknown column — pass through unchanged
    return coerceForPgType(typname, value);
  };
}
