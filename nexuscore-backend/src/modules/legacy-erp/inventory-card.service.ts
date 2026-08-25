import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap } from './legacy-db-types.util';
import { screenKeyFor } from './inventory-receipt.service';
import { baseQuantitySql, baseQuantityJoinSql } from './unit-conversion.util';

// Read-only aggregation over the three existing IM_Item-based inventory cards (Fabric, Yarn,
// Trim) for the "Inventory Card List" screen — a UNION ALL of the same three AccessCode-
// scoped slices fabric-card.service.ts / yarn-card.service.ts / trim-inventory-card.service.ts
// already query individually, not a new table or materialized view: nothing here can drift
// out of sync with those services, because it reads the exact same rows they do.
//
// Unit resolution is unified across all three cards: the item's Base Unit, resolved the same
// way for Fabric, Yarn and Trim — from the shared "unit" satellite tab (IM_ItemUnitItemSize
// -> MD_UnitSetItem, the same table yarn-card-satellites.service.ts's own 'unit' tab writes),
// preferring whichever row is flagged the item's Main Unit (IsMainUnit), falling back to the
// first one. This is the same Base Unit concept the "Base Unit + Unit Conversion" feature
// (unit-conversion.util.ts) uses everywhere else — Yarn previously showed IM_Item.UnitId's
// MD_UnitSet name instead, a different/legacy field that isn't the configured Base Unit.
//
// InsertedBy resolves against the real Users/Auth table ("User", the same one every other
// part of NexusCore signs in against) via IM_Item.InsertedByUserId — a separate, additive
// column from the legacy InsertedBy integer (which every fabric/yarn/trim-card.service.ts
// create() populates from CurrentUser('id'), a real uuid, unlike the legacy InsertedBy int
// which Number(uuid) always collapses to a meaningless fallback). Falls back to "Unknown
// User" when the column is null (record created before this column existed) or the user was
// deleted since — never a fabricated placeholder like "User #1".
const SORTABLE_COLUMNS: Record<string, string> = {
  inventoryCode: 'inventoryCode',
  inventoryName: 'inventoryName',
  insertedAt: 'insertedAt',
  insertedBy: 'insertedBy',
};

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source) — the
// synthetic UNION ALL's own fixed output columns (see list() below), not a real table's raw
// columns like every other *_COLUMNS export in this module. Used only to drive the Worklist
// Design field picker; the frontend resolves a custom worklist for this one screen by
// projecting/reordering the rows its existing list() call already returns (see worklist-rows
// .service.ts's own comment on why this source has no LIST_SCREEN_TABLES entry).
export const INVENTORY_CARD_COLUMNS = [
  'sourceType', 'inventoryCode', 'inventoryName', 'inventoryType', 'unit',
  'stockOnHand', 'lastPurchasePrice', 'insertedAt', 'insertedBy',
] as const;

export interface InventoryCardListParams {
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

@Injectable()
export class InventoryCardService {
  constructor(private readonly prisma: PrismaService) {}

  // Display-name priority, per spec: User.name, else User.fullName (if that column exists),
  // else CONCAT(firstName, lastName) (if both exist), else "Unknown User" — never a raw id.
  // Built from a live column introspection of "User" (reusing the same pg_catalog lookup
  // legacy-db-types.util.ts already uses for domain-type coercion) rather than hardcoding
  // the assumption that fullName/firstName/lastName exist: today's schema only has `name`,
  // so this resolves to `COALESCE(NULLIF(creator."name",''), 'Unknown User')` — but if
  // fullName or firstName+lastName are ever added to User, this starts using them with zero
  // code changes, and never errors by referencing a column that doesn't exist.
  private async creatorNameExpr(): Promise<Prisma.Sql> {
    const userColumns = await getColumnTypeMap(this.prisma, 'User');
    const tiers: Prisma.Sql[] = [];
    if (userColumns.has('name')) tiers.push(Prisma.sql`NULLIF(creator."name", '')`);
    if (userColumns.has('fullName')) tiers.push(Prisma.sql`NULLIF(creator."fullName", '')`);
    if (userColumns.has('firstName') && userColumns.has('lastName')) {
      tiers.push(Prisma.sql`NULLIF(TRIM(CONCAT(creator."firstName", ' ', creator."lastName")), '')`);
    }
    tiers.push(Prisma.sql`'Unknown User'`);
    return Prisma.sql`COALESCE(${Prisma.join(tiers, ', ')})`;
  }

