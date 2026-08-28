import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { TABLES, type UnifiedGridConfig } from './unified-grid.service';
import { WorklistFieldsService, type WorklistSourceKey } from './worklist-fields.service';
import { RECEIPT_TYPES } from './receipt-types.config';

// The 17 "other" receipt types (Receipt Screen Replication) — same RECEIPT_TYPES source of
// truth already used by receipt-type.controller.ts, not a second hardcoded list. Purchase
// Receipt itself (receiptType=2) is excluded here since 'purchase-receipt'/'inventory-receipt'
// already resolve via the unified-grid TABLES branch below.
const RECEIPT_TYPE_KEYS = RECEIPT_TYPES.filter((t) => t.receiptType !== 2).map((t) => t.key);

// One entry per per-entity list screen rolled out under "Customize Worklist" (Yarn Cards List,
// Fabric Cards List, etc.) — deliberately a SEPARATE map from unified-grid.service.ts's own
// TABLES, never merged into it: TABLES doubles as Receipt & Master Data's/Financial Receipt &
// Master Data's own dropdown option list, so adding entries there would leak new choices into
// those screens' dropdowns. Each page.tsx passes its own one of these keys as `primaryTable` —
// see worklist-fields.service.ts's ALLOWED_SOURCES_BY_PRIMARY, keyed by these same strings.
// 'inventory-card-list' (the synthetic UNION ALL screen) is deliberately absent — that screen's
// custom worklists are resolved client-side from its existing list() rows instead (see
// inventory-card.service.ts's own comment), so it never reaches resolvePrimaryConfig().
const LIST_SCREEN_TABLES: Record<string, UnifiedGridConfig> = {
  'yarn-card-list': {
    table: 'IM_Item', label: 'Yarn Cards List', extraWhere: Prisma.sql`AND "AccessCode" = 'YARN'`,
    searchColumns: ['InventoryCode', 'InventoryName'], orderBy: 'InventoryCode', orderDir: 'ASC',
  },
  'fabric-card-list': {
    table: 'IM_Item', label: 'Fabric Cards List', extraWhere: Prisma.sql`AND "AccessCode" = 'FABRIC'`,
    searchColumns: ['InventoryCode', 'InventoryName'], orderBy: 'InventoryCode', orderDir: 'ASC',
  },
  'trim-inventory-card-list': {
    table: 'IM_Item', label: 'Trim Inventory Cards List', extraWhere: Prisma.sql`AND "AccessCode" = 'TRIM'`,
    searchColumns: ['InventoryCode', 'InventoryName'], orderBy: 'InventoryCode', orderDir: 'ASC',
  },
  'current-account-list': {
    table: 'FI_Account', label: 'Current Accounts List',
    searchColumns: ['CurrentAccountCode', 'CurrentAccountName'], orderBy: 'CurrentAccountCode', orderDir: 'ASC',
  },
  'warehouse-list': {
    table: 'IM_Warehouse', label: 'Warehouse List',
    searchColumns: ['WarehouseCode', 'WarehouseName'], orderBy: 'WarehouseCode', orderDir: 'ASC',
  },
  // Inventory Receipts List is deliberately absent here — that screen is parameterized by
  // receiptType (Receipt Screen Replication, same 17-type IM_Receipt spine Receipt & Master
  // Data itself browses) and just reuses the SAME keys already resolved above/via RECEIPT_TYPES
  // (e.g. 'purchase-receipt', 'warehouse-transfer-receipt', ...) as its `primaryTable` — no new
  // entry needed, and adding one here would only create a second, unused way to name the exact
  // same rows.
  'trim-card-list': {
    table: 'MA_YarnTrimCard', label: 'Trim Cards List',
    searchColumns: ['Code', 'Explanation'], orderBy: 'Code', orderDir: 'ASC',
  },
  'purchase-order-list': {
    table: 'IM_OrderReceipt', label: 'Purchase Orders List', extraWhere: Prisma.sql`AND "ReceiptType" = 1`,
    searchColumns: ['ReceiptNo', 'DocumentNo'], orderBy: 'ReceiptNo', orderDir: 'DESC',
  },
  // Order Screen Replication's second entry — same IM_OrderReceipt table as Purchase Order
  // immediately above, just filtered to ReceiptType=3 (see order-types.config.ts).
  'subcontract-order-list': {
    table: 'IM_OrderReceipt', label: 'Subcontract Orders List', extraWhere: Prisma.sql`AND "ReceiptType" = 3`,
    searchColumns: ['ReceiptNo', 'DocumentNo'], orderBy: 'ReceiptNo', orderDir: 'DESC',
  },
  'size-set-list': {
    table: 'MA_SizeSet', label: 'Sizes List',
    searchColumns: ['Code', 'Name'], orderBy: 'Code', orderDir: 'ASC',
  },
  'unit-set-list': {
    table: 'MD_UnitSet', label: 'Unit Sets List',
    searchColumns: ['SetCode', 'SetName'], orderBy: 'SetCode', orderDir: 'ASC',
  },
  'purchase-contract-list': {
    table: 'SM_Contract', label: 'Purchase Contracts List', extraWhere: Prisma.sql`AND "ReceiptType" = 1`,
    searchColumns: ['ReceiptNo', 'DocumentNo'], orderBy: 'ReceiptNo', orderDir: 'DESC',
  },
  'sale-contract-list': {
    table: 'SM_Contract', label: 'Sale Contracts List', extraWhere: Prisma.sql`AND "ReceiptType" = 2`,
    searchColumns: ['ReceiptNo', 'DocumentNo'], orderBy: 'ReceiptNo', orderDir: 'DESC',
  },
};

