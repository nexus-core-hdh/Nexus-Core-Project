import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  OPERATORS,
  REPORT_SOURCES,
  REPORT_SECTION_TITLES,
  ReportField,
  ReportSource,
  PrismaReportSource,
  SqlReportSource,
  VALUELESS_OPERATORS,
  findReportSource,
} from './report-sources';
import { standardPlmReportInputs } from './standard-reports';
import { standardLegacyReportInputs } from './standard-legacy-reports';
import { standardDocketReportInputs } from './standard-docket-reports';
import { ReportModuleConfig, reportModule, reportViewHref } from './report-modules';
import { sqlCondition, sqlQuery } from './report-sql';

/** Most rows a report run or export returns; anything beyond is reported as truncated. */
export const MAX_REPORT_ROWS = 10000;
const PREVIEW_ROWS = 50;
const MAX_SORTS = 3;

const MENU_PARENT_TITLE = 'Reports';
const STANDARD_REPORTS: Record<string, () => ReportDefinitionInput[]> = {
  plm: standardPlmReportInputs,
  'legacy-erp': standardLegacyReportInputs,
  docket: standardDocketReportInputs,
};

export interface ReportColumn {
  field: string;
  label?: string;
  total?: boolean;
}
export interface ReportFilter {
  id: string;
  field: string;
  operator: string;
  value?: string;
  value2?: string;
  /** Ask for the value when the report is run instead of storing it. */
  prompt?: boolean;
}
export interface ReportSort {
  field: string;
  direction: 'asc' | 'desc';
}
export interface ReportDefinitionInput {
  name: string;
  description?: string | null;
  dataSource: string;
  columns: ReportColumn[];
  filters?: ReportFilter[];
  sorting?: ReportSort[];
}
/** Run-time values for prompt filters, keyed by filter id. */
export type ReportParams = Record<string, { value?: string; value2?: string }>;

export interface ReportUser {
  id: string;
  companyId: string;
  branchId?: string | null;
  company?: { name?: string | null } | null;
}

export interface ReportResult {
  report: { id: string | null; name: string; description: string | null; source: string };
  columns: { key: string; label: string; type: string; total: boolean }[];
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
  rowCount: number;
  truncated: boolean;
  appliedFilters: string[];
  generatedAt: string;
}

/** Nullability along a field's path, read from the Prisma schema itself. */
function pathInfo(model: string, path: string[]) {
  const models = Prisma.dmmf.datamodel.models;
  // Prisma delegate names are the model names with a lower-case first letter.
  let current = models.find((m) => m.name === model[0].toUpperCase() + model.slice(1));
  // Index in the path of the first relation that may be missing (-1 if every link is required).
  let firstOptional = -1;
  path.slice(0, -1).forEach((rel, i) => {
    const f = current?.fields.find((x) => x.name === rel);
    if (f && !f.isRequired && firstOptional === -1) firstOptional = i;
    current = models.find((m) => m.name === f?.type);
  });
  const scalar = current?.fields.find((x) => x.name === path[path.length - 1]);
  return { nullable: !scalar?.isRequired, firstOptional };
}

const OPERATOR_LABEL: Record<string, string> = {
  equals: 'is', notEquals: 'is not', contains: 'contains', notContains: 'does not contain', startsWith: 'starts with',
  endsWith: 'ends with', isEmpty: 'is empty', isNotEmpty: 'is not empty', eq: '=', neq: '≠', gt: '>', gte: '≥',
  lt: '<', lte: '≤', between: 'between', on: 'on', before: 'before', after: 'after', isTrue: 'is Yes', isFalse: 'is No',
};

