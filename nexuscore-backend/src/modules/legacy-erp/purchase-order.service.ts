import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { ApprovalService } from '../approval/approval.service';
import { screenKeyFor as receiptScreenKeyFor } from './inventory-receipt.service';
import { ReceiptTraceabilityService } from './receipt-traceability.service';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';
import { resolveLineUnitId, assertValidItemUnit, assertHasBaseUnit, baseQuantitySql, baseQuantityJoinSql, fromBaseQuantitySql } from './unit-conversion.util';
import { DeleteDependencyService } from './delete-dependency.service';
import { assertAllNonNegative } from './numeric-guards.util';
import { AuditService, AUDIT_ACTIONS, hasRealChanges, enrichDisplayRefs, FkResolver } from '../audit/audit.service';

// Purchase Order — NOT a new entity. IM_OrderReceipt/IM_OrderReceiptItem are the same
// generic "goods receipt" spine the legacy system uses for every receipt kind (Purchase
// Order, Sales Order, returns, ...), differentiated only by ReceiptType — an undocumented
// smallint with no lookup/enum table in the migrated schema (confirmed via pg_catalog: no
// FK, no CHECK, no seed data). The value is not a guess: the reference screenshot's own tab
// title reads "Order Receipt [1-Purchase Order] - ...", i.e. the legacy system's own
// ReceiptType=1 -> "Purchase Order" label pairing. Both tables, plus IM_OrderReceiptItem's
// real FK columns (InventoryId -> IM_Item, UnitId -> MD_UnitSetItem, ForexId -> MD_Forex),
// already existed in the migrated schema before this — confirmed 0 rows, so this is the
// first writer, not a duplicate of anything.
const HEADER_TABLE = 'IM_OrderReceipt';
const ITEM_TABLE = 'IM_OrderReceiptItem';
const RECEIPT_TYPE = 1; // "[1-Purchase Order]" — see comment above

// Order Screen Replication (mirrors inventory-receipt.service.ts's own screenKeyFor() for the
// 18 IM_Receipt-backed types) — every method below now takes `receiptType`/`numberPrefix` as
// plain parameters (defaulting to Purchase Order's existing values), so Subcontract Order
// (ReceiptType=3 — see order-types.config.ts) reuses this exact same service/SQL instead of a
// second copy. Purchase Order keeps its own dedicated /purchase-orders(-list) routes; Subcontract
// Order gets its own dedicated /subcontract-orders(-list) routes (order-type.controller.ts) —
// each screenKey matches its screen's real MenuItem.href exactly, same convention as everywhere
// else in this module.
export const screenKeyFor = (receiptType: number): string => {
  if (receiptType === RECEIPT_TYPE) return '/dashboard/legacy-erp/purchase-orders-list';
  if (receiptType === 3) return '/dashboard/legacy-erp/subcontract-orders-list';
  return `/dashboard/legacy-erp/purchase-orders-list?receiptType=${receiptType}`;
};

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source).
// IsApproved/ApprovedAt/ApprovedBy/IsRejected/RejectedAt/RejectedBy/RejectedExplanation are
// real, pre-existing IM_OrderReceipt columns (confirmed via information_schema — the migrated
// schema already had a full approve/reject shape for Purchase Order, richer than IM_Receipt's
// own IsApproved-only flag) that no writer ever selected/populated before this pass. Added here
// purely as this screen's own existing-column "current status" mirror of the real source of
// truth (ApprovalRequest.status, via ApprovalService) — exactly the same role IM_Receipt's own
// IsApproved already plays for Inventory Receipt. No schema change.
export const HEADER_COLUMNS = [
  'ReceiptNo', 'ReceiptType', 'ReceiptDate', 'DocumentNo',
  'CurrentAccountId', 'WarehouseId', 'ForexId',
  'SubTotal', 'VatAmount', 'GrandTotal',
  'IsApproved', 'ApprovedAt', 'ApprovedBy', 'IsRejected', 'RejectedAt', 'RejectedBy', 'RejectedExplanation',
] as const;

// Grid columns (Type/Code via InventoryId or ServiceCardId depending on ItemType/Quantity/
// Unit/Rate/Forex/VAT/Item Amount/Received/Manufacturing Order/Work Order No) plus a handful
// of extended fields surfaced on the screen's "Detail" tab for whichever line is selected
// (DeliveryDate/CustomerOrderNo/PartyNo/Explanation/SpecialCode) — all pre-existing
// IM_OrderReceiptItem columns, no new ones except two: ColorCardId (added earlier — no color
// column existed at all) and ManufacturingOrderId (added now — the existing
// ManufacturingOrderNo column was bare free text with no FK; a new nullable FK to the
// already-existing, already-populated-in-schema MA_WorkOrder master was added instead of
// reusing WorkOrderReceiptItemId, which already means something else: a specific
// MA_WorkOrderItem line, not an MA_WorkOrder header). ServiceCardId needed no migration — it
// was already a live FK on this table (-> SM_Service), just never populated by any writer
// until now (Type=Service).
const ITEM_COLUMNS = [
  'ItemOrderNo', 'ItemType', 'InventoryId', 'ServiceCardId', 'UnitId', 'Quantity', 'GrossQuantity',
  'UnitPrice', 'ForexId', 'ForexRate', 'ForexUnitPrice',
  'VatIncluded', 'VatRate', 'VatAmount', 'ItemTotal', 'NetItemTotal',
  'ReceivedQuantity', 'ManufacturingOrderNo', 'ManufacturingOrderId', 'WorkOrderReceiptItemId', 'ColorCardId',
  'DeliveryDate', 'CustomerOrderNo', 'PartyNo', 'Explanation', 'SpecialCode',
] as const;

// Type dropdown: no lookup/enum table exists for "item type" in the migrated schema
// (confirmed via pg_catalog — ItemType is a bare smallint, no FK, no CHECK) and the reference
// screen only ever showed "Inventory", so these three values are a business-level convention
// defined here, not read from a master table — the one deliberate exception the spec itself
// allows ("do not hardcode dropdown values except where explicitly mentioned").
const ITEM_TYPE_SERVICE = 2;

