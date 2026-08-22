import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { screenKeyFor } from './inventory-receipt.service';
import { getReceiptTypeConfig } from './receipt-types.config';
import { InventoryCardService } from './inventory-card.service';

// Item Statement / Transaction History — a read-only view over the exact same IM_Item /
// IM_Receipt / IM_ReceiptItem rows every *-card.service.ts and inventory-receipt.service.ts
// already read and write. No new ledger table, no new stock formula: the "Current Stock"
// figure is InventoryCardService.getStockOnHand() (the module's one and only stock-on-hand
// calculation), and the per-row direction below is scoped to the exact same two receipt types
// that calculation trusts, for the same reason it does (see inventory-card.service.ts's own
// stockSumSql comment).
//
// AUDIT (direction evidence for every configured ReceiptType, live DB inspected — nothing here
// is inferred from a screen name):
//  - ReceiptType 2 (Purchase Receipt) and 122 (Purchase Return) are the ONLY two values with any
//    real row in "IM_Receipt" in this environment (9 and 1 respectively) and the only two with
//    any approval activity ever recorded (real ApprovalRequest rows). HIGH confidence.
//  - The other 14 configured "Receipt Screen Replication" types (16, 101, 10, 11, 12, 132, 133,
//    134, 139, 140, 18, 22, 120, 3 — see receipt-types.config.ts) have ZERO rows in "IM_Receipt",
//    no code anywhere branches on their specific ReceiptType for stock purposes (repo-wide grep),
//    and were never configured/exercised in ApprovalConfiguration/ApprovalRequest either. No
//    direction can be assigned without guessing — left UNKNOWN, excluded from the balance.
//  - ReceiptType 17 (Warehouse Transfer) is kept as its own `TRANSFER` category (still excluded
//    from the balance, same as UNKNOWN) rather than lumped in with the rest: "IM_Receipt"/
//    "IM_ReceiptItem" do have an `OutWarehouseId` column alongside `InWarehouseId`, and a migrated
//    (but never called) stored procedure `EditInventoryTransferOutflowReceipt` proves the original
//    legacy ERP modeled it as source-OUT/destination-IN. But `OutWarehouseId` is NULL on every
//    real row, that stored procedure has no trigger and is never invoked by this NestJS backend,
//    and there are 0 real Warehouse Transfer rows to observe — so there's no live source/
//    destination data to compute a per-warehouse movement from. Faking a transfer's sign without
//    that data would produce an incorrect global balance, which is explicitly off-limits — so this
//    stays informational-only until real transfer data (with both warehouses populated) exists.
//  - ReceiptType values 1, 13, 20, 136 (raised as candidates in a later audit request) do not
//    exist anywhere in this system: not in receipt-types.config.ts, not as any real IM_Receipt
//    header row, and not referenced by any table/column/code in the repo. The only appearance of
//    "1" in real data is a stale denormalized copy on IM_ReceiptItem.ReceiptType for a line whose
//    real header (source of truth) is ReceiptType=2 — already correctly ignored elsewhere in this
//    module (inventory-card.service.ts trusts the header, never the line's own copy). Nothing was
//    added for these four values; inventing a mapping for types with zero footprint in this
//    codebase/DB would violate the same "don't guess" rule this whole audit exists to enforce.
type DirectionClass = 'IN' | 'OUT' | 'TRANSFER' | 'UNKNOWN';
const DIRECTION_CLASS: Record<number, DirectionClass> = {
  2: 'IN', // Purchase Receipt
  122: 'OUT', // Purchase Return
  17: 'TRANSFER', // Warehouse Transfer — see audit note above; not counted in the balance
};
const directionClassOf = (receiptType: number): DirectionClass => DIRECTION_CLASS[receiptType] ?? 'UNKNOWN';

const ACCESS_CODE_LABEL: Record<string, string> = {
  YARN: 'Yarn',
  FABRIC: 'Fabric',
  TRIM: 'Trim',
  FIXEDASSET: 'Fixed Asset',
};

