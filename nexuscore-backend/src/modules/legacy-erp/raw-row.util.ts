// $queryRaw results carry JS types PostgreSQL's driver produces for columns Prisma doesn't
// know about via its schema (this whole module bypasses schema.prisma): `bigint` for
// Postgres bigint/int8-based domains, and `Prisma.Decimal` for numeric-based domains.
// Neither survives JSON.stringify as-is — bigint throws, Decimal serializes as its internal
// {s,e,d} shape. Date instances must NOT be walked as plain objects (Object.entries on a
// Date is empty, which silently corrupts it to `{}`) — they already have a correct toJSON().
export function sanitizeRawRow<T>(value: T): T {
  if (typeof value === 'bigint') return Number(value) as unknown as T;
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && typeof (value as any).toNumber === 'function') {
    // Prisma.Decimal (and compatible decimal.js-style values)
    return Number((value as any).toNumber()) as unknown as T;
  }
  if (Array.isArray(value)) return value.map(sanitizeRawRow) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeRawRow(v);
    return out as T;
  }
  return value;
}
