import { AsyncLocalStorage } from 'async_hooks';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { LegacyCompanyContext, LegacyCompanyContextService } from './legacy-company-context.service';

// Company isolation — the request-scoped legacy company (phase 2/3). Every legacy ERP query that
// reads or writes company-owned data asks currentLegacyCompany() for the company of the CURRENT
// request instead of hard-coding legacy company 1:
//   - legacyScopeMiddleware (main.ts, first middleware) opens one AsyncLocalStorage store per HTTP
//     request; the authenticated user (req.user, set later by JwtAuthGuard) is read from it lazily;
//   - currentLegacyCompany() resolves that user's mapped legacy company + workplace once per request
//     (LegacyCompanyContextService — token company only, never client input) and fails closed (403)
//     when there is no valid mapping;
//   - outside an HTTP request (tests, scripts) there is NO default: callers must run inside
//     runAsLegacyCompany(), or a test database harness must set an explicit default.
// Nothing here trusts a company id from a request body, query string or header.

interface ScopeStore {
  req?: Request & { user?: { companyId?: string | null } };
  ctx?: LegacyCompanyContext;
  pending?: Promise<LegacyCompanyContext>;
}

const storage = new AsyncLocalStorage<ScopeStore>();
let nonHttpDefault: LegacyCompanyContext | null = null;

/** Express middleware: one store per request (main.ts registers it before every other handler). */
export function legacyScopeMiddleware(req: Request, _res: Response, next: NextFunction) {
  storage.run({ req: req as ScopeStore['req'] }, () => next());
}

/** Runs `fn` as the given legacy company (tests, scripts, explicit system work). */
export function runAsLegacyCompany<T>(ctx: LegacyCompanyContext, fn: () => T): T {
  return storage.run({ ctx }, fn);
}

/** Test harnesses only (see test/packing-list/test-db.ts): the company used when no request or
 *  runAsLegacyCompany() scope is active. Never set by the application. */
export function setNonHttpLegacyCompanyDefault(ctx: LegacyCompanyContext | null) {
  nonHttpDefault = ctx;
}

/** The legacy company + workplace of the current request (or explicit scope). Fails closed. */
export async function currentLegacyCompany(prisma: PrismaService): Promise<LegacyCompanyContext> {
  const store = storage.getStore();
  if (store?.ctx) return store.ctx;
  if (store?.req) {
    if (!store.pending) {
      store.pending = new LegacyCompanyContextService(prisma).resolve(store.req.user).then((ctx) => (store.ctx = ctx));
      // A rejected resolution must not be cached as "pending forever" for a retry in the same request.
      store.pending.catch(() => { store.pending = undefined; });
    }
    return store.pending;
  }
  if (nonHttpDefault) return nonHttpDefault;
  throw new ForbiddenException('No company context for this operation.');
}

/** `AND <alias>."CompanyId" = <current legacy company>` — for a table with its own CompanyId. */
export const companyIs = (alias: string, ctx: LegacyCompanyContext) =>
  Prisma.sql`${Prisma.raw(`"${alias}"`)}."CompanyId" = ${ctx.legacyCompanyId}`;

/** For masters whose existing rows carry no company (CompanyId NULL — processes, quality types,
 *  size sets, item groups): those legacy rows stay visible to every company (shared), rows a
 *  company creates from now on are its own. */
export const companyOrShared = (alias: string, ctx: LegacyCompanyContext) =>
  Prisma.sql`(${Prisma.raw(`"${alias}"`)}."CompanyId" = ${ctx.legacyCompanyId} OR ${Prisma.raw(`"${alias}"`)}."CompanyId" IS NULL)`;

/** Throws 404 (never 403, so other companies' ids can't be probed) unless every given row id of
 *  `table` exists and belongs to the current company. Used for linked-record validation. */