export interface ItemStatementFilters {
  dateFrom?: string;
  dateTo?: string;
  receiptType?: number;
  receiptNo?: string;
}

@Injectable()
export class ItemStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryCardSvc: InventoryCardService,
  ) {}

  // Item header — same "IM_Item scoped to a real AccessCode" shape as every *-card.service.ts's
  // own get(id), just accepting any of the four card AccessCodes instead of one, since this
  // screen is opened from Trim/Fabric/Yarn/Inventory Card List alike. Throws the same
  // NotFoundException a bad/foreign id would get from those screens' own get(id) — an id that
  // doesn't resolve to a real, non-deleted, card-backed IM_Item row is rejected outright, never
  // silently statement-ed against.
  private async getItemSummary(itemId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT i."RecId" as id, i."InventoryCode" as "inventoryCode", i."InventoryName" as "inventoryName", i."AccessCode" as "accessCode"
      FROM "IM_Item" i WHERE i."RecId" = ${itemId} AND i."IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Inventory item not found');
    const item = sanitizeRawRow(rows[0]);
    if (!ACCESS_CODE_LABEL[item.accessCode]) throw new NotFoundException('Inventory item not found');

    // Unit resolution — same per-AccessCode shape as inventory-card.service.ts's own
    // yarnSlice/fabricAndTrimSlice (Yarn: direct IM_Item.UnitId -> MD_UnitSet; Fabric/Trim/Fixed
    // Asset: IM_ItemUnitItemSize -> MD_UnitSetItem, preferring the row flagged IsMainUnit).
    let unit = '';
    if (item.accessCode === 'YARN') {
      const u = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT us."SetName" as "unitName" FROM "IM_Item" i
        LEFT JOIN "MD_UnitSet" us ON us."RecId" = i."UnitId"
        WHERE i."RecId" = ${itemId}
      `);
      unit = u[0]?.unitName ?? '';
    } else {
      const u = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT usi."UnitName" as "unitName"
        FROM "IM_ItemUnitItemSize" iuis
        JOIN "MD_UnitSetItem" usi ON usi."RecId" = iuis."UnitItemId"
        WHERE iuis."InventoryId" = ${itemId} AND iuis."IsDeleted" = 0
        ORDER BY iuis."IsMainUnit" DESC NULLS LAST, iuis."RecId" ASC LIMIT 1
      `);
      unit = u[0]?.unitName ?? '';
    }

    return { ...item, unit, inventoryType: ACCESS_CODE_LABEL[item.accessCode] };
  }

  async getStatement(itemId: number, filters: ItemStatementFilters = {}) {
    const item = await this.getItemSummary(itemId);
    const currentStockOnHand = await this.inventoryCardSvc.getStockOnHand(itemId);

    const purchaseReceiptKey = screenKeyFor(2);
    const purchaseReturnKey = screenKeyFor(122);

    const dateFromSql = filters.dateFrom ? Prisma.sql`AND r."ReceiptDate" >= ${new Date(filters.dateFrom)}` : Prisma.sql``;
    const dateToSql = filters.dateTo ? Prisma.sql`AND r."ReceiptDate" <= ${new Date(filters.dateTo)}` : Prisma.sql``;
    const receiptTypeSql = filters.receiptType != null ? Prisma.sql`AND r."ReceiptType" = ${filters.receiptType}` : Prisma.sql``;
    const receiptNoSql = filters.receiptNo ? Prisma.sql`AND r."ReceiptNo" ILIKE ${`%${filters.receiptNo}%`}` : Prisma.sql``;

    // Approval gate on the two confirmed-direction types, byte-identical to Stock on Hand's own
    // gate (see inventory-card.service.ts's stockSumSql) — so this statement's own running
    // balance ties out to `currentStockOnHand` above. The other 16 types carry no such gate:
    // they're excluded from the balance regardless of approval state, so gating them would be
    // meaningless (and inventing an approval rule for types that were never wired to one).
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        r."RecId" as "receiptId",
        r."ReceiptNo" as "receiptNo",
        r."ReceiptType" as "receiptType",
        r."ReceiptDate" as "receiptDate",
        ri."RecId" as "lineId",
        ri."Quantity" as "quantity",
        COALESCE(usi."UnitName", '') as "unit"
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" AND r."IsDeleted" = 0
      LEFT JOIN "MD_UnitSetItem" usi ON usi."RecId" = ri."UnitId"
      WHERE ri."InventoryId" = ${itemId} AND ri."IsDeleted" = 0
        AND (
          r."ReceiptType" NOT IN (2, 122)
          OR (r."ReceiptType" = 2 AND NOT EXISTS (
            SELECT 1 FROM "ApprovalRequest" ar
            WHERE ar."screenKey" = ${purchaseReceiptKey} AND ar."transactionId" = r."RecId"::text AND ar."status" <> 'approved'
          ))
          OR (r."ReceiptType" = 122 AND NOT EXISTS (
            SELECT 1 FROM "ApprovalRequest" ar
            WHERE ar."screenKey" = ${purchaseReturnKey} AND ar."transactionId" = r."RecId"::text AND ar."status" <> 'approved'
          ))
        )
        ${dateFromSql} ${dateToSql} ${receiptTypeSql} ${receiptNoSql}
      ORDER BY r."ReceiptDate" ASC NULLS LAST, r."RecId" ASC, ri."RecId" ASC
    `);

    let runningBalance = 0;
    let totalIn = 0;
    let totalOut = 0;
    const transactions = sanitizeRawRow(rows).map((row: any) => {
      const movementCategory = directionClassOf(row.receiptType);
      const direction = movementCategory === 'IN' || movementCategory === 'OUT' ? movementCategory : null;
      const quantity = Number(row.quantity) || 0;
      const quantityIn = direction === 'IN' ? quantity : 0;
      const quantityOut = direction === 'OUT' ? quantity : 0;
      if (direction) runningBalance += quantityIn - quantityOut;
      totalIn += quantityIn;
      totalOut += quantityOut;
      const config = getReceiptTypeConfig(row.receiptType);
      return {
        date: row.receiptDate,
        receiptNo: row.receiptNo,
        receiptType: row.receiptType,
        transactionType: config?.label ?? `Receipt Type ${row.receiptType}`,
        unit: row.unit,
        quantity,
        quantityIn,
        quantityOut,
        direction,
        // 'IN' | 'OUT' | 'TRANSFER' | 'UNKNOWN' — see the audit note above this class' definition.
        // Only 'IN'/'OUT' ever affect the balance; 'TRANSFER' (Warehouse Transfer, ReceiptType 17)
        // is kept distinct from generic 'UNKNOWN' purely for clearer labeling in the UI.
        movementCategory,
        includedInStockCalculation: direction !== null,
        runningBalance,
      };
    });

    return {
      item: {
        id: item.id,
        inventoryCode: item.inventoryCode,
        inventoryName: item.inventoryName,
        inventoryType: item.inventoryType,
        unit: item.unit,
      },
      currentStockOnHand,
      transactions,
      totals: {
        totalIn,
        totalOut,
        closingBalanceFromTransactions: runningBalance,
        transactionCount: transactions.length,
      },
      // Distinguishes the two figures per the feature spec — they're expected to match (both
      // derive from the same Purchase Receipt/Return rows), but are never silently conflated:
      // currentStockOnHand is the module's one stock engine; closingBalanceFromTransactions is
      // this statement's own chronological replay of the same rows, exposed separately so any
      // future divergence (e.g. a stock adjustment made outside this statement's date filter)
      // is visible rather than hidden.
      stockReconciled: currentStockOnHand === runningBalance,
    };
  }
}
