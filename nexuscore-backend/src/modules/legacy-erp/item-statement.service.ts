import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getReceiptTypeConfig, directionClassOf } from './receipt-types.config';
import { InventoryCardService, stockApprovalGateSql } from './inventory-card.service';
import { baseQuantitySql, baseQuantityJoinSql, unitConversionIssueSql } from './unit-conversion.util';

// Item Statement / Stock Control Ledger — still a read-only view over the exact same IM_Item /
// IM_Receipt / IM_ReceiptItem rows every *-card.service.ts and inventory-receipt.service.ts
// already read and write. No new ledger table, no new stock formula, no split of Inventory
// Card's own stock: "Overall Current Stock" (currentStockOnHand below) is still, unconditionally,
// InventoryCardService.getStockOnHand() (the module's one and only stock-on-hand calculation) —
// unaffected by every filter/dimension/view this service adds. Only THIS statement's own
// chronological replay (running balance / opening / closing / totals, and the new Detailed
// View's per-dimension balances) is extended to cover more transaction types, per an explicit,
// confirmed business mapping (see DIRECTION_CLASS below) that supersedes the narrower one this
// file previously shipped with.
//
// DIRECTION_CLASS / directionClassOf — the ONE receipt-type stock-direction mapping — now lives in
// receipt-types.config.ts (moved there unchanged) so inventory-card.service.ts's Stock on Hand
// reads the same map as this ledger.

// Approval gating (Purchase Receipt/Return only) is inventory-card.service.ts's
// stockApprovalGateSql — the same filter getStockOnHand() applies.

const ACCESS_CODE_LABEL: Record<string, string> = {
  YARN: 'Yarn',
  FABRIC: 'Fabric',
  TRIM: 'Trim',
  FIXEDASSET: 'Fixed Asset',
};

export type StatementView = 'overall' | 'detailed';

export interface ItemStatementFilters {
  dateFrom?: string;
  dateTo?: string;
  receiptType?: number;
  /** Matches either IM_Receipt.ReceiptNo or IM_Receipt.DocumentNo — the task's "Document/Receipt
   *  No" is one combinable field over two real, separate columns, not a new one. */
  documentOrReceiptNo?: string;
  colorCardId?: string;
  /** IM_ReceiptItem.PartyNo — the only real "Lot/Batch" column on this table (no separate Lot
   *  master exists); filtered as an exact match since it's the same code a document itself
   *  carries. */
  lotBatch?: string;
  warehouseId?: number;
  currentAccountId?: number;
  /** Only meaningful when itemId is omitted (see getStatement) — narrows which items' lines are
   *  included by a substring match on Code/Name. Ignored when a specific itemId is given (that
   *  already fully identifies the item). */
  itemCode?: string;
  itemName?: string;
}

/** Why a line's quantity could not be normalized into its item's Base Unit (the statement's
 *  reporting unit). Such a line is still listed (original Unit/Quantity untouched) but excluded
 *  from every balance/total — baseQuantitySql's own COALESCE(..., 1) fallback would otherwise add
 *  its raw number 1:1 into Base-Unit totals, i.e. silently sum e.g. KG into BAG. */
export type UnitConversionIssue = 'NO_BASE_UNIT' | 'MISSING_CONVERSION' | 'MIXED_UNCONFIGURED_UNITS';
const CONVERSION_ISSUE_MESSAGE: Record<UnitConversionIssue, string> = {
  NO_BASE_UNIT: 'Item has configured units but none is flagged as Base Unit (IsMainUnit) — cannot normalize.',
  MISSING_CONVERSION: 'No valid UnitFactor/UnitDivisor configured for this unit on this item (IM_ItemUnitItemSize) — cannot normalize.',
  MIXED_UNCONFIGURED_UNITS: 'Item has no configured units (IM_ItemUnitItemSize) but its lines use more than one unit — cannot normalize.',
};

// Quantity/UnitFactor/UnitDivisor are all numeric(28,8) — rounding every derived figure to that
// same scale removes binary-float noise (e.g. 100 / 45.36 = 2.204585537918871…) without dropping
// any precision the data itself actually carries.
const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

/** One item's balances within a statement, in that item's own Base Unit (unit). */
export interface ItemBalance {
  itemId: number; itemCode: string; itemName: string; unit: string | null;
  openingBalance: number; totalIn: number; totalOut: number; closingBalance: number; transactionCount: number;
}

