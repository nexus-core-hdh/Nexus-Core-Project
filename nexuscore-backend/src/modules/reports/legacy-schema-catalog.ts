// Dynamic Legacy ERP report sources: every eligible legacy table, discovered from pg_catalog.
//
// Alongside the hand-written sources in legacy-report-sources.ts, any legacy table (IM_*, MA_*,
// FI_*, ...) can be a report's data source as `table:<TableName>`. Its columns, and the columns of
// the tables its foreign keys lead to, are read from the database catalog — never from the request.
//
// Field keys (stored in saved definitions) are paths over real FK constraints:
//   "InventoryCode"                                   a column of the base table
//   ">FK_IM_Item_IM_Warehouse/WarehouseName"          a column of a referenced (to-one) table
//   "<IM_ReceiptItem~FK_..._IM_Item/#sum:Quantity"    an aggregate over referencing (to-many) rows
// ">Con" follows constraint Con of the current table to the row it references (many-to-one, at
// most one row: every FK here references a primary key). "<Child~Con" goes the other way, to the
// rows of Child whose constraint Con references the current row: when Child's FK column is unique
// that is one row (one-to-one) and is joined like ">"; otherwise it is one-to-many and can only end
// a path in an aggregate (#count, #sum:Col, #min:Col, #max:Col), computed as a correlated subquery,
// so a base row always stays exactly one report row.
//
// Safety: every key is parsed and checked against the cached catalog; only identifiers found there
// (and matching a strict pattern) are ever quoted into SQL, and table aliases are generated here.
// Filter values still only reach SQL as bound parameters (report-sql.ts).
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ReportField, ReportFieldType, SqlReportSource } from './report-sources';

export const TABLE_SOURCE_PREFIX = 'table:';
export const isTableSource = (key: string) => typeof key === 'string' && key.startsWith(TABLE_SOURCE_PREFIX);

/** How long discovered metadata is reused before the catalog is read again (schema changes show up after this). */
const CACHE_MS = 5 * 60 * 1000;
/** Most to-one links followed from the base table (base → A → B → C). */
export const MAX_TO_ONE_HOPS = 3;
/** Most joined tables one report may use. */
export const MAX_JOINS = 15;

/** Legacy tables: two-letter module prefix, underscore, name. Prisma's own tables never match. */
const LEGACY_TABLE = /^[A-Z]{2}_[A-Za-z0-9]+$/;
const IDENTIFIER = /^[A-Za-z0-9_]+$/;
/**
 * Tables never offered: users / rights / licensing, system & integration settings and logs, and
 * HR (personal and payroll data has no Legacy ERP report permission of its own yet).
 */
const RESTRICTED_TABLES: RegExp[] = [
  /^MD_User/, /^WF_User/, /^LC_/, /^LG_/, /^AI_/, /^HR_/,
  /^MD_Parameter/, /^MD_(DBVersion|Location|MessageProvider|Script|WindowSetting|LanguageData|CustomReport|Report|DataConstraint|Preset)$/,
];
/** Columns never offered from any table (passwords, keys, tokens, hashes...). */
const SENSITIVE_COLUMN = /(pass(word)?|pwd|secret|token|hash|salt|api_?key|credential|private_?key|connection_?string)/i;
/** Columns that are bookkeeping, not data. */
const HIDDEN_COLUMNS = new Set(['IsDeleted']);

