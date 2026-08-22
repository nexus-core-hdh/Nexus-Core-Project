import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { ApprovalService } from '../approval/approval.service';
import { screenKeyFor as receiptScreenKeyFor } from './inventory-receipt.service';

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

// General Settings -> Approval Configuration screenKey for this screen — matches this screen's
// real MenuItem.href exactly (see prisma/seed.ts's Legacy ERP menu), same convention
// inventory-receipt.service.ts's own screenKeyFor() already establishes.
const APPROVAL_SCREEN_KEY = '/dashboard/legacy-erp/purchase-orders-list';

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
const ITEM_SELECT = Prisma.raw(['"RecId" as id', '"OrderReceiptId" as "orderReceiptId"', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_VARIANT_SELECT = Prisma.raw(['"RecId" as id', '"OrderReceiptItemId" as "orderReceiptItemId"', ...ITEM_VARIANT_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalSvc: ApprovalService,
  ) {}

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
  // APPROVAL_SCREEN_KEY + the row's id as transactionId (identical join shape to
  // inventory-card.service.ts's stockLateral() approval gate). "unapproved" means "not yet
  // decided": no ApprovalRequest row at all (never submitted/approval not required) OR still
  // pending_approval — matching the List filter's job of surfacing everything not yet Approved
  // or Rejected, not inventing a third "draft" bucket the UI doesn't ask for.
  async list(search?: string, approvalStatus?: 'all' | 'approved' | 'unapproved' | 'rejected') {
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
      LEFT JOIN "ApprovalRequest" ar ON ar."screenKey" = ${APPROVAL_SCREEN_KEY} AND ar."transactionId" = t."RecId"::text
      WHERE t."IsDeleted" = 0 AND t."ReceiptType" = ${RECEIPT_TYPE} ${searchFilter} ${statusFilter}
      ORDER BY t."ReceiptNo" DESC LIMIT 50
    `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_OrderReceipt" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "ReceiptType" = ${RECEIPT_TYPE}
    `);
    if (!rows.length) throw new NotFoundException('Purchase order not found');
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
  async listPending(currentAccountId: number) {
    const purchaseReceiptScreenKey = receiptScreenKeyFor(2);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        po."RecId" as "orderReceiptId", po."ReceiptNo" as "receiptNo", po."ReceiptDate" as "receiptDate", po."DocumentNo" as "documentNo",
        poi."RecId" as "orderReceiptItemId", poi."InventoryId" as "inventoryId", poi."Explanation" as "explanation",
        poi."Quantity" as "orderQty", poi."UnitId" as "unitId", poi."UnitPrice" as "unitPrice", poi."ColorCardId" as "colorCardId",
        i."InventoryCode" as "code", i."InventoryName" as "name",
        COALESCE(recv."qty", 0) as "receivedQty",
        (poi."Quantity" - COALESCE(recv."qty", 0)) as "pendingQty"
      FROM "IM_OrderReceipt" po
      JOIN "IM_OrderReceiptItem" poi ON poi."OrderReceiptId" = po."RecId" AND poi."IsDeleted" = 0
      LEFT JOIN "IM_Item" i ON i."RecId" = poi."InventoryId"
      LEFT JOIN LATERAL (
        SELECT SUM(ri."Quantity") as qty
        FROM "IM_ReceiptItem" ri
        JOIN "IM_Receipt" rec ON rec."RecId" = ri."InventoryReceiptId" AND rec."IsDeleted" = 0
        WHERE ri."OrderReceiptItemId" = poi."RecId" AND ri."IsDeleted" = 0
          AND NOT EXISTS (
            SELECT 1 FROM "ApprovalRequest" ar
            WHERE ar."screenKey" = ${purchaseReceiptScreenKey} AND ar."transactionId" = ri."InventoryReceiptId"::text AND ar."status" <> 'approved'
          )
      ) recv ON true
      WHERE po."IsDeleted" = 0 AND po."ReceiptType" = ${RECEIPT_TYPE} AND po."CurrentAccountId" = ${currentAccountId}
        AND (poi."Quantity" - COALESCE(recv."qty", 0)) > 0
        -- Same approval gate applied to the PO itself: a PO still pending approval or rejected
        -- shouldn't be offered for receiving yet (its lines aren't authorized to receive
        -- against). A PO never submitted for approval (screen not configured, or approval OFF)
        -- has no ApprovalRequest row, so this stays vacuously true — unchanged behavior.
        AND NOT EXISTS (
          SELECT 1 FROM "ApprovalRequest" ar
          WHERE ar."screenKey" = ${APPROVAL_SCREEN_KEY} AND ar."transactionId" = po."RecId"::text AND ar."status" <> 'approved'
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
        variants: variantsByLine.get(r.orderReceiptItemId) ?? [],
      });
    }
    return Array.from(byPo.values());
  }

  async getByReceiptNo(receiptNo: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_OrderReceipt" WHERE "ReceiptNo" = ${receiptNo} AND "IsDeleted" = 0 AND "ReceiptType" = ${RECEIPT_TYPE}
    `);
    if (!rows.length) throw new NotFoundException('Purchase order not found');
    return sanitizeRawRow(rows[0]);
  }

  // Business-friendly sequential numbers ("PO-1", "PO-2", ... — no padded leading zeros),
  // scoped to ReceiptType=1 so Purchase Order numbering never collides with any other
  // future receipt-kind screen built on this same generic IM_OrderReceipt spine. Mirrors
  // yarn-card.service.ts's nextInventoryCode() prefix+sequence pattern (no shared numbering
  // service exists to reuse — see that file's own comment on why). Scans ALL rows including
  // soft-deleted ones so a deleted PO's number is never reissued. Purely a *default* — the
  // number is still a plain, user-editable text field on Create (see create() below), same
  // as every other master's Code field in this app.
  async nextReceiptNo(): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "ReceiptNo" as code FROM "IM_OrderReceipt"
      WHERE "ReceiptType" = ${RECEIPT_TYPE} AND "ReceiptNo" ~ '^PO-[0-9]+$'
      ORDER BY (regexp_replace("ReceiptNo", '^PO-', ''))::int DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `PO-${next}`;
  }

  // Application-level uniqueness check for a manually-typed Receipt No — mirrors the
  // ConflictException("<field> already exists") convention used by yarn-card.service.ts's
  // assertUnique. Case-insensitive/trimmed comparison, scoped to ReceiptType=1.
  private async assertReceiptNoAvailable(receiptNo: string, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" FROM "IM_OrderReceipt"
      WHERE "ReceiptType" = ${RECEIPT_TYPE} AND "IsDeleted" = 0 AND LOWER("ReceiptNo") = LOWER(${receiptNo}) ${exclude}
    `);
    if (rows.length) throw new ConflictException('A purchase order already exists with this number.');
  }

  private static readonly MAX_CODE_RETRIES = 5;

  // Direct-write bypass guard — same shape as inventory-receipt.service.ts's own create()/
  // update() guard on IsApproved. A plain POST/PUT can't set Approved/Rejected state directly
  // once this screen is configured to require approval; that state only ever changes through
  // approve()/reject() below (permission-checked, pending-state-checked, self-approval-checked,
  // atomic). No-op (unchanged) whenever approval isn't required for this screen.
  private async assertNoDirectApprovalWrite(dto: Record<string, any>) {
    if (dto.isApproved === undefined && dto.isRejected === undefined) return;
    if (await this.approvalSvc.isApprovalRequired(APPROVAL_SCREEN_KEY)) {
      throw new ForbiddenException('This screen requires approval — use the Approve/Reject actions instead of setting status directly.');
    }
  }

  async create(dto: Record<string, any>, userId: number) {
    await this.assertNoDirectApprovalWrite(dto);
    const toDb = await this.headerToDb();
    const manualReceiptNo = String(dto.receiptNo ?? '').trim();

    if (manualReceiptNo) {
      await this.assertReceiptNoAvailable(manualReceiptNo);
      const effective = { ...dto, receiptType: RECEIPT_TYPE, receiptNo: manualReceiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_OrderReceipt" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        if (msg.includes('23505') && msg.includes('ReceiptNo')) throw new ConflictException('A purchase order already exists with this number.');
        throw err;
      }
    }

    // No number typed — fall back to the auto-generated default, same collision-retry
    // loop as before (covers the race where a second Save lands between preview and insert).
    for (let attempt = 1; attempt <= PurchaseOrderService.MAX_CODE_RETRIES; attempt++) {
      const receiptNo = await this.nextReceiptNo();
      const effective = { ...dto, receiptType: RECEIPT_TYPE, receiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_OrderReceipt" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('ReceiptNo');
        if (isCodeCollision && attempt < PurchaseOrderService.MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Receipt No — please try again.');
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    await this.get(id);
    await this.assertNoDirectApprovalWrite(dto);
    const toDb = await this.headerToDb();
    const cols = HEADER_COLUMNS.filter((c) => c !== 'ReceiptNo' && c !== 'ReceiptType' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_OrderReceipt" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$executeRaw`
      UPDATE "IM_OrderReceipt" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }

  // --- Approval (General Settings -> Approval Configuration) ------------------------------
  // Same thin-adapter shape as inventory-receipt.service.ts's own submitForApproval/approve/
  // reject/getApprovalStatus: this owns the one existence check (this.get — throws NotFound for
  // a deleted/nonexistent PO, closing the "approve a deleted transaction" gap) plus the one
  // Purchase-Order-specific completion side effect; every permission/pending-state/self-approval/
  // idempotency/audit concern is owned entirely by the generic ApprovalService.

  async submitForApproval(id: number, userId: string) {
    await this.get(id);
    return this.approvalSvc.submit(APPROVAL_SCREEN_KEY, String(id), userId);
  }

  // Unlike inventory-receipt.service.ts's approve() (which preserves a genuinely pre-existing
  // "unrestricted Approve button" behavior for when approval isn't required), Purchase Order
  // never had ANY prior approve/reject UI — there is no legacy behavior to preserve here. So
  // both methods always delegate to ApprovalService first: with no ApprovalRequest row (approval
  // not required / never submitted), that call itself throws NotFoundException, and the header
  // column flip below never runs — IsApproved/IsRejected can only ever change as the direct
  // consequence of a real, permission-checked approval decision.
  async approve(id: number, userId: string, remarks: string | undefined) {
    await this.get(id);
    // Both writes — the ApprovalRequest decision (+ AuditLog) and this screen's own
    // IsApproved/ApprovedAt/ApprovedBy/IsRejected/RejectedAt/RejectedBy/RejectedExplanation
    // column flip — happen in one atomic transaction, same reasoning as
    // inventory-receipt.service.ts's own approve(): neither can commit without the other.
    const rows = await this.prisma.$transaction(async (tx) => {
      await this.approvalSvc.approve(APPROVAL_SCREEN_KEY, String(id), userId, remarks, tx);
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

  async reject(id: number, userId: string, remarks: string) {
    await this.get(id);
    const rows = await this.prisma.$transaction(async (tx) => {
      await this.approvalSvc.reject(APPROVAL_SCREEN_KEY, String(id), userId, remarks, tx);
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

  getApprovalStatus(id: number) {
    return this.approvalSvc.getStatus(APPROVAL_SCREEN_KEY, String(id));
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

  async createItem(orderReceiptId: number, dto: Record<string, any>, userId: number) {
    // Required-field check branches by Type: Service lines identify by ServiceCardId, every
    // other type (Inventory, Fixed Asset) is an IM_Item row identified by InventoryId.
    if (Number(dto.itemType) === ITEM_TYPE_SERVICE) {
      if (!dto.serviceCardId) throw new BadRequestException('A service is required');
    } else if (!dto.inventoryId) {
      throw new BadRequestException('An inventory item is required');
    }
    const toDb = await this.itemToDb();
    const effective = { ...dto, receiptType: RECEIPT_TYPE };
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"OrderReceiptId"', '"ReceiptType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_OrderReceiptItem" (${colList})
      VALUES (${orderReceiptId}, ${RECEIPT_TYPE}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async updateItem(itemId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemToDb();
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "IM_OrderReceiptItem" WHERE "RecId" = ${itemId}`);
      if (!rows.length) throw new NotFoundException('Line not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_OrderReceiptItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${itemId} AND "IsDeleted" = 0
      RETURNING ${ITEM_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Line not found');
    return sanitizeRawRow(rows[0]);
  }

  async removeItem(itemId: number, userId: number) {
    const result = await this.prisma.$executeRaw`
      UPDATE "IM_OrderReceiptItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId}
    `;
    if (!result) throw new NotFoundException('Line not found');
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

  async createItemVariantLine(orderReceiptItemId: number, dto: Record<string, any>, userId: number) {
    if (!dto.inventoryVariantId) throw new BadRequestException('A variant is required');
    const toDb = await this.itemVariantToDb();
    const effective = { ...dto, receiptType: RECEIPT_TYPE };
    const cols = ITEM_VARIANT_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"OrderReceiptItemId"', '"ReceiptType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_OrderReceiptItemVariant" (${colList})
      VALUES (${orderReceiptItemId}, ${RECEIPT_TYPE}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_VARIANT_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async updateItemVariantLine(variantLineId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemVariantToDb();
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