interface RawMovementRow {
  itemId: number;
  itemCode: string;
  itemName: string;
  receiptId: number;
  receiptNo: string;
  documentNo: string | null;
  receiptType: number;
  receiptDate: Date;
  currentAccountId: number | null;
  currentAccountCode: string | null;
  currentAccountName: string | null;
  lineId: number;
  quantity: number;
  baseQuantity: number;
  unit: string;
  /** The item's Base Unit name (IsMainUnit=1) — every baseQuantity/balance is in this unit. */
  baseUnit: string | null;
  conversionIssue: UnitConversionIssue | null;
  colorCardId: string | null;
  colorCode: string | null;
  colorName: string | null;
  lotBatch: string | null;
  remarks: string | null;
  inWarehouseId: number | null;
  inWarehouseCode: string | null;
  inWarehouseName: string | null;
  outWarehouseId: number | null;
  outWarehouseCode: string | null;
  outWarehouseName: string | null;
}

/** One movement's effect on a single warehouse's balance. Every IN/OUT row produces exactly one
 *  (keyed by whichever warehouse it actually moved into/out of); a TRANSFER row produces two —
 *  a decrease at its source and an increase at its destination — which is what makes "decrease
 *  Source, increase Destination, unchanged company-wide total" fall out naturally: summing both
 *  contributions together (i.e. ignoring which warehouse each belongs to, as the Overall/company-
 *  wide view does) always nets to zero for a transfer, while attributing each contribution to its
 *  own warehouse (as the Detailed View's per-warehouse grouping does) correctly moves the balance
 *  between the two. */
interface WarehouseContribution {
  warehouseId: number | null;
  baseQtyIn: number;
  baseQtyOut: number;
}

function contributionsFor(row: RawMovementRow): WarehouseContribution[] {
  if (row.conversionIssue) return []; // unconvertible — never summed into Base-Unit balances
  const cls = directionClassOf(row.receiptType);
  if (cls === 'TRANSFER') {
    const out: WarehouseContribution[] = [];
    if (row.outWarehouseId != null) out.push({ warehouseId: row.outWarehouseId, baseQtyIn: 0, baseQtyOut: row.baseQuantity });
    if (row.inWarehouseId != null) out.push({ warehouseId: row.inWarehouseId, baseQtyIn: row.baseQuantity, baseQtyOut: 0 });
    return out;
  }
  if (cls === 'IN') return [{ warehouseId: row.inWarehouseId, baseQtyIn: row.baseQuantity, baseQtyOut: 0 }];
  if (cls === 'OUT') return [{ warehouseId: row.outWarehouseId, baseQtyIn: 0, baseQtyOut: row.baseQuantity }];
  return []; // UNKNOWN — excluded from every balance, same as before this pass
}

/** Net effect of a row for a given "point of view": no warehouse filter = company-wide (sum every
 *  contribution — a transfer's two legs cancel out); a specific warehouseId = that warehouse's
 *  own balance (only the matching contribution, if any, counts). Reused identically for the grid's
 *  own Quantity In/Out/Running Balance and for the Detailed View's per-warehouse grouping, so
 *  there is exactly one place this rule is expressed. */
function netForWarehouse(row: RawMovementRow, warehouseId: number | null): { baseQtyIn: number; baseQtyOut: number } {
  const contributions = contributionsFor(row);
  // Company-wide, a transfer always nets to zero — even one with a missing warehouse leg — the
  // same way getStockOnHand() (which never counts TRANSFER) sees it.
  if (warehouseId == null && contributions.length && directionClassOf(row.receiptType) === 'TRANSFER') {
    return { baseQtyIn: row.baseQuantity, baseQtyOut: row.baseQuantity };
  }
  if (warehouseId == null) {
    return contributions.reduce((acc, c) => ({ baseQtyIn: acc.baseQtyIn + c.baseQtyIn, baseQtyOut: acc.baseQtyOut + c.baseQtyOut }), { baseQtyIn: 0, baseQtyOut: 0 });
  }
  const match = contributions.find((c) => c.warehouseId === warehouseId);
  return match ? { baseQtyIn: match.baseQtyIn, baseQtyOut: match.baseQtyOut } : { baseQtyIn: 0, baseQtyOut: 0 };
}