const MODULE_LABELS: Record<string, string> = {
  IM: 'Inventory', MA: 'Manufacturing', FI: 'Finance', MD: 'Master Data', SM: 'Sales & Contracts', CR: 'CRM',
  GL: 'General Ledger', WF: 'Workflow', RM: 'Reminders', GN: 'General', HR: 'Human Resources',
};
/** Friendlier names for the tables people know from the Legacy ERP screens. */
const TABLE_LABELS: Record<string, string> = {
  IM_Item: 'Inventory Card', IM_Receipt: 'Inventory Receipt', IM_ReceiptItem: 'Inventory Receipt Line',
  IM_OrderReceipt: 'Purchase / Subcontract Order', IM_OrderReceiptItem: 'Order Line', IM_SerialCard: 'Serial Card',
  MA_WorkOrderItem: 'Work Order Line', FI_Account: 'Current Account', FI_Receipt: 'Financial Receipt',
  FI_ReceiptItem: 'Financial Receipt Line', SM_ContractItem: 'Contract Line', MD_Forex: 'Currency', MD_UnitSetItem: 'Unit',
};
/** Menu sections for reports on a table, by module prefix (titles shared with the hand-written sources). */
const PREFIX_SECTIONS: Record<string, { title: string; icon: string }> = {
  IM: { title: 'Inventory Reports', icon: 'Boxes' },
  MA: { title: 'Production Reports', icon: 'Factory' },
  FI: { title: 'Finance Reports', icon: 'Landmark' },
  GL: { title: 'Finance Reports', icon: 'Landmark' },
  SM: { title: 'Sales & Contract Reports', icon: 'FileSignature' },
};
const OTHER_TABLE_SECTION = { title: 'Database Table Reports', icon: 'Database' };
export const TABLE_SECTION_TITLES = [...Object.values(PREFIX_SECTIONS).map((s) => s.title), OTHER_TABLE_SECTION.title];

export function tableSourceSection(sourceKey: string) {
  return PREFIX_SECTIONS[sourceKey.slice(TABLE_SOURCE_PREFIX.length, TABLE_SOURCE_PREFIX.length + 2)] ?? OTHER_TABLE_SECTION;
}

/** "InventoryCode" → "Inventory Code", "WarehouseId" → "Warehouse ID", "UD_Brands" → "UD Brands". */
export function humanize(name: string) {
  const words = name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\bRec Id\b/, 'Record ID')
    .replace(/\bId\b/g, 'ID')
    .trim();
  return words || name;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

interface CatalogColumn {
  name: string;
  type: ReportFieldType;
  /** How the value is read: plain, a 0/1 smallint flag, or cast to text (uuid). */
  read: 'plain' | 'flag' | 'text';
}
interface CatalogFk {
  name: string;
  child: string;
  childCol: string;
  parent: string;
  parentCol: string;
  /** The child's FK column is unique, so each parent row has at most one child row (one-to-one). */
  childUnique: boolean;
}
interface CatalogTable {
  name: string;
  label: string;
  module: string;
  pk: string;
  softDelete: boolean;
  columns: CatalogColumn[];
  columnByName: Map<string, CatalogColumn>;
  /** Column names that are this table's PK or an FK (not summed). */
  keyColumns: Set<string>;
  outgoing: CatalogFk[];
  incoming: CatalogFk[];
}
interface Catalog {
  tables: Map<string, CatalogTable>;
  loadedAt: number;
}

function columnKind(domain: string, base: string): Omit<CatalogColumn, 'name'> | null {
  if (/^UdtBool$/i.test(domain)) return { type: 'boolean', read: 'flag' };
  if (['int2', 'int4', 'int8', 'numeric', 'float4', 'float8'].includes(base)) return { type: 'number', read: 'plain' };
  if (base === 'bool') return { type: 'boolean', read: 'plain' };
  if (['timestamp', 'timestamptz', 'date'].includes(base)) return { type: 'date', read: 'plain' };
  if (['varchar', 'text', 'bpchar'].includes(base)) return { type: 'string', read: 'plain' };
  if (base === 'uuid') return { type: 'string', read: 'text' };
  return null; // bytea (images, binaries), json, arrays, ... are not reportable
}

// One catalog per process, shared by every service instance (seed scripts construct their own).
let cached: Catalog | null = null;
let loading: Promise<Catalog> | null = null;