// Builds the same shape as unified-grid.service.ts's own 'purchase-receipt'/'inventory-receipt'
// TABLES entries (IM_Receipt, filtered by ReceiptType, same search/order columns) — just
// data-driven by the specific receiptType instead of the hardcoded literal 1. This is what lets
// every one of the 16 other receipt types reuse the exact same base-query shape Purchase
// Receipt's own worklist resolution already used, with zero duplicated query logic.
function resolvePrimaryConfig(primaryTable: string): UnifiedGridConfig | undefined {
  const unified = TABLES[primaryTable];
  if (unified) return unified;
  const rt = RECEIPT_TYPES.find((t) => t.key === primaryTable && t.receiptType !== 2);
  if (rt) {
    return {
      table: 'IM_Receipt',
      label: rt.label,
      // Qualified with `r.` — unqualified "ReceiptType" was safe only as long as no relationship
      // ever joined another table that also has a "ReceiptType" column. Adding Script
      // (RELATIONSHIPS['purchase-receipt'].script, joining IM_OrderReceipt, which does have one)
      // made the unqualified form genuinely ambiguous the moment a worklist requests a Script
      // field — Postgres error 42702. `r` is this function's own FROM-clause alias (see resolve()
      // below: `FROM ${table} r`), not a guess.
      extraWhere: Prisma.sql`AND r."ReceiptType" = ${rt.receiptType}`,
      searchColumns: ['ReceiptNo', 'DocumentNo'],
      orderBy: 'ReceiptNo',
      orderDir: 'DESC',
    };
  }
  return LIST_SCREEN_TABLES[primaryTable];
}

interface RequestedField {
  source: WorklistSourceKey;
  key: string;
}

