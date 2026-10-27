import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
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
  DocumentReportSource,
  VALUELESS_OPERATORS,
  findReportSource,
} from './report-sources';
import { standardPlmReportInputs } from './standard-reports';
import { standardLegacyReportInputs } from './standard-legacy-reports';
import { standardDocketReportInputs } from './standard-docket-reports';
import { ReportModuleConfig, reportModule, reportViewHref } from './report-modules';
import { sqlCondition, sqlQuery } from './report-sql';
import { LegacySchemaCatalog, isTableSource, tableSourceSection } from './legacy-schema-catalog';
import { WorkOrderOrderFormService } from '../legacy-erp/work-order-order-form.service';
import { InventoryReceiptGatePassService } from '../legacy-erp/inventory-receipt-gate-pass.service';
import { GATE_PASS_RECEIPT_FIELD, gatePassSections } from './inward-gate-pass.report';
import { RequirementMaterial, YarnRequirementReportService, YarnReportSelection } from '../legacy-erp/yarn-requirement-report.service';
import { BOM_FALLBACK_FIELD, BOM_FALLBACK_YES, MATERIAL_REPORT_SOURCE_KEYS, YARN_REPORT_ORDER_NO_FIELD, YARN_REPORT_WORK_ORDERS_FIELD, yarnReportSections } from './yarn-requirement.report';
import type { ReportDocumentInfo } from './document-sections';
import { DyeingFollowUpSelection, DyeingFollowUpService } from '../legacy-erp/dyeing-follow-up.service';
import { DYEING_FIELDS, DYEING_SOURCE_KEY, dyeingSections } from './dyeing-follow-up.report';
import { ProcessFollowUpSelection, ProcessFollowUpService } from '../legacy-erp/process-follow-up.service';
import {
  PROCESS_FOLLOW_UP_EMPTY_FIELD, PROCESS_FOLLOW_UP_EMPTY_YES, PROCESS_FOLLOW_UP_FIELDS, PROCESS_FOLLOW_UP_SOURCE_KEY, processFollowUpSections,
} from './process-follow-up.report';
import { ORDER_FORM_WORK_ORDER_FIELD, ReportSection, SectionColumnConfig, cleanSectionColumns, orderFormSections } from './work-order-order-form.report';

/** Most rows a report run or export returns; anything beyond is reported as truncated. */
export const MAX_REPORT_ROWS = 10000;
const PREVIEW_ROWS = 50;
const MAX_SORTS = 3;
/** Most columns a report on a database table source may select. */
const MAX_TABLE_COLUMNS = 60;
/** Longest a single report query may run before the database cancels it. */
const SQL_STATEMENT_TIMEOUT_MS = 20000;
/** Modules whose reports may use any eligible database table (`table:<name>`) as their data source. */
const TABLE_SOURCE_MODULES = new Set(['legacy-erp']);

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
  /** Document sections: the section's own columns (order, labels, widths, alignment, decimals, visibility). */
  sectionColumns?: SectionColumnConfig[];
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
  /** Document sources: the printed sections (columns/rows above stay empty). */
  sections?: ReportSection[];
  /** Document sources: how the document prints around its sections (title, company address). */
  document?: ReportDocumentInfo;
  /** Why there is nothing to show yet (e.g. a document report without its record chosen). Not
   *  "message": the global response interceptor lifts a payload's "message" into its envelope. */
  notice?: string | null;
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
  lt: '<', lte: '≤', between: 'between', in: 'is one of', on: 'on', before: 'before', after: 'after', isTrue: 'is Yes', isFalse: 'is No',
};

/** Document filter values by field: the operator and the (fixed or answered) value. */
type DocumentFilterValues = Record<string, { operator: string; value: string }>;
/** "12, 15,20" → [12, 15, 20]; undefined unless it is a non-empty list of positive integers (≤ 500). */
function parseIdList(value: string | undefined): number[] | undefined {
  const ids = String(value ?? '').split(',').map((v) => v.trim()).filter(Boolean).map(Number);
  return ids.length && ids.length <= 500 && ids.every((n) => Number.isInteger(n) && n > 0) ? [...new Set(ids)] : undefined;
}