async function loadCatalog(prisma: PrismaService): Promise<Catalog> {
  // Only base tables of the public schema the connected role may read; views are not included.
  const tableRows = await prisma.$queryRaw<{ name: string; pk: string }[]>(Prisma.sql`
    SELECT c.relname AS name, a.attname AS pk
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_constraint p ON p.conrelid = c.oid AND p.contype = 'p' AND array_length(p.conkey, 1) = 1
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = p.conkey[1]
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND has_table_privilege(c.oid, 'SELECT')`);
  const eligible = tableRows.filter((t) => LEGACY_TABLE.test(t.name) && IDENTIFIER.test(t.pk) && !RESTRICTED_TABLES.some((r) => r.test(t.name)));
  const names = new Set(eligible.map((t) => t.name));

  const columnRows = await prisma.$queryRaw<{ tbl: string; col: string; domain: string; base: string }[]>(Prisma.sql`
    SELECT c.relname AS tbl, a.attname AS col, t.typname AS domain, COALESCE(bt.typname, t.typname) AS base
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    LEFT JOIN pg_type bt ON bt.oid = t.typbasetype AND t.typtype = 'd'
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum`);
  const fkRows = await prisma.$queryRaw<{ name: string; child: string; childCol: string; parent: string; parentCol: string }[]>(Prisma.sql`
    SELECT k.conname AS name, c.relname AS child, ca.attname AS "childCol", r.relname AS parent, ra.attname AS "parentCol"
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_class r ON r.oid = k.confrelid
    JOIN pg_attribute ca ON ca.attrelid = c.oid AND ca.attnum = k.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid = r.oid AND ra.attnum = k.confkey[1]
    WHERE k.contype = 'f' AND array_length(k.conkey, 1) = 1`);
  const uniqueRows = await prisma.$queryRaw<{ tbl: string; col: string }[]>(Prisma.sql`
    SELECT c.relname AS tbl, a.attname AS col
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE i.indisunique AND i.indnatts = 1 AND i.indpred IS NULL`);
  const unique = new Set(uniqueRows.map((u) => `${u.tbl}.${u.col}`));

  const tables = new Map<string, CatalogTable>();
  for (const t of eligible) {
    const module = t.name.slice(0, 2);
    tables.set(t.name, {
      name: t.name,
      label: TABLE_LABELS[t.name] ?? humanize(t.name.slice(3)),
      module,
      pk: t.pk,
      softDelete: false,
      columns: [],
      columnByName: new Map(),
      keyColumns: new Set([t.pk]),
      outgoing: [],
      incoming: [],
    });
  }
  for (const r of columnRows) {
    const table = tables.get(r.tbl);
    if (!table || !IDENTIFIER.test(r.col)) continue;
    if (r.col === 'IsDeleted') table.softDelete = true;
    if (HIDDEN_COLUMNS.has(r.col) || SENSITIVE_COLUMN.test(r.col)) continue;
    const kind = columnKind(r.domain, r.base);
    if (!kind) continue;
    const column = { name: r.col, ...kind };
    table.columns.push(column);
    table.columnByName.set(r.col, column);
  }
  for (const f of fkRows) {
    // Both ends must be eligible tables and both columns plain identifiers; the parent column must
    // be the parent's primary key (guarantees a many-to-one link matches at most one row).
    const child = tables.get(f.child);
    const parent = tables.get(f.parent);
    if (!child || !parent || !names.has(f.child) || !IDENTIFIER.test(f.name) || !IDENTIFIER.test(f.childCol) || f.parentCol !== parent.pk) continue;
    const fk: CatalogFk = { ...f, childUnique: unique.has(`${f.child}.${f.childCol}`) || f.childCol === child.pk };
    child.outgoing.push(fk);
    child.keyColumns.add(f.childCol);
    parent.incoming.push(fk);
  }
  return { tables, loadedAt: Date.now() };
}

// ── Paths ────────────────────────────────────────────────────────────────────

type Hop = { fk: CatalogFk; dir: 'out' | 'in'; from: CatalogTable; to: CatalogTable; toOne: boolean };
type Terminal =
  | { kind: 'column'; column: CatalogColumn }
  | { kind: 'count' }
  | { kind: 'sum' | 'min' | 'max'; column: CatalogColumn };

const hopId = (h: Pick<Hop, 'fk' | 'dir'>) => (h.dir === 'out' ? `>${h.fk.name}` : `<${h.fk.child}~${h.fk.name}`);

/** Error thrown for a field key that does not match the current schema. */
class StaleField extends Error {}

