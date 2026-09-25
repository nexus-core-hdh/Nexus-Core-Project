import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { AuditService, AUDIT_ACTIONS, hasRealChanges } from '../audit/audit.service';
import { WORK_ORDER_SCREEN_KEY } from './work-order.service';
import { screenKeyFor } from './inventory-receipt.service';

// Received Allocation — NOT a new entity, NOT a second allocation system. IM_ItemAllocation /
// IM_ItemAllocationHistory are real, pre-existing legacy tables (confirmed live via
// information_schema: 31/33 columns respectively, 0 rows each — first writer, exactly the same
// "raw SQL against a pre-existing legacy table" convention every other module in this file already
// uses), never touched by any code in this codebase before this file (confirmed via a whole-repo
// grep). Real FKs already on IM_ItemAllocation (confirmed via pg_constraint) tie it to
// IM_ReceiptItem (the SOURCE — a real, already-received receipt line), MA_WorkOrderItem (the
// TARGET — a real Work Order line), IM_Item/IM_ItemVariant (material/variant), FI_Account,
// MA_Requirement, IM_OrderReceiptItem, IM_DemandReceiptItem, IM_QuotationReceiptItem — this
// service only ever populates the subset a Planning row can genuinely resolve (see each method's
// own comment on which columns are left null and why, never guessed).
//
// This is a RESERVATION, not a stock transaction: it creates/updates exactly one IM_ItemAllocation
// row (plus one mirrored IM_ItemAllocationHistory row and one centralized AuditService entry) and
// never touches IM_Receipt/IM_ReceiptItem/any stock-ledger table. "Available to allocate" is
// ALWAYS derived live as (the receipt line's own real Quantity) minus (SUM of its own real,
// non-deleted IM_ItemAllocation rows) — never a second, independently-stored balance that could
// drift from the two real numbers it's computed from.

// Inbound-only receipt types eligible as an allocation SOURCE — material must have actually
// arrived before it can be reserved. The exact same real, curated ReceiptType values
// receipt-types.config.ts already establishes (2 = Purchase Receipt, 11 = Outside Process Receive
// Receipt) — never a new taxonomy. Outbound types (134 Outside Process Sent, 140 Manufacture
// Send) and return types (122, 12, 133) are deliberately excluded: they either haven't brought
// material in yet, or represent stock LEAVING — neither is a new available quantity to allocate
// FROM.
const ALLOCATABLE_RECEIPT_TYPES = [2, 11] as const;
// Receipt types that REDUCE a source line's allocatable quantity when linked to it via
// IM_ReceiptItem.PurchaseReceiptItemId (122 = Purchase Return — 'OUT' in receipt-types.config.ts's
// DIRECTION_CLASS). Outside Process Sent Return (133) is an IN type there, so it is not a reversal.
const RETURN_RECEIPT_TYPES = [122] as const;

export interface SaveAllocationDto {
  id?: number;
  inventoryReceiptItemId: number;
  workOrderId: number;
  inventoryId: number;
  colorCardId?: string | null;
  inventoryVariantId?: number | null;
  quantity: number;
  grossQuantity?: number | null;
}

