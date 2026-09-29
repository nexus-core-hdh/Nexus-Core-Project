import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Server-side pagination for the legacy ERP list endpoints.
//
// Paged mode (request carries `page`): search/filters (the query's WHERE) and sorting are applied
// in the database BEFORE LIMIT/OFFSET, a stable unique tiebreak keeps pages deterministic, and the
// response is { rows, total, page, pageSize, pageCount, sortBy, sortDir }.
// Legacy mode (no `page`): the exact previous query and row cap, returned as a plain array — kept
// for typeahead pickers, which search the whole table and only show the best matches.

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export interface ListPaging {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface PagedResult<T = any> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

/** `page`, `pageSize`, `sortBy`, `sortDir` from the query string; null when `page` is absent. */
export function readPaging(q: Record<string, any>): ListPaging | null {
  if (q?.page === undefined || q.page === '') return null;
  const page = Number(q.page);
  const pageSize = q.pageSize === undefined || q.pageSize === '' ? DEFAULT_PAGE_SIZE : Number(q.pageSize);
  if (!Number.isInteger(page) || page < 1) throw new BadRequestException('page must be a positive integer');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new BadRequestException(`pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  const sortDir = q.sortDir === undefined || q.sortDir === '' ? undefined : String(q.sortDir).toLowerCase();
  if (sortDir !== undefined && sortDir !== 'asc' && sortDir !== 'desc') throw new BadRequestException('sortDir must be asc or desc');
  return { page, pageSize, sortBy: q.sortBy ? String(q.sortBy) : undefined, sortDir: sortDir as 'asc' | 'desc' | undefined };
}

/** Controller parameter: the request's paging options (or null for the legacy, unpaged response). */
export const Paging = createParamDecorator((_: unknown, ctx: ExecutionContext): ListPaging | null =>
  readPaging(ctx.switchToHttp().getRequest().query),
);

export interface LegacyListQuery {
  /** Column list after SELECT. */
  select: Prisma.Sql;
  /** Everything from FROM through WHERE (search + filters) and any GROUP BY — no ORDER BY / LIMIT. */
  from: Prisma.Sql;
  /** FROM ... WHERE for the total count when `from` contains GROUP BY (one row per group). */
  countFrom?: Prisma.Sql;
  /** Sortable API keys -> SQL expression. */
  sortable: Record<string, Prisma.Sql>;
  defaultSortBy: string;
  defaultSortDir: 'asc' | 'desc';
  /** Unique expression appended to every ORDER BY so pages never overlap or skip rows. */
  tiebreak: Prisma.Sql;
  /** Row cap of the previous (unpaged) response, kept for legacy-mode callers. */
  legacyLimit: number;
}

export async function runLegacyList(
  prisma: PrismaService,
  q: LegacyListQuery,
  paging: ListPaging | null,
  mapRows: (rows: any[]) => any[],
): Promise<any[] | PagedResult> {
  const sortBy = paging?.sortBy ?? q.defaultSortBy;
  const sortExpr = q.sortable[sortBy];
  if (!sortExpr) throw new BadRequestException(`Cannot sort by "${sortBy}". Allowed: ${Object.keys(q.sortable).join(', ')}`);
  const sortDir = paging?.sortDir ?? q.defaultSortDir;
  const dir = Prisma.raw(sortDir === 'desc' ? 'DESC' : 'ASC');
  const orderBy = Prisma.sql`ORDER BY ${sortExpr} ${dir} NULLS LAST, ${q.tiebreak} ${dir}`;

  if (!paging) {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${q.select} ${q.from} ${orderBy} LIMIT ${q.legacyLimit}`);
    return mapRows(rows);
  }

  const offset = (paging.page - 1) * paging.pageSize;
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${q.select} ${q.from} ${orderBy} LIMIT ${paging.pageSize} OFFSET ${offset}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n ${q.countFrom ?? q.from}`),
  ]);
  const total = Number(countRows[0]?.n ?? 0);
  return {
    rows: mapRows(rows),
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    pageCount: Math.max(1, Math.ceil(total / paging.pageSize)),
    sortBy,
    sortDir,
  };
}
