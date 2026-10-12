// Query builder for SQL report sources (the Legacy ERP tables — see legacy-report-sources.ts).
//
// Safety: every piece of SQL text here comes from a source/field declaration in code (FROM clause,
// fixed WHERE, field expressions, ASC/DESC) — never from the request. Values a user types (filter
// values, run-time prompt answers) only ever enter the query as bound parameters through
// Prisma.sql's ${...} placeholders, and LIKE wildcards inside them are escaped.
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReportField, SqlReportSource } from './report-sources';

const expr = (field: ReportField): Prisma.Sql => {
  if (!field.sql) throw new BadRequestException(`"${field.label}" has no SQL expression`);
  return typeof field.sql === 'string' ? Prisma.raw(field.sql) : field.sql;
};

const likePattern = (value: string, prefix: string, suffix: string) => `${prefix}${value.replace(/[\\%_]/g, (c) => `\\${c}`)}${suffix}`;

function toNumber(value: string, field: ReportField) {
  const n = Number(value);
  if (value === '' || !Number.isFinite(n)) throw new BadRequestException(`"${field.label}" needs a number`);
  return n;
}

/** "yyyy-MM-dd" → that day's start (UTC), as the PLM engine does. */
function toDay(value: string, field: ReportField) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!d || Number.isNaN(d.getTime())) throw new BadRequestException(`"${field.label}" needs a date`);
  return d;
}
const nextDay = (d: Date) => new Date(d.getTime() + 86400000);

/** One filter as a SQL condition (also validates the value's format). */
export function sqlCondition(field: ReportField, operator: string, value: string, value2: string): Prisma.Sql {
  const e = expr(field);
  if (operator === 'isEmpty') return field.type === 'string' ? Prisma.sql`(${e} IS NULL OR ${e} = '')` : Prisma.sql`(${e} IS NULL)`;
  if (operator === 'isNotEmpty') return field.type === 'string' ? Prisma.sql`(${e} IS NOT NULL AND ${e} <> '')` : Prisma.sql`(${e} IS NOT NULL)`;

  switch (field.type) {
    case 'string': {
      if (operator === 'equals') return Prisma.sql`lower(${e}) = lower(${value})`;
      if (operator === 'notEquals') return Prisma.sql`(${e} IS NULL OR lower(${e}) <> lower(${value}))`;
      if (operator === 'contains') return Prisma.sql`${e} ILIKE ${likePattern(value, '%', '%')}`;
      if (operator === 'notContains') return Prisma.sql`(${e} IS NULL OR ${e} NOT ILIKE ${likePattern(value, '%', '%')})`;
      if (operator === 'startsWith') return Prisma.sql`${e} ILIKE ${likePattern(value, '', '%')}`;
      if (operator === 'endsWith') return Prisma.sql`${e} ILIKE ${likePattern(value, '%', '')}`;
      break;
    }
    case 'number': {
      const n = toNumber(value, field);
      if (operator === 'eq') return Prisma.sql`${e} = ${n}`;
      if (operator === 'neq') return Prisma.sql`(${e} IS NULL OR ${e} <> ${n})`;
      if (operator === 'gt') return Prisma.sql`${e} > ${n}`;
      if (operator === 'gte') return Prisma.sql`${e} >= ${n}`;
      if (operator === 'lt') return Prisma.sql`${e} < ${n}`;
      if (operator === 'lte') return Prisma.sql`${e} <= ${n}`;
      if (operator === 'between') return Prisma.sql`${e} BETWEEN ${n} AND ${toNumber(value2, field)}`;
      break;
    }
    case 'date': {
      const day = toDay(value, field);
      if (operator === 'on') return Prisma.sql`(${e} >= ${day} AND ${e} < ${nextDay(day)})`;
      if (operator === 'before') return Prisma.sql`${e} < ${day}`;
      if (operator === 'after') return Prisma.sql`${e} >= ${nextDay(day)}`;
      if (operator === 'between') return Prisma.sql`(${e} >= ${day} AND ${e} < ${nextDay(toDay(value2, field))})`;
      break;
    }
    case 'boolean':
      if (operator === 'isTrue') return Prisma.sql`(${e}) IS TRUE`;
      if (operator === 'isFalse') return Prisma.sql`(${e}) IS NOT TRUE`;
      break;
  }
  throw new BadRequestException(`Invalid condition for "${field.label}"`);
}

/** SELECT for a SQL source: columns aliased c0, c1, ... so result keys never depend on labels. */
export function sqlQuery(
  source: SqlReportSource,
  fields: ReportField[],
  conditions: Prisma.Sql[],
  sorts: { field: ReportField; direction: 'asc' | 'desc' }[],
  limit: number,
): Prisma.Sql {
  const select = Prisma.join(fields.map((f, i) => Prisma.sql`${expr(f)} AS ${Prisma.raw(`"c${i}"`)}`));
  const where = Prisma.join([Prisma.raw(`(${source.where})`), ...conditions], ' AND ');
  const orderBy = sorts.length
    ? Prisma.join(sorts.map((s) => Prisma.sql`${expr(s.field)} ${Prisma.raw(s.direction === 'desc' ? 'DESC NULLS LAST' : 'ASC NULLS LAST')}`))
    : Prisma.raw('1');
  return Prisma.sql`SELECT ${select} FROM ${Prisma.raw(source.from)} WHERE ${where} ORDER BY ${orderBy} LIMIT ${limit}`;
}