// 'purchase-receipt' as a JOINED/related target (never as a receipt-type PRIMARY's own self-
// source — see PRIMARY_SELF_SOURCE below, which bypasses this table entirely and is already
// correctly scoped by the primary's own base-query ReceiptType filter) has exactly two
// structurally possible meanings, made explicit here instead of an implicit "no filter":
//   'any'   — a generic receipt reference (e.g. Current Account -> Purchase Receipt field):
//             no single active ReceiptType exists for a non-receipt primary (a Current Account
//             can legitimately be referenced by receipts of ANY type), so this deliberately
//             aggregates across every ReceiptType rather than silently defaulting to 1.
//   number  — a specific configured ReceiptType. Not reachable today: no worklist field (see
//             WorklistField in worklist-types.ts / the frontend Design UI) carries a per-field
//             receipt-type selector, and adding one is a UI change explicitly out of scope here.
//             resolveTargetFilter() below still branches on it so the one real behavioral rule
//             ("never arbitrarily default to ReceiptType=1") is enforced by a typed decision,
//             not by the mere absence of a value.
type ReceiptScope = 'any' | number;
const SOURCE_TABLE: Record<WorklistSourceKey, { table: string; filter?: Prisma.Sql; receiptScope?: ReceiptScope }> = {
  'purchase-receipt': { table: 'IM_Receipt', receiptScope: 'any' },
  // Related Receipt Import's line-level source (see worklist-fields.service.ts). Only ever
  // resolved client-side against that dialog's own already-loaded rows today — this entry exists
  // purely to satisfy this Record's completeness, same "ready if a relationship is added later"
  // reasoning as trim-card/contract/etc. below: no RELATIONSHIPS entry references it, so a
  // Receipt & Master Data worklist that picks one of its fields renders it blank (same documented
  // rule as any other unrelated (primary, source) pair) rather than resolving incorrectly.
  'purchase-receipt-item': { table: 'IM_ReceiptItem' },
  'yarn-card': { table: 'IM_Item', filter: Prisma.sql`"AccessCode" = 'YARN'` },
  'fabric-card': { table: 'IM_Item', filter: Prisma.sql`"AccessCode" = 'FABRIC'` },
  'current-account': { table: 'FI_Account' },
  warehouse: { table: 'IM_Warehouse' },
  // Financial Receipt & Master Data screen's own self-source — no RELATIONSHIPS entries below
  // (its only FKs — FactoringCompanyId->FI_Account, CashId->FI_Cash, CostCenterId->FI_CostCenter
  // — don't match any of the other 5 sources' semantics, so cross-source joins are deliberately
  // left unresolved here rather than inventing an incorrect relationship).
  'financial-receipt': { table: 'FI_Receipt' },
  // The 7 per-entity list screen sources — each is only ever reached as its own primary's self-
  // source today (see PRIMARY_SELF_SOURCE), never as a JOINED target (no RELATIONSHIPS entry
  // references them), so these entries exist purely to satisfy this Record's completeness and
  // are ready if a cross-source relationship is added for one of these screens later.
  'trim-card': { table: 'MA_YarnTrimCard' },
  'trim-inventory-card': { table: 'IM_Item', filter: Prisma.sql`"AccessCode" = 'TRIM'` },
  'purchase-order': { table: 'IM_OrderReceipt', filter: Prisma.sql`"ReceiptType" = 1` },
  contract: { table: 'SM_Contract' },
  'size-set': { table: 'MA_SizeSet' },
  'unit-set': { table: 'MD_UnitSet' },
  'inventory-card': { table: 'IM_Item' },
  // Joined-only targets for Subcontract Type/Receipt — see RELATIONSHIPS['purchase-receipt']
  // below. No filter/receiptScope needed: MD_SubcontractType/MD_SubcontractReceipt aren't
  // receipt-scoped tables, just plain masters (same shape as current-account/warehouse above).
  'subcontract-type': { table: 'MD_SubcontractType' },
  'subcontract-receipt': { table: 'MD_SubcontractReceipt' },
  // Script — joined-only target, the parent Subcontract Order this receipt's ScriptId points at.
  // Same table/filter shape as 'purchase-order' above, just ReceiptType=3 instead of 1.
  script: { table: 'IM_OrderReceipt', filter: Prisma.sql`"ReceiptType" = 3` },
};

// The single, explicit decision point for how a JOINED target's ReceiptType is scoped — the
// direct answer to "make the receipt type behavior explicit and deterministic" without
// reintroducing the old arbitrary `= 1` default. Only takes the target source (not
// primarySource/activeReceiptType/fieldConfig) because those are provably irrelevant here: by
// the time resolve() ever reaches SOURCE_TABLE for a given field, PRIMARY_SELF_SOURCE has
// already proven the field is NOT the primary's own receipt-type context (that case never
// calls this), so there is no "active receipt type" left to consult — see the ReceiptScope
// comment above for why 'any' is the only real case right now.
function resolveTargetFilter(source: WorklistSourceKey): Prisma.Sql | undefined {
  const target = SOURCE_TABLE[source];
  if (source !== 'purchase-receipt') return target.filter; // yarn/fabric AccessCode filters, current-account/warehouse (none) — unaffected
  const scope = target.receiptScope;
  if (scope === undefined || scope === 'any') return undefined; // generic — every ReceiptType
  return Prisma.sql`"ReceiptType" = ${scope}`; // a specific configured ReceiptType, if one is ever supplied
}

