import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Centralized, project-wide Audit capture + query service. NOT a new/competing history
// mechanism: this writes to the exact same AuditLog table ApprovalService/plm-cards.service.ts/
// cutting.service.ts already write to directly (see prisma/schema.prisma's own AuditLog comment)
// — this service exists so every OTHER existing CRUD service can share ONE consistent, correct
// write path (company scoping, sensitive-field scrubbing, Module/Menu resolution) instead of each
// hand-rolling its own `prisma.auditLog.create({...})` call the way those three already do.
//
// Call `record()` at the exact point an existing service's own business write already succeeded
// (optionally inside that same `tx` if the caller already has one) — see work-order.service.ts's
// own create()/update()/remove() for the real, working pattern to copy into any other service.

// Recognized action strings — a real, shared vocabulary (not hardcoded per-call-site spelling),
// extensible: any string is technically accepted by record() (the DB column is a plain TEXT, per
// the existing AuditLog.action convention already in production use with values like 'submit'/
// 'approved'/'status_changed'), these are just the common lifecycle ones this framework's own
// spec asks for, named once so every caller spells them identically.
export const AUDIT_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  RESTORE: 'restore',
  READ: 'read',
  POST: 'post',
  APPROVE: 'approve',
  REJECT: 'reject',
  CANCEL: 'cancel',
  LOCK: 'lock',
  UNLOCK: 'unlock',
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;

export interface RecordAuditParams {
  userId: string;
  companyId: string;
  // MenuItem.href — the same screenKey convention ApprovalConfiguration/ScreenParameter already
  // use. Optional: a background/system-triggered event may have no originating screen.
  screenKey?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  // Old/new state — for CREATE only `after` is set, for DELETE only `before`, for UPDATE both.
  // Either may be a flat object (simple field diff) OR a structured multi-section snapshot object
  // (e.g. `{ IMReceipt: {...}, IMReceiptItem: [...] }`) — Log Details renders whichever shape it
  // finds, generically, per its own comment.
  before?: unknown;
  after?: unknown;
  documentNo?: string | null;
  parentEntityType?: string | null;
  parentEntityId?: string | null;
  parentDocumentNo?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null;
}

export interface ListAuditParams {
  companyId: string; // always the caller's own — never client-controlled scoping
  from?: Date;
  to?: Date;
  userId?: string;
  module?: string;
  screenKey?: string;
  action?: string;
  entityType?: string;
  documentNo?: string; // partial match
  entityId?: string;
  correlationId?: string;
  skip?: number;
  take?: number;
  sortDir?: 'asc' | 'desc';
}

// Keys never persisted, anywhere inside before/after, at any nesting depth — matches this
// framework's own "never log passwords/tokens/secrets/credentials" rule.
const SENSITIVE_KEY_PATTERN = /password|token|secret|apikey|api_key|credential|privatekey|private_key/i;