export async function assertSameCompany(
  prisma: PrismaService | Prisma.TransactionClient,
  ctx: LegacyCompanyContext,
  table: string,
  ids: Array<number | string | null | undefined>,
  label: string,
  opts: { allowShared?: boolean; badRequest?: boolean } = {},
) {
  const wanted = [...new Set(ids.filter((v) => v !== null && v !== undefined && v !== '').map(Number))];
  if (!wanted.length) return;
  const scope = opts.allowShared ? companyOrShared('t', ctx) : companyIs('t', ctx);
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT t."RecId"::int AS id FROM ${Prisma.raw(`"${table}"`)} t WHERE t."RecId" IN (${Prisma.join(wanted)}) AND ${scope}`);
  const found = new Set(rows.map((r) => Number(r.id)));
  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length) {
    const message = `${label} ${missing.join(', ')} not found`;
    throw opts.badRequest ? new BadRequestException(message) : new NotFoundException(message);
  }
}

/**
 * Global guard (main.ts, after RolesGuard): every Legacy ERP API request — /legacy-erp/... and the
 * report builder's legacy module (/reports/legacy-erp/...) — must resolve to a valid legacy company
 * before any handler runs, so an unmapped or wrongly mapped company is refused up front (fail
 * closed) instead of reaching a query. Other routes are untouched.
 */
export class LegacyCompanyGuard {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: import('@nestjs/common').ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    if (!isLegacyRoute(req.path ?? req.url ?? '')) return true;
    if (!req.user) return true; // public / unauthenticated routes are rejected by JwtAuthGuard already
    await currentLegacyCompany(this.prisma);
    return true;
  }
}

/** Paths whose data is legacy ERP data (company-scoped). */
export const isLegacyRoute = (path: string) => /\/legacy-erp(\/|$)/.test(path.split('?')[0]);

// ── Generic table scoping (master lookups, worklist grids, report "table:" sources) ──────────────
// A legacy table that has a "CompanyId" column holds company-owned rows: a company sees its own rows
// plus rows with no company at all (legacy rows that were never assigned — processes, quality types,
// size sets, item groups — which stay shared, unchanged). A table WITHOUT the column is shared
// reference data (units, currencies, countries, ...) and is not filtered. Column presence is read
// from the live schema once per process.
let companyColumnTables: Promise<Set<string>> | null = null;
export function tablesWithCompanyColumn(prisma: PrismaService): Promise<Set<string>> {
  if (!companyColumnTables) {
    companyColumnTables = prisma
      .$queryRaw<{ t: string }[]>`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'CompanyId'`
      .then((rows) => new Set(rows.map((r) => r.t)))
      .catch((e) => { companyColumnTables = null; throw e; });
  }
  return companyColumnTables;
}

/** `AND (<alias>.CompanyId = current OR NULL)` for a company-column table, else nothing. Pass the
 *  table name as stored (e.g. "IM_Warehouse"); `alias` null = unqualified column. */
export async function companyScopeSql(prisma: PrismaService, table: string, alias: string | null = null): Promise<Prisma.Sql> {
  if (!(await tablesWithCompanyColumn(prisma)).has(table)) return Prisma.empty;
  const ctx = await currentLegacyCompany(prisma);
  const col = Prisma.raw(alias ? `"${alias}"."CompanyId"` : `"CompanyId"`);
  return Prisma.sql` AND (${col} = ${ctx.legacyCompanyId} OR ${col} IS NULL)`;
}

/** `<CompanyId>, <WorkplaceId>` of the caller's legacy company, for an INSERT whose column list starts
 *  with "CompanyId", "WorkplaceId" — new documents are always the creating company's own. */
export async function legacyStampSql(prisma: PrismaService): Promise<Prisma.Sql> {
  const ctx = await currentLegacyCompany(prisma);
  return Prisma.sql`${ctx.legacyCompanyId}, ${ctx.workplaceId}`;
}

/** A company-owned document row (`table` has "CompanyId") of the caller's company, else 404. */
export async function assertOwnedRow(prisma: PrismaService, table: string, id: number, label: string): Promise<void> {
  const ctx = await currentLegacyCompany(prisma);
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE "RecId" = ${Number(id)} AND "CompanyId" = ${ctx.legacyCompanyId}`);
  if (!rows.length) throw new NotFoundException(`${label} not found`);
}