  async list(params: InventoryCardListParams) {
    const sortColumn = SORTABLE_COLUMNS[params.sortBy ?? 'inventoryCode'] ?? 'inventoryCode';
    const sortDir = params.sortDir === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
    if (params.sortBy && !SORTABLE_COLUMNS[params.sortBy]) {
      throw new BadRequestException(`Cannot sort by "${params.sortBy}"`);
    }

    const whereSearch = params.search
      ? Prisma.sql`WHERE ("inventoryCode" ILIKE ${`%${params.search}%`} OR "inventoryName" ILIKE ${`%${params.search}%`} OR "inventoryType" ILIKE ${`%${params.search}%`} OR "insertedBy" ILIKE ${`%${params.search}%`})`
      : Prisma.sql``;

    const creatorName = await this.creatorNameExpr();

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM (
        ${this.fabricAndTrimSlice('FABRIC', 'Fabric', 'fabric', creatorName)}
        UNION ALL
        ${this.yarnSlice(creatorName)}
        UNION ALL
        ${this.fabricAndTrimSlice('TRIM', 'Trim', 'trim', creatorName)}
        UNION ALL
        ${this.fabricAndTrimSlice('FIXEDASSET', 'Fixed Asset', 'fixedasset', creatorName)}
      ) combined
      ${whereSearch}
      ORDER BY "${Prisma.raw(sortColumn)}" ${sortDir}
      LIMIT 200
    `);
    return sanitizeRawRow(rows);
  }

  // Fabric, Trim and Fixed Asset share the exact same "no direct Unit column, resolve via the
  // unit satellite tab" shape, so this one query template serves all three — just the
  // AccessCode/display label/sourceType differ. Fixed Asset has no dedicated item master of
  // its own (confirmed via pg_catalog): IM_FixedAssetDepreciation/Expense/Inflation all key
  // off InventoryId -> IM_Item the same way Fabric/Trim/Yarn do, so a Fixed Asset item is
  // just an IM_Item row with AccessCode = 'FIXEDASSET' (0 rows today — no fake data).
  private fabricAndTrimSlice(accessCode: string, label: string, sourceType: string, creatorName: Prisma.Sql) {
    return Prisma.sql`
      SELECT
        i."RecId" AS id,
        ${sourceType} AS "sourceType",
        i."InventoryCode" AS "inventoryCode",
        i."InventoryName" AS "inventoryName",
        ${label} AS "inventoryType",
        COALESCE(unit_lookup."unitName", '') AS "unit",
        COALESCE(stock."qty", 0) AS "stockOnHand",
        last_price."price" AS "lastPurchasePrice",
        i."InsertedAt" AS "insertedAt",
        ${creatorName} AS "insertedBy"
      FROM "IM_Item" i
      LEFT JOIN LATERAL (
        SELECT usi."UnitName" AS "unitName"
        FROM "IM_ItemUnitItemSize" iuis
        JOIN "MD_UnitSetItem" usi ON usi."RecId" = iuis."UnitItemId"
        WHERE iuis."InventoryId" = i."RecId" AND iuis."IsDeleted" = 0
        ORDER BY iuis."IsMainUnit" DESC NULLS LAST, iuis."RecId" ASC
        LIMIT 1
      ) unit_lookup ON true
      ${this.stockLateral()}
      ${this.lastPurchasePriceLateral()}
      LEFT JOIN "User" creator ON creator."id" = i."InsertedByUserId"
      WHERE i."IsDeleted" = 0 AND i."AccessCode" = ${accessCode}
    `;
  }

  private yarnSlice(creatorName: Prisma.Sql) {
    return Prisma.sql`
      SELECT
        i."RecId" AS id,
        'yarn' AS "sourceType",
        i."InventoryCode" AS "inventoryCode",
        i."InventoryName" AS "inventoryName",
        'Yarn' AS "inventoryType",
        COALESCE(unit_lookup."unitName", '') AS "unit",
        COALESCE(stock."qty", 0) AS "stockOnHand",
        last_price."price" AS "lastPurchasePrice",
        i."InsertedAt" AS "insertedAt",
        ${creatorName} AS "insertedBy"
      FROM "IM_Item" i
      LEFT JOIN LATERAL (
        SELECT usi."UnitName" AS "unitName"
        FROM "IM_ItemUnitItemSize" iuis
        JOIN "MD_UnitSetItem" usi ON usi."RecId" = iuis."UnitItemId"
        WHERE iuis."InventoryId" = i."RecId" AND iuis."IsDeleted" = 0
        ORDER BY iuis."IsMainUnit" DESC NULLS LAST, iuis."RecId" ASC
        LIMIT 1
      ) unit_lookup ON true
      ${this.stockLateral()}
      ${this.lastPurchasePriceLateral()}
      LEFT JOIN "User" creator ON creator."id" = i."InsertedByUserId"
      WHERE i."IsDeleted" = 0 AND i."AccessCode" = 'YARN'
    `;
  }

  // Stock on Hand — deliberately scoped to only the two unambiguous, purchase-side movement
  // types on IM_ReceiptItem: Purchase Receipt (ReceiptType=2, +) and Purchase Return
  // (ReceiptType=2, -). The other 16 "Receipt Screen Replication" types (Warehouse Transfer,
  // Outside Process Send/Receive, Manufacture Send/Return, etc. — see receipt-types.config.ts)
  // carry no explicit inbound/outbound flag anywhere in the schema; guessing a sign for each
  // would risk a silently-wrong stock figure, which is worse than the narrower-but-correct
  // "purchases minus returns" figure this computes instead. NOT a full perpetual-inventory
  // balance — see the module's own final report for this documented scope limitation.
  //
  // BUG FIX: also requires the owning IM_Receipt header to be non-deleted. removeItem's own
  // IsDeleted=0 filter only ever checked the LINE's own flag — but IM_Receipt.remove() (like
  // every other header/detail pair in this module) soft-deletes only the header, never cascades
  // to its items (confirmed live: several IM_OrderReceipt rows in the dev DB are IsDeleted=1
  // with still-active IsDeleted=0 line items). Without this join, a cancelled/deleted Purchase
  // Receipt or Return's quantity still counted toward Stock on Hand.
  //
  // BUG FIX: filters on the HEADER's "ReceiptType" (rec), not the line item's own denormalized
  // copy (ri."ReceiptType"). inventory-receipt.service.ts's createItem does stamp both the same
  // value at insert time, but confirmed live that at least one existing IM_ReceiptItem row has a
  // stale/mismatched value on the item copy (item ReceiptType=1, its own header ReceiptType=2) —
  // which silently excluded a real Purchase Receipt line from this sum. The header's ReceiptType
  // is the single source of truth for "what kind of receipt this is" everywhere else in this
  // module (list/get/nextReceiptNo all filter on it), so trusting it here instead is strictly
  // more correct, not a new business rule.
  //
  // APPROVAL GATE: gated on the real ApprovalRequest row for this exact receipt (General
  // Settings -> Approval Configuration's screenKey/transactionId, the same table
  // ApprovalService.submit()/approve()/reject() already write — see inventory-receipt.service
  // .ts), NOT on the current live "is approval required" config flag. This distinction matters:
  // a receipt created back when Approval Required was OFF has no ApprovalRequest row at all —
  // NOT EXISTS is true for it, so it keeps counting toward stock forever, exactly as before,
  // even after an admin later turns Approval Required ON for this screen. Only a receipt that
  // actually went through submit() and is sitting at pending_approval/rejected (status <>
  // 'approved') is excluded. This is the one and only place stock is computed (see class
  // comment / final report: there is no separate stored quantity to "not update"), so gating
  // this SUM *is* the enforcement — approval-OFF / never-submitted behavior is untouched.
  // `itemRef` is the correlated `i."RecId"` column reference when embedded in the per-row
  // LATERAL join below, or a literal item id when used as a standalone scalar query (see
  // getStockOnHand, added for item-statement.service.ts) — same SQL text either way, so the
  // two call sites can never silently drift apart into two different stock formulas.
  // Base Unit + Unit Conversion (spec Section 7): two receipts of the same item in different
  // units (e.g. one in Bags, one in Kg) must aggregate into one Stock on Hand figure, in Base
  // Unit — a raw SUM("Quantity") across mixed units is meaningless. Reuses the one conversion
  // formula in unit-conversion.util.ts (the same one purchase-order.service.ts's listPending and
  // inventory-receipt.service.ts's assertPendingQty use) rather than a second stock formula.
  private stockSumSql(itemRef: Prisma.Sql) {
    const purchaseReceiptKey = screenKeyFor(2);
    const purchaseReturnKey = screenKeyFor(122);
    const baseQty = baseQuantitySql(Prisma.sql`ri."Quantity"`, Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri');
    return Prisma.sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN rec."ReceiptType" = 2 AND NOT EXISTS (
            SELECT 1 FROM "ApprovalRequest" ar
            WHERE ar."screenKey" = ${purchaseReceiptKey} AND ar."transactionId" = rec."RecId"::text AND ar."status" <> 'approved'
          ) THEN ${baseQty}
          WHEN rec."ReceiptType" = 122 AND NOT EXISTS (
            SELECT 1 FROM "ApprovalRequest" ar
            WHERE ar."screenKey" = ${purchaseReturnKey} AND ar."transactionId" = rec."RecId"::text AND ar."status" <> 'approved'
          ) THEN -${baseQty}
          ELSE 0
        END
      ), 0) AS "qty"
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" rec ON rec."RecId" = ri."InventoryReceiptId" AND rec."IsDeleted" = 0
      ${baseQuantityJoinSql(Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri')}
      WHERE ri."InventoryId" = ${itemRef} AND ri."IsDeleted" = 0 AND rec."ReceiptType" IN (2, 122)
    `;
  }