function scrub(value: unknown, depth = 0): unknown {
  if (value == null || depth > 8) return value;
  // A Date instance is `typeof 'object'` but has zero own enumerable properties —
  // Object.entries(new Date()) is `[]`, so without this guard the generic walk below silently
  // rebuilds every Date field as `{}`. Same guard raw-row.util.ts's sanitizeRawRow already has,
  // reinstated here since this is a separate recursive walk over the same kind of data.
  if (value instanceof Date) return value;
  // Prisma.Decimal / decimal.js-style wrapper — same convention as sanitizeRawRow.
  if (value && typeof value === 'object' && typeof (value as any).toNumber === 'function') {
    return Number((value as any).toNumber());
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[redacted]' : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

// PRODUCTION HARDENING (root cause of "CREATE produces Created + Updated" / any no-op Save
// producing a false Updated event — confirmed live: PUT-ing back the exact same values a record
// already had still wrote a second AuditLog row with oldValues === newValues, because every
// update() unconditionally logged UPDATE whenever the dto carried any defined column, never
// checking whether a value actually differs from what's already persisted).
//
// Every update() should call this BEFORE recordSafe()/record() for AUDIT_ACTIONS.UPDATE and skip
// the audit write entirely when it returns false — the business UPDATE statement itself is left
// untouched (still runs exactly as before; only the audit event is conditional), so this can never
// change what gets persisted, only whether a real change is reported. Compares the same flat or
// single-section snapshot object a service already composes for before/after (see this file's own
// RecordAuditParams comment on that shape) key-by-key with a deep (JSON) equality check.
export function hasRealChanges(before: Record<string, any> | null | undefined, after: Record<string, any> | null | undefined, ignoreKeys: string[] = []): boolean {
  const a = before ?? {};
  const b = after ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (ignoreKeys.includes(k)) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return true;
  }
  return false;
}

// GENERIC FK DISPLAY ENRICHMENT — a raw foreign-key id (e.g. currentAccountId: 200130) is
// useless to a human reading Log Details. This lets any calling service replace such a field,
// at the exact moment it composes an audit snapshot, with `{ id, code, name }` — the id kept
// alongside for technical reference, code/name resolved ONCE at write time (not a live join at
// read time, so a master renamed/deleted later can never rewrite what an old audit row shows —
// see this file's own "snapshot at write time" design and RecordAuditParams' own comment).
//
// Deliberately NOT a universal "any id, any table" auto-resolver — that would have to guess
// which table a bare number belongs to. Each calling service already knows its own real FK
// columns and already has (or can trivially get, via LegacyMasterLookupService or a Prisma
// model) a way to read that table's Code/Name — this just gives every service the SAME reusable
// shape/plumbing for doing so, instead of each one hand-rolling its own enrichment.
export interface DisplayRef {
  id: number | string;
  code: string | null;
  name: string | null;
}
export type FkResolver = (id: any) => Promise<{ code: string | null; name: string | null } | null>;

// Best-effort by design: a resolver that throws, times out, or returns null just leaves that
// field as the original raw value — enrichment can never block or fail an audit write. Only
// fields actually present on `obj` AND listed in `resolvers` are touched; everything else
// (including fields with no registered resolver) passes through unchanged. Works on a flat
// header row or a single line/detail row — call it per-row for an array section.
export async function enrichDisplayRefs<T extends Record<string, any>>(obj: T, resolvers: Record<string, FkResolver>): Promise<T> {
  const out: Record<string, any> = { ...obj };
  await Promise.all(
    Object.keys(resolvers).map(async (field) => {
      const rawId = obj[field];
      if (rawId === null || rawId === undefined) return;
      try {
        const resolved = await resolvers[field](rawId);
        out[field] = resolved ? { id: rawId, code: resolved.code ?? null, name: resolved.name ?? null } : rawId;
      } catch {
        // resolver failure -> leave the raw id in place, never throw
      }
    }),
  );
  return out as T;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Best-effort, per-request-cheap MenuItem lookup (href is not @unique in this schema — see
  // menu-items.service.ts's own getMenuItems, which already tolerates that; findFirst here for
  // the same reason). Failure to resolve (unknown/legacy screenKey) never blocks the audit write
  // itself — module/menu just come back null, same as an entity with no known screen.
  //
  // HARDENING FIX: a screen registered as a CHILD MenuItem (parentId set — e.g. every
  // "N - <Receipt Type>" row nested under the "Inventory Receipts" submenu) carries its own
  // `group: null` by this schema's own convention; only top-level rows (parentId: null) carry a
  // real `group`. A flat `item.group` read therefore always resolved `moduleName` to null for
  // every submenu-nested screen — not an Inventory-Receipt-specific bug, but generic to this
  // whole menu tree shape. Fixed by walking up to the nearest ancestor with a non-null `group`
  // (depth-bounded, matching real menu nesting which is never more than 2 levels deep) instead
  // of adding a redundant `group` value onto every child MenuItem row.
  private async resolveScreen(screenKey: string | null | undefined): Promise<{ module: string | null; menu: string | null }> {
    if (!screenKey) return { module: null, menu: null };
    const item = await this.prisma.menuItem.findFirst({ where: { href: screenKey }, select: { group: true, title: true, parentId: true } });
    if (!item) return { module: null, menu: null };
    let group = item.group;
    let parentId = item.parentId;
    for (let depth = 0; group == null && parentId && depth < 5; depth++) {
      const parent = await this.prisma.menuItem.findUnique({ where: { id: parentId }, select: { group: true, parentId: true } });
      if (!parent) break;
      group = parent.group;
      parentId = parent.parentId;
    }
    return { module: group ?? null, menu: item.title ?? null };
  }

  // Never-throws wrapper for the common "audit the business write I just made, inside a
  // controller/service method that isn't itself wrapped in a $transaction" case — a hiccup in the
  // audit write (e.g. a transient DB blip) must never fail the business operation that already
  // succeeded and already returned/committed. Logged (not silently swallowed) so an operator can
  // still detect a broken audit pipeline. A caller that DOES want the audit write to be atomic
  // with its own business write (rolled back together on failure) should call record() directly
  // inside its own `prisma.$transaction(async (tx) => ...)` instead — see AuditService.record's
  // own `tx` param.
  async recordSafe(params: RecordAuditParams): Promise<void> {
    try {
      await this.record(params);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AuditService] Failed to record audit event', { entityType: params.entityType, entityId: params.entityId, action: params.action, err });
    }
  }

  async record(params: RecordAuditParams, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const { module: moduleName, menu: menuTitle } = await this.resolveScreen(params.screenKey);
    await client.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        changedBy: params.userId,
        companyId: params.companyId,
        screenKey: params.screenKey ?? null,
        moduleName,
        menuTitle,
        documentNo: params.documentNo ?? null,
        parentEntityType: params.parentEntityType ?? null,
        parentEntityId: params.parentEntityId ?? null,
        parentDocumentNo: params.parentDocumentNo ?? null,
        correlationId: params.correlationId ?? null,
        ipAddress: params.ipAddress ?? null,
        oldValues: params.before !== undefined ? (scrub(params.before) as Prisma.InputJsonValue) : undefined,
        newValues: params.after !== undefined ? (scrub(params.after) as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async list(params: ListAuditParams) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 200);
    const where: Prisma.AuditLogWhereInput = {
      companyId: params.companyId,
      ...(params.from || params.to
        ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
        : {}),
      ...(params.userId ? { changedBy: params.userId } : {}),
      ...(params.module ? { moduleName: params.module } : {}),
      ...(params.screenKey ? { screenKey: params.screenKey } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.correlationId ? { correlationId: params.correlationId } : {}),
      ...(params.documentNo ? { documentNo: { contains: params.documentNo, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        // PERFORMANCE/SAFETY: explicit select, deliberately omitting oldValues/newValues — the
        // worklist must never load complete document snapshots for every row on every page (that
        // data can be arbitrarily large per row); Log Details' own getById() below is the only
        // place a snapshot is fetched, and only for the one row actually opened.
        select: {
          id: true, entityType: true, entityId: true, action: true, changedBy: true, companyId: true,
          screenKey: true, moduleName: true, menuTitle: true, documentNo: true,
          parentEntityType: true, parentEntityId: true, parentDocumentNo: true,
          correlationId: true, ipAddress: true, createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: params.sortDir ?? 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total, skip, take };
  }

  // Single audit event, company-scoped (never returns a row belonging to another tenant even if
  // the id is guessed/leaked) — the Log Details endpoint's own source of both the Audit
  // Information section and the Document Snapshot (oldValues/newValues, already the full
  // structured snapshot the writing service composed — see the model's own comment; no second,
  // live-requery join is performed here, by design).
  async getById(id: string, companyId: string) {
    return this.prisma.auditLog.findFirst({
      where: { id, companyId },
      include: { user: { select: { name: true, email: true } } },
    });
  }

  // Real, DB-driven Module filter options — every distinct MenuItem.group a company's own audit
  // rows actually reference, not a hardcoded list.
  async listModules(companyId: string): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { companyId, moduleName: { not: null } },
      select: { moduleName: true },
      distinct: ['moduleName'],
      orderBy: { moduleName: 'asc' },
    });
    return rows.map((r) => r.moduleName as string);
  }

  async listActions(companyId: string): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { companyId },
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    });
    return rows.map((r) => r.action);
  }

  async listEntityTypes(companyId: string): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { companyId },
      select: { entityType: true },
      distinct: ['entityType'],
      orderBy: { entityType: 'asc' },
    });
    return rows.map((r) => r.entityType);
  }
}