export interface FieldGroupInfo {
  /** Path prefix of the group's fields ('' = the base table). */
  id: string;
  label: string;
  table: string;
  relation: 'base' | 'to-one' | 'to-many';
  depth: number;
  /** The FK link that leads here, e.g. "IM_Item.WarehouseId → IM_Warehouse.RecId". */
  via: string | null;
  fields: ReturnType<LegacySchemaCatalog['fieldInfo']>[];
  /** More fields (deeper tables, or the aggregates of a to-many group) can be loaded with this path. */
  expandable: boolean;
}

export class LegacySchemaCatalog {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(): Promise<Catalog> {
    if (cached && Date.now() - cached.loadedAt < CACHE_MS) return cached;
    loading ??= loadCatalog(this.prisma)
      .then((c) => (cached = c))
      .finally(() => (loading = null));
    return loading;
  }

  /** Every table offered as a data source, for the source picker. */
  async sources() {
    const { tables } = await this.catalog();
    return [...tables.values()]
      .sort((a, b) => a.module.localeCompare(b.module) || a.label.localeCompare(b.label))
      .map((t) => ({
        key: `${TABLE_SOURCE_PREFIX}${t.name}`,
        label: t.label,
        table: t.name,
        group: `${MODULE_LABELS[t.module] ?? t.module} (${t.module})`,
        description: `Database table ${t.name}: ${t.columns.length} columns, ${t.outgoing.length} linked tables it references, ${t.incoming.length} that reference it. One row per ${t.label.toLowerCase()} record${t.softDelete ? ' (deleted records excluded)' : ''}.`,
      }));
  }

  private async baseTable(sourceKey: string) {
    if (!isTableSource(sourceKey)) throw new BadRequestException('Not a database table source');
    const { tables } = await this.catalog();
    const table = tables.get(sourceKey.slice(TABLE_SOURCE_PREFIX.length));
    if (!table) throw new BadRequestException('This data source is not available (the table does not exist or is restricted)');
    return table;
  }

  /** Follows hops ('>Con' / '<Child~Con') from the base table; throws StaleField if any is unknown. */
  private walk(base: CatalogTable, parts: string[], tables: Map<string, CatalogTable>): Hop[] {
    const hops: Hop[] = [];
    let node = base;
    let toOneHops = 0;
    for (const [i, part] of parts.entries()) {
      if (hops.length && !hops[hops.length - 1].toOne) throw new StaleField(`cannot follow links beyond a one-to-many relationship`);
      let hop: Hop | undefined;
      if (part.startsWith('>')) {
        const fk = node.outgoing.find((f) => f.name === part.slice(1));
        if (fk) hop = { fk, dir: 'out', from: node, to: tables.get(fk.parent)!, toOne: true };
      } else if (part.startsWith('<')) {
        const [child, name] = part.slice(1).split('~');
        const fk = node.incoming.find((f) => f.child === child && f.name === name);
        if (fk) hop = { fk, dir: 'in', from: node, to: tables.get(fk.child)!, toOne: fk.childUnique };
      }
      if (!hop) throw new StaleField(`relationship "${part}" (step ${i + 1}) no longer exists`);
      if (hop.toOne && ++toOneHops > MAX_TO_ONE_HOPS) throw new StaleField(`is more than ${MAX_TO_ONE_HOPS} links away`);
      hops.push(hop);
      node = hop.to;
    }
    return hops;
  }

  /** A field key's hops and final column / aggregate; throws StaleField if it does not match the schema. */
  private parse(base: CatalogTable, key: string, tables: Map<string, CatalogTable>): { hops: Hop[]; terminal: Terminal } {
    const parts = String(key).split('/');
    const last = parts.pop()!;
    const hops = this.walk(base, parts, tables);
    const node = hops.length ? hops[hops.length - 1].to : base;
    const toMany = hops.length > 0 && !hops[hops.length - 1].toOne;
    let terminal: Terminal | undefined;
    if (last === '#count') terminal = { kind: 'count' };
    else {
      const m = /^#(sum|min|max):(.+)$/.exec(last);
      const column = node.columnByName.get(m ? m[2] : last);
      if (column && m) {
        const kind = m[1] as 'sum' | 'min' | 'max';
        const ok = kind === 'sum' ? column.type === 'number' && column.read === 'plain' && !node.keyColumns.has(column.name) : column.type === 'date';
        if (ok) terminal = { kind, column };
      } else if (column) terminal = { kind: 'column', column };
    }
    if (!terminal) throw new StaleField(`column "${last}" no longer exists in ${node.name} or is not available`);
    if (toMany !== (terminal.kind !== 'column')) {
      throw new StaleField(toMany ? 'needs a count or total over the related rows' : 'totals need a one-to-many relationship');
    }
    return { hops, terminal };
  }