// A primary dropdown table (table-config.ts's TableKey) whose OWN raw columns already ARE one
// of the 5 worklist sources — a worklist field with this source needs no join, it's already in
// the base row. Address/City/State/Country are primaries but not worklist sources.
const PRIMARY_SELF_SOURCE: Partial<Record<string, WorklistSourceKey>> = {
  'purchase-receipt': 'purchase-receipt',
  'inventory-receipt': 'purchase-receipt',
  'current-account': 'current-account',
  warehouse: 'warehouse',
  'financial-receipt': 'financial-receipt',
  // The 17 other receipt types share IM_Receipt/HEADER_COLUMNS byte-for-byte with Purchase
  // Receipt (see receipt-types.config.ts) — a worklist field with source 'purchase-receipt'
  // (e.g. "Receipt No") genuinely exists on their own row too, so no join is needed for it
  // either, exactly like Purchase Receipt itself.
  ...Object.fromEntries(RECEIPT_TYPE_KEYS.map((k) => [k, 'purchase-receipt' as WorklistSourceKey])),
  // The per-entity list screens' own LIST_SCREEN_TABLES primaries — each one's fields are
  // already on its own base row (r.*), same self-source reasoning as the entries above. No
  // cross-source joins for these screens in this rollout (RELATIONSHIPS is left untouched for
  // them); a worklist field from a different source simply renders blank, same documented rule
  // as any other (primary, source) pair with no RELATIONSHIPS entry.
  'yarn-card-list': 'yarn-card',
  'fabric-card-list': 'fabric-card',
  'trim-inventory-card-list': 'trim-inventory-card',
  'current-account-list': 'current-account',
  'warehouse-list': 'warehouse',
  'trim-card-list': 'trim-card',
  'purchase-order-list': 'purchase-order',
  // Same self-source reasoning — 'purchase-order' fields (identical HEADER_COLUMNS, same
  // IM_OrderReceipt table) already exist on Subcontract Order's own row too.
  'subcontract-order-list': 'purchase-order',
  'size-set-list': 'size-set',
  'unit-set-list': 'unit-set',
  'purchase-contract-list': 'contract',
  'sale-contract-list': 'contract',
};

type Strategy =
  | { kind: 'forward'; fkColumn: string }
  | { kind: 'reverse'; childFkColumn: string }
  | { kind: 'reverse-bridge'; bridgeTable: string; bridgeFkToPrimary: string; bridgeFkToTarget: string };