@Injectable()
export class ReportBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Catalog & capabilities ──────────────────────────────────────────────────

  /** Data sources for a module, plus what the current user may do with reports. */
  async catalog(module: string, user: ReportUser) {
    return {
      module: { key: reportModule(module).key, label: reportModule(module).label },
      sources: REPORT_SOURCES.filter((s) => s.module === module).map((s) => ({
        key: s.key,
        label: s.label,
        description: s.description,
        fields: s.fields.map((f) => ({
          key: f.key, label: f.label, group: f.group, type: f.type,
          filterable: !f.countOf && !f.compute,
          sortable: !f.compute,
        })),
      })),
      operators: OPERATORS,
      capabilities: await this.capabilities(module, user),
      maxRows: MAX_REPORT_ROWS,
    };
  }

  private async capabilities(module: string, user: ReportUser) {
    const permission = reportModule(module).permission;
    const roles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const granted = new Set(
      roles.flatMap((r) => r.role.permissions.filter((rp) => rp.permission.module === permission).map((rp) => rp.permission.action)),
    );
    return {
      view: granted.has('view'),
      create: granted.has('create'),
      update: granted.has('update'),
      delete: granted.has('delete'),
      export: granted.has('export'),
    };
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  list(module: string, user: ReportUser) {
    return this.prisma.reportDefinition.findMany({
      where: { companyId: user.companyId, module },
      orderBy: { name: 'asc' },
    });
  }

  /** A report of this module and company — another module's report is "not found" here, so
   *  each module's own permissions always apply. */
  async get(module: string, id: string, user: ReportUser) {
    const def = await this.prisma.reportDefinition.findFirst({ where: { id, module, companyId: user.companyId } });
    if (!def) throw new NotFoundException('Report not found');
    return def;
  }

  async create(module: string, input: ReportDefinitionInput, user: ReportUser) {
    const clean = this.normalize(module, input);
    await this.assertUniqueName(module, clean.name, user.companyId);
    const created = await this.prisma.$transaction(async (tx) => {
      const def = await tx.reportDefinition.create({
        data: { ...this.toData(clean), module, companyId: user.companyId, createdById: user.id, updatedById: user.id },
      });
      const menuItemId = await this.createMenuItem(tx, reportModule(module), def.id, def.name, def.dataSource, user.companyId);
      return tx.reportDefinition.update({ where: { id: def.id }, data: { menuItemId } });
    });
    if (user.id) {
      await this.audit.recordSafe({
        userId: user.id, companyId: user.companyId, screenKey: reportModule(module).basePath,
        entityType: 'ReportDefinition', entityId: created.id, action: 'create', documentNo: created.name, after: created,
      });
    }
    return created;
  }

  /**
   * Adds a module's standard reports (standard-reports.ts, standard-legacy-reports.ts,
   * standard-docket-reports.ts) a company
   * does not have yet. Matching is
   * by name, so re-running never duplicates, keeps any edits made to a standard report, and does
   * not bring back one that was renamed. Returns how many were created and skipped.
   */
  async ensureStandardReports(module: string, companyId: string, createdById?: string | null) {
    const standard = (STANDARD_REPORTS[module] ?? (() => []))();
    const existing = await this.prisma.reportDefinition.findMany({ where: { companyId, module }, select: { name: true } });
    const names = new Set(existing.map((r) => r.name.toLowerCase()));
    let created = 0;
    for (const input of standard) {
      if (names.has(input.name.toLowerCase())) continue;
      await this.create(module, input, { id: createdById ?? (undefined as unknown as string), companyId });
      names.add(input.name.toLowerCase());
      created++;
    }
    return { created, skipped: standard.length - created };
  }

  async update(module: string, id: string, input: ReportDefinitionInput, user: ReportUser) {
    const existing = await this.get(module, id, user);
    const mod = reportModule(module);
    const clean = this.normalize(existing.module, input);
    if (clean.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUniqueName(existing.module, clean.name, user.companyId, id);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      // Keep the report's own menu entry in step with its name and data source (each source has
      // its own menu section); recreate the entry if it was removed.
      const menu = existing.menuItemId ? await tx.menuItem.findUnique({ where: { id: existing.menuItemId } }) : null;
      let menuItemId = existing.menuItemId;
      if (menu) {
        const sectionId = await this.ensureSourceSection(tx, mod, clean.dataSource, user.companyId);
        if (menu.title !== clean.name || menu.parentId !== sectionId) {
          await tx.menuItem.update({ where: { id: menu.id }, data: { title: clean.name, parentId: sectionId } });
          if (menu.parentId && menu.parentId !== sectionId) await this.removeSectionIfEmpty(tx, menu.parentId);
        }
      } else {
        menuItemId = await this.createMenuItem(tx, mod, id, clean.name, clean.dataSource, user.companyId);
      }
      return tx.reportDefinition.update({
        where: { id },
        data: { ...this.toData(clean), menuItemId, updatedById: user.id },
      });
    });
    await this.audit.recordSafe({
      userId: user.id, companyId: user.companyId, screenKey: mod.basePath,
      entityType: 'ReportDefinition', entityId: id, action: 'update', documentNo: updated.name, before: existing, after: updated,
    });
    return updated;
  }

  async remove(module: string, id: string, user: ReportUser) {
    const existing = await this.get(module, id, user);
    await this.prisma.$transaction(async (tx) => {
      const menu = existing.menuItemId ? await tx.menuItem.findUnique({ where: { id: existing.menuItemId } }) : null;
      if (menu) {
        await tx.menuItem.delete({ where: { id: menu.id } });
        if (menu.parentId) await this.removeSectionIfEmpty(tx, menu.parentId);
      }
      await tx.reportDefinition.delete({ where: { id } });
    });
    await this.audit.recordSafe({
      userId: user.id, companyId: user.companyId, screenKey: reportModule(module).basePath,
      entityType: 'ReportDefinition', entityId: id, action: 'delete', documentNo: existing.name, before: existing,
    });
    return { id };
  }

  private toData(clean: ReturnType<ReportBuilderService['normalize']>) {
    const json = (v: unknown) => v as Prisma.InputJsonValue;
    return {
      name: clean.name,
      description: clean.description,
      dataSource: clean.dataSource,
      columns: json(clean.columns),
      filters: json(clean.filters),
      sorting: json(clean.sorting),
    };
  }

  private async assertUniqueName(module: string, name: string, companyId: string, exceptId?: string) {
    const clash = await this.prisma.reportDefinition.findFirst({
      where: { module, companyId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A report named "${name}" already exists`);
  }

  // ── Menu ────────────────────────────────────────────────────────────────────

  /** PLM › Reports parent and its "Manage Reports" entry (always first) — created on first use;
   *  scripts/seed-plm-report-builder-menu-item.ts creates the same entries at setup. */
  private async ensureMenuParent(tx: Prisma.TransactionClient, mod: ReportModuleConfig): Promise<string> {
    const MENU_GROUP = mod.menuGroup;
    const MANAGE_REPORTS_HREF = mod.basePath;
    let parent = await tx.menuItem.findFirst({ where: { group: MENU_GROUP, parentId: null, title: MENU_PARENT_TITLE } });
    if (!parent) {
      const last = await tx.menuItem.aggregate({ where: { group: MENU_GROUP, parentId: null }, _max: { order: true } });
      parent = await tx.menuItem.create({
        data: { title: MENU_PARENT_TITLE, href: '#', icon: 'BarChart3', group: MENU_GROUP, order: (last._max.order ?? 0) + 1, isActive: true },
      });
    }
    const manage = await tx.menuItem.findFirst({ where: { href: MANAGE_REPORTS_HREF } });
    if (!manage) {
      await tx.menuItem.create({
        data: { title: 'Manage Reports', href: MANAGE_REPORTS_HREF, icon: 'SlidersHorizontal', parentId: parent.id, order: -1, isActive: true },
      });
    }
    return parent.id;
  }

  /**
   * The PLM menu section a data source's reports are listed in ("Style Card Reports", ...) — one
   * per company, created on first use, so many reports stay organised by what they report on.
   */
  private async ensureSourceSection(tx: Prisma.TransactionClient, mod: ReportModuleConfig, dataSource: string, companyId: string): Promise<string> {
    await this.ensureMenuParent(tx, mod);
    const MENU_GROUP = mod.menuGroup;
    const section = findReportSource(dataSource)?.menuSection ?? { title: 'Other Reports', icon: 'BarChart3' };
    const title = section.title;
    const existing = await tx.menuItem.findFirst({ where: { group: MENU_GROUP, parentId: null, title, companyId } });
    if (existing) return existing.id;
    const last = await tx.menuItem.aggregate({ where: { group: MENU_GROUP, parentId: null }, _max: { order: true } });
    const created = await tx.menuItem.create({
      data: {
        title, href: '#', icon: section.icon, group: MENU_GROUP, companyId,
        order: (last._max.order ?? 0) + 1, isActive: true,
      },
    });
    return created.id;
  }

  /** Drops a report section once its last report is gone, so no empty sections linger. */
  private async removeSectionIfEmpty(tx: Prisma.TransactionClient, sectionId: string) {
    const section = await tx.menuItem.findUnique({ where: { id: sectionId }, select: { title: true, parentId: true } });
    if (!section || section.parentId !== null || !REPORT_SECTION_TITLES.has(section.title)) return;
    if ((await tx.menuItem.count({ where: { parentId: sectionId } })) === 0) await tx.menuItem.delete({ where: { id: sectionId } });
  }

  private async createMenuItem(tx: Prisma.TransactionClient, mod: ReportModuleConfig, reportId: string, name: string, dataSource: string, companyId: string) {
    const parentId = await this.ensureSourceSection(tx, mod, dataSource, companyId);
    const last = await tx.menuItem.aggregate({ where: { parentId }, _max: { order: true } });
    const item = await tx.menuItem.create({
      data: {
        title: name, href: reportViewHref(mod, reportId), icon: 'FileText',
        parentId, companyId, order: (last._max.order ?? 0) + 1, isActive: true,
      },
    });
    return item.id;
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  private normalize(module: string, input: ReportDefinitionInput) {
    const source = findReportSource(String(input?.dataSource ?? ''), module);
    if (!source) throw new BadRequestException('Choose a valid data source');
    const fieldByKey = new Map(source.fields.map((f) => [f.key, f]));

    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('Report name is required');
    if (name.length > 120) throw new BadRequestException('Report name must be at most 120 characters');

    if (!Array.isArray(input.columns) || input.columns.length === 0) throw new BadRequestException('Select at least one column');
    const seen = new Set<string>();
    const columns: ReportColumn[] = [];
    for (const c of input.columns) {
      const field = fieldByKey.get(String(c?.field));
      if (!field) throw new BadRequestException(`Unknown column "${c?.field}"`);
      if (seen.has(field.key)) continue;
      seen.add(field.key);
      const label = String(c.label ?? '').trim().slice(0, 100);
      columns.push({ field: field.key, ...(label && label !== field.label ? { label } : {}), ...(c.total && field.type === 'number' ? { total: true } : {}) });
    }

    const filters: ReportFilter[] = (Array.isArray(input.filters) ? input.filters : []).map((f) => {
      const field = fieldByKey.get(String(f?.field));
      if (!field || field.countOf || field.compute) throw new BadRequestException(`Field "${field?.label ?? f?.field}" cannot be filtered`);
      if (!OPERATORS[field.type].includes(f.operator)) throw new BadRequestException(`Invalid condition for "${field.label}"`);
      const needsValue = !VALUELESS_OPERATORS.has(f.operator);
      const prompt = needsValue && !!f.prompt;
      const value = needsValue && !prompt ? String(f.value ?? '').trim() : '';
      const value2 = needsValue && !prompt && f.operator === 'between' ? String(f.value2 ?? '').trim() : '';
      if (needsValue && !prompt && (!value || (f.operator === 'between' && !value2))) {
        throw new BadRequestException(`Enter a value for the "${field.label}" filter, or set it to ask when the report runs`);
      }
      if (!prompt) this.condition(source, field, f.operator, value, value2); // validates the value's format
      return {
        id: typeof f.id === 'string' && f.id ? f.id : randomUUID(),
        field: field.key,
        operator: f.operator,
        ...(value ? { value } : {}),
        ...(value2 ? { value2 } : {}),
        ...(prompt ? { prompt: true } : {}),
      };
    });

    const sorting: ReportSort[] = (Array.isArray(input.sorting) ? input.sorting : []).slice(0, MAX_SORTS).map((s) => {
      const field = fieldByKey.get(String(s?.field));
      if (!field) throw new BadRequestException(`Unknown sort field "${s?.field}"`);
      if (field.compute) throw new BadRequestException(`"${field.label}" is calculated and cannot be used for sorting`);
      return { field: s.field, direction: s.direction === 'desc' ? 'desc' : 'asc' };
    });

    const description = String(input.description ?? '').trim() || null;
    return { name, description, dataSource: source.key, columns, filters, sorting } as const;
  }

  // ── Running ─────────────────────────────────────────────────────────────────

  async run(module: string, id: string, params: ReportParams, user: ReportUser, limit = MAX_REPORT_ROWS): Promise<ReportResult> {
    const def = await this.get(module, id, user);
    return this.execute(def.module, { ...def, filters: def.filters as any, columns: def.columns as any, sorting: def.sorting as any }, params, user, limit, def.id);
  }

  /** Runs an unsaved definition — the builder's live preview. */
  preview(module: string, input: ReportDefinitionInput, params: ReportParams, user: ReportUser) {
    // A preview must not require a name or values for prompt filters yet.
    const clean = this.normalize(module, { ...input, name: input?.name?.trim() || 'Preview' });
    return this.execute(module, clean, params, user, PREVIEW_ROWS, null);
  }

  private async execute(
    module: string,
    def: { name: string; description?: string | null; dataSource: string; columns: ReportColumn[]; filters: ReportFilter[]; sorting: ReportSort[] },
    params: ReportParams,
    user: ReportUser,
    limit: number,
    id: string | null,
  ): Promise<ReportResult> {
    const source = findReportSource(def.dataSource, module);
    if (!source) throw new BadRequestException('This report uses a data source that no longer exists');
    const fieldByKey = new Map(source.fields.map((f) => [f.key, f]));
    const columns = def.columns
      .map((c) => ({ col: c, field: fieldByKey.get(c.field) }))
      .filter((c): c is { col: ReportColumn; field: ReportField } => !!c.field);

    const conditions: unknown[] = [];
    const appliedFilters: string[] = [];
    for (const f of def.filters ?? []) {
      const field = fieldByKey.get(f.field);
      if (!field) continue;
      const supplied = f.prompt ? params?.[f.id] ?? {} : f;
      const value = String(supplied.value ?? '').trim();
      const value2 = String(supplied.value2 ?? '').trim();
      // An unanswered prompt filter means "no restriction".
      if (!VALUELESS_OPERATORS.has(f.operator) && (!value || (f.operator === 'between' && !value2))) continue;
      conditions.push(this.condition(source, field, f.operator, value, value2));
      appliedFilters.push(
        `${field.label} ${OPERATOR_LABEL[f.operator] ?? f.operator}${VALUELESS_OPERATORS.has(f.operator) ? '' : ` ${value}${f.operator === 'between' ? ` and ${value2}` : ''}`}`,
      );
    }

    const sorts = (def.sorting?.length ? def.sorting : [source.defaultSort])
      .map((s) => ({ field: fieldByKey.get(s.field), direction: s.direction }))
      .filter((s): s is { field: ReportField; direction: 'asc' | 'desc' } => !!s.field);

    const fetched = source.kind === 'sql'
      ? await this.fetchSql(source, columns.map((c) => c.field), conditions as Prisma.Sql[], sorts, limit + 1)
      : await this.fetchPrisma(source, columns.map((c) => c.field), conditions as Record<string, unknown>[], sorts, limit + 1, user);
    const truncated = fetched.length > limit;
    const rows = fetched.slice(0, limit);

    const totals: Record<string, number> = {};
    for (const { col, field } of columns) {
      if (!col.total || field.type !== 'number') continue;
      totals[field.key] = rows.reduce((sum, row) => sum + (typeof row[field.key] === 'number' ? (row[field.key] as number) : 0), 0);
    }

    return {
      report: { id, name: def.name, description: def.description ?? null, source: source.label },
      columns: columns.map(({ col, field }) => ({ key: field.key, label: col.label || field.label, type: field.type, total: !!col.total && field.type === 'number' })),
      rows,
      totals,
      rowCount: rows.length,
      truncated,
      appliedFilters,
      generatedAt: new Date().toISOString(),
    };
  }

  /** A filter condition in the source's own query language (Prisma where-object or SQL). */
  private condition(source: ReportSource, field: ReportField, operator: string, value: string, value2: string): unknown {
    return source.kind === 'sql'
      ? sqlCondition(field, operator, value, value2)
      : this.toCondition(source.model, field, operator, value, value2);
  }

  private async fetchPrisma(
    source: PrismaReportSource, fields: ReportField[], conditions: Record<string, unknown>[],
    sorts: { field: ReportField; direction: 'asc' | 'desc' }[], take: number, user: ReportUser,
  ): Promise<Record<string, unknown>[]> {
    const records: any[] = await (this.prisma as any)[source.model].findMany({
      where: { AND: [await this.scope(user, source), ...conditions] },
      select: this.toSelect(fields),
      orderBy: sorts.map((s) => this.toOrderBy(s.field, s.direction)),
      take,
    });
    return records.map((r) => Object.fromEntries(fields.map((f) => [f.key, this.readValue(r, f)])));
  }

  private async fetchSql(
    source: SqlReportSource, fields: ReportField[], conditions: Prisma.Sql[],
    sorts: { field: ReportField; direction: 'asc' | 'desc' }[], take: number,
  ): Promise<Record<string, unknown>[]> {
    const records = await this.prisma.$queryRaw<Record<string, unknown>[]>(sqlQuery(source, fields, conditions, sorts, take));
    return records.map((r) => Object.fromEntries(fields.map((f, i) => [f.key, this.normalizeValue(r[`c${i}`])])));
  }

  /**
   * Same data scope as the PLM screens: the user's branch, or every branch of their company.
   * Line tables have no branch of their own and are scoped through their parent record
   * (source.scope, e.g. a BOM line through its Style Card).
   */
  private async scope(user: ReportUser, source: PrismaReportSource) {
    let condition: Record<string, unknown>;
    if (user.branchId) {
      condition = { branchId: user.branchId };
    } else {
      const branches = await this.prisma.branch.findMany({ where: { companyId: user.companyId }, select: { id: true } });
      condition = { branchId: { in: branches.map((b) => b.id) } };
    }
    if (source.scopeIncludesShared) condition = { OR: [condition, { branchId: null }] };
    return source.scope.reduceRight<Record<string, unknown>>((inner, rel) => ({ [rel]: { is: inner } }), condition);
  }

  private toSelect(fields: ReportField[]) {
    const select: Record<string, any> = { id: true };
    for (const f of fields) {
      if (f.countOf) {
        select._count ??= { select: {} };
        select._count.select[f.countOf] = true;
        continue;
      }
      for (const path of f.compute ? f.compute.deps : [f.path!]) {
        let node = select;
        for (const rel of path.slice(0, -1)) {
          if (node[rel] === true || !node[rel]) node[rel] = { select: {} };
          node = node[rel].select;
        }
        node[path[path.length - 1]] = true;
      }
    }
    return select;
  }

  private readValue(record: any, field: ReportField): unknown {
    if (field.compute) {
      const values = field.compute.deps.map((path) => {
        const v = this.normalizeValue(this.readPath(record, path));
        return typeof v === 'number' ? v : 0;
      });
      const result = field.compute.fn(values);
      return Number.isFinite(result) ? result : null;
    }
    return this.normalizeValue(field.countOf ? record?._count?.[field.countOf] : this.readPath(record, field.path!));
  }

  private readPath(record: any, path: string[]) {
    return path.reduce((v: any, key) => (v === null || v === undefined ? v : v[key]), record);
  }

  private normalizeValue(raw: any): unknown {
    if (raw === null || raw === undefined) return null;
    if (raw instanceof Date) return raw.toISOString();
    if (typeof raw === 'bigint') return Number(raw);
    if (typeof raw === 'object' && typeof raw.toNumber === 'function') return raw.toNumber(); // Prisma Decimal
    return raw;
  }

  private toOrderBy(field: ReportField, direction: 'asc' | 'desc') {
    if (field.countOf) return { [field.countOf]: { _count: direction } };
    const path = field.path!;
    return path.slice(0, -1).reduceRight<Record<string, unknown>>((inner, rel) => ({ [rel]: inner }), { [path[path.length - 1]]: direction });
  }

  /** Wraps a scalar condition in its relation chain: ['customer','name'] → { customer: { is: { name: cond } } }. */
  private wrap(path: string[], condition: unknown): Record<string, unknown> {
    return path.slice(0, -1).reduceRight<Record<string, unknown>>((inner, rel) => ({ [rel]: { is: inner } }), { [path[path.length - 1]]: condition });
  }

  private toCondition(model: string, field: ReportField, operator: string, value: string, value2: string): Record<string, unknown> {
    const path = field.path!;
    const wrap = (cond: unknown) => this.wrap(path, cond);
    const empty = (): Record<string, unknown> => {
      const { nullable, firstOptional } = pathInfo(model, path);
      const options: Record<string, unknown>[] = [];
      if (nullable) options.push(wrap({ equals: null }));
      if (field.type === 'string') options.push(wrap({ equals: '' }));
      // A missing related record counts as empty too — checked at the first link that can be missing.
      if (firstOptional >= 0) {
        options.push(path.slice(0, firstOptional).reduceRight<Record<string, unknown>>((inner, rel) => ({ [rel]: { is: inner } }), { [path[firstOptional]]: { is: null } }));
      }
      // A required, non-text value can never be empty: match nothing.
      return options.length ? { OR: options } : { id: { in: [] } };
    };
    if (operator === 'isEmpty') return empty();
    if (operator === 'isNotEmpty') return { NOT: empty() };

    switch (field.type) {
      case 'string': {
        const mode = 'insensitive';
        if (operator === 'equals') return wrap({ equals: value, mode });
        if (operator === 'notEquals') return { NOT: wrap({ equals: value, mode }) };
        if (operator === 'contains') return wrap({ contains: value, mode });
        if (operator === 'notContains') return { NOT: wrap({ contains: value, mode }) };
        if (operator === 'startsWith') return wrap({ startsWith: value, mode });
        if (operator === 'endsWith') return wrap({ endsWith: value, mode });
        break;
      }
      case 'number': {
        const n = this.toNumber(value, field);
        if (operator === 'eq') return wrap({ equals: n });
        if (operator === 'neq') return { NOT: wrap({ equals: n }) };
        if (operator === 'gt') return wrap({ gt: n });
        if (operator === 'gte') return wrap({ gte: n });
        if (operator === 'lt') return wrap({ lt: n });
        if (operator === 'lte') return wrap({ lte: n });
        if (operator === 'between') return wrap({ gte: n, lte: this.toNumber(value2, field) });
        break;
      }
      case 'date': {
        const day = this.toDay(value, field);
        const nextDay = (d: Date) => new Date(d.getTime() + 86400000);
        if (operator === 'on') return wrap({ gte: day, lt: nextDay(day) });
        if (operator === 'before') return wrap({ lt: day });
        if (operator === 'after') return wrap({ gte: nextDay(day) });
        if (operator === 'between') return wrap({ gte: day, lt: nextDay(this.toDay(value2, field)) });
        break;
      }
      case 'boolean':
        if (operator === 'isTrue') return wrap({ equals: true });
        if (operator === 'isFalse') return wrap({ equals: false });
        break;
    }
    throw new BadRequestException(`Invalid condition for "${field.label}"`);
  }

  private toNumber(value: string, field: ReportField) {
    const n = Number(value);
    if (value === '' || !Number.isFinite(n)) throw new BadRequestException(`"${field.label}" needs a number`);
    return n;
  }

  /** "yyyy-MM-dd" → that day's start (UTC). */
  private toDay(value: string, field: ReportField) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    if (!d || Number.isNaN(d.getTime())) throw new BadRequestException(`"${field.label}" needs a date`);
    return d;
  }

}