  private hopLabel(h: Hop) {
    const siblings = h.dir === 'out'
      ? h.from.outgoing.filter((f) => f.parent === h.fk.parent).length
      : h.from.incoming.filter((f) => f.child === h.fk.child).length;
    const label = h.to.label;
    const via = humanize(h.fk.childCol).replace(/ ID$/, '');
    // Several links between the same two tables (In / Out warehouse, ...): name the FK column.
    return siblings > 1 || (h.dir === 'out' && via !== label) ? `${label} (${humanize(h.fk.childCol)})` : label;
  }

  private groupLabel(base: CatalogTable, hops: Hop[]) {
    return [base.label, ...hops.map((h) => this.hopLabel(h) + (h.toOne ? '' : ' — rows'))].join(' › ');
  }

  private via(h: Hop) {
    return `${h.fk.child}.${h.fk.childCol} → ${h.fk.parent}.${h.fk.parentCol}${h.dir === 'in' ? (h.toOne ? ' (one-to-one)' : ' (one-to-many)') : ''}`;
  }

  private terminalLabel(t: Terminal) {
    if (t.kind === 'column') return humanize(t.column.name);
    if (t.kind === 'count') return 'Number of Rows';
    return `${t.kind === 'sum' ? 'Total' : t.kind === 'min' ? 'Earliest' : 'Latest'} ${humanize(t.column.name)}`;
  }

  private terminalType(t: Terminal): ReportFieldType {
    return t.kind === 'column' ? t.column.type : t.kind === 'count' || t.kind === 'sum' ? 'number' : 'date';
  }

  fieldInfo(base: CatalogTable, prefix: string, hops: Hop[], t: Terminal) {
    const last = t.kind === 'column' ? t.column.name : t.kind === 'count' ? '#count' : `#${t.kind}:${t.column.name}`;
    const node = hops.length ? hops[hops.length - 1].to : base;
    return {
      key: prefix ? `${prefix}/${last}` : last,
      label: this.terminalLabel(t),
      group: this.groupLabel(base, hops),
      type: this.terminalType(t),
      filterable: true,
      sortable: true,
      table: node.name,
      column: t.kind === 'count' ? null : t.column.name,
      relation: (hops.length === 0 ? 'base' : hops[hops.length - 1].toOne ? 'to-one' : 'to-many') as FieldGroupInfo['relation'],
    };
  }

  private columnsGroup(base: CatalogTable, hops: Hop[]): FieldGroupInfo {
    const node = hops.length ? hops[hops.length - 1].to : base;
    const prefix = hops.map(hopId).join('/');
    const toOneDepth = hops.filter((h) => h.toOne).length;
    return {
      id: prefix,
      label: this.groupLabel(base, hops),
      table: node.name,
      relation: hops.length ? 'to-one' : 'base',
      depth: hops.length,
      via: hops.length ? this.via(hops[hops.length - 1]) : null,
      fields: node.columns.map((column) => this.fieldInfo(base, prefix, hops, { kind: 'column', column })),
      expandable: hops.length > 0 && toOneDepth < MAX_TO_ONE_HOPS,
    };
  }