// Every entry below is a REAL foreign-key relationship, verified directly against Postgres
// (information_schema.table_constraints) before this file was written — see the accompanying
// conversation for the full FK dump. Multiplicity note: 'reverse' and 'reverse-bridge' are
// one(primary)-to-many(target) — e.g. one Purchase Receipt can have several line items, each
// possibly a different Yarn/Fabric card — so those are resolved as a DISTINCT, comma-separated
// aggregate per requested column (string_agg), never "pick the first row". This is a deliberate,
// approved choice: it surfaces every real related value instead of silently dropping data, at
// the cost that multiple aggregated columns from the same source are NOT positionally
// correlated row-by-row (e.g. Yarn Codes "Y1, Y2" and Yarn Names "Cotton" don't necessarily
// pair up 1:1 if two lines share a name) — each column is independently DISTINCT-aggregated.
//
// A (primary, source) pair with NO entry here has no existing single-hop relationship in this
// schema and is deliberately left unresolved (its worklist columns render blank) rather than
// inventing one. Confirmed absent: Yarn/Fabric Card from Address/City/State/Country primaries;
// any of the 5 sources from City/State/Country except Warehouse (MD_City/MD_State/MD_Country
// have no direct link to FI_Account/IM_Receipt/IM_Item — only to IM_Warehouse).
const RELATIONSHIPS: Partial<Record<string, Partial<Record<WorklistSourceKey, Strategy>>>> = {
  'purchase-receipt': {
    'current-account': { kind: 'forward', fkColumn: 'CurrentAccountId' },
    warehouse: { kind: 'forward', fkColumn: 'InWarehouseId' },
    'yarn-card': { kind: 'reverse-bridge', bridgeTable: 'IM_ReceiptItem', bridgeFkToPrimary: 'InventoryReceiptId', bridgeFkToTarget: 'InventoryId' },
    'fabric-card': { kind: 'reverse-bridge', bridgeTable: 'IM_ReceiptItem', bridgeFkToPrimary: 'InventoryReceiptId', bridgeFkToTarget: 'InventoryId' },
    // Real FK columns confirmed live on IM_Receipt (see inventory-receipt.service.ts's own
    // HEADER_COLUMNS comment) — one row can reference at most one Subcontract Type and one
    // Subcontract Receipt, so a plain forward join (not reverse/aggregated) is correct, same
    // shape as current-account/warehouse above. Propagates to every other receipt type below via
    // the existing `RELATIONSHIPS[k] = RELATIONSHIPS['purchase-receipt']` reuse loop — the two
    // columns are only ever non-null for the 4 Outside Process types in practice, but the join
    // itself is harmless (resolves to NULL) for every other type, exactly like every other
    // relationship here.
    'subcontract-type': { kind: 'forward', fkColumn: 'SubcontractTypeId' },
    'subcontract-receipt': { kind: 'forward', fkColumn: 'SubcontractReceiptId' },
    // Script — same real, single-valued FK shape as the two above (ScriptId), just targeting
    // IM_OrderReceipt (ReceiptType=3) instead of a simple master table.
    script: { kind: 'forward', fkColumn: 'ScriptId' },
  },
  'current-account': {
    warehouse: { kind: 'forward', fkColumn: 'WarehouseId' },
    'purchase-receipt': { kind: 'reverse', childFkColumn: 'CurrentAccountId' },
    'yarn-card': { kind: 'reverse', childFkColumn: 'CurrentAccountId' },
    'fabric-card': { kind: 'reverse', childFkColumn: 'CurrentAccountId' },
  },
  warehouse: {
    'current-account': { kind: 'reverse', childFkColumn: 'WarehouseId' },
    'purchase-receipt': { kind: 'reverse', childFkColumn: 'InWarehouseId' },
    'yarn-card': { kind: 'reverse', childFkColumn: 'WarehouseId' },
    'fabric-card': { kind: 'reverse', childFkColumn: 'WarehouseId' },
  },
  address: {
    'current-account': { kind: 'forward', fkColumn: 'CurrentAccountId' },
    warehouse: { kind: 'forward', fkColumn: 'WarehouseId' },
    'purchase-receipt': { kind: 'reverse', childFkColumn: 'AddressId' },
  },
  city: { warehouse: { kind: 'reverse', childFkColumn: 'CityId' } },
  state: { warehouse: { kind: 'reverse', childFkColumn: 'StateId' } },
  country: { warehouse: { kind: 'reverse', childFkColumn: 'CountryId' } },
};
RELATIONSHIPS['inventory-receipt'] = RELATIONSHIPS['purchase-receipt'];
// Same physical table/relationships for all 16 other receipt types — reuse the identical
// relationship map object (not a copy) rather than duplicating it per type. The bridge to
// Yarn/Fabric via IM_ReceiptItem is already scoped by the active row's own RecId (see resolve()
// below), so this can never pull in another receipt type's line items.
for (const k of RECEIPT_TYPE_KEYS) RELATIONSHIPS[k] = RELATIONSHIPS['purchase-receipt'];

const fieldAlias = (source: string, key: string) => `${source}:${key}`;
const id = (name: string) => Prisma.raw(`"${name}"`);