  private stockLateral() {
    return Prisma.sql`LEFT JOIN LATERAL ( ${this.stockSumSql(Prisma.sql`i."RecId"`)} ) stock ON true`;
  }

  // Single-item entry point for item-statement.service.ts's "Current Stock" header field and
  // its cross-check against the statement's own transaction-derived closing balance — same
  // formula as the list() grid's "Stock on Hand" column above, just scalar instead of a
  // per-row LATERAL join. Never a second, divergent stock calculation.
  async getStockOnHand(itemId: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<any[]>(this.stockSumSql(Prisma.sql`${itemId}`));
    return Number(rows[0]?.qty ?? 0);
  }

  // "Stock Price" has no source anywhere in this schema (no cost/valuation column on IM_Item,
  // no ledger) — approximated here as the most recent UnitPrice actually paid for this item,
  // across either a Purchase Order line or a Purchase Receipt line, whichever is more recent.
  // Exposed as "lastPurchasePrice" (not "stockPrice") so callers surface it honestly as a last-
  // paid-price approximation rather than implying a true costed valuation.
  //
  // BUG FIX: same header-soft-delete gap as stockLateral above, on both sides of the UNION —
  // confirmed live that this was actually surfacing prices from cancelled Purchase Orders
  // (7 of 10 IM_OrderReceipt rows in the dev DB are soft-deleted with still-active items) before
  // this join was added.
  //
  // BUG FIX: the IM_ReceiptItem side also filters on the HEADER's "ReceiptType" (rec), same
  // stale-denormalized-column reasoning as stockLateral above.
  private lastPurchasePriceLateral() {
    return Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT p."price"
        FROM (
          SELECT ooi."UnitPrice" AS "price", ooi."InsertedAt" AS "ts"
          FROM "IM_OrderReceiptItem" ooi
          JOIN "IM_OrderReceipt" po ON po."RecId" = ooi."OrderReceiptId" AND po."IsDeleted" = 0
          WHERE ooi."InventoryId" = i."RecId" AND ooi."IsDeleted" = 0 AND ooi."UnitPrice" IS NOT NULL
          UNION ALL
          SELECT ri."UnitPrice" AS "price", ri."InsertedAt" AS "ts"
          FROM "IM_ReceiptItem" ri
          JOIN "IM_Receipt" rec ON rec."RecId" = ri."InventoryReceiptId" AND rec."IsDeleted" = 0
          WHERE ri."InventoryId" = i."RecId" AND ri."IsDeleted" = 0 AND rec."ReceiptType" = 2 AND ri."UnitPrice" IS NOT NULL
        ) p
        ORDER BY p."ts" DESC
        LIMIT 1
      ) last_price ON true
    `;
  }
}