  /** A to-many group: the row count always; with `full`, totals of its numbers and date ranges too. */
  private aggregateGroup(base: CatalogTable, hops: Hop[], full: boolean): FieldGroupInfo {
    const node = hops[hops.length - 1].to;
    const prefix = hops.map(hopId).join('/');
    const terminals: Terminal[] = [{ kind: 'count' }];
    if (full) {
      for (const column of node.columns) {
        if (column.type === 'number' && column.read === 'plain' && !node.keyColumns.has(column.name)) terminals.push({ kind: 'sum', column });
        if (column.type === 'date') terminals.push({ kind: 'min', column }, { kind: 'max', column });
      }
    }
    return {
      id: prefix,
      label: this.groupLabel(base, hops),
      table: node.name,
      relation: 'to-many',
      depth: hops.length,
      via: this.via(hops[hops.length - 1]),
      fields: terminals.map((t) => this.fieldInfo(base, prefix, hops, t)),
      expandable: !full,
    };
  }

  /** Groups for the links leaving a to-one node: its referenced tables and the tables referencing it. */
  private relationGroups(base: CatalogTable, hops: Hop[], tables: Map<string, CatalogTable>): FieldGroupInfo[] {
    const node = hops.length ? hops[hops.length - 1].to : base;
    const back = hops.length ? hops[hops.length - 1] : null;
    const groups: FieldGroupInfo[] = [];
    if (hops.filter((h) => h.toOne).length >= MAX_TO_ONE_HOPS) return groups;
    // Never offer the link straight back to where we came from (a cycle that adds nothing).
    const isBack = (fk: CatalogFk) => back?.fk === fk;
    for (const fk of node.outgoing) {
      if (isBack(fk)) continue;
      groups.push(this.columnsGroup(base, [...hops, { fk, dir: 'out', from: node, to: tables.get(fk.parent)!, toOne: true }]));
    }
    for (const fk of node.incoming) {
      if (isBack(fk)) continue;
      const hop: Hop = { fk, dir: 'in', from: node, to: tables.get(fk.child)!, toOne: fk.childUnique };
      groups.push(hop.toOne ? this.columnsGroup(base, [...hops, hop]) : this.aggregateGroup(base, [...hops, hop], false));
    }
    return groups;
  }

  /**
   * Field groups of a table source. `path` '' gives the base table, every directly linked table
   * and the row counts of the tables referencing it; the path of a to-one group gives the groups
   * one link further; the path of a to-many group gives its full set of totals.
   */
  async describe(sourceKey: string, path = ''): Promise<{ groups: FieldGroupInfo[] }> {
    const base = await this.baseTable(sourceKey);
    const { tables } = await this.catalog();
    if (!path) return { groups: [this.columnsGroup(base, []), ...this.relationGroups(base, [], tables)] };
    let hops: Hop[];
    try {
      hops = this.walk(base, String(path).split('/'), tables);
    } catch (e) {
      throw new BadRequestException(`Those related fields are not available: ${(e as Error).message}`);
    }
    const last = hops[hops.length - 1];
    return { groups: last.toOne ? this.relationGroups(base, hops, tables) : [this.aggregateGroup(base, hops, true)] };
  }

  /** Metadata of specific field keys (columns of a saved report), plus the keys that no longer resolve. */
  async resolveFields(sourceKey: string, keys: string[]) {
    const base = await this.baseTable(sourceKey);
    const { tables } = await this.catalog();
    const fields: ReturnType<LegacySchemaCatalog['fieldInfo']>[] = [];
    const missing: { key: string; reason: string }[] = [];
    for (const key of new Set(keys.map(String))) {
      try {
        const { hops, terminal } = this.parse(base, key, tables);
        fields.push(this.fieldInfo(base, hops.map(hopId).join('/'), hops, terminal));
      } catch (e) {
        missing.push({ key, reason: (e as Error).message });
      }
    }
    return { fields, missing };
  }