// Per-line variant breakdown (the grid's Variant2 column) — a real one-to-many relationship,
// not a scalar field: IM_ItemVariant already defines every composite Variant1..5 combination
// that exists for a given inventory item (confirmed live: 0 rows today because no inventory
// item is currently variant-enabled, but the schema is real and pre-existing), and
// IM_OrderReceiptItem's own IM_OrderReceiptItemVariant child table (also pre-existing, 0
// rows) is exactly where a line's quantity gets split across those combinations. Both tables
// already existed before this — no migration, no new columns.
const ITEM_VARIANT_TABLE = 'IM_OrderReceiptItemVariant';
const ITEM_VARIANT_COLUMNS = ['InventoryId', 'InventoryVariantId', 'Quantity', 'NetUnitPrice', 'ReceivedQuantity'] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
// "ReceiptType" selected here (alongside OrderReceiptId) purely so item-level audit calls
// (createItem/updateItem/removeItem) can resolve their owning header's real entityType/
// screenKey/documentNo without a second, ambiguous lookup — it was already a real column on
// every inserted row (see createItem's own INSERT below), just never read back until now.
const ITEM_SELECT = Prisma.raw(['"RecId" as id', '"OrderReceiptId" as "orderReceiptId"', '"ReceiptType" as "receiptType"', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_VARIANT_SELECT = Prisma.raw(['"RecId" as id', '"OrderReceiptItemId" as "orderReceiptItemId"', ...ITEM_VARIANT_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalSvc: ApprovalService,
    private readonly masterLookupSvc: LegacyMasterLookupService,
    private readonly deleteGuard: DeleteDependencyService,
    private readonly traceability: ReceiptTraceabilityService,
    private readonly audit: AuditService,
  ) {}

  // Entity name varies by receiptType — Purchase Order and Subcontract Order share this exact
  // service/table, and Log Tracking must be able to tell them apart (entityType, not just the
  // shared "IM_OrderReceipt" table name) the same way screenKeyFor() already does for the
  // ApprovalRequest join above.
  private entityTypeFor(receiptType: number): string {
    return receiptType === 3 ? 'SubcontractOrder' : 'PurchaseOrder';
  }

  // Display resolvers for this document's own real FK columns — see audit.service.ts's own
  // enrichDisplayRefs comment for why this lives per-service instead of one universal resolver.
  // Every entry reuses an already-existing generic lookup (LegacyMasterLookupService — including
  // the 'current-account'/'inventory-item' keys added there specifically for this) or an
  // already-existing Prisma model (ColorCard); no bespoke per-field SQL. `includeInactive: true`
  // matches Section 6's "historical reliability" requirement — an OLD audit row referencing a
  // since-deactivated master must still resolve its Code/Name, not silently go blank.
  private displayResolvers(): Record<string, FkResolver> {
    const byKey = (key: string): FkResolver => (id) => this.masterLookupSvc.getById(key, Number(id), { includeInactive: true });
    return {
      currentAccountId: byKey('current-account'),
      warehouseId: byKey('warehouse'),
      forexId: byKey('forex'),
      inventoryId: byKey('inventory-item'),
      serviceCardId: byKey('service'),
      unitId: byKey('unit'),
      manufacturingOrderId: byKey('manufacturing-order'),
      colorCardId: async (id) => this.prisma.colorCard.findUnique({ where: { id: String(id) }, select: { code: true, name: true } }),
    };
  }

  // Full document snapshot — header + detail lines + variant breakdown, every FK column
  // enriched to its Code/Name via displayResolvers() above. Composed once at write time (see
  // audit.service.ts's own "snapshot at write time" design) — mirrors inventory-receipt.
  // service.ts's own snapshotDocument() exactly (same generic pattern, not a new mechanism).
  private async snapshotDocument(id: number, receiptType: number) {
    const label = this.entityTypeFor(receiptType);
    const resolvers = this.displayResolvers();
    const header = await this.get(id, receiptType).catch(() => null);
    const enrichedHeader = header ? await enrichDisplayRefs(header, resolvers) : null;
    const items = await this.listItems(id).catch(() => []);
    const enrichedItems = await Promise.all((items as any[]).map((it) => enrichDisplayRefs(it, resolvers)));
    const variantRows = await Promise.all(
      (items as any[]).map(async (it) => {
        const vs = await this.listItemVariantLines(it.id).catch(() => []);
        return (vs as any[]).map((v) => ({ ...v, orderReceiptItemId: it.id }));
      }),
    );
    return {
      [`${label} (IM_OrderReceipt)`]: enrichedHeader,
      [`${label} Details (IM_OrderReceiptItem)`]: enrichedItems,
      [`${label} Variants (IM_OrderReceiptItemVariant)`]: variantRows.flat(),
    };
  }

  private async headerToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE));
  }
  private async itemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE));
  }
  private async itemVariantToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_VARIANT_TABLE));
  }

  // approvalStatus: "all" (default/omitted) | "approved" | "unapproved" | "rejected" — reuses the
  // same ApprovalRequest table every other approval surface reads, joined by this screen's own
  // screenKeyFor(receiptType) + the row's id as transactionId (identical join shape to
  // inventory-card.service.ts's stockLateral() approval gate). "unapproved" means "not yet
  // decided": no ApprovalRequest row at all (never submitted/approval not required) OR still
  // pending_approval — matching the List filter's job of surfacing everything not yet Approved
  // or Rejected, not inventing a third "draft" bucket the UI doesn't ask for.
  async list(search?: string, approvalStatus?: 'all' | 'approved' | 'unapproved' | 'rejected', receiptType: number = RECEIPT_TYPE) {
    const statusFilter = !approvalStatus || approvalStatus === 'all'
      ? Prisma.sql``
      : approvalStatus === 'approved'
        ? Prisma.sql`AND ar."status" = 'approved'`
        : approvalStatus === 'rejected'
          ? Prisma.sql`AND ar."status" = 'rejected'`
          : Prisma.sql`AND (ar."status" IS NULL OR ar."status" = 'pending_approval')`;
    const searchFilter = search ? Prisma.sql`AND ("t"."ReceiptNo" ILIKE ${`%${search}%`} OR "t"."DocumentNo" ILIKE ${`%${search}%`})` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.raw(['t."RecId" as id', ...HEADER_COLUMNS.map((c) => `t."${c}" as "${camel(c)}"`)].join(', '))},
        CASE WHEN ar."status" IN ('approved', 'rejected') THEN ar."status" ELSE 'unapproved' END as "approvalStatus"
      FROM "IM_OrderReceipt" t
      LEFT JOIN "ApprovalRequest" ar ON ar."screenKey" = ${screenKeyFor(receiptType)} AND ar."transactionId" = t."RecId"::text
      WHERE t."IsDeleted" = 0 AND t."ReceiptType" = ${receiptType} ${searchFilter} ${statusFilter}
      ORDER BY t."ReceiptNo" DESC LIMIT 50
    `);
    return sanitizeRawRow(rows);
  }

  async get(id: number, receiptType: number = RECEIPT_TYPE) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_OrderReceipt" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
    `);
    if (!rows.length) throw new NotFoundException('Order not found');
    return sanitizeRawRow(rows[0]);
  }

  // Purchase Receipt -> Current Account -> right-click -> Pending Orders. PendingQty is
  // computed here, server-side, from real persisted data only — never trusted from the
  // frontend: OrderQty (IM_OrderReceiptItem.Quantity) minus the live SUM of every non-deleted
  // IM_ReceiptItem row already linked back to this PO line via its existing (previously unused)
  // "OrderReceiptItemId" FK (see inventory-receipt.service.ts). A line/PO with nothing pending
  // is excluded by the WHERE clause itself, not a stored flag, so a fully-received PO
  // disappears automatically the instant its last receipt is saved — no write-back to
  // IM_OrderReceiptItem.ReceivedQuantity (that legacy column isn't maintained by this app and
  // is deliberately not trusted as a second source of truth).
  //
  // Approval consistency (two fixes, both mirroring inventory-card.service.ts's own stockLateral
  // gate exactly — same NOT EXISTS ApprovalRequest pattern, same header-soft-delete join, not a
  // second copy of either rule):
  //  1. `recv` now also requires the RECEIPT's own header to be non-deleted (rec."IsDeleted"=0)
  //     — previously a soft-deleted Purchase Receipt's items still counted as "received" here
  //     even though stockLateral already correctly excludes them from Stock on Hand, so deleting
  //     a receipt used to leave Pending Receiving permanently (and wrongly) reduced.
  //  2. `recv` also excludes any receipt line whose OWN receipt is still pending_approval or was
  //     rejected (NOT EXISTS ... status <> 'approved', scoped to Purchase Receipt's real
  //     screenKey) — an Unapproved receipt must not reduce Pending Receiving (only an Approved
  //     one has actually "received" the goods), and a Rejected one releases its quantity back to
  //     Pending Receiving automatically, with no separate write-back needed, since it's simply no
  //     longer counted in this SUM. A receipt whose screen never required approval has no
  //     ApprovalRequest row at all, so NOT EXISTS is vacuously true and it counts immediately,
  //     exactly as before — zero behavior change when Approval Required = OFF.
  // Base Unit + Unit Conversion (spec Section 6): PendingQty is compared/reported in Base Unit
  // internally (poi.Quantity and every ri.Quantity can legitimately be in different units — a Bag
  // ordered, received in KG — so a raw subtraction is meaningless), then converted back into the
  // PO line's own unit for the existing `pendingQty`/`unitId` fields, because
  // pending-orders-dialog.tsx copies both straight onto a new receipt line unchanged; switching
  // that field to the Base Unit would silently corrupt that import. `orderBaseQty`/
  // `receivedBaseQty`/`pendingBaseQty`/`baseUnitId`/`baseUnitCode` are new, additive fields for
  // display only. Reuses the one conversion formula in unit-conversion.util.ts — not a second copy.
  // `receiptType` — which order type's pending lines to list (default 1, Purchase Order).
  // `receivingReceiptType` — which IM_Receipt-side screen actually consumes those lines (default
  // 2, Purchase Receipt); Subcontract Order (3) is only ever received via Outside Process Receive
  // Receipt (11), so both this method's approval gate below AND the `recv` SUM itself now key off
  // that pairing explicitly, rather than being hardcoded to Purchase Receipt — a real, pre-
  // existing correctness gap this generalization closes: without it, an unapproved-but-existing
  // receipt of any OTHER type would already have silently reduced `pendingQty` for a Subcontract
  // Order line (nothing filtered `rec."ReceiptType"` in the SUM before), the same
  // Approval-ON-must-not-count-yet rule Purchase Receipt already gets.
  async listPending(currentAccountId: number, receiptType: number = RECEIPT_TYPE, receivingReceiptType: number = 2) {
    const receivingScreenKey = receiptScreenKeyFor(receivingReceiptType);
    const poInvId = Prisma.sql`poi."InventoryId"`;
    const poUnitId = Prisma.sql`poi."UnitId"`;
    const poOrderBaseQty = baseQuantitySql(Prisma.sql`poi."Quantity"`, poInvId, poUnitId, 'po');
    const poUnitJoin = baseQuantityJoinSql(poInvId, poUnitId, 'po');
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        po."RecId" as "orderReceiptId", po."ReceiptNo" as "receiptNo", po."ReceiptDate" as "receiptDate", po."DocumentNo" as "documentNo",
        poi."RecId" as "orderReceiptItemId", poi."InventoryId" as "inventoryId", poi."Explanation" as "explanation",
        poi."Quantity" as "orderQty", poi."UnitId" as "unitId", poi."UnitPrice" as "unitPrice", poi."ColorCardId" as "colorCardId",
        i."InventoryCode" as "code", i."InventoryName" as "name",
        base_unit.id as "baseUnitId", base_unit.code as "baseUnitCode",
        ${poOrderBaseQty} as "orderBaseQty",
        COALESCE(recv."baseQty", 0) as "receivedBaseQty",
        (${poOrderBaseQty} - COALESCE(recv."baseQty", 0)) as "pendingBaseQty",
        COALESCE(recv."qty", 0) as "receivedQty",
        ${fromBaseQuantitySql(Prisma.sql`(${poOrderBaseQty} - COALESCE(recv."baseQty", 0))`, 'po')} as "pendingQty"
      FROM "IM_OrderReceipt" po
      JOIN "IM_OrderReceiptItem" poi ON poi."OrderReceiptId" = po."RecId" AND poi."IsDeleted" = 0
      LEFT JOIN "IM_Item" i ON i."RecId" = poi."InventoryId"
      ${poUnitJoin}
      LEFT JOIN LATERAL (
        SELECT usi."RecId" as id, usi."UnitCode" as code
        FROM "IM_ItemUnitItemSize" iuis
        JOIN "MD_UnitSetItem" usi ON usi."RecId" = iuis."UnitItemId"
        WHERE iuis."InventoryId" = poi."InventoryId" AND iuis."IsDeleted" = 0 AND iuis."IsMainUnit" = 1
        LIMIT 1
      ) base_unit ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(ri."Quantity") as qty,
          SUM(${baseQuantitySql(Prisma.sql`ri."Quantity"`, Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri')}) as "baseQty"
        FROM "IM_ReceiptItem" ri
        JOIN "IM_Receipt" rec ON rec."RecId" = ri."InventoryReceiptId" AND rec."IsDeleted" = 0 AND rec."ReceiptType" = ${receivingReceiptType}
        ${baseQuantityJoinSql(Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri')}
        WHERE ri."OrderReceiptItemId" = poi."RecId" AND ri."IsDeleted" = 0
          AND NOT EXISTS (
            SELECT 1 FROM "ApprovalRequest" ar
            WHERE ar."screenKey" = ${receivingScreenKey} AND ar."transactionId" = ri."InventoryReceiptId"::text AND ar."status" <> 'approved'
          )
      ) recv ON true
      WHERE po."IsDeleted" = 0 AND po."ReceiptType" = ${receiptType} AND po."CurrentAccountId" = ${currentAccountId}
        AND (${poOrderBaseQty} - COALESCE(recv."baseQty", 0)) > 0
        -- Same approval gate applied to the order itself: an order still pending approval or
        -- rejected shouldn't be offered for receiving yet (its lines aren't authorized to
        -- receive against). An order never submitted for approval (screen not configured, or
        -- approval OFF) has no ApprovalRequest row, so this stays vacuously true — unchanged
        -- behavior for Purchase Order.
        AND NOT EXISTS (
          SELECT 1 FROM "ApprovalRequest" ar
          WHERE ar."screenKey" = ${screenKeyFor(receiptType)} AND ar."transactionId" = po."RecId"::text AND ar."status" <> 'approved'
        )
      ORDER BY po."ReceiptNo" DESC, poi."ItemOrderNo", poi."RecId"
    `);
    const clean = sanitizeRawRow(rows);

    // Variant breakdown — a small follow-up query (same pattern inventory-receipt.service.ts's
    // own listItems() already uses to resolve orderReceiptNo) rather than joining into the
    // pending-quantity query above, so it can't perturb that query's own WHERE/GROUP shape.
    // Grouped onto each line as `variants` so Pending Orders import can copy them across
    // verbatim onto the new IM_ReceiptItemVariant rows (see inventory-receipt.service.ts's own
    // createItemVariantLine).
    const lineIds = clean.map((r: any) => r.orderReceiptItemId);
    const variantsByLine = new Map<number, any[]>();
    if (lineIds.length) {
      const variantRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT "RecId" as id, "OrderReceiptItemId" as "orderReceiptItemId",
          "InventoryVariantId" as "inventoryVariantId", "Quantity" as "quantity", "NetUnitPrice" as "netUnitPrice"
        FROM "IM_OrderReceiptItemVariant"
        WHERE "OrderReceiptItemId" IN (${Prisma.join(lineIds)}) AND "IsDeleted" = 0
        ORDER BY "RecId"
      `);
      for (const v of sanitizeRawRow(variantRows)) {
        const list = variantsByLine.get(v.orderReceiptItemId) ?? [];
        list.push(v);
        variantsByLine.set(v.orderReceiptItemId, list);
      }
    }

    const byPo = new Map<number, { id: number; receiptNo: string; receiptDate: any; documentNo: string | null; lines: any[] }>();
    for (const r of clean) {
      if (!byPo.has(r.orderReceiptId)) {
        byPo.set(r.orderReceiptId, { id: r.orderReceiptId, receiptNo: r.receiptNo, receiptDate: r.receiptDate, documentNo: r.documentNo, lines: [] });
      }
      byPo.get(r.orderReceiptId)!.lines.push({
        orderReceiptItemId: r.orderReceiptItemId, inventoryId: r.inventoryId, code: r.code, name: r.name,
        explanation: r.explanation, unitId: r.unitId, unitPrice: r.unitPrice, colorCardId: r.colorCardId,
        orderQty: r.orderQty, receivedQty: r.receivedQty, pendingQty: r.pendingQty,
        baseUnitId: r.baseUnitId, baseUnitCode: r.baseUnitCode,
        orderBaseQty: r.orderBaseQty, receivedBaseQty: r.receivedBaseQty, pendingBaseQty: r.pendingBaseQty,
        variants: variantsByLine.get(r.orderReceiptItemId) ?? [],
      });
    }
    return Array.from(byPo.values());
  }

  // Universal Action Menu -> "Return / Purchase Receipt" submenu. Delegates to the one shared
  // traceability implementation (ReceiptTraceabilityService) also used from the Receipt/Return/
  // Received-Connection screens (inventory-receipt.service.ts) — no duplicate SQL here.
  async listRelatedReceipts(purchaseOrderId: number) {
    return this.traceability.listForPurchaseOrder(purchaseOrderId);
  }

  async getByReceiptNo(receiptNo: string, receiptType: number = RECEIPT_TYPE) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_OrderReceipt" WHERE "ReceiptNo" = ${receiptNo} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
    `);
    if (!rows.length) throw new NotFoundException('Order not found');
    return sanitizeRawRow(rows[0]);
  }

  // Business-friendly sequential numbers ("PO-1", "PO-2", ... / "SC-1", "SC-2", ... — no padded
  // leading zeros), scoped to `receiptType` so numbering never collides across the different
  // order kinds sharing this one generic IM_OrderReceipt spine. Mirrors yarn-card.service.ts's
  // nextInventoryCode() prefix+sequence pattern (no shared numbering service exists to reuse —
  // see that file's own comment on why). Scans ALL rows including soft-deleted ones so a deleted
  // order's number is never reissued. Purely a *default* — the number is still a plain, user-
  // editable text field on Create (see create() below), same as every other master's Code field.
  async nextReceiptNo(receiptType: number = RECEIPT_TYPE, numberPrefix: string = 'PO'): Promise<string> {
    const pattern = `^${numberPrefix}-[0-9]+$`;
    const stripPrefix = `^${numberPrefix}-`;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "ReceiptNo" as code FROM "IM_OrderReceipt"
      WHERE "ReceiptType" = ${receiptType} AND "ReceiptNo" ~ ${pattern}
      ORDER BY (regexp_replace("ReceiptNo", ${stripPrefix}, ''))::int DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${numberPrefix}-${next}`;
  }

  // Application-level uniqueness check for a manually-typed Receipt No — mirrors the
  // ConflictException("<field> already exists") convention used by yarn-card.service.ts's
  // assertUnique. Case-insensitive/trimmed comparison, scoped to `receiptType`.
  private async assertReceiptNoAvailable(receiptNo: string, receiptType: number, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" FROM "IM_OrderReceipt"
      WHERE "ReceiptType" = ${receiptType} AND "IsDeleted" = 0 AND LOWER("ReceiptNo") = LOWER(${receiptNo}) ${exclude}
    `);
    if (rows.length) throw new ConflictException('An order already exists with this number.');
  }

  private static readonly MAX_CODE_RETRIES = 5;

  // Direct-write bypass guard — same shape as inventory-receipt.service.ts's own create()/
  // update() guard on IsApproved. A plain POST/PUT can't set Approved/Rejected state directly
  // once this screen is configured to require approval; that state only ever changes through
  // approve()/reject() below (permission-checked, pending-state-checked, self-approval-checked,
  // atomic). No-op (unchanged) whenever approval isn't required for this screen.
  private async assertNoDirectApprovalWrite(dto: Record<string, any>, receiptType: number) {
    if (dto.isApproved === undefined && dto.isRejected === undefined) return;
    if (await this.approvalSvc.isApprovalRequired(screenKeyFor(receiptType))) {
      throw new ForbiddenException('This screen requires approval — use the Approve/Reject actions instead of setting status directly.');
    }
  }

  async create(dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE, numberPrefix: string = 'PO', currentUserId?: string, companyId?: string) {
    await this.assertNoDirectApprovalWrite(dto, receiptType);
    const toDb = await this.headerToDb();
    const manualReceiptNo = String(dto.receiptNo ?? '').trim();

    const auditCreate = async (created: any) => {
      if (!currentUserId || !companyId) return;
      const label = this.entityTypeFor(receiptType);
      const enriched = await enrichDisplayRefs(created, this.displayResolvers());
      await this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: screenKeyFor(receiptType),
        entityType: label, entityId: String(created.id), action: AUDIT_ACTIONS.CREATE,
        documentNo: created.receiptNo, after: { [`${label} (IM_OrderReceipt)`]: enriched },
      });
    };

    if (manualReceiptNo) {
      await this.assertReceiptNoAvailable(manualReceiptNo, receiptType);
      const effective = { ...dto, receiptType, receiptNo: manualReceiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_OrderReceipt" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        const created = sanitizeRawRow(rows[0]);
        await auditCreate(created);
        return created;
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        if (msg.includes('23505') && msg.includes('ReceiptNo')) throw new ConflictException('An order already exists with this number.');
        throw err;
      }
    }

    // No number typed — fall back to the auto-generated default, same collision-retry
    // loop as before (covers the race where a second Save lands between preview and insert).
    for (let attempt = 1; attempt <= PurchaseOrderService.MAX_CODE_RETRIES; attempt++) {
      const receiptNo = await this.nextReceiptNo(receiptType, numberPrefix);
      const effective = { ...dto, receiptType, receiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_OrderReceipt" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        const created = sanitizeRawRow(rows[0]);
        await auditCreate(created);
        return created;
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('ReceiptNo');
        if (isCodeCollision && attempt < PurchaseOrderService.MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Receipt No — please try again.');
  }

  async update(id: number, dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE, currentUserId?: string, companyId?: string) {
    const before = await this.get(id, receiptType);
    await this.assertNoDirectApprovalWrite(dto, receiptType);
    const toDb = await this.headerToDb();
    const cols = HEADER_COLUMNS.filter((c) => c !== 'ReceiptNo' && c !== 'ReceiptType' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id, receiptType);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_OrderReceipt" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    const updated = sanitizeRawRow(rows[0]);
    // ROOT CAUSE FIX for "CREATE produces Created + Updated": SubTotal/VatAmount/GrandTotal are
    // NEVER directly user-typed anywhere on this screen — they're a derived recompute the line
    // grid's own totals-sync effect PUTs back automatically the instant lines are added/edited/
    // removed (purchase-order-line-grid.tsx, the totalsSyncTimer effect), including immediately
    // after a brand-new PO's first lines are committed. That auto-sync goes through this exact
    // same update() a real user edit does, so a change confined to ONLY these 3 derived columns
    // is an internal recalculation finishing the record, not a user "Updated" action (Section 1's
    // own case (A)) — confirmed live: it was the second row in every "Created + Updated" pair.
    // A change that ALSO touches any other real header field still audits normally, with the
    // derived totals included in the shown diff for context — this never suppresses a genuine
    // edit, only the derived-only recompute case.
    const hasBusinessChange = hasRealChanges(before, updated, ['subTotal', 'vatAmount', 'grandTotal']);
    if (currentUserId && companyId && hasBusinessChange) {
      const label = this.entityTypeFor(receiptType);
      const resolvers = this.displayResolvers();
      const [enrichedBefore, enrichedAfter] = await Promise.all([enrichDisplayRefs(before, resolvers), enrichDisplayRefs(updated, resolvers)]);
      // Header-only write, but the snapshot still covers the full document (Details/Variants,
      // Section 2) — this endpoint never touches items/variants itself, so both sides show the
      // same (accurate, unchanged) current line state; ChangedFields in Log Details still diffs
      // only the header section, the only one present as a plain object on both before/after.
      const items = await this.listItems(id).catch(() => []);
      const enrichedItems = await Promise.all((items as any[]).map((it) => enrichDisplayRefs(it, resolvers)));
      const detailSections = { [`${label} Details (IM_OrderReceiptItem)`]: enrichedItems };
      this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: screenKeyFor(receiptType),
        entityType: label, entityId: String(id), action: AUDIT_ACTIONS.UPDATE,
        documentNo: updated?.receiptNo ?? before.receiptNo,
        before: { [`${label} (IM_OrderReceipt)`]: enrichedBefore, ...detailSections },
        after: { [`${label} (IM_OrderReceipt)`]: enrichedAfter, ...detailSections },
      });
    }
    return updated;
  }

  async remove(id: number, userId: number, receiptType: number = RECEIPT_TYPE, currentUserId?: string, companyId?: string) {
    await this.get(id, receiptType);
    // Full document snapshot (header + items + variants, FK-enriched) captured BEFORE the
    // soft-delete, per Section 2's "DELETE -> last valid complete document snapshot" — mirrors
    // inventory-receipt.service.ts's own remove() exactly.
    const snapshot = currentUserId && companyId ? await this.snapshotDocument(id, receiptType) : null;
    await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('IM_OrderReceipt', id, tx);
      await tx.$executeRaw`
        UPDATE "IM_OrderReceipt" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
      `;
    });
    if (currentUserId && companyId && snapshot) {
      const label = this.entityTypeFor(receiptType);
      const header = snapshot[`${label} (IM_OrderReceipt)`] as any;
      await this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: screenKeyFor(receiptType),
        entityType: label, entityId: String(id), action: AUDIT_ACTIONS.DELETE,
        documentNo: header?.receiptNo, before: snapshot,
      });
    }
    return { message: 'Deleted' };
  }

  // --- Approval (General Settings -> Approval Configuration) ------------------------------
  // Same thin-adapter shape as inventory-receipt.service.ts's own submitForApproval/approve/
  // reject/getApprovalStatus: this owns the one existence check (this.get — throws NotFound for
  // a deleted/nonexistent order, closing the "approve a deleted transaction" gap) plus the one
  // Purchase-Order-specific completion side effect; every permission/pending-state/self-approval/
  // idempotency/audit concern is owned entirely by the generic ApprovalService.

  async submitForApproval(id: number, userId: string, receiptType: number = RECEIPT_TYPE, companyId?: string) {
    const header = await this.get(id, receiptType);
    return this.approvalSvc.submit(screenKeyFor(receiptType), String(id), userId, undefined, this.approvalCtx(header, receiptType, companyId));
  }

  // Unlike inventory-receipt.service.ts's approve() (which preserves a genuinely pre-existing
  // "unrestricted Approve button" behavior for when approval isn't required), Purchase Order
  // never had ANY prior approve/reject UI — there is no legacy behavior to preserve here. So
  // both methods always delegate to ApprovalService first: with no ApprovalRequest row (approval
  // not required / never submitted), that call itself throws NotFoundException, and the header
  // column flip below never runs — IsApproved/IsRejected can only ever change as the direct
  // consequence of a real, permission-checked approval decision.
  async approve(id: number, userId: string, remarks: string | undefined, receiptType: number = RECEIPT_TYPE, companyId?: string) {
    const header = await this.get(id, receiptType);
    // Both writes — the ApprovalRequest decision (+ AuditLog) and this screen's own
    // IsApproved/ApprovedAt/ApprovedBy/IsRejected/RejectedAt/RejectedBy/RejectedExplanation
    // column flip — happen in one atomic transaction, same reasoning as
    // inventory-receipt.service.ts's own approve(): neither can commit without the other.
    const rows = await this.prisma.$transaction(async (tx) => {
      await this.approvalSvc.approve(screenKeyFor(receiptType), String(id), userId, remarks, tx, this.approvalCtx(header, receiptType, companyId));
      return tx.$queryRaw<any[]>(Prisma.sql`
        UPDATE "IM_OrderReceipt" SET
          "IsApproved" = 1, "ApprovedAt" = now(), "ApprovedBy" = ${Number(userId) || 1},
          "IsRejected" = 0, "RejectedAt" = NULL, "RejectedBy" = NULL, "RejectedExplanation" = NULL,
          "UpdatedAt" = now(), "UpdatedBy" = ${Number(userId) || 1}
        WHERE "RecId" = ${id}
        RETURNING ${HEADER_SELECT}
      `);
    });
    return sanitizeRawRow(rows[0]);
  }

  async reject(id: number, userId: string, remarks: string, receiptType: number = RECEIPT_TYPE, companyId?: string) {
    const header = await this.get(id, receiptType);
    const rows = await this.prisma.$transaction(async (tx) => {
      await this.approvalSvc.reject(screenKeyFor(receiptType), String(id), userId, remarks, tx, this.approvalCtx(header, receiptType, companyId));
      return tx.$queryRaw<any[]>(Prisma.sql`
        UPDATE "IM_OrderReceipt" SET
          "IsRejected" = 1, "RejectedAt" = now(), "RejectedBy" = ${Number(userId) || 1}, "RejectedExplanation" = ${remarks},
          "IsApproved" = 0, "ApprovedAt" = NULL, "ApprovedBy" = NULL,
          "UpdatedAt" = now(), "UpdatedBy" = ${Number(userId) || 1}
        WHERE "RecId" = ${id}
        RETURNING ${HEADER_SELECT}
      `);
    });
    return sanitizeRawRow(rows[0]);
  }

  getApprovalStatus(id: number, receiptType: number = RECEIPT_TYPE) {
    return this.approvalSvc.getStatus(screenKeyFor(receiptType), String(id));
  }

  // Real entity identity for an approval transition audit row — see ApprovalAuditContext's own
  // comment. `companyId` optional/undefined makes ApprovalService fall back to its own
  // pre-existing behavior, same "additive, never a hard requirement" convention as every other
  // audit integration in this file.
  private approvalCtx(header: any, receiptType: number, companyId?: string): import('../approval/approval.service').ApprovalAuditContext | undefined {
    if (!companyId) return undefined;
    return { companyId, entityType: this.entityTypeFor(receiptType), documentNo: header?.receiptNo ?? null };
  }

  // --- Detail lines (the grid) ------------------------------------------------------------

  async listItems(orderReceiptId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "IM_OrderReceiptItem"
      WHERE "OrderReceiptId" = ${orderReceiptId} AND "IsDeleted" = 0
      ORDER BY "ItemOrderNo", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  // Real entity identity for a line-level audit event — same "additive, optional" convention as
  // every other audit integration in this file. `entityType` is "<label>Item" (e.g.
  // "PurchaseOrderItem"), distinct from but clearly grouped with the header's own entityType;
  // parentEntityType/parentEntityId/parentDocumentNo let Log Tracking/Log Details show a line
  // event in the context of the document it belongs to, same mechanism
  // fabric-yarn-requirements.service.ts already uses for Requirements-under-Work-Order.
  private async lineAuditCtx(orderReceiptId: number, receiptType: number) {
    const header = await this.get(orderReceiptId, receiptType).catch(() => null);
    const label = this.entityTypeFor(receiptType);
    return { label, screenKey: screenKeyFor(receiptType), parentDocumentNo: header?.receiptNo ?? null };
  }

  async createItem(orderReceiptId: number, dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE, currentUserId?: string, companyId?: string) {
    // Required-field check branches by Type: Service lines identify by ServiceCardId, every
    // other type (Inventory, Fixed Asset) is an IM_Item row identified by InventoryId.
    if (Number(dto.itemType) === ITEM_TYPE_SERVICE) {
      if (!dto.serviceCardId) throw new BadRequestException('A service is required');
    } else if (!dto.inventoryId) {
      throw new BadRequestException('An inventory item is required');
    }
    const toDb = await this.itemToDb();
    const effective: Record<string, any> = { ...dto, receiptType };
    // Purchase Order (IM_OrderReceipt) is a genuinely separate, dedicated entity — NOT part of
    // the ReceiptType-shared IM_Receipt family that backs Stock Adjustment/Return/Transfer (see
    // receipt-types.config.ts's own comment), so none of these has a legitimate signed meaning.
    assertAllNonNegative({
      Quantity: effective.quantity, 'Gross Quantity': effective.grossQuantity, 'Unit Price': effective.unitPrice,
      'Forex Rate': effective.forexRate, 'Forex Unit Price': effective.forexUnitPrice, 'VAT Rate': effective.vatRate,
      'Received Quantity': effective.receivedQuantity,
    });
    // Item -> Unit backend enforcement (spec Section 4/10) — brings Purchase Order to parity with
    // Purchase Receipt's own resolveUnitId (inventory-receipt.service.ts), which already did this;
    // PO's own createItem/updateItem had no unit resolution at all until now. Reuses the exact same
    // helper, not a second copy of it.
    effective.unitId = await resolveLineUnitId(this.masterLookupSvc, effective.inventoryId, effective.unitId);
    await assertValidItemUnit(this.prisma, effective.inventoryId, effective.unitId);
    // Missing-Base-Unit blocking (spec Section 9) — an item that has entered the per-item
    // conversion system (has configured units) but has no row flagged IsMainUnit=1 cannot post
    // conversion-dependent stock transactions until one is set.
    await assertHasBaseUnit(this.prisma, effective.inventoryId);
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"OrderReceiptId"', '"ReceiptType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_OrderReceiptItem" (${colList})
      VALUES (${orderReceiptId}, ${receiptType}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_SELECT}
    `);
    const created = sanitizeRawRow(rows[0]);
    if (currentUserId && companyId) {
      const { label, screenKey, parentDocumentNo } = await this.lineAuditCtx(orderReceiptId, receiptType);
      const enriched = await enrichDisplayRefs(created, this.displayResolvers());
      this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey,
        entityType: `${label}Item`, entityId: String(created.id), action: AUDIT_ACTIONS.CREATE,
        parentEntityType: label, parentEntityId: String(orderReceiptId), parentDocumentNo,
        after: { [`${label} Line (IM_OrderReceiptItem)`]: enriched },
      });
    }
    return created;
  }

  async updateItem(itemId: number, dto: Record<string, any>, userId: number, currentUserId?: string, companyId?: string) {
    const beforeRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "IM_OrderReceiptItem" WHERE "RecId" = ${itemId} AND "IsDeleted" = 0`);
    if (!beforeRows.length) throw new NotFoundException('Line not found');
    const before = sanitizeRawRow(beforeRows[0]);
    const toDb = await this.itemToDb();
    const effective = { ...dto };
    assertAllNonNegative({
      Quantity: effective.quantity, 'Gross Quantity': effective.grossQuantity, 'Unit Price': effective.unitPrice,
      'Forex Rate': effective.forexRate, 'Forex Unit Price': effective.forexUnitPrice, 'VAT Rate': effective.vatRate,
      'Received Quantity': effective.receivedQuantity,
    });
    // Same "only touch Unit when Item and/or Unit actually changes" shape as
    // inventory-receipt.service.ts's own updateItem — an edit to an unrelated field must not force
    // a normalization query, and changing Item alone still re-resolves Unit against the new item.
    if (effective.inventoryId !== undefined || effective.unitId !== undefined) {
      const invId = effective.inventoryId !== undefined ? effective.inventoryId : before.inventoryId;
      effective.unitId = await resolveLineUnitId(this.masterLookupSvc, invId, effective.unitId);
      await assertValidItemUnit(this.prisma, invId, effective.unitId);
      await assertHasBaseUnit(this.prisma, invId);
    }
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const updated = cols.length
      ? sanitizeRawRow(
          (
            await this.prisma.$queryRaw<any[]>(Prisma.sql`
              UPDATE "IM_OrderReceiptItem" SET ${Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, effective[camel(c)])}`))}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
              WHERE "RecId" = ${itemId} AND "IsDeleted" = 0
              RETURNING ${ITEM_SELECT}
            `)
          )[0],
        )
      : before;
    if (cols.length && !updated) throw new NotFoundException('Line not found');
    // Only log UPDATE when a submitted value actually differs from what was already persisted —
    // same hasRealChanges gate as the header's own update(), for the same reason (a no-op line
    // save, or the totals-sync effect touching only derived header columns elsewhere, must never
    // fabricate an Updated history entry here either).
    if (currentUserId && companyId && hasRealChanges(before, updated)) {
      const { label, screenKey, parentDocumentNo } = await this.lineAuditCtx(updated.orderReceiptId, updated.receiptType);
      const resolvers = this.displayResolvers();
      const [enrichedBefore, enrichedAfter] = await Promise.all([enrichDisplayRefs(before, resolvers), enrichDisplayRefs(updated, resolvers)]);
      this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey,
        entityType: `${label}Item`, entityId: String(itemId), action: AUDIT_ACTIONS.UPDATE,
        parentEntityType: label, parentEntityId: String(updated.orderReceiptId), parentDocumentNo,
        before: { [`${label} Line (IM_OrderReceiptItem)`]: enrichedBefore }, after: { [`${label} Line (IM_OrderReceiptItem)`]: enrichedAfter },
      });
    }
    return updated;
  }

  async removeItem(itemId: number, userId: number, currentUserId?: string, companyId?: string) {
    const beforeRows = currentUserId && companyId
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "IM_OrderReceiptItem" WHERE "RecId" = ${itemId} AND "IsDeleted" = 0`)
      : [];
    const result = await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('IM_OrderReceiptItem', itemId, tx);
      return tx.$executeRaw`
        UPDATE "IM_OrderReceiptItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId}
      `;
    });
    if (!result) throw new NotFoundException('Line not found');
    if (currentUserId && companyId && beforeRows.length) {
      const before = sanitizeRawRow(beforeRows[0]);
      const { label, screenKey, parentDocumentNo } = await this.lineAuditCtx(before.orderReceiptId, before.receiptType);
      const enriched = await enrichDisplayRefs(before, this.displayResolvers());
      this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey,
        entityType: `${label}Item`, entityId: String(itemId), action: AUDIT_ACTIONS.DELETE,
        parentEntityType: label, parentEntityId: String(before.orderReceiptId), parentDocumentNo,
        before: { [`${label} Line (IM_OrderReceiptItem)`]: enriched },
      });
    }
    return { message: 'Deleted' };
  }

  // --- Variant breakdown (the grid's Variant2 column) --------------------------------------

  // Every real composite Variant1..5 combination already defined for this inventory item
  // (IM_ItemVariant — one row per actual stock-keeping combination), joined to IM_VariantItem
  // twice for readable Variant1/Variant2 labels. Empty for any item that isn't variant-
  // enabled (IM_Item.HasVariant = 0) — that's the item master's own data, not a defect here.
  async listItemVariantOptions(inventoryId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT iv."RecId" as id,
        iv."Variant1Id" as "variant1Id", v1."ItemName" as "variant1Name",
        iv."Variant2Id" as "variant2Id", v2."ItemName" as "variant2Name"
      FROM "IM_ItemVariant" iv
      LEFT JOIN "IM_VariantItem" v1 ON v1."RecId" = iv."Variant1Id" AND v1."IsDeleted" = 0
      LEFT JOIN "IM_VariantItem" v2 ON v2."RecId" = iv."Variant2Id" AND v2."IsDeleted" = 0
      WHERE iv."InventoryId" = ${inventoryId} AND iv."IsDeleted" = 0 AND iv."InUse" = 1
      ORDER BY iv."Variant1Order", iv."Variant2Order"
    `);
    return sanitizeRawRow(rows);
  }

  async listItemVariantLines(orderReceiptItemId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_VARIANT_SELECT} FROM "IM_OrderReceiptItemVariant"
      WHERE "OrderReceiptItemId" = ${orderReceiptItemId} AND "IsDeleted" = 0
      ORDER BY "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async createItemVariantLine(orderReceiptItemId: number, dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE) {
    if (!dto.inventoryVariantId) throw new BadRequestException('A variant is required');
    const toDb = await this.itemVariantToDb();
    assertAllNonNegative({ Quantity: dto.quantity, 'Net Unit Price': dto.netUnitPrice, 'Received Quantity': dto.receivedQuantity });
    const effective = { ...dto, receiptType };
    const cols = ITEM_VARIANT_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"OrderReceiptItemId"', '"ReceiptType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_OrderReceiptItemVariant" (${colList})
      VALUES (${orderReceiptItemId}, ${receiptType}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_VARIANT_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async updateItemVariantLine(variantLineId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemVariantToDb();
    assertAllNonNegative({ Quantity: dto.quantity, 'Net Unit Price': dto.netUnitPrice, 'Received Quantity': dto.receivedQuantity });
    const cols = ITEM_VARIANT_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_VARIANT_SELECT} FROM "IM_OrderReceiptItemVariant" WHERE "RecId" = ${variantLineId}`);
      if (!rows.length) throw new NotFoundException('Variant line not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_OrderReceiptItemVariant" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${variantLineId} AND "IsDeleted" = 0
      RETURNING ${ITEM_VARIANT_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Variant line not found');
    return sanitizeRawRow(rows[0]);
  }

  async removeItemVariantLine(variantLineId: number, userId: number) {
    const result = await this.prisma.$executeRaw`
      UPDATE "IM_OrderReceiptItemVariant" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${variantLineId}
    `;
    if (!result) throw new NotFoundException('Variant line not found');
    return { message: 'Deleted' };
  }

  // --- Explanation tab (IM_OrderReceiptExplanation — dated free-text notes, header-level) --

  async listExplanations(orderReceiptId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "ExplanationDate" as "explanationDate", "ExplanationText" as "explanationText"
      FROM "IM_OrderReceiptExplanation"
      WHERE "OrderReceiptId" = ${orderReceiptId} AND "OrderReceiptItemId" IS NULL AND "IsDeleted" = 0
      ORDER BY "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async createExplanation(orderReceiptId: number, dto: { explanationText: string; explanationDate?: string }, userId: number) {
    const text = String(dto.explanationText ?? '').trim();
    if (!text) throw new BadRequestException('Explanation text is required');
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_OrderReceiptExplanation" ("OrderReceiptId", "ExplanationDate", "ExplanationText", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
      VALUES (${orderReceiptId}, ${dto.explanationDate ? new Date(dto.explanationDate) : new Date()}, ${text}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING "RecId" as id, "ExplanationDate" as "explanationDate", "ExplanationText" as "explanationText"
    `);
    return sanitizeRawRow(rows[0]);
  }

  async removeExplanation(explanationId: number, userId: number) {
    const result = await this.prisma.$executeRaw`
      UPDATE "IM_OrderReceiptExplanation" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${explanationId}
    `;
    if (!result) throw new NotFoundException('Explanation not found');
    return { message: 'Deleted' };
  }
}