@Injectable()
export class ItemAllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // A Work Order's real "primary" Style Info line — work-order.service.ts's own listItems(),
  // ordered by ItemOrderNo/RecId — the SAME primary-line convention already established and
  // reused throughout this session (fabric-yarn-requirements.service.ts's own
  // getManufacturingQuantityTotals, and the Planning-prefill Work Order fix earlier this session),
  // never a second/invented resolver.
  async resolvePrimaryWorkOrderItemId(workOrderId: number): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id FROM "MA_WorkOrderItem"
      WHERE "WorkOrderId" = ${workOrderId} AND "IsDeleted" = 0
      ORDER BY "ItemOrderNo", "RecId" LIMIT 1
    `);
    return rows.length ? Number(rows[0].id) : null;
  }

  // Available-to-allocate receipts for one Planning row: the SOURCE is any real, inbound receipt line
  // for this Inventory Item in the Work Order's own company — Purchase Receipt (2) / Outside Process
  // Receive (11). The Work Order is the allocation TARGET only; it is deliberately NOT a source-
  // ownership filter (a receipt line's WorkOrderReceiptItemId is usually NULL — general inventory
  // received before/without being tied to an order, exactly like every YARN-00004 line in the live DB —
  // and requiring it to equal this Work Order's item is what previously hid every such receipt).
  // Same join/soft-delete/approval semantics as Item Statement's fetchMovementRows (receipt + line not
  // deleted; a receipt whose approval is not yet 'approved' is not real stock and is excluded).
  // Colour: an exact-colour receipt matches only that colour; a receipt with NO colour is
  // common/general stock and stays allocatable to any colour. Available = received − approved
  // Purchase Returns linked to that line (PurchaseReceiptItemId) − live allocations on that line.
  async listAvailableReceipts(workOrderId: number, inventoryId: number, colorCardId?: string | null) {
    const woRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "CompanyId" as "companyId" FROM "MA_WorkOrder" WHERE "RecId" = ${workOrderId} AND "IsDeleted" = 0
    `);
    if (!woRows.length) throw new NotFoundException('Work order not found');
    const colorFilter = colorCardId ? Prisma.sql`AND (ri."ColorCardId" IS NULL OR ri."ColorCardId" = ${colorCardId})` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        ri."RecId" as id,
        ri."InventoryReceiptId" as "receiptId",
        ri."InventoryId" as "inventoryId",
        i."InventoryCode" as "inventoryCode",
        i."InventoryName" as "inventoryName",
        ri."ColorCardId" as "colorCardId",
        cc.code as "colorCode",
        cc.name as "colorName",
        ri."UnitId" as "unitId",
        usi."UnitName" as unit,
        r."ReceiptDate" as "receiptDate",
        r."ReceiptType" as "receiptType",
        st."SubcontractTypeName" as subcontractor,
        r."ReceiptNo" as "receiptNo",
        r."DocumentNo" as "documentNo",
        wh."WarehouseCode" as warehouse,
        ri."PartyNo" as "partyNo",
        ri."SpecialCode" as "specialCode",
        ri."Explanation" as explanation,
        acc."CurrentAccountCode" as "currentAccountCode",
        acc."CurrentAccountName" as "currentAccountName",
        wo."RecId" as "workOrderId",
        wo."WorkOrderNo" as "workOrderNo",
        wi."RecId" as "workOrderItemId",
        sc."styleNumber" as "styleCode",
        sc."title" as "styleName",
        ri."Quantity" as "receivedQuantity",
        COALESCE(ret."returnedQty", 0) as "returnedQuantity",
        COALESCE(alloc."totalQty", 0) as "totalAllocatedQuantity",
        COALESCE(alloc."currentQty", 0) as "currentWorkOrderAllocatedQuantity"
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" AND r."IsDeleted" = 0
      JOIN "IM_Item" i ON i."RecId" = ri."InventoryId" AND i."IsDeleted" = 0
      LEFT JOIN "MD_SubcontractType" st ON st."RecId" = r."SubcontractTypeId"
      LEFT JOIN "FI_Account" acc ON acc."RecId" = r."CurrentAccountId"
      LEFT JOIN "IM_Warehouse" wh ON wh."RecId" = r."InWarehouseId"
      LEFT JOIN "MD_UnitSetItem" usi ON usi."RecId" = ri."UnitId"
      LEFT JOIN "MA_WorkOrderItem" wi ON wi."RecId" = ri."WorkOrderReceiptItemId" AND wi."IsDeleted" = 0
      LEFT JOIN "MA_WorkOrder" wo ON wo."RecId" = wi."WorkOrderId" AND wo."IsDeleted" = 0
      LEFT JOIN "StyleCard" sc ON sc.id = wo."StyleCardId"
      LEFT JOIN "ColorCard" cc ON cc.id = ri."ColorCardId"
      LEFT JOIN LATERAL (
        SELECT SUM(rl."Quantity") as "returnedQty" FROM "IM_ReceiptItem" rl
        JOIN "IM_Receipt" rr ON rr."RecId" = rl."InventoryReceiptId" AND rr."IsDeleted" = 0
        WHERE rl."PurchaseReceiptItemId" = ri."RecId" AND rl."IsDeleted" = 0 AND rr."ReceiptType" IN (${Prisma.join(RETURN_RECEIPT_TYPES)})
          AND NOT EXISTS (SELECT 1 FROM "ApprovalRequest" ar WHERE ar."screenKey" = ${screenKeyFor(122)} AND ar."transactionId" = rr."RecId"::text AND ar."status" <> 'approved')
      ) ret ON true
      LEFT JOIN LATERAL (
        -- totalQty = every live allocation of this receipt line to ANY Work Order; currentQty = only
        -- those whose target line belongs to THIS Work Order. The target line is resolved through
        -- MA_WorkOrderItem WITHOUT an IsDeleted filter: Style Info saves soft-delete and recreate the
        -- Work Order's lines, so an older allocation can point at a soft-deleted line of the same order.
        SELECT SUM(a."Quantity") as "totalQty",
               SUM(a."Quantity") FILTER (WHERE awi."WorkOrderId" = ${workOrderId}) as "currentQty"
        FROM "IM_ItemAllocation" a
        LEFT JOIN "MA_WorkOrderItem" awi ON awi."RecId" = a."WorkOrderItemId"
        WHERE a."InventoryReceiptItemId" = ri."RecId" AND a."IsDeleted" = 0
      ) alloc ON true
      WHERE ri."InventoryId" = ${inventoryId}
        AND ri."IsDeleted" = 0
        AND r."CompanyId" = ${woRows[0].companyId}
        AND r."ReceiptType" IN (${Prisma.join(ALLOCATABLE_RECEIPT_TYPES)})
        AND ${this.notPendingApprovalSql(Prisma.sql`r`)}
        ${colorFilter}
      ORDER BY r."ReceiptDate" DESC, ri."RecId" DESC
    `);
    return sanitizeRawRow(rows).map((r: any) => ({
      ...r,
      isCommonColor: r.colorCardId == null,
      // Global remaining: received − returned − allocated to ALL Work Orders. Another order's allocation
      // therefore reduces what is left, and this order's own allocation is shown separately.
      availableQuantity: Math.max(0, Number(r.receivedQuantity) - Number(r.returnedQuantity) - Number(r.totalAllocatedQuantity)),
    }));
  }

  // A receipt whose approval request exists and is not 'approved' has not really arrived yet — the
  // same rule Item Statement applies to Purchase Receipt/Return, extended here to every allocatable
  // source type (Outside Process Receive also has approval requests in the live data).
  private notPendingApprovalSql(r: Prisma.Sql) {
    return Prisma.sql`(
      (${r}."ReceiptType" = 2 AND NOT EXISTS (SELECT 1 FROM "ApprovalRequest" ar WHERE ar."screenKey" = ${screenKeyFor(2)} AND ar."transactionId" = ${r}."RecId"::text AND ar."status" <> 'approved'))
      OR (${r}."ReceiptType" = 11 AND NOT EXISTS (SELECT 1 FROM "ApprovalRequest" ar WHERE ar."screenKey" = ${screenKeyFor(11)} AND ar."transactionId" = ${r}."RecId"::text AND ar."status" <> 'approved'))
    )`;
  }

  // Real, already-persisted allocations for this exact Planning scope — lets the dialog show what
  // already exists (to edit/delete) instead of only ever creating new rows.
  async listAllocations(workOrderId: number, inventoryId: number, colorCardId?: string | null) {
    const itemIds = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId}
    `);
    const ids = itemIds.map((r) => Number(r.id));
    if (!ids.length) return [];
    const colorFilter = colorCardId ? Prisma.sql`AND a."InventoryVariantId" IS NOT DISTINCT FROM a."InventoryVariantId"` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        a."RecId" as id, a."InventoryReceiptItemId" as "inventoryReceiptItemId",
        a."WorkOrderItemId" as "workOrderItemId", a."InventoryId" as "inventoryId",
        a."InventoryVariantId" as "inventoryVariantId", a."Quantity" as quantity,
        a."GrossQuantity" as "grossQuantity", a."RequirementId" as "requirementId",
        r."ReceiptNo" as "receiptNo", r."ReceiptType" as "receiptType"
      FROM "IM_ItemAllocation" a
      JOIN "IM_ReceiptItem" ri ON ri."RecId" = a."InventoryReceiptItemId"
      JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId"
      WHERE a."WorkOrderItemId" IN (${Prisma.join(ids)}) AND a."InventoryId" = ${inventoryId} AND a."IsDeleted" = 0
      ${colorFilter}
    `);
    return sanitizeRawRow(rows);
  }


  // "View Allocations" — one receipt line's real header + EVERY live allocation of it, to whichever
  // Work Order owns each. All from IM_ItemAllocation (source InventoryReceiptItemId -> target
  // WorkOrderItemId -> MA_WorkOrder); nothing synthetic. Target colour: IM_ItemAllocation has no colour
  // column of its own (InventoryVariantId is null for Style-based Work Orders), so the colour shown is the
  // ColorCardId of the MA_Requirement the allocation was linked to (RequirementId), or null when none.
  // "Created By" is resolved from the allocation's own create AuditLog row (InsertedBy is only the
  // legacy numeric id and cannot be mapped to a User).
  async getReceiptItemAllocations(receiptItemId: number) {
    const heads = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ri."RecId" as id, ri."InventoryReceiptId" as "receiptId", r."ReceiptNo" as "receiptNo", r."DocumentNo" as "documentNo",
             r."ReceiptDate" as "receiptDate", r."ReceiptType" as "receiptType", st."SubcontractTypeName" as subcontractor,
             i."RecId" as "inventoryId", i."InventoryCode" as "inventoryCode", i."InventoryName" as "inventoryName",
             ri."ColorCardId" as "colorCardId", cc.code as "colorCode", cc.name as "colorName",
             usi."UnitName" as unit, wh."WarehouseCode" as warehouse, ri."Quantity" as "receivedQuantity",
             COALESCE((
               SELECT SUM(rl."Quantity") FROM "IM_ReceiptItem" rl JOIN "IM_Receipt" rr ON rr."RecId" = rl."InventoryReceiptId" AND rr."IsDeleted" = 0
               WHERE rl."PurchaseReceiptItemId" = ri."RecId" AND rl."IsDeleted" = 0 AND rr."ReceiptType" IN (${Prisma.join(RETURN_RECEIPT_TYPES)})
                 AND NOT EXISTS (SELECT 1 FROM "ApprovalRequest" ar WHERE ar."screenKey" = ${screenKeyFor(122)} AND ar."transactionId" = rr."RecId"::text AND ar."status" <> 'approved')
             ), 0) as "returnedQuantity"
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" AND r."IsDeleted" = 0
      JOIN "IM_Item" i ON i."RecId" = ri."InventoryId"
      LEFT JOIN "MD_SubcontractType" st ON st."RecId" = r."SubcontractTypeId"
      LEFT JOIN "ColorCard" cc ON cc.id = ri."ColorCardId"
      LEFT JOIN "MD_UnitSetItem" usi ON usi."RecId" = ri."UnitId"
      LEFT JOIN "IM_Warehouse" wh ON wh."RecId" = r."InWarehouseId"
      WHERE ri."RecId" = ${receiptItemId} AND ri."IsDeleted" = 0
    `);
    if (!heads.length) throw new NotFoundException('Receipt line not found.');
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT a."RecId" as id, a."Quantity" as quantity, a."InsertedAt" as "allocationDate", a."IsReturned" as "isReturned",
             a."WorkOrderItemId" as "workOrderItemId", wi."ItemOrderNo" as "itemOrderNo",
             wo."RecId" as "workOrderId", wo."WorkOrderNo" as "workOrderNo",
             sc."styleNumber" as "styleCode", sc."title" as "styleName",
             cust."CurrentAccountCode" as "customerCode", cust."CurrentAccountName" as "customerName",
             rcc.code as "colorCode", rcc.name as "colorName",
             cb.name as "createdBy"
      FROM "IM_ItemAllocation" a
      LEFT JOIN "MA_WorkOrderItem" wi ON wi."RecId" = a."WorkOrderItemId"
      LEFT JOIN "MA_WorkOrder" wo ON wo."RecId" = wi."WorkOrderId"
      LEFT JOIN "StyleCard" sc ON sc.id = wo."StyleCardId"
      LEFT JOIN "FI_Account" cust ON cust."RecId" = wo."CurrentAccountId"
      LEFT JOIN "MA_Requirement" rq ON rq."RecId" = a."RequirementId"
      LEFT JOIN "ColorCard" rcc ON rcc.id = rq."ColorCardId"
      LEFT JOIN LATERAL (
        SELECT u.name FROM "AuditLog" al JOIN "User" u ON u.id = al."changedBy"
        WHERE al."entityType" = 'ItemAllocation' AND al."entityId" = a."RecId"::text AND al.action = 'create'
        ORDER BY al."createdAt" LIMIT 1
      ) cb ON true
      WHERE a."InventoryReceiptItemId" = ${receiptItemId} AND a."IsDeleted" = 0
      ORDER BY a."RecId"
    `);
    const head: any = sanitizeRawRow(heads[0]);
    const allocations = sanitizeRawRow(rows).map((r: any) => ({ ...r, unit: head.unit }));
    const totalAllocated = allocations.reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0);
    return {
      ...head,
      totalAllocatedQuantity: totalAllocated,
      globalAvailableQuantity: Math.max(0, Number(head.receivedQuantity) - Number(head.returnedQuantity) - totalAllocated),
      allocations,
    };
  }

  // Sum of every real, non-deleted allocation already made against one receipt line — the single
  // source of truth "available to allocate" is always derived from (never a second, cached
  // number). `excludeId` lets an UPDATE compute what would remain available if the row being
  // edited's own current quantity were first backed out (otherwise editing a row's own quantity
  // upward would always appear blocked by its own prior value).
  private async allocatedSumForReceiptItem(client: Prisma.TransactionClient | PrismaService, inventoryReceiptItemId: number, excludeId?: number): Promise<number> {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await client.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM("Quantity"), 0) as s FROM "IM_ItemAllocation"
      WHERE "InventoryReceiptItemId" = ${inventoryReceiptItemId} AND "IsDeleted" = 0 ${exclude}
    `);
    return Number(rows[0]?.s) || 0;
  }

  // CREATE-or-UPDATE — never a duplicate row for the same (InventoryReceiptItemId,
  // WorkOrderItemId, InventoryId, InventoryVariantId) combination (Section "Duplicate Protection"):
  // an existing match is UPDATEd in place; only a genuinely new combination INSERTs. Runs inside
  // one transaction with the target receipt line row-locked (`FOR UPDATE`) for its whole duration,
  // so two concurrent Saves against the SAME receipt line serialize instead of both reading a
  // stale "available" figure and jointly over-allocating (Section "prevent race-condition
  // over-allocation").
  async saveAllocation(dto: SaveAllocationDto, userId: string, companyId: string) {
    if (!(dto.quantity > 0)) throw new BadRequestException('Allocation Qty must be greater than zero.');

    return this.prisma.$transaction(async (tx) => {
      const receiptRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT ri."RecId" as id, ri."InventoryId" as "inventoryId", ri."Quantity" as quantity,
          ri."ColorCardId" as "colorCardId", r."ReceiptType" as "receiptType", r."CompanyId" as "companyId"
        FROM "IM_ReceiptItem" ri
        JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" AND r."IsDeleted" = 0
        WHERE ri."RecId" = ${dto.inventoryReceiptItemId} AND ri."IsDeleted" = 0 AND ${this.notPendingApprovalSql(Prisma.sql`r`)}
        FOR UPDATE OF ri
      `);
      const receipt = receiptRows[0];
      if (!receipt) throw new NotFoundException('Receipt line not found.');
      if (!ALLOCATABLE_RECEIPT_TYPES.includes(Number(receipt.receiptType) as any)) {
        throw new BadRequestException('This receipt type cannot be allocated from.');
      }
      if (Number(receipt.inventoryId) !== Number(dto.inventoryId)) {
        throw new BadRequestException('This receipt line is for a different Inventory Item.');
      }

      if (dto.colorCardId && receipt.colorCardId && receipt.colorCardId !== dto.colorCardId) {
        throw new BadRequestException('This receipt line is for a different colour.');
      }
      const woCompany = await tx.$queryRaw<any[]>(Prisma.sql`SELECT "CompanyId" as c FROM "MA_WorkOrder" WHERE "RecId" = ${dto.workOrderId} AND "IsDeleted" = 0`);
      if (!woCompany.length) throw new NotFoundException('Work order not found');
      if (Number(woCompany[0].c) !== Number(receipt.companyId)) throw new BadRequestException('This receipt belongs to a different company.');

      const workOrderItemId = await this.resolvePrimaryWorkOrderItemId(dto.workOrderId);
      if (!workOrderItemId) throw new NotFoundException('This Work Order has no resolvable line to allocate against.');

      const existingRows = dto.id
        ? await tx.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "IM_ItemAllocation" WHERE "RecId" = ${dto.id} AND "IsDeleted" = 0`)
        : await tx.$queryRaw<any[]>(Prisma.sql`
            SELECT * FROM "IM_ItemAllocation"
            WHERE "InventoryReceiptItemId" = ${dto.inventoryReceiptItemId} AND "WorkOrderItemId" = ${workOrderItemId}
              AND "InventoryId" = ${dto.inventoryId}
              AND "InventoryVariantId" IS NOT DISTINCT FROM ${dto.inventoryVariantId ?? null}
              AND "IsDeleted" = 0
          `);
      const existing = existingRows[0] ?? null;

      const alreadyAllocated = await this.allocatedSumForReceiptItem(tx, dto.inventoryReceiptItemId, existing?.RecId);
      const returnedRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(SUM(rl."Quantity"), 0) as s FROM "IM_ReceiptItem" rl
        JOIN "IM_Receipt" rr ON rr."RecId" = rl."InventoryReceiptId" AND rr."IsDeleted" = 0
        WHERE rl."PurchaseReceiptItemId" = ${dto.inventoryReceiptItemId} AND rl."IsDeleted" = 0 AND rr."ReceiptType" IN (${Prisma.join(RETURN_RECEIPT_TYPES)})
          AND NOT EXISTS (SELECT 1 FROM "ApprovalRequest" ar WHERE ar."screenKey" = ${screenKeyFor(122)} AND ar."transactionId" = rr."RecId"::text AND ar."status" <> 'approved')
      `);
      const available = Number(receipt.quantity) - (Number(returnedRows[0]?.s) || 0) - alreadyAllocated;
      if (dto.quantity > available) {
        throw new ConflictException(`Allocation Qty (${dto.quantity}) exceeds this receipt's available quantity (${available}).`);
      }

      // Optional secondary guard — only when a real, PERSISTED Requirement row exists for this
      // exact (Work Order Line, Inventory, Material Color) scope (MA_Requirement, written by the
      // Fabric/Trim/Yarn Requirements screen's own Save — see that service's own comment). A Work
      // Order whose Requirements were never saved has no such row, so this is silently skipped
      // ("where applicable" — never a fabricated ceiling).
      const colorFilter = dto.colorCardId ? Prisma.sql`"ColorCardId" = ${dto.colorCardId}` : Prisma.sql`"ColorCardId" IS NULL`;
      const reqRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT "RecId" as id, "Quantity" as quantity FROM "MA_Requirement"
        WHERE "WorkOrderItemId" = ${workOrderItemId} AND "InventoryId" = ${dto.inventoryId} AND ${colorFilter} AND "IsDeleted" = 0
        LIMIT 1
      `);
      let requirementId: number | null = null;
      if (reqRows.length) {
        requirementId = Number(reqRows[0].id);
        const reqAllocatedRows = await tx.$queryRaw<any[]>(Prisma.sql`
          SELECT COALESCE(SUM("Quantity"), 0) as s FROM "IM_ItemAllocation"
          WHERE "RequirementId" = ${requirementId} AND "IsDeleted" = 0 ${existing ? Prisma.sql`AND "RecId" != ${existing.RecId}` : Prisma.sql``}
        `);
        const reqAvailable = Number(reqRows[0].quantity) - (Number(reqAllocatedRows[0]?.s) || 0);
        if (dto.quantity > reqAvailable) {
          throw new ConflictException(`Allocation Qty (${dto.quantity}) exceeds this Work Order line's remaining requirement (${reqAvailable}).`);
        }
      }

      const grossQuantity = dto.grossQuantity ?? dto.quantity;
      let recId: number;
      let action: 'create' | 'update';
      if (existing) {
        action = 'update';
        recId = Number(existing.RecId);
        await tx.$executeRaw`
          UPDATE "IM_ItemAllocation" SET
            "Quantity" = ${dto.quantity}, "GrossQuantity" = ${grossQuantity}, "RequirementId" = ${requirementId},
            "InventoryVariantId" = ${dto.inventoryVariantId ?? null},
            "UpdatedAt" = now(), "UpdatedBy" = ${Number(userId) || 1}
          WHERE "RecId" = ${recId}
        `;
      } else {
        action = 'create';
        const inserted = await tx.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_ItemAllocation" (
            "InventoryReceiptType", "InventoryReceiptItemId", "WorkOrderItemId", "InventoryId",
            "InventoryVariantId", "RequirementId", "ReceiptDate", "Quantity", "GrossQuantity",
            "InsertedAt", "InsertedBy", "IsDeleted", "UUID"
          ) VALUES (
            ${Number(receipt.receiptType)},
            ${dto.inventoryReceiptItemId}, ${workOrderItemId}, ${dto.inventoryId},
            ${dto.inventoryVariantId ?? null}, ${requirementId}, now(), ${dto.quantity}, ${grossQuantity},
            now(), ${Number(userId) || 1}, 0, gen_random_uuid()
          )
          RETURNING "RecId" as id
        `);
        recId = Number(inserted[0].id);
      }

      // Mirror into IM_ItemAllocationHistory — the real, pre-existing per-write history table this
      // schema already provides for this exact entity (confirmed via pg_catalog: AllocationId FK
      // back to IM_ItemAllocation, same column set). RowStatus follows this file's own documented
      // convention (1=Created, 2=Updated, 3=Deleted — this table has never been written before, so
      // there is no pre-existing convention to conform to; same "assign one, document it" pattern
      // this codebase already uses for REQUIREMENT_TYPE/RECIPE_TYPE_BY_LINE_TYPE elsewhere).
      await tx.$executeRaw`
        INSERT INTO "IM_ItemAllocationHistory" (
          "AllocationId", "RowStatus", "InventoryReceiptItemId", "WorkOrderItemId", "InventoryId",
          "InventoryVariantId", "RequirementId", "ReceiptDate", "Quantity", "GrossQuantity",
          "InsertedAt", "InsertedBy", "IsDeleted", "UUID"
        ) VALUES (
          ${recId}, ${action === 'create' ? 1 : 2}, ${dto.inventoryReceiptItemId}, ${workOrderItemId}, ${dto.inventoryId},
          ${dto.inventoryVariantId ?? null}, ${requirementId}, now(), ${dto.quantity}, ${grossQuantity},
          now(), ${Number(userId) || 1}, 0, gen_random_uuid()
        )
      `;

      const afterRows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "IM_ItemAllocation" WHERE "RecId" = ${recId}`);
      const after = sanitizeRawRow(afterRows[0]);
      const beforeSnapshot = existing ? sanitizeRawRow(existing) : null;

      // Audit only a REAL create or a REAL change — never an unchanged re-save (Section "Do not
      // generate audit logs for... unchanged saves"). UpdatedAt/UpdatedBy are excluded from the
      // comparison since this method's own UPDATE branch always re-stamps them even when the
      // allocation's real business fields (Quantity/GrossQuantity/RequirementId/
      // InventoryVariantId) didn't change — the same hasRealChanges gate/reasoning
      // work-order.service.ts's own update() already established for this exact "no-op save must
      // never fabricate a false audit event" rule.
      if (action === 'create' || hasRealChanges(beforeSnapshot, after, ['UpdatedAt', 'UpdatedBy'])) {
        const woRows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT "WorkOrderNo" as "workOrderNo" FROM "MA_WorkOrder" WHERE "RecId" = ${dto.workOrderId}`);
        await this.audit.record({
          userId, companyId, screenKey: WORK_ORDER_SCREEN_KEY,
          entityType: 'ItemAllocation', entityId: String(recId), action: action === 'create' ? AUDIT_ACTIONS.CREATE : AUDIT_ACTIONS.UPDATE,
          documentNo: woRows[0]?.workOrderNo ?? null,
          parentEntityType: 'WorkOrder', parentEntityId: String(dto.workOrderId), parentDocumentNo: woRows[0]?.workOrderNo ?? null,
          before: beforeSnapshot ?? undefined,
          after,
        }, tx);
      }

      // HTTP response uses a normalized camelCase shape (same convention every other endpoint in
      // this module returns) — the raw PascalCase `after`/`beforeSnapshot` above stay exactly as
      // queried since AuditService's own hasRealChanges compares them as a matched pair; only the
      // caller-facing payload needed remapping.
      return {
        id: recId,
        inventoryReceiptItemId: after.InventoryReceiptItemId,
        workOrderItemId: after.WorkOrderItemId,
        inventoryId: after.InventoryId,
        inventoryVariantId: after.InventoryVariantId,
        requirementId: after.RequirementId,
        quantity: after.Quantity,
        grossQuantity: after.GrossQuantity,
      };
    });
  }

  async deleteAllocation(id: number, userId: string, companyId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "IM_ItemAllocation" WHERE "RecId" = ${id} AND "IsDeleted" = 0 FOR UPDATE`);
      const before = rows[0];
      if (!before) throw new NotFoundException('Allocation not found.');

      await tx.$executeRaw`
        UPDATE "IM_ItemAllocation" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${Number(userId) || 1} WHERE "RecId" = ${id}
      `;
      await tx.$executeRaw`
        INSERT INTO "IM_ItemAllocationHistory" (
          "AllocationId", "RowStatus", "InventoryReceiptItemId", "WorkOrderItemId", "InventoryId",
          "InventoryVariantId", "RequirementId", "ReceiptDate", "Quantity", "GrossQuantity",
          "InsertedAt", "InsertedBy", "IsDeleted", "UUID"
        ) VALUES (
          ${id}, 3, ${before.InventoryReceiptItemId}, ${before.WorkOrderItemId}, ${before.InventoryId},
          ${before.InventoryVariantId}, ${before.RequirementId}, now(), ${before.Quantity}, ${before.GrossQuantity},
          now(), ${Number(userId) || 1}, 0, gen_random_uuid()
        )
      `;

      const woItemRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT wo."RecId" as "workOrderId", wo."WorkOrderNo" as "workOrderNo"
        FROM "MA_WorkOrderItem" wi JOIN "MA_WorkOrder" wo ON wo."RecId" = wi."WorkOrderId"
        WHERE wi."RecId" = ${before.WorkOrderItemId}
      `);
      await this.audit.record({
        userId, companyId, screenKey: WORK_ORDER_SCREEN_KEY,
        entityType: 'ItemAllocation', entityId: String(id), action: AUDIT_ACTIONS.DELETE,
        documentNo: woItemRows[0]?.workOrderNo ?? null,
        parentEntityType: 'WorkOrder', parentEntityId: woItemRows[0]?.workOrderId != null ? String(woItemRows[0].workOrderId) : null,
        parentDocumentNo: woItemRows[0]?.workOrderNo ?? null,
        before: sanitizeRawRow(before),
      }, tx);

      return { message: 'Deleted' };
    });
  }

  // Batched (Work Order, Inventory) -> total allocated quantity — the SAME shape
  // fabric-planning.service.ts's own aggregatePurchase/aggregateReceipts already use, reused by
  // Fabric/Yarn/Trim Planning to show a real "Allocated" column without a per-row request.
  async aggregateAllocations(workOrderIds: number[], inventoryIds: number[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!workOrderIds.length || !inventoryIds.length) return out;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT wi."WorkOrderId" as "workOrderId", a."InventoryId" as "inventoryId", SUM(a."Quantity") as qty
      FROM "IM_ItemAllocation" a
      JOIN "MA_WorkOrderItem" wi ON wi."RecId" = a."WorkOrderItemId" AND wi."IsDeleted" = 0
      WHERE a."IsDeleted" = 0 AND wi."WorkOrderId" IN (${Prisma.join(workOrderIds)}) AND a."InventoryId" IN (${Prisma.join(inventoryIds)})
      GROUP BY wi."WorkOrderId", a."InventoryId"
    `);
    for (const r of sanitizeRawRow(rows)) out.set(`${r.workOrderId}:${r.inventoryId}`, Number(r.qty) || 0);
    return out;
  }
}