  /**
   * A query-ready SQL source for a table and the field keys a report uses: only the joins those
   * fields need, in the same shape as the hand-written sources, so report-sql.ts runs it unchanged.
   * Throws a readable error naming any field that no longer matches the schema.
   */
  async buildSource(sourceKey: string, keys: string[]): Promise<SqlReportSource> {
    const base = await this.baseTable(sourceKey);
    const { tables } = await this.catalog();
    const q = (id: string) => {
      if (!IDENTIFIER.test(id)) throw new BadRequestException('Invalid identifier'); // catalog names only; belt and braces
      return `"${id}"`;
    };
    const aliases = new Map<string, string>([['', 't0']]);
    const joins: string[] = [];
    const aliasFor = (hops: Hop[]): string => {
      const prefix = hops.map(hopId).join('/');
      const existing = aliases.get(prefix);
      if (existing) return existing;
      const parent = aliasFor(hops.slice(0, -1));
      const h = hops[hops.length - 1];
      const alias = `t${aliases.size}`;
      if (aliases.size > MAX_JOINS) throw new BadRequestException(`A report can use at most ${MAX_JOINS} linked tables`);
      aliases.set(prefix, alias);
      // Lookups are LEFT JOINs: a missing (optional) link gives empty values, never drops the row.
      joins.push(h.dir === 'out'
        ? `LEFT JOIN ${q(h.to.name)} ${alias} ON ${alias}.${q(h.fk.parentCol)} = ${parent}.${q(h.fk.childCol)}`
        : `LEFT JOIN ${q(h.to.name)} ${alias} ON ${alias}.${q(h.fk.childCol)} = ${parent}.${q(h.fk.parentCol)}${h.to.softDelete ? ` AND ${alias}."IsDeleted" = 0` : ''}`);
      return alias;
    };

    const fields: ReportField[] = [];
    const stale: string[] = [];
    const wanted = [...new Set([...keys.map(String), base.pk])];
    for (const key of wanted) {
      let parsed: ReturnType<LegacySchemaCatalog['parse']>;
      try {
        parsed = this.parse(base, key, tables);
      } catch (e) {
        stale.push(`"${key}" — ${(e as Error).message}`);
        continue;
      }
      const { hops, terminal } = parsed;
      const info = this.fieldInfo(base, hops.map(hopId).join('/'), hops, terminal);
      let sql: string;
      if (terminal.kind === 'column') {
        const e = `${aliasFor(hops)}.${q(terminal.column.name)}`;
        sql = terminal.column.read === 'flag' ? `(${e} = 1)` : terminal.column.read === 'text' ? `${e}::text` : e;
      } else {
        // To-many: a correlated subquery per row, so the base row is never multiplied.
        const h = hops[hops.length - 1];
        const outer = aliasFor(hops.slice(0, -1));
        const where = `x.${q(h.fk.childCol)} = ${outer}.${q(h.fk.parentCol)}${h.to.softDelete ? ` AND x."IsDeleted" = 0` : ''}`;
        const from = `FROM ${q(h.to.name)} x WHERE ${where}`;
        sql = terminal.kind === 'count'
          ? `(SELECT count(*) ${from})`
          : terminal.kind === 'sum'
            ? `(SELECT COALESCE(sum(x.${q(terminal.column.name)}), 0) ${from})`
            : `(SELECT ${terminal.kind}(x.${q(terminal.column.name)}) ${from})`;
      }
      fields.push({ key: info.key, label: info.label, group: info.group, type: info.type, sql });
    }
    if (stale.length) {
      throw new BadRequestException(`This report refers to fields that are no longer available in ${base.name}: ${stale.join('; ')}. Edit the report and remove or replace them.`);
    }

    return {
      kind: 'sql',
      key: sourceKey,
      module: 'legacy-erp',
      label: base.label,
      description: `Database table ${base.name}`,
      from: [`${q(base.name)} t0`, ...joins].join('\n    '),
      where: base.softDelete ? `t0."IsDeleted" = 0` : 'TRUE',
      defaultSort: { field: base.pk, direction: 'desc' },
      menuSection: tableSourceSection(sourceKey),
      fields,
    };
  }

  /** The FK links a set of fields uses, for showing a report's relationship paths. */
  async joinPaths(sourceKey: string, keys: string[]) {
    const base = await this.baseTable(sourceKey);
    const { tables } = await this.catalog();
    const paths = new Map<string, string>();
    for (const key of keys) {
      try {
        const { hops } = this.parse(base, key, tables);
        if (hops.length) paths.set(hops.map(hopId).join('/'), [base.name, ...hops.map((h) => `${this.via(h)}`)].join('  ⟶  '));
      } catch {
        /* reported by validation */
      }
    }
    return [...paths.values()];
  }
}