@Injectable()
export class ItemStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryCardSvc: InventoryCardService,
  ) {}

  // Item header — same "IM_Item scoped to a real AccessCode" shape as every *-card.service.ts's
  // own get(id). Unchanged from before this pass.
  private async getItemSummary(itemId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT i."RecId" as id, i."InventoryCode" as "inventoryCode", i."InventoryName" as "inventoryName", i."AccessCode" as "accessCode"
      FROM "IM_Item" i WHERE i."RecId" = ${itemId} AND i."IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Inventory item not found');
    const item = sanitizeRawRow(rows[0]);
    if (!ACCESS_CODE_LABEL[item.accessCode]) throw new NotFoundException('Inventory item not found');

    const u = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT usi."UnitName" as "unitName", iuis."IsMainUnit" as "isMainUnit"
      FROM "IM_ItemUnitItemSize" iuis
      JOIN "MD_UnitSetItem" usi ON usi."RecId" = iuis."UnitItemId"
      WHERE iuis."InventoryId" = ${itemId} AND iuis."IsDeleted" = 0
      ORDER BY iuis."IsMainUnit" DESC NULLS LAST, iuis."RecId" ASC LIMIT 1
    `);
    // The statement's reporting unit IS the Base Unit (every balance is in Base-Unit terms), so a
    // non-base unit is never shown as its label — that would mislabel Base-Unit figures.
    const unit = u.length && Number(u[0].isMainUnit) !== 1 ? '' : (u[0]?.unitName ?? '');

    return { ...item, unit, inventoryType: ACCESS_CODE_LABEL[item.accessCode] };
  }

  // Fetches every candidate movement row for the requested scope, unrestricted by date (a lower
  // date bound would silently break "Opening Balance before From Date" — see class-level comment)
  // but bounded by `dateTo` (nothing after it can ever matter) and by the DIMENSION filters that
  // legitimately narrow the item/stock scope itself: itemId (or itemCode/itemName when itemId is
  // omitted), color, lot/batch, warehouse. Deliberately NOT filtered here by receiptType/
  // documentOrReceiptNo/currentAccountId — those are transaction-detail filters, applied later,
  // only to what's actually displayed/summed for the CURRENT view, never to the rows an opening
  // balance is computed from.
  private async fetchMovementRows(itemId: number | null, filters: ItemStatementFilters): Promise<RawMovementRow[]> {
    const baseQty = baseQuantitySql(Prisma.sql`ri."Quantity"`, Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri');

    const itemSql = itemId != null ? Prisma.sql`AND ri."InventoryId" = ${itemId}` : Prisma.sql``;
    const itemCodeSql = itemId == null && filters.itemCode ? Prisma.sql`AND i."InventoryCode" ILIKE ${`%${filters.itemCode}%`}` : Prisma.sql``;
    const itemNameSql = itemId == null && filters.itemName ? Prisma.sql`AND i."InventoryName" ILIKE ${`%${filters.itemName}%`}` : Prisma.sql``;
    const dateToSql = filters.dateTo ? Prisma.sql`AND r."ReceiptDate" <= ${new Date(filters.dateTo)}` : Prisma.sql``;
    const colorSql = filters.colorCardId ? Prisma.sql`AND ri."ColorCardId" = ${filters.colorCardId}` : Prisma.sql``;
    const lotSql = filters.lotBatch ? Prisma.sql`AND ri."PartyNo" = ${filters.lotBatch}` : Prisma.sql``;
    const warehouseSql = filters.warehouseId != null
      ? Prisma.sql`AND (ri."InWarehouseId" = ${filters.warehouseId} OR ri."OutWarehouseId" = ${filters.warehouseId})`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        i."RecId" as "itemId", i."InventoryCode" as "itemCode", i."InventoryName" as "itemName",
        r."RecId" as "receiptId", r."ReceiptNo" as "receiptNo", r."DocumentNo" as "documentNo",
        r."ReceiptType" as "receiptType", r."ReceiptDate" as "receiptDate",
        r."CurrentAccountId" as "currentAccountId",
        acc."CurrentAccountCode" as "currentAccountCode", acc."CurrentAccountName" as "currentAccountName",
        ri."RecId" as "lineId", ri."Quantity" as "quantity", ${baseQty} as "baseQuantity",
        COALESCE(usi."UnitName", '') as "unit", bu."UnitName" as "baseUnit",
        ${unitConversionIssueSql(Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri')} as "conversionIssue",
        ri."ColorCardId" as "colorCardId", cc."code" as "colorCode", cc."name" as "colorName",
        ri."PartyNo" as "lotBatch",
        ri."Explanation" as "remarks",
        ri."InWarehouseId" as "inWarehouseId", inwh."WarehouseCode" as "inWarehouseCode", inwh."WarehouseName" as "inWarehouseName",
        ri."OutWarehouseId" as "outWarehouseId", outwh."WarehouseCode" as "outWarehouseCode", outwh."WarehouseName" as "outWarehouseName"
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" AND r."IsDeleted" = 0
      JOIN "IM_Item" i ON i."RecId" = ri."InventoryId" AND i."IsDeleted" = 0
      LEFT JOIN "MD_UnitSetItem" usi ON usi."RecId" = ri."UnitId"
      LEFT JOIN "ColorCard" cc ON cc."id" = ri."ColorCardId"
      LEFT JOIN "IM_Warehouse" inwh ON inwh."RecId" = ri."InWarehouseId" AND inwh."IsDeleted" = 0
      LEFT JOIN "IM_Warehouse" outwh ON outwh."RecId" = ri."OutWarehouseId" AND outwh."IsDeleted" = 0
      LEFT JOIN "FI_Account" acc ON acc."RecId" = r."CurrentAccountId" AND acc."IsDeleted" = 0
      ${baseQuantityJoinSql(Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri')}
      LEFT JOIN LATERAL (
        SELECT busi."UnitName" FROM "IM_ItemUnitItemSize" b
        JOIN "MD_UnitSetItem" busi ON busi."RecId" = b."UnitItemId"
        WHERE b."InventoryId" = ri."InventoryId" AND b."IsDeleted" = 0 AND b."IsMainUnit" = 1
        ORDER BY b."RecId" ASC LIMIT 1
      ) bu ON true
      WHERE ri."IsDeleted" = 0
        ${itemSql} ${itemCodeSql} ${itemNameSql}
        AND ${stockApprovalGateSql('r')}
        ${dateToSql} ${colorSql} ${lotSql} ${warehouseSql}
      ORDER BY r."ReceiptDate" ASC NULLS LAST, r."RecId" ASC, ri."RecId" ASC
    `);
    // conversionIssue comes from unitConversionIssueSql — the same predicate getStockOnHand() uses
    // to exclude a line, so both figures skip exactly the same lines.
    return sanitizeRawRow(rows).map((r: any) => ({
      ...r,
      quantity: Number(r.quantity) || 0,
      baseQuantity: round8(Number(r.baseQuantity) || 0),
      conversionIssue: r.conversionIssue ?? null,
    }));
  }

  async getStatement(itemId: number | null, filters: ItemStatementFilters = {}) {
    const item = itemId != null ? await this.getItemSummary(itemId) : null;
    const currentStockOnHand = itemId != null ? await this.inventoryCardSvc.getStockOnHand(itemId) : null;

    const allRows = await this.fetchMovementRows(itemId, filters);

    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
    // The "point of view" every balance in this response is computed from: company-wide (null)
    // unless the caller asked to see one specific warehouse's own movements.
    const warehouseView = filters.warehouseId ?? null;

    const beforeRange = dateFrom ? allRows.filter((r) => new Date(r.receiptDate) < dateFrom) : [];
    const inRangeAll = allRows.filter((r) => {
      if (dateFrom && new Date(r.receiptDate) < dateFrom) return false;
      if (dateTo && new Date(r.receiptDate) > dateTo) return false;
      return true;
    });

    // Balances are kept PER ITEM (each in its own Base Unit) — in the no-item ledger, rows of
    // different items interleave by date, and one shared running balance would add e.g. BAG of
    // one item to MTR of another. For a single-item statement there is exactly one bucket.
    const byItem = new Map<number, ItemBalance>();
    const bucketFor = (r: RawMovementRow): ItemBalance => {
      let b = byItem.get(r.itemId);
      if (!b) {
        b = { itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, unit: r.baseUnit, openingBalance: 0, totalIn: 0, totalOut: 0, closingBalance: 0, transactionCount: 0 };
        byItem.set(r.itemId, b);
      }
      return b;
    };

    // Opening Balance: every historical row before From Date, in the SAME dimension scope
    // (item/color/lot/warehouse — already applied by fetchMovementRows), regardless of
    // transaction-type/document/current-account filters (an opening balance is a fact about the
    // item's history, not about which rows the user currently wants to LOOK at).
    for (const r of beforeRange) {
      const b = bucketFor(r);
      const { baseQtyIn, baseQtyOut } = netForWarehouse(r, warehouseView);
      b.openingBalance = round8(b.openingBalance + baseQtyIn - baseQtyOut);
    }
    for (const b of byItem.values()) b.closingBalance = b.openingBalance;

    // Transaction-detail filters — narrow which of the in-range rows are actually displayed/
    // summed for THIS view, same as the receiptType/receiptNo filters this endpoint already had.
    const docFilter = filters.documentOrReceiptNo?.trim().toLowerCase();
    const displayed = inRangeAll.filter((r) => {
      if (filters.receiptType != null && r.receiptType !== filters.receiptType) return false;
      if (docFilter && !(r.receiptNo?.toLowerCase().includes(docFilter) || r.documentNo?.toLowerCase().includes(docFilter))) return false;
      if (filters.currentAccountId != null && r.currentAccountId !== filters.currentAccountId) return false;
      return true;
    });

    const transactions = displayed.map((row) => {
      const b = bucketFor(row);
      b.transactionCount += 1;
      const movementCategory = directionClassOf(row.receiptType);
      const { baseQtyIn, baseQtyOut } = netForWarehouse(row, warehouseView);
      const included = movementCategory !== 'UNKNOWN' && !row.conversionIssue;
      if (included) {
        b.closingBalance = round8(b.closingBalance + baseQtyIn - baseQtyOut);
        b.totalIn = round8(b.totalIn + baseQtyIn);
        b.totalOut = round8(b.totalOut + baseQtyOut);
      }
      const runningBalance = b.closingBalance;
      // Display side only: an unconvertible line still shows its ORIGINAL quantity in the column
      // its direction implies — it just never reaches the Base-Unit balances above.
      const shown = row.conversionIssue ? netForWarehouse({ ...row, conversionIssue: null }, warehouseView) : { baseQtyIn, baseQtyOut };
      const config = getReceiptTypeConfig(row.receiptType);
      const isTransfer = movementCategory === 'TRANSFER';
      return {
        itemId: row.itemId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        date: row.receiptDate,
        receiptNo: row.receiptNo,
        documentNo: row.documentNo,
        receiptType: row.receiptType,
        transactionType: config?.label ?? `Receipt Type ${row.receiptType}`,
        currentAccountCode: row.currentAccountCode,
        currentAccountName: row.currentAccountName,
        colorCode: row.colorCode,
        colorName: row.colorName,
        lotBatch: row.lotBatch,
        remarks: row.remarks,
        // Non-transfer: the one warehouse this line actually moved through. Transfer: null here —
        // its movement is expressed as Source/Destination instead, never a single "Warehouse".
        warehouseCode: !isTransfer ? (movementCategory === 'IN' ? row.inWarehouseCode : movementCategory === 'OUT' ? row.outWarehouseCode : null) : null,
        warehouseName: !isTransfer ? (movementCategory === 'IN' ? row.inWarehouseName : movementCategory === 'OUT' ? row.outWarehouseName : null) : null,
        sourceWarehouseCode: isTransfer ? row.outWarehouseCode : null,
        sourceWarehouseName: isTransfer ? row.outWarehouseName : null,
        destinationWarehouseCode: isTransfer ? row.inWarehouseCode : null,
        destinationWarehouseName: isTransfer ? row.inWarehouseName : null,
        // Original, as persisted — Unit/Quantity/Quantity In/Out are never converted.
        unit: row.unit,
        quantity: row.quantity,
        quantityIn: shown.baseQtyIn > 0 ? row.quantity : 0,
        quantityOut: shown.baseQtyOut > 0 ? row.quantity : 0,
        // The same line normalized into the reporting (Base) unit — the figure runningBalance and
        // the totals actually used. Null when it could not be normalized.
        baseQuantity: row.conversionIssue ? null : row.baseQuantity,
        conversionIssue: row.conversionIssue ? CONVERSION_ISSUE_MESSAGE[row.conversionIssue] : null,
        direction: movementCategory === 'IN' || movementCategory === 'OUT' ? movementCategory : null,
        movementCategory,
        includedInStockCalculation: included,
        // This row's ITEM's running balance, in that item's Base Unit (reportingUnit).
        runningBalance,
        reportingUnit: row.baseUnit,
      };
    });

    // Every unconvertible line in scope — including ones before From Date that the opening balance
    // had to skip — so a gap in the opening figure is never hidden just because it isn't displayed.
    const conversionIssues = [...beforeRange, ...displayed]
      .filter((r) => r.conversionIssue && directionClassOf(r.receiptType) !== 'UNKNOWN')
      .map((r) => ({
        lineId: r.lineId, receiptNo: r.receiptNo, receiptDate: r.receiptDate, itemCode: r.itemCode,
        unit: r.unit, quantity: r.quantity, reason: CONVERSION_ISSUE_MESSAGE[r.conversionIssue!],
      }));

    const totalsByItem = Array.from(byItem.values()).sort((a, b) => a.itemCode.localeCompare(b.itemCode));

    // One combined Stock In/Out/Balance only when every item in scope shares the same, known Base
    // Unit (always true for a single-item statement). Otherwise `totals` is null and only
    // totalsByItem is meaningful — never a sum of BAG + KG + PCS + MTR.
    const distinctUnits = new Set(totalsByItem.map((t) => t.unit ?? ''));
    const combinable = itemId != null || totalsByItem.length <= 1 || (distinctUnits.size === 1 && !distinctUnits.has(''));
    const reportingUnit = itemId != null ? (item?.unit || null) : combinable ? (totalsByItem[0]?.unit ?? null) : null;
    const sum = (k: 'openingBalance' | 'totalIn' | 'totalOut' | 'closingBalance') => round8(totalsByItem.reduce((s, t) => s + t[k], 0));
    const closingBalance = sum('closingBalance');
    const totals = combinable ? {
      openingBalance: sum('openingBalance'),
      totalIn: sum('totalIn'),
      totalOut: sum('totalOut'),
      closingBalance,
      // Kept for backward compatibility with the pre-existing field name this endpoint already
      // shipped with.
      closingBalanceFromTransactions: closingBalance,
      transactionCount: transactions.length,
    } : null;

    // Current Stock vs ledger closing: getStockOnHand() is always the item's WHOLE history,
    // company-wide. The ledger's closing covers that same scope — whatever the From Date, since
    // closing = opening + movements — unless a filter narrows it (To Date cuts off later
    // movements; color/lot/warehouse/type/document/account filters drop lines). Only then is the
    // comparison apples-to-apples; otherwise it's reported as not comparable, with the reason,
    // instead of a false "Differs".
    const scopeNarrowedBy = [
      filters.dateTo && 'To Date',
      filters.colorCardId && 'Color',
      filters.lotBatch && 'Lot/Batch',
      filters.warehouseId != null && 'Warehouse',
      filters.receiptType != null && 'Transaction Type',
      filters.documentOrReceiptNo?.trim() && 'Document/Receipt No',
      filters.currentAccountId != null && 'Current Account',
    ].filter(Boolean) as string[];
    const stockComparable = itemId != null && scopeNarrowedBy.length === 0;
    const soh = currentStockOnHand != null ? round8(currentStockOnHand) : null;

    return {
      item: item ? {
        id: item.id,
        inventoryCode: item.inventoryCode,
        inventoryName: item.inventoryName,
        inventoryType: item.inventoryType,
        unit: item.unit,
      } : null,
      // Always the module's one Stock on Hand engine, always company-wide, always independent of
      // every filter above. Null in multi-item mode (no single item to report one figure for).
      currentStockOnHand: soh,
      transactions,
      conversionIssues,
      reportingUnit,
      // Stock In/Out are MOVEMENT totals within the displayed range only (never include the
      // opening balance); closingBalance = openingBalance + totalIn - totalOut, in reportingUnit.
      totals,
      totalsByItem,
      // Numeric equality at the data's own numeric(28,8) scale (both sides already round8'd).
      stockComparable,
      stockComparisonScope: stockComparable ? null : itemId != null ? `Ledger filtered by ${scopeNarrowedBy.join(', ')} — Current Stock is the item's full company-wide history.` : null,
      stockReconciled: stockComparable ? soh === closingBalance : null,
      stockDifference: stockComparable ? round8((soh as number) - closingBalance) : null,
    };
  }

  // Detailed View — dimension-wise balances (spec: "Item + optional Color + Lot/Batch + Variant +
  // Warehouse"). Variant is intentionally omitted: IM_ReceiptItem has no real Variant column
  // anywhere (confirmed against the live table — the only "Variant" fields that exist at all are
  // free-text UI scaffolding on unrelated Purchase Order lines, never persisted here), so grouping
  // by it would fabricate a dimension no data backs. Groups by whichever of
  // {itemId, colorCardId, lotBatch, warehouseId} the caller enables via `dimensions`; Item is
  // always implicitly part of the key when itemId is omitted (multi-item scope), so multiple
  // items' balances are never summed together by accident.
  async getDetailedStatement(
    itemId: number | null,
    filters: ItemStatementFilters,
    dimensions: { color?: boolean; lot?: boolean; warehouse?: boolean },
  ) {
    const allRows = await this.fetchMovementRows(itemId, filters);
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;

    const docFilter = filters.documentOrReceiptNo?.trim().toLowerCase();
    const passesDisplayFilters = (r: RawMovementRow) => {
      if (filters.receiptType != null && r.receiptType !== filters.receiptType) return false;
      if (docFilter && !(r.receiptNo?.toLowerCase().includes(docFilter) || r.documentNo?.toLowerCase().includes(docFilter))) return false;
      if (filters.currentAccountId != null && r.currentAccountId !== filters.currentAccountId) return false;
      return true;
    };

    interface Bucket {
      itemId: number; itemCode: string; itemName: string;
      colorCode: string | null; colorName: string | null;
      lotBatch: string | null;
      warehouseCode: string | null; warehouseName: string | null;
      opening: number; in: number; out: number;
    }
    const buckets = new Map<string, Bucket>();
    const keyFor = (r: RawMovementRow, warehouseId: number | null) =>
      [r.itemId, dimensions.color ? r.colorCardId ?? '' : '', dimensions.lot ? r.lotBatch ?? '' : '', dimensions.warehouse ? warehouseId ?? '' : ''].join('::');
    const ensureBucket = (r: RawMovementRow, warehouseId: number | null, warehouseCode: string | null, warehouseName: string | null): Bucket => {
      const key = keyFor(r, warehouseId);
      let b = buckets.get(key);
      if (!b) {
        b = {
          itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName,
          colorCode: dimensions.color ? r.colorCode : null, colorName: dimensions.color ? r.colorName : null,
          lotBatch: dimensions.lot ? r.lotBatch : null,
          warehouseCode: dimensions.warehouse ? warehouseCode : null, warehouseName: dimensions.warehouse ? warehouseName : null,
          opening: 0, in: 0, out: 0,
        };
        buckets.set(key, b);
      }
      return b;
    };

    for (const row of allRows) {
      const isBefore = dateFrom ? new Date(row.receiptDate) < dateFrom : false;
      const inRange = !isBefore && (!dateTo || new Date(row.receiptDate) <= dateTo);
      if (!isBefore && !inRange) continue; // after dateTo — irrelevant to opening or in-range
      if (isBefore) {
        // Opening balance never applies the transaction-detail filters — see getStatement's own
        // comment for why.
      } else if (!passesDisplayFilters(row)) {
        continue;
      }

      if (!dimensions.warehouse) {
        const b = ensureBucket(row, null, null, null);
        const { baseQtyIn, baseQtyOut } = netForWarehouse(row, null);
        if (isBefore) b.opening += baseQtyIn - baseQtyOut; else { b.in += baseQtyIn; b.out += baseQtyOut; }
      } else {
        for (const c of contributionsFor(row)) {
          if (c.warehouseId == null) continue;
          const isOut = c.warehouseId === row.outWarehouseId;
          const b = ensureBucket(row, c.warehouseId, isOut ? row.outWarehouseCode : row.inWarehouseCode, isOut ? row.outWarehouseName : row.inWarehouseName);
          if (isBefore) b.opening += c.baseQtyIn - c.baseQtyOut; else { b.in += c.baseQtyIn; b.out += c.baseQtyOut; }
        }
      }
    }

    return Array.from(buckets.values())
      .map((b) => ({ ...b, opening: round8(b.opening), in: round8(b.in), out: round8(b.out), closing: round8(b.opening + b.in - b.out) }))
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode) || (a.warehouseCode ?? '').localeCompare(b.warehouseCode ?? ''));
  }
}