/** A child row (no "CompanyId" of its own) whose parent document — `childTable.fk` → `parentTable` —
 *  is the caller's company's own, else 404. Child tables inherit the parent's company. */
export async function assertOwnedChild(prisma: PrismaService, childTable: string, fk: string, parentTable: string, id: number, label: string): Promise<void> {
  const ctx = await currentLegacyCompany(prisma);
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM ${Prisma.raw(`"${childTable}"`)} c JOIN ${Prisma.raw(`"${parentTable}"`)} p ON p."RecId" = c.${Prisma.raw(`"${fk}"`)}
    WHERE c."RecId" = ${Number(id)} AND p."CompanyId" = ${ctx.legacyCompanyId}`);
  if (!rows.length) throw new NotFoundException(`${label} not found`);
}

/** Write-side reference check for a dto: each [table, value, label] that is set must be the caller's
 *  company's own (or a shared NULL-company master where `allowShared`), else 400. */
export async function assertRefsSameCompany(prisma: PrismaService, refs: [string, unknown, string][], opts: { allowShared?: boolean } = {}): Promise<void> {
  const set = refs.filter(([, v]) => v != null && v !== '');
  if (!set.length) return;
  const ctx = await currentLegacyCompany(prisma);
  for (const [table, v, label] of set) await assertSameCompany(prisma, ctx, table, [Number(v)], label, { badRequest: true, allowShared: opts.allowShared });
}

/** For code OUTSIDE the /legacy-erp routes (dashboard, costing, custom fields, PLM) that only
 *  reads legacy data alongside its own: the caller's legacy company, or null when the company has
 *  no valid legacy mapping — such a company then simply sees no legacy records (never another
 *  company's, and the page itself keeps working). */
export async function legacyCompanyOrNull(prisma: PrismaService): Promise<LegacyCompanyContext | null> {
  try {
    return await currentLegacyCompany(prisma);
  } catch (e) {
    if (e instanceof ForbiddenException) return null;
    throw e;
  }
}

/** Child tables without a "CompanyId" of their own → [fk column, parent table]: they inherit the
 *  parent document's company. */
const CHILD_PARENT: Record<string, [string, string]> = {
  IM_ReceiptItem: ['InventoryReceiptId', 'IM_Receipt'],
  IM_OrderReceiptItem: ['OrderReceiptId', 'IM_OrderReceipt'],
  SM_ContractItem: ['ReceiptId', 'SM_Contract'],
  MA_WorkOrderItem: ['WorkOrderId', 'MA_WorkOrder'],
  FI_Address: ['CurrentAccountId', 'FI_Account'],
};

/** ` AND …` restricting rows of `table` (aliased `alias`) to the caller's company: its own
 *  "CompanyId" (or shared NULL) when it has one, else its parent document's company (CHILD_PARENT);
 *  empty for shared reference tables (cities, countries, unit sets, …). For generic list engines. */
export async function companyRowScopeSql(prisma: PrismaService, table: string, alias: string): Promise<Prisma.Sql> {
  if ((await tablesWithCompanyColumn(prisma)).has(table)) return companyScopeSql(prisma, table, alias);
  const parent = CHILD_PARENT[table];
  if (!parent) return Prisma.empty;
  const ctx = await currentLegacyCompany(prisma);
  return Prisma.sql` AND EXISTS (SELECT 1 FROM ${Prisma.raw(`"${parent[1]}"`)} cp
    WHERE cp."RecId" = ${Prisma.raw(`"${alias}"`)}.${Prisma.raw(`"${parent[0]}"`)} AND cp."CompanyId" = ${ctx.legacyCompanyId})`;
}