@Injectable()
export class ReportBuilderService {
  /** Database tables discovered from the catalog (Legacy ERP "table:" sources). */
  private readonly schema: LegacySchemaCatalog;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // Builds the Work Order Order Form document source. Optional so the standard-report seed
    // scripts, which only validate definitions, can construct this service without Nest.
    @Optional() private readonly orderForm?: WorkOrderOrderFormService,
    // Builds the Inward Gate Pass document source (same reason it is optional).
    @Optional() private readonly gatePass?: InventoryReceiptGatePassService,
    // Builds the Yarn Requirement document source (same reason it is optional).
    @Optional() private readonly yarnReport?: YarnRequirementReportService,
    // Builds the Dyeing Follow-up document source (same reason it is optional).
    @Optional() private readonly dyeing?: DyeingFollowUpService,
    // Builds the Process Follow-up document source (same reason it is optional).
    @Optional() private readonly processFollowUp?: ProcessFollowUpService,
  ) {
    this.schema = new LegacySchemaCatalog(prisma);
  }

  // ── Catalog & capabilities ──────────────────────────────────────────────────

  /** Data sources for a module, plus what the current user may do with reports. */
  async catalog(module: string, user: ReportUser) {
    const curated = REPORT_SOURCES.filter((s) => s.module === module).map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description,
      group: 'Ready-made Sources',
      dynamic: false,
      document: s.kind === 'document',
      fields: s.fields.map((f) => ({
        key: f.key, label: f.label, group: f.group, type: f.type,
        filterable: !f.countOf && !f.compute && !f.section,
        sortable: !f.compute && s.kind !== 'document',
        ...(f.operators ? { operators: f.operators } : {}),
        ...(f.lookup ? { lookup: f.lookup } : {}),
        ...(f.options ? { options: f.options } : {}),
        ...(f.section ? { section: true } : {}),
        ...(f.sectionColumns ? { sectionColumns: f.sectionColumns } : {}),
      })),
    }));
    // Table sources carry no fields here (hundreds of tables): the designer loads them per source.
    let tables: { key: string; label: string; description: string; group: string; table: string; dynamic: true; fields: [] }[] = [];
    let tableSourcesError: string | null = null;
    if (TABLE_SOURCE_MODULES.has(module)) {
      try {
        tables = (await this.schema.sources()).map((t) => ({ ...t, dynamic: true as const, fields: [] as [] }));
      } catch {
        tableSourcesError = 'Database tables could not be read right now; only the ready-made sources are listed.';
      }
    }
    return {
      module: { key: reportModule(module).key, label: reportModule(module).label },
      sources: [...curated, ...tables],
      tableSourcesError,
      operators: OPERATORS,
      capabilities: await this.capabilities(module, user),
      maxRows: MAX_REPORT_ROWS,
    };
  }

  /**
   * Fields of a database table source: with `keys`, the metadata of exactly those fields (and the
   * ones that no longer resolve); otherwise the field groups at `path` (see LegacySchemaCatalog.describe).
   */
  async sourceFields(module: string, input: { source?: string; path?: string; keys?: string[] }) {
    const source = String(input?.source ?? '');
    if (!TABLE_SOURCE_MODULES.has(module) || !isTableSource(source)) throw new BadRequestException('Choose a database table data source');
    if (Array.isArray(input.keys)) return this.schema.resolveFields(source, input.keys.slice(0, 500));
    return this.schema.describe(source, input.path ? String(input.path) : '');
  }

  /** Checks a definition exactly as saving would, and lists the relationship paths it joins. */
  async validate(module: string, input: ReportDefinitionInput) {
    const clean = await this.normalize(module, { ...input, name: input?.name?.trim() || 'Untitled' });
    const keys = [...clean.columns.map((c) => c.field), ...clean.filters.map((f) => f.field), ...clean.sorting.map((s) => s.field)];
    return {
      valid: true,
      definition: clean,
      joinPaths: isTableSource(clean.dataSource) ? await this.schema.joinPaths(clean.dataSource, keys) : [],
    };
  }

  /**
   * The source a definition runs on. Ready-made sources are declared in code; a "table:" source is
   * built from the database catalog for exactly the fields the definition uses (throws a readable
   * error if any of them no longer exists).
   */
  private async resolveSource(module: string, key: string, fieldKeys: string[]): Promise<ReportSource | undefined> {
    if (isTableSource(key)) {
      if (!TABLE_SOURCE_MODULES.has(module)) return undefined;
      return this.schema.buildSource(key, fieldKeys);
    }
    return findReportSource(key, module);
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
    const clean = await this.normalize(module, input);
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
    const clean = await this.normalize(existing.module, input);
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

  private toData(clean: Awaited<ReturnType<ReportBuilderService['normalize']>>) {
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
    const section = isTableSource(dataSource)
      ? tableSourceSection(dataSource)
      : findReportSource(dataSource)?.menuSection ?? { title: 'Other Reports', icon: 'BarChart3' };
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

  private async normalize(module: string, input: ReportDefinitionInput) {
    const keys = [input?.columns, input?.filters, input?.sorting].flatMap((list) => (Array.isArray(list) ? list.map((x) => String(x?.field)) : []));
    const source = await this.resolveSource(module, String(input?.dataSource ?? ''), keys);
    if (!source) throw new BadRequestException('Choose a valid data source');
    if (isTableSource(source.key) && Array.isArray(input.columns) && input.columns.length > MAX_TABLE_COLUMNS) {
      throw new BadRequestException(`A report can have at most ${MAX_TABLE_COLUMNS} columns`);
    }
    const isDocument = source.kind === 'document';
    const fieldByKey = new Map(source.fields.map((f) => [f.key, f]));

    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('Report name is required');
    if (name.length > 120) throw new BadRequestException('Report name must be at most 120 characters');

    if (!Array.isArray(input.columns) || input.columns.length === 0) throw new BadRequestException(isDocument ? 'Select at least one section' : 'Select at least one column');
    const seen = new Set<string>();
    const columns: ReportColumn[] = [];
    for (const c of input.columns) {
      const field = fieldByKey.get(String(c?.field));
      if (!field) throw new BadRequestException(`Unknown column "${c?.field}"`);
      // A document's columns are its sections; its other fields only choose the record.
      if (isDocument && !field.section) throw new BadRequestException(`"${field.label}" is not a section of this document`);
      if (seen.has(field.key)) continue;
      seen.add(field.key);
      const label = String(c.label ?? '').trim().slice(0, 100);
      let sectionColumns: SectionColumnConfig[] | undefined;
      if (field.sectionColumns) {
        try {
          sectionColumns = cleanSectionColumns(field.sectionColumns, (c as ReportColumn).sectionColumns);
        } catch (e) {
          throw new BadRequestException(`${field.label}: ${(e as Error).message}`);
        }
      }
      columns.push({
        field: field.key, ...(label && label !== field.label ? { label } : {}), ...(c.total && field.type === 'number' ? { total: true } : {}),
        ...(sectionColumns ? { sectionColumns } : {}),
      });
    }

    const filters: ReportFilter[] = (Array.isArray(input.filters) ? input.filters : []).map((f) => {
      const field = fieldByKey.get(String(f?.field));
      if (!field || field.countOf || field.compute || field.section) throw new BadRequestException(`Field "${field?.label ?? f?.field}" cannot be filtered`);
      if (!(field.operators ?? OPERATORS[field.type]).includes(f.operator)) throw new BadRequestException(`Invalid condition for "${field.label}"`);
      const needsValue = !VALUELESS_OPERATORS.has(f.operator);
      const prompt = needsValue && !!f.prompt;
      const value = needsValue && !prompt ? String(f.value ?? '').trim() : '';
      const value2 = needsValue && !prompt && f.operator === 'between' ? String(f.value2 ?? '').trim() : '';
      if (needsValue && !prompt && (!value || (f.operator === 'between' && !value2))) {
        throw new BadRequestException(`Enter a value for the "${field.label}" filter, or set it to ask when the report runs`);
      }
      if (!prompt && !isDocument) this.condition(source, field, f.operator, value, value2); // validates the value's format
      if (!prompt && isDocument && f.operator === 'eq' && !Number.isFinite(Number(value))) throw new BadRequestException(`"${field.label}" needs a number`);
      if (!prompt && isDocument && f.operator === 'in' && !parseIdList(value)) throw new BadRequestException(`"${field.label}" needs one or more records`);
      if (!prompt && field.options && !field.options.some((o) => o.value === value)) throw new BadRequestException(`Choose one of the options for "${field.label}"`);
      return {
        id: typeof f.id === 'string' && f.id ? f.id : randomUUID(),
        field: field.key,
        operator: f.operator,
        ...(value ? { value } : {}),
        ...(value2 ? { value2 } : {}),
        ...(prompt ? { prompt: true } : {}),
      };
    });

    // A document prints one record — there is nothing to sort.
    const sorting: ReportSort[] = (Array.isArray(input.sorting) && !isDocument ? input.sorting : []).slice(0, MAX_SORTS).map((s) => {
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
  async preview(module: string, input: ReportDefinitionInput, params: ReportParams, user: ReportUser) {
    // A preview must not require a name or values for prompt filters yet.
    const clean = await this.normalize(module, { ...input, name: input?.name?.trim() || 'Preview' });
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
    const usedKeys = [...(def.columns ?? []), ...(def.filters ?? []), ...(def.sorting ?? [])].map((x) => String(x?.field));
    const source = await this.resolveSource(module, def.dataSource, usedKeys);
    if (!source) throw new BadRequestException('This report uses a data source that no longer exists');
    if (source.kind === 'document') return this.executeDocument(source, def, params, user, id);
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

    // Two default labels alike (e.g. "Code" of two linked tables): add where each comes from.
    const labelCount = new Map<string, number>();
    for (const { col, field } of columns) if (!col.label) labelCount.set(field.label, (labelCount.get(field.label) ?? 0) + 1);
    const columnLabel = (col: ReportColumn, field: ReportField) =>
      col.label || ((labelCount.get(field.label) ?? 0) > 1 ? `${field.label} (${field.group.split(' › ').pop()})` : field.label);

    return {
      report: { id, name: def.name, description: def.description ?? null, source: source.label },
      columns: columns.map(({ col, field }) => ({ key: field.key, label: columnLabel(col, field), type: field.type, total: !!col.total && field.type === 'number' })),
      rows,
      totals,
      rowCount: rows.length,
      truncated,
      appliedFilters,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * A document source: the record chosen by its filter (fixed or asked at run time), printed as the
   * sections the report's columns list. Without a record chosen yet, an empty result with a message.
   */
  private async executeDocument(
    source: DocumentReportSource,
    def: { name: string; description?: string | null; columns: ReportColumn[]; filters: ReportFilter[] },
    params: ReportParams,
    user: ReportUser,
    id: string | null,
  ): Promise<ReportResult> {
    const builder = this.documentBuilders()[source.builder];
    if (!builder) throw new BadRequestException('This document report is not available here');
    // The values of the builder's filter fields (fixed, or answered when the report runs).
    const values: DocumentFilterValues = {};
    for (const f of def.filters ?? []) {
      if (!builder.fields.includes(f.field) && !builder.options?.includes(f.field)) continue;
      const raw = String((f.prompt ? params?.[f.id]?.value : f.value) ?? '').trim();
      if (raw) values[f.field] = { operator: f.operator, value: raw };
    }
    const base = {
      report: { id, name: def.name, description: def.description ?? null, source: source.label },
      columns: [], rows: [], totals: {}, rowCount: 0, truncated: false, generatedAt: new Date().toISOString(),
    };
    // Only the record-choosing fields count here — an option (e.g. the BOM fallback) chooses nothing.
    if (!builder.allowEmpty && !builder.fields.some((f) => values[f])) return { ...base, appliedFilters: [], sections: [], notice: `Choose the ${builder.noun} to print.` };
    const built = await builder.build(values, user, def.columns ?? []);
    return {
      ...base,
      rowCount: built.sections.reduce((t, s) => t + s.rows.length, 0),
      appliedFilters: [built.applied],
      sections: built.sections,
      document: built.document,
      notice: null,
    };
  }

  /**
   * The document sources' builders, by DocumentReportSource.builder: the filter field that names
   * the record, what it is called in messages, and how its sections are built from the record's
   * data (via the same services its own screens use).
   */
  private documentBuilders(): Record<string, {
    fields: string[]; noun: string;
    /** Filter fields that set how the document is built, not which records it prints. */
    options?: string[];
    /** Runs with no filter given (every filter optional — e.g. the Dyeing Follow-up prints all lines). */
    allowEmpty?: boolean;
    build: (values: DocumentFilterValues, user: ReportUser, columns: ReportColumn[]) => Promise<{ sections: ReportSection[]; applied: string; document: ReportDocumentInfo }>;
  }> {
    /** One record's id from a single-record filter ("=" a number); a missing one is reported by name. */
    const recordId = async <T>(values: DocumentFilterValues, field: string, noun: string, load: (id: number) => Promise<T>): Promise<T> => {
      const id = Number(values[field]?.value);
      if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(`Choose a valid ${noun}`);
      return load(id).catch((e) => {
        if (e instanceof NotFoundException) throw new BadRequestException(`${noun} ${id} was not found (or has been deleted)`);
        throw e;
      });
    };
    return {
      'work-order-order-form': {
        fields: [ORDER_FORM_WORK_ORDER_FIELD], noun: 'Work Order',
        build: async (values, user, columns) => {
          if (!this.orderForm) throw new BadRequestException('This document report is not available here');
          const data = await recordId(values, ORDER_FORM_WORK_ORDER_FIELD, 'Work Order', (id) => this.orderForm!.build(id, user.companyId));
          return {
            sections: orderFormSections(data, columns),
            applied: `Work Order ${data.header.workOrderNo}`,
            document: { showTitle: true, companyAddress: null },
          };
        },
      },
      'inward-gate-pass': {
        fields: [GATE_PASS_RECEIPT_FIELD], noun: 'Receipt',
        build: async (values, user, columns) => {
          if (!this.gatePass) throw new BadRequestException('This document report is not available here');
          const data = await recordId(values, GATE_PASS_RECEIPT_FIELD, 'Receipt', (id) => this.gatePass!.build(id, user.companyId));
          return {
            sections: gatePassSections(data, columns),
            applied: `Receipt ${data.header.receiptNo}`,
            // The printed form has no title line (removed on request); its header carries the company.
            document: { showTitle: false, companyAddress: data.company.address, showSectionTitles: false },
          };
        },
      },
      [DYEING_SOURCE_KEY]: {
        fields: Object.values(DYEING_FIELDS), noun: 'receipts', allowEmpty: true,
        build: async (values: DocumentFilterValues, _user: ReportUser, columns: ReportColumn[]) => {
          if (!this.dyeing) throw new BadRequestException('This document report is not available here');
          const sel: DyeingFollowUpSelection = {};
          const applied: string[] = [];
          const ids = async (field: string, label: string, table: 'account' | 'item' | 'workOrder') => {
            const v = values[field];
            if (!v) return undefined;
            const list = parseIdList(v.value);
            if (!list) throw new BadRequestException(`Choose valid values for "${label}"`);
            applied.push(`${label}: ${(await this.dyeing!.names(table, list)).join(', ')}`);
            return list;
          };
          const match = (field: string, label: string) => {
            const v = values[field];
            if (!v) return undefined;
            const operator = (['equals', 'contains', 'startsWith'].includes(v.operator) ? v.operator : 'contains') as 'equals' | 'contains' | 'startsWith';
            applied.push(`${label} ${OPERATOR_LABEL[operator]} ${v.value}`);
            return { operator, value: v.value };
          };
          const from = values[DYEING_FIELDS.dateFrom]?.value;
          const to = values[DYEING_FIELDS.dateTo]?.value;
          if (from) { sel.dateFrom = from.slice(0, 10); applied.push(`Date From ${sel.dateFrom}`); }
          if (to) { sel.dateTo = to.slice(0, 10); applied.push(`Date To ${sel.dateTo}`); }
          sel.subcontractorIds = await ids(DYEING_FIELDS.subcontractors, 'Party Name', 'account');
          sel.partyNo = match(DYEING_FIELDS.partyNo, 'Party No');
          sel.receiptNo = match(DYEING_FIELDS.receiptNo, 'Receipt No');
          sel.documentNo = match(DYEING_FIELDS.documentNo, 'Document No');
          sel.inventoryIds = await ids(DYEING_FIELDS.inventory, 'Inventory Code', 'item');
          sel.inventoryName = match(DYEING_FIELDS.inventoryName, 'Inventory Name');
          sel.process = match(DYEING_FIELDS.process, 'Process');
          sel.workOrderIds = await ids(DYEING_FIELDS.workOrders, 'Work Order No', 'workOrder');
          const data = await this.dyeing.build(sel);
          return {
            sections: dyeingSections(data, columns),
            applied: applied.join(' · ') || 'All subcontract receipts',
            document: { showTitle: true, companyAddress: null, showSectionTitles: false },
          };
        },
      },
      [PROCESS_FOLLOW_UP_SOURCE_KEY]: {
        fields: Object.values(PROCESS_FOLLOW_UP_FIELDS), noun: 'Work Orders', allowEmpty: true, options: [PROCESS_FOLLOW_UP_EMPTY_FIELD],
        build: async (values: DocumentFilterValues, _user: ReportUser, columns: ReportColumn[]) => {
          if (!this.processFollowUp) throw new BadRequestException('This document report is not available here');
          const svc = this.processFollowUp;
          const F = PROCESS_FOLLOW_UP_FIELDS;
          const sel: ProcessFollowUpSelection = {};
          const applied: string[] = [];
          const ids = async (field: string, label: string, table: 'account' | 'workOrder' | 'process') => {
            const v = values[field];
            if (!v) return undefined;
            const list = parseIdList(v.value);
            if (!list) throw new BadRequestException(`Choose valid values for "${label}"`);
            applied.push(`${label}: ${(await svc.names(table, list)).join(', ')}`);
            return list;
          };
          const match = (field: string, label: string) => {
            const v = values[field];
            if (!v) return undefined;
            const operator = (['equals', 'contains', 'startsWith'].includes(v.operator) ? v.operator : 'contains') as 'equals' | 'contains' | 'startsWith';
            applied.push(`${label} ${OPERATOR_LABEL[operator]} ${v.value}`);
            return { operator, value: v.value };
          };
          const from = values[F.dateFrom]?.value;
          const to = values[F.dateTo]?.value;
          if (from) { sel.dateFrom = from.slice(0, 10); applied.push(`Date From ${sel.dateFrom}`); }
          if (to) { sel.dateTo = to.slice(0, 10); applied.push(`Date To ${sel.dateTo}`); }
          sel.customerIds = await ids(F.customers, 'Customer', 'account');
          sel.workOrderIds = await ids(F.workOrders, 'Work Order No', 'workOrder');
          sel.orderNo = match(F.orderNo, 'Order No');
          sel.styleCode = match(F.styleCode, 'Style Code');
          sel.styleName = match(F.styleName, 'Style Name');
          sel.color = match(F.color, 'Color');
          sel.processIds = await ids(F.processes, 'Process', 'process');
          sel.factoryIds = await ids(F.factories, 'Factory', 'account');
          // Unanswered or "No" = as on the legacy report: only processes that have entries.
          const includeEmptyProcesses = values[PROCESS_FOLLOW_UP_EMPTY_FIELD]?.value === PROCESS_FOLLOW_UP_EMPTY_YES;
          const data = await svc.build(sel, { includeEmptyProcesses });
          if (includeEmptyProcesses) applied.push('Processes without entries shown');
          return {
            sections: processFollowUpSections(data, columns),
            applied: applied.join(' · ') || 'All Work Orders',
            // 20 columns, as on the legacy report: compact print so every one fits the page.
            document: { showTitle: true, companyAddress: null, showSectionTitles: false, compactTables: true },
          };
        },
      },
      // Yarn / Fabric / Trim cumulative requirement — one builder, the material from the source.
      ...Object.fromEntries((Object.keys(MATERIAL_REPORT_SOURCE_KEYS) as RequirementMaterial[]).map((material) => [MATERIAL_REPORT_SOURCE_KEYS[material], {
        fields: [YARN_REPORT_WORK_ORDERS_FIELD, YARN_REPORT_ORDER_NO_FIELD], noun: 'Work Orders', options: [BOM_FALLBACK_FIELD],
        build: async (values: DocumentFilterValues, _user: ReportUser, columns: ReportColumn[]) => {
          if (!this.yarnReport) throw new BadRequestException('This document report is not available here');
          const sel: YarnReportSelection = {};
          const ids = values[YARN_REPORT_WORK_ORDERS_FIELD];
          if (ids) {
            const list = parseIdList(ids.value);
            if (!list) throw new BadRequestException('Choose valid Work Orders');
            sel.workOrderIds = list;
          }
          const no = values[YARN_REPORT_ORDER_NO_FIELD];
          if (no) sel.workOrderNo = { operator: no.operator as 'startsWith' | 'contains' | 'equals', value: no.value };
          // BOM fallback only when explicitly chosen — unanswered or "No" never calculates.
          const calculateFromBom = values[BOM_FALLBACK_FIELD]?.value === BOM_FALLBACK_YES;
          const data = await this.yarnReport.build(sel, material, { calculateFromBom });
          const applied = [
            ...(ids ? [`Work Orders: ${data.workOrders.map((w) => w.header.workOrderNo).join(', ') || 'none found'}`] : []),
            ...(no ? [`Order No ${OPERATOR_LABEL[no.operator] ?? no.operator} ${no.value}`] : []),
            calculateFromBom ? 'Missing requirements calculated from BOM' : 'Saved requirements only',
          ];
          return {
            sections: yarnReportSections(data, columns),
            applied: applied.join(' · '),
            document: { showTitle: true, companyAddress: null },
          };
        },
      }])),
    };
  }

  /** A filter condition in the source's own query language (Prisma where-object or SQL). */
  private condition(source: ReportSource, field: ReportField, operator: string, value: string, value2: string): unknown {
    if (source.kind === 'document') throw new BadRequestException('Document reports have no query conditions'); // handled by executeDocument
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
    // A time limit per query, so an expensive report cannot tie up the database.
    const records = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${SQL_STATEMENT_TIMEOUT_MS}`);
      return tx.$queryRaw<Record<string, unknown>[]>(sqlQuery(source, fields, conditions, sorts, take));
    }, { timeout: SQL_STATEMENT_TIMEOUT_MS + 5000 }).catch((e: any) => {
      if (/statement timeout|canceling statement/i.test(String(e?.message))) {
        throw new BadRequestException('The report took too long to run. Add filters or remove some linked-table columns and try again.');
      }
      throw e;
    });
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