@Injectable()
export class WorklistRowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fieldsSvc: WorklistFieldsService,
  ) {}

  // Server-side relational resolution: one query, joining/aggregating only the sources the
  // active worklist actually references (never N+1, never every relation unconditionally — see
  // RELATIONSHIPS comment above and worklist-fields.service.ts for the field whitelist).
  async resolve(primaryTable: string, rawFields: RequestedField[], search?: string) {
    const cfg = resolvePrimaryConfig(primaryTable);
    if (!cfg) throw new BadRequestException(`Unknown Receipt & Master Data source "${primaryTable}"`);

    // Fields come from a user-editable, persisted JSON worklist config — never trust them as
    // safe SQL identifiers. Only keys that are genuinely part of a known source's metadata (see
    // worklist-fields.service.ts, itself derived from each owning service's own column list)
    // are allowed through to raw-SQL interpolation below.
    const validKeys = new Map<WorklistSourceKey, Set<string>>();
    for (const sf of this.fieldsSvc.list()) validKeys.set(sf.source, new Set(sf.fields));
    const fields = (rawFields ?? []).filter((f) => f?.source && f?.key && validKeys.get(f.source)?.has(f.key));

    const selfSource = PRIMARY_SELF_SOURCE[primaryTable];
    const bySource = new Map<WorklistSourceKey, string[]>();
    for (const f of fields) {
      if (f.source === selfSource) continue; // covered by r.* + the duplicate alias below
      if (!bySource.has(f.source)) bySource.set(f.source, []);
      bySource.get(f.source)!.push(f.key);
    }

    const selectParts: Prisma.Sql[] = [Prisma.sql`r.*`];
    for (const f of fields) {
      if (f.source === selfSource) {
        selectParts.push(Prisma.sql`r.${id(f.key)} as ${id(fieldAlias(f.source, f.key))}`);
      }
    }

    const joinParts: Prisma.Sql[] = [];
    let joinIndex = 0;
    for (const [source, keys] of bySource) {
      const strategy = RELATIONSHIPS[primaryTable]?.[source];
      if (!strategy) continue; // no real relationship for this (primary, source) — left unresolved
      const target = SOURCE_TABLE[source];
      const targetFilter = resolveTargetFilter(source);
      const alias = Prisma.raw(`j${joinIndex++}`);

      if (strategy.kind === 'forward') {
        joinParts.push(Prisma.sql`
          LEFT JOIN ${id(target.table)} ${alias}
            ON ${alias}."RecId" = r.${id(strategy.fkColumn)} AND ${alias}."IsDeleted" = 0
            ${targetFilter ? Prisma.sql`AND ${alias}.${targetFilter}` : Prisma.sql``}
        `);
        for (const key of keys) selectParts.push(Prisma.sql`${alias}.${id(key)} as ${id(fieldAlias(source, key))}`);
      } else if (strategy.kind === 'reverse') {
        const aggCols = keys.map((key) => Prisma.sql`string_agg(DISTINCT c.${id(key)}, ', ') as ${id(key)}`);
        joinParts.push(Prisma.sql`
          LEFT JOIN LATERAL (
            SELECT ${Prisma.join(aggCols, ', ')}
            FROM ${id(target.table)} c
            WHERE c.${id(strategy.childFkColumn)} = r."RecId" AND c."IsDeleted" = 0
              ${targetFilter ? Prisma.sql`AND c.${targetFilter}` : Prisma.sql``}
          ) ${alias} ON true
        `);
        for (const key of keys) selectParts.push(Prisma.sql`${alias}.${id(key)} as ${id(fieldAlias(source, key))}`);
      } else {
        const aggCols = keys.map((key) => Prisma.sql`string_agg(DISTINCT t.${id(key)}, ', ') as ${id(key)}`);
        joinParts.push(Prisma.sql`
          LEFT JOIN LATERAL (
            SELECT ${Prisma.join(aggCols, ', ')}
            FROM ${id(strategy.bridgeTable)} b
            JOIN ${id(target.table)} t
              ON t."RecId" = b.${id(strategy.bridgeFkToTarget)} AND t."IsDeleted" = 0
              ${targetFilter ? Prisma.sql`AND t.${targetFilter}` : Prisma.sql``}
            WHERE b.${id(strategy.bridgeFkToPrimary)} = r."RecId" AND b."IsDeleted" = 0
          ) ${alias} ON true
        `);
        for (const key of keys) selectParts.push(Prisma.sql`${alias}.${id(key)} as ${id(fieldAlias(source, key))}`);
      }
    }

    const table = id(cfg.table);
    const extraWhere = cfg.extraWhere ?? Prisma.sql``;
    const orderDir = Prisma.raw(cfg.orderDir === 'DESC' ? 'DESC' : 'ASC');
    const whereSearch = search
      ? Prisma.sql`AND (${Prisma.join(cfg.searchColumns.map((c) => Prisma.sql`r.${id(c)} ILIKE ${`%${search}%`}`), ' OR ')})`
      : Prisma.sql``;

    // Prisma.join() throws on an empty array (common here — e.g. a worklist with no
    // cross-source fields needs no joins at all) — Prisma.sql`` is a safe empty fragment.
    const joinsSql = joinParts.length ? Prisma.join(joinParts, ' ') : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.join(selectParts, ', ')}
      FROM ${table} r
      ${joinsSql}
      WHERE r."IsDeleted" = 0 ${extraWhere} ${whereSearch}
      ORDER BY r.${id(cfg.orderBy)} ${orderDir}
      LIMIT 200
    `);
    return sanitizeRawRow(rows);
  }
}
