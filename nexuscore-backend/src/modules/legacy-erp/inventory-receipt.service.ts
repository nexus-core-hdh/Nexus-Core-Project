import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { ApprovalService } from '../approval/approval.service';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';

// General Settings -> Approval Configuration screenKey for this module — matches this screen's
// real MenuItem.href exactly (the existing screen/module registry), so it lines up with
// whatever an admin configures in the Approval Configuration grid with zero extra mapping.
// Generalizes to the other 16 Receipt Screen Replication types this same service backs, for
// whenever they're wired to the approve/reject routes too — not activated for them yet.
// Exported for inventory-card.service.ts's stockLateral() — Stock on Hand must be gated by
// this exact same screenKey formula, not a second copy of it.
export const screenKeyFor = (receiptType: number) =>
  receiptType === RECEIPT_TYPE
    ? '/dashboard/legacy-erp/inventory-receipts-list'
    : `/dashboard/legacy-erp/inventory-receipts-list?receiptType=${receiptType}`;

// Inventory Receipt — NOT the same entity as Purchase Order. IM_Receipt/IM_ReceiptItem is a
// separate, pre-existing "physical goods receipt" spine (DriverName/PlateNumber/IsApproved —
// logistics/waybill fields IM_OrderReceipt has none of), confirmed via the reference
// screenshot's own tab title "Inventory Receipt [1-Purchase Receipt] [Unapproved] - ...":
// IM_Receipt.ReceiptType=2 -> "Purchase Receipt", its own independent numbering namespace,
// distinct from IM_OrderReceipt.ReceiptType=1 -> "Purchase Order" (purchase-order.service.ts).
// Both tables + IM_ReceiptItem's real FK columns (InventoryId -> IM_Item, UnitId ->
// MD_UnitSetItem, ForexId -> MD_Forex) already existed in the migrated schema — confirmed 0
// rows, first writer. IM_Receipt_IX0 (CompanyId, ReceiptType, ReceiptNo) is a pre-existing
// unique index, reused as-is for numbering-collision safety — no new constraint added.
const HEADER_TABLE = 'IM_Receipt';
const ITEM_TABLE = 'IM_ReceiptItem';
const RECEIPT_TYPE = 2; // "[2-Purchase Receipt]" — see comment above

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source) — raw
// column names as-is, matching exactly what unified-grid.service.ts's own `SELECT *` returns.
export const HEADER_COLUMNS = [
  'ReceiptNo', 'ReceiptType', 'ReceiptDate', 'ShipmentDate', 'DocumentNo',
  'CurrentAccountId', 'InWarehouseId', 'PlateNumber', 'DriverName', 'IsApproved',
] as const;

// Detail grid columns. The first 9 (through 'SpecialCode') are the original editable set —
// Type/Code(->InventoryId)/Name/Explanation/Special Code/Quantity/Unit/Price/Forex — unchanged
// in meaning or persistence behavior. Everything after that is ADDITIVE: real columns that
// already existed on this same physical "IM_ReceiptItem" table (confirmed via
// information_schema — 175 columns total, 0 rows, first reader/writer) but were never selected
// before this pass. Exposing them here only widens the SELECT (ITEM_SELECT below is derived
// straight from this list) — createItem/updateItem still only ever write whichever of these
// keys the caller's dto actually sets (see itemToDb's `!== undefined` filter), so a grid that
// only ever sends the original 9 keys writes exactly what it always did. No new table, no new
// column — every name below is a pre-existing column on the real table, added here purely to
// surface it for read-only display in the Column Manager (see inventory-receipt-line-grid.tsx).
const ITEM_COLUMNS = [
  'ItemOrderNo', 'ItemType', 'InventoryId', 'UnitId', 'Quantity',
  'UnitPrice', 'ForexId', 'Explanation', 'SpecialCode',
  'ManufacturingOrderNo', 'PartyNo', 'LotQuantity',
  'RawWidth', 'RawWeight', 'DyeWidth', 'DyeWeight', 'Fine', 'Pus', 'FabricProductionMethod',
  'GrossQuantity', 'Quantity2', 'Quantity3', 'GrossQuantity2', 'GrossQuantity3',
  'MaterialPrice', 'CostPrice', 'ForexRate', 'ForexUnitPrice',
  'VatIncluded', 'VatRate', 'WithholdingTypeId', 'WithholdingFactor', 'WithholdingDivisor',
  'UnitPrice2', 'UnitPrice3', 'ForexUnitPrice2', 'ForexUnitPrice3',
  'AddToVatBase', 'ExciseTaxRate', 'ExciseTaxAmount',
  'ItemTotal', 'DiscountAmount', 'ExpenseAmount', 'VatAmount', 'VatBaseAmount',
  'WithholdingAmount1', 'WithholdingAmount2', 'NetItemTotal', 'NetQuantity',
  'NetUnitPrice', 'NetUnitPriceForex', 'ItemTotalForex', 'DiscountsTotalForex', 'ExpensesTotalForex',
  'VatAmountForex', 'VatBaseAmountForex', 'WithholdingAmount1Forex', 'WithholdingAmount2Forex', 'NetItemTotalForex',
  'IsClosed', 'IsQCApproved', 'UsedQuantity', 'ReturnedQuantity', 'NoneAllocatableQuantity',
  'IsChecked', 'IsTaxExempted', 'CustomerOrderNo', 'PackageQuantity', 'PackageNo',
  'WorkOrderReceiptItemId', 'VatListGField01', 'VatListGField02',
  'EximIpacItemId', 'EximIpacItemDocumentNo', 'UD_Expfield', 'UD_ShippingMarks',
  // Purchase Receipt -> Current Account -> right-click -> Pending Orders. A real, pre-existing
  // IM_ReceiptItem column (confirmed via information_schema), previously never selected or
  // written by this app — reused as-is to carry the originating Purchase Order line back onto
  // an imported receipt line. No new column.
  'OrderReceiptItemId',
  // Colour — IM_ReceiptItem had no equivalent to IM_OrderReceiptItem's own ColorCardId
  // (confirmed via information_schema: 175 columns, none of them colour-related). Added as the
  // exact same nullable text FK -> "ColorCard"(id) that was already added to IM_OrderReceiptItem
  // for this identical concept — not a new pattern, the same precedent applied to the sibling
  // table. 3 real Purchase Order lines already use ColorCardId, so Pending Orders import needs
  // somewhere real to carry that value onto the receipt line.
  'ColorCardId',
] as const;

// Variant breakdown — exact structural mirror of purchase-order.service.ts's own
// ITEM_VARIANT_TABLE/ITEM_VARIANT_COLUMNS/listItemVariantOptions/listItemVariantLines/
// createItemVariantLine/updateItemVariantLine/removeItemVariantLine (see that file's own
// comment on why this table exists — same real, pre-existing, 0-rows-until-used table shape,
// just "IM_ReceiptItemVariant" instead of "IM_OrderReceiptItemVariant"). No new table.
// "OrderReceiptItemVariantId" (a real, pre-existing column on IM_ReceiptItemVariant, previously
// never selected/written) traces an imported variant line back to the PO variant line it came
// from, the same way IM_ReceiptItem.OrderReceiptItemId already does for the parent line.
const ITEM_VARIANT_TABLE = 'IM_ReceiptItemVariant';
const ITEM_VARIANT_COLUMNS = ['InventoryId', 'InventoryVariantId', 'Quantity', 'NetUnitPrice', 'OrderReceiptItemVariantId'] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', '"InventoryReceiptId" as "inventoryReceiptId"', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_VARIANT_SELECT = Prisma.raw(['"RecId" as id', '"InventoryReceiptItemId" as "inventoryReceiptItemId"', ...ITEM_VARIANT_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class InventoryReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalSvc: ApprovalService,
    private readonly masterLookupSvc: LegacyMasterLookupService,
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

  // Item -> Unit backend enforcement. Reuses legacy-master-lookup.service.ts's own
  // listItemUnits(inventoryId) — the exact same IM_ItemUnitItemSize -> MD_UnitSetItem query
  // Purchase Order's line grid already drives its per-item Unit dropdown from — as the single
  // source of truth for "which UnitIds are actually valid for this item", instead of a second
  // copy of that join. listItemUnits orders by IsMainUnit DESC, so [0] is always the item's
  // configured default/main unit.
  //
  // No inventoryId (e.g. a Service line) -> UnitId passes through untouched, nothing to check
  // against. An inventoryId with zero configured units also passes the given value through
  // (nothing to normalize against — matches today's behavior for such items). Otherwise an
  // unrelated/stale UnitId (left over from a previously selected item, or a tampered payload)
  // is silently normalized to the item's own main unit rather than rejected outright, so saves
  // never hard-fail over a value the frontend itself already prevents a user from picking.
  private async resolveUnitId(inventoryId: any, unitId: any): Promise<number | null | undefined> {
    if (inventoryId === undefined) return unitId;
    if (inventoryId === null) return unitId;
    const validUnits = await this.masterLookupSvc.listItemUnits(Number(inventoryId));
    if (!validUnits.length) return unitId ?? null;
    const requested = unitId != null ? Number(unitId) : null;
    if (requested != null && validUnits.some((u: any) => Number(u.id) === requested)) return requested;
    return Number(validUnits[0].id);
  }

  // `receiptType`/`numberPrefix` default to Purchase Receipt's existing values everywhere below
  // — any caller that doesn't pass them (i.e. every existing InventoryReceiptController route)
  // generates byte-identical SQL to before. Added so receipt-type.controller.ts (the generic
  // "other 11 receipt types" route) can reuse this exact same service instead of duplicating it.
  async list(search?: string, receiptType: number = RECEIPT_TYPE) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "IM_Receipt"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
            AND ("ReceiptNo" ILIKE ${`%${search}%`} OR "DocumentNo" ILIKE ${`%${search}%`})
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "IM_Receipt"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number, receiptType: number = RECEIPT_TYPE) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_Receipt" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
    `);
    if (!rows.length) throw new NotFoundException('Inventory receipt not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByReceiptNo(receiptNo: string, receiptType: number = RECEIPT_TYPE) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_Receipt" WHERE "ReceiptNo" = ${receiptNo} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
    `);
    if (!rows.length) throw new NotFoundException('Inventory receipt not found');
    return sanitizeRawRow(rows[0]);
  }

  // Same pattern as purchase-order.service.ts's nextReceiptNo — "IR-1", "IR-2", ... scoped to
  // ReceiptType=2 on THIS table (IM_Receipt), so it can never collide with Purchase Order's own
  // "PO-N" sequence on the separate IM_OrderReceipt table. Scans all rows incl. soft-deleted so
  // a deleted receipt's number is never reissued. Preview-only default — still a plain,
  // user-editable text field on Create, same convention as every other master's Code field.
  async nextReceiptNo(receiptType: number = RECEIPT_TYPE, numberPrefix: string = 'IR'): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "ReceiptNo" as code FROM "IM_Receipt"
      WHERE "ReceiptType" = ${receiptType} AND "ReceiptNo" ~ ${`^${numberPrefix}-[0-9]+$`}
      ORDER BY (regexp_replace("ReceiptNo", ${`^${numberPrefix}-`}, ''))::int DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${numberPrefix}-${next}`;
  }

  private async assertReceiptNoAvailable(receiptNo: string, excludeId?: number, receiptType: number = RECEIPT_TYPE) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" FROM "IM_Receipt"
      WHERE "ReceiptType" = ${receiptType} AND "IsDeleted" = 0 AND LOWER("ReceiptNo") = LOWER(${receiptNo}) ${exclude}
    `);
    if (rows.length) throw new ConflictException('An inventory receipt already exists with this number.');
  }

  private static readonly MAX_CODE_RETRIES = 5;

  // General Settings -> Approval Configuration is OFF for this screen -> the record must land
  // Approved immediately, with zero manual action, by reusing approve() itself (the same
  // IsApproved/UpdatedAt/UpdatedBy write it always made, inside the same transaction it always
  // used) rather than a second copy of that write here. approve() already no-ops the
  // ApprovalRequest/AuditLog side when approval isn't required (see its own comment), so this
  // adds no new behavior for the ON case — it only ever runs the branch that already existed.
  // Idempotent by construction: it's a flag UPDATE (IsApproved=1), not a stock/quantity mutation
  // — stock itself is computed live from IM_ReceiptItem (see inventory-card.service.ts), so
  // calling this on every not-required create/update can never inflate it.
  private async autoApproveIfNotRequired(id: number, userId: number, receiptType: number) {
    if (await this.approvalSvc.isApprovalRequired(screenKeyFor(receiptType))) return this.get(id, receiptType);
    return this.approve(id, String(userId), undefined, receiptType);
  }

  async create(dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE, numberPrefix: string = 'IR') {
    // Same bypass guard as update() below — a direct API call can't create a record already
    // marked approved when this screen requires approval. No-op (unchanged) otherwise.
    if (dto.isApproved !== undefined && await this.approvalSvc.isApprovalRequired(screenKeyFor(receiptType))) {
      throw new ForbiddenException('This screen requires approval — Is Approved cannot be set directly.');
    }
    const toDb = await this.headerToDb();
    const manualReceiptNo = String(dto.receiptNo ?? '').trim();

    if (manualReceiptNo) {
      await this.assertReceiptNoAvailable(manualReceiptNo, undefined, receiptType);
      const effective = { ...dto, receiptType, receiptNo: manualReceiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_Receipt" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return this.autoApproveIfNotRequired(rows[0].id, userId, receiptType);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        if (msg.includes('23505') && msg.includes('ReceiptNo')) throw new ConflictException('An inventory receipt already exists with this number.');
        throw err;
      }
    }

    for (let attempt = 1; attempt <= InventoryReceiptService.MAX_CODE_RETRIES; attempt++) {
      const receiptNo = await this.nextReceiptNo(receiptType, numberPrefix);
      const effective = { ...dto, receiptType, receiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_Receipt" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return this.autoApproveIfNotRequired(rows[0].id, userId, receiptType);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('ReceiptNo');
        if (isCodeCollision && attempt < InventoryReceiptService.MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Receipt No — please try again.');
  }

  // BUG FIX (found during live verification of the other 11 receipt types): this method's own
  // internal existence-check used to call `this.get(id)` with no receiptType arg — once get()
  // gained an optional receiptType param defaulting to RECEIPT_TYPE(=2), that internal call
  // silently filtered every non-Purchase-Receipt record out, 404ing update() for every other
  // type even though the caller (receipt-type.controller.ts) had already verified ownership
  // correctly. Threading receiptType through here too closes that gap.
  async update(id: number, dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE) {
    await this.get(id, receiptType);
    // Approval Configuration — when approval is required for this screen, IsApproved can only
    // be set via the dedicated approve() flow below (permission-checked, pending-state-checked,
    // self-approval-checked). Closes the exact bypass this framework exists to close: a plain
    // PUT could previously set IsApproved=true unconditionally. When approval isn't required
    // (the default), this is a no-op and update() behaves byte-for-byte as before.
    if (dto.isApproved !== undefined && await this.approvalSvc.isApprovalRequired(screenKeyFor(receiptType))) {
      throw new ForbiddenException('This screen requires approval — use the Approve action instead of setting Is Approved directly.');
    }
    const toDb = await this.headerToDb();
    const cols = HEADER_COLUMNS.filter((c) => c !== 'ReceiptNo' && c !== 'ReceiptType' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.autoApproveIfNotRequired(id, userId, receiptType);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_Receipt" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    // Same "approval OFF -> always land Approved, zero manual action" rule as create() above —
    // see autoApproveIfNotRequired's own comment. Saving/updating an already-Approved record
    // just re-flips the same IsApproved=1 it already had, so this is safe to run unconditionally
    // on every header Save while approval isn't required.
    return this.autoApproveIfNotRequired(id, userId, receiptType);
  }

  // Same bug/fix as update() above — remove() also self-checks existence via this.get(id).
  async remove(id: number, userId: number, receiptType: number = RECEIPT_TYPE) {
    await this.get(id, receiptType);
    await this.prisma.$executeRaw`
      UPDATE "IM_Receipt" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }

  // --- Approval (General Settings -> Approval Configuration) ------------------------------
  // Thin adapter over the generic ApprovalService: it owns permission/state/self-approval
  // checks and the ApprovalRequest/AuditLog rows; this only performs the one Purchase-Receipt-
  // specific completion side effect (the same "SET IsApproved = 1" the old row-action already
  // made) once the policy engine confirms the approval actually succeeded.

  async submitForApproval(id: number, userId: string, receiptType: number = RECEIPT_TYPE) {
    await this.get(id, receiptType);
    return this.approvalSvc.submit(screenKeyFor(receiptType), String(id), userId);
  }

  async approve(id: number, userId: string, remarks: string | undefined, receiptType: number = RECEIPT_TYPE) {
    await this.get(id, receiptType);
    const screenKey = screenKeyFor(receiptType);
    // "When approval is NOT required, existing workflow remains completely unchanged" — this
    // screen's original Approval row-action was an unrestricted direct write, so it stays
    // exactly that (no permission/state/self-approval gate, no ApprovalRequest involved) unless
    // the screen is actually configured to require it.
    const approvalRequired = await this.approvalSvc.isApprovalRequired(screenKey);
    // Both writes (the ApprovalRequest decision + AuditLog row, and this screen's own
    // IsApproved flip) happen in ONE atomic transaction — if the ApprovalRequest update fails
    // (e.g. a concurrent approve already decided it), IsApproved is never touched; if the
    // IsApproved UPDATE fails, the ApprovalRequest decision rolls back too, so the two can never
    // observably diverge (approval-required transaction can never sit "approved" with stock
    // still gated, or "not approved" with stock already counting it).
    const rows = await this.prisma.$transaction(async (tx) => {
      if (approvalRequired) {
        await this.approvalSvc.approve(screenKey, String(id), userId, remarks, tx);
      }
      // Number(userId)||1 matches this file's own existing UpdatedBy convention everywhere else
      // (the legacy column is a small numeric id with no real mapping to NexusCore's uuid users).
      return tx.$queryRaw<any[]>(Prisma.sql`
        UPDATE "IM_Receipt" SET "IsApproved" = 1, "UpdatedAt" = now(), "UpdatedBy" = ${Number(userId) || 1}
        WHERE "RecId" = ${id}
        RETURNING ${HEADER_SELECT}
      `);
    });
    return sanitizeRawRow(rows[0]);
  }

  async reject(id: number, userId: string, remarks: string, receiptType: number = RECEIPT_TYPE) {
    await this.get(id, receiptType);
    return this.approvalSvc.reject(screenKeyFor(receiptType), String(id), userId, remarks);
  }

  async getApprovalStatus(id: number, receiptType: number = RECEIPT_TYPE) {
    return this.approvalSvc.getStatus(screenKeyFor(receiptType), String(id));
  }

  // --- Detail lines (the grid) ------------------------------------------------------------

  async listItems(inventoryReceiptId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "IM_ReceiptItem"
      WHERE "InventoryReceiptId" = ${inventoryReceiptId} AND "IsDeleted" = 0
      ORDER BY "ItemOrderNo", "RecId"
    `);
    const clean = sanitizeRawRow(rows);
    // Pending Orders import — resolve each imported line's originating PO's own ReceiptNo for
    // display (the raw orderReceiptItemId FK alone isn't human-readable). A separate, small
    // follow-up query rather than joining into the 100+-column ITEM_SELECT above, so this can't
    // perturb any existing column's behavior there.
    const linkedIds = clean.map((r: any) => r.orderReceiptItemId).filter((v: any) => v != null);
    if (linkedIds.length) {
      const poRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT poi."RecId" as "orderReceiptItemId", po."ReceiptNo" as "orderReceiptNo"
        FROM "IM_OrderReceiptItem" poi
        JOIN "IM_OrderReceipt" po ON po."RecId" = poi."OrderReceiptId"
        WHERE poi."RecId" IN (${Prisma.join(linkedIds)})
      `);
      const byId = new Map(poRows.map((r: any) => [Number(r.orderReceiptItemId), r.orderReceiptNo]));
      for (const r of clean) {
        if (r.orderReceiptItemId != null) r.orderReceiptNo = byId.get(Number(r.orderReceiptItemId)) ?? null;
      }
    }
    // Variant breakdown read-back — same "separate small follow-up query" shape as the
    // orderReceiptNo lookup above, so it can't perturb ITEM_SELECT's own column behavior.
    // Previously these rows were written (see createItemVariantLine, called from Pending
    // Orders import) but never read back, so save->reload silently dropped them from the
    // API response even though they were persisted correctly. Grouped by
    // inventoryReceiptItemId so each line only ever sees its own rows.
    const itemIds = clean.map((r: any) => r.id);
    if (itemIds.length) {
      const variantRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${ITEM_VARIANT_SELECT} FROM "IM_ReceiptItemVariant"
        WHERE "InventoryReceiptItemId" IN (${Prisma.join(itemIds)}) AND "IsDeleted" = 0
        ORDER BY "RecId"
      `);
      const variantsByItem = new Map<number, any[]>();
      for (const v of sanitizeRawRow(variantRows)) {
        const list = variantsByItem.get(v.inventoryReceiptItemId) ?? [];
        list.push(v);
        variantsByItem.set(v.inventoryReceiptItemId, list);
      }
      for (const r of clean) {
        r.variants = variantsByItem.get(Number(r.id)) ?? [];
      }
    }
    return clean;
  }

  // Server-side re-check of a Pending-Orders-imported line's remaining quantity, from real
  // persisted data only — never trusted from the frontend. Locks the PO line row (SELECT ...
  // FOR UPDATE inside a transaction) so two concurrent receipts against the same line can't
  // both pass this check and jointly over-receive it; reuses this codebase's existing
  // prisma.$transaction convention (see plm-operations.service.ts) rather than introducing a
  // new locking mechanism.
  private async assertPendingQty(tx: Prisma.TransactionClient, orderReceiptItemId: number, requestedQty: number) {
    const poLineRows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT "Quantity" as "orderQty" FROM "IM_OrderReceiptItem"
      WHERE "RecId" = ${orderReceiptItemId} AND "IsDeleted" = 0
      FOR UPDATE
    `);
    if (!poLineRows.length) throw new BadRequestException('The originating Purchase Order line was not found.');
    const receivedRows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM("Quantity"), 0) as "receivedQty" FROM "IM_ReceiptItem"
      WHERE "OrderReceiptItemId" = ${orderReceiptItemId} AND "IsDeleted" = 0
    `);
    const pendingQty = Number(poLineRows[0].orderQty) - Number(receivedRows[0].receivedQty);
    if (requestedQty > pendingQty) {
      throw new BadRequestException(`Cannot receive ${requestedQty} — only ${pendingQty} still pending on this Purchase Order line.`);
    }
  }

  async createItem(inventoryReceiptId: number, dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE) {
    if (!dto.inventoryId) throw new BadRequestException('An inventory item is required');
    const toDb = await this.itemToDb();
    const effective: Record<string, any> = { ...dto, receiptType };
    effective.unitId = await this.resolveUnitId(effective.inventoryId, effective.unitId);
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"InventoryReceiptId"', '"ReceiptType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const insert = (client: Prisma.TransactionClient | PrismaService) => client.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_ReceiptItem" (${colList})
      VALUES (${inventoryReceiptId}, ${receiptType}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_SELECT}
    `);

    if (effective['orderReceiptItemId']) {
      const rows = await this.prisma.$transaction(async (tx) => {
        await this.assertPendingQty(tx, Number(effective['orderReceiptItemId']), Number(effective['quantity'] ?? 0));
        return insert(tx);
      });
      return sanitizeRawRow(rows[0]);
    }

    const rows = await insert(this.prisma);
    return sanitizeRawRow(rows[0]);
  }

  // BUG FIX (found during final data-integrity review): neither method verified that `itemId`
  // actually belongs to the `inventoryReceiptId` in the URL — only the header-level ReceiptType
  // guard was checked upstream. Reproduced live: an item on header A could be mutated/deleted by
  // calling the route with header B's id (same or different type) + item A's real id, since the
  // WHERE clause only ever matched on "RecId". Fixed using the existing "InventoryReceiptId"
  // column already on IM_ReceiptItem (already used by listItems/createItem) — no new column.
  // `inventoryReceiptId` is optional so any caller that omits it keeps today's exact behavior;
  // both controllers (Purchase Receipt's dedicated route and the generic 16-type route) now pass
  // it, so the check is active everywhere in practice.
  async updateItem(itemId: number, dto: Record<string, any>, userId: number, inventoryReceiptId?: number) {
    const toDb = await this.itemToDb();
    const owner = inventoryReceiptId !== undefined ? Prisma.sql`AND "InventoryReceiptId" = ${inventoryReceiptId}` : Prisma.sql``;
    const effective = { ...dto };
    // Only touch Unit when this update actually changes Item and/or Unit — an edit to an
    // unrelated field (e.g. Explanation) must not force a normalization query. When Item
    // changes without an explicit Unit in the same payload, the current InventoryId's line is
    // read so the new item's own main unit still gets resolved (stale-Unit protection even for
    // callers that only send `inventoryId`).
    if (effective.inventoryId !== undefined || effective.unitId !== undefined) {
      let invId = effective.inventoryId;
      if (invId === undefined) {
        const cur = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "InventoryId" as "inventoryId" FROM "IM_ReceiptItem" WHERE "RecId" = ${itemId}
        `);
        invId = cur[0]?.inventoryId ?? null;
      }
      effective.unitId = await this.resolveUnitId(invId, effective.unitId);
    }
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "IM_ReceiptItem" WHERE "RecId" = ${itemId} ${owner}`);
      if (!rows.length) throw new NotFoundException('Line not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, effective[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_ReceiptItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${itemId} AND "IsDeleted" = 0 ${owner}
      RETURNING ${ITEM_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Line not found');
    return sanitizeRawRow(rows[0]);
  }

  // Same bug/fix as updateItem() above.
  async removeItem(itemId: number, userId: number, inventoryReceiptId?: number) {
    const owner = inventoryReceiptId !== undefined ? Prisma.sql`AND "InventoryReceiptId" = ${inventoryReceiptId}` : Prisma.sql``;
    const result = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "IM_ReceiptItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId} ${owner}
    `);
    if (!result) throw new NotFoundException('Line not found');
    return { message: 'Deleted' };
  }

  // --- Variant breakdown -------------------------------------------------------------------
  // Exact structural mirror of purchase-order.service.ts's own listItemVariantOptions/
  // listItemVariantLines/createItemVariantLine/updateItemVariantLine/removeItemVariantLine —
  // same read of IM_ItemVariant/IM_VariantItem, same IM_*ItemVariant write shape, just against
  // IM_ReceiptItemVariant instead of IM_OrderReceiptItemVariant. See that file's own comment on
  // why IM_ItemVariant is empty for any item that isn't variant-enabled — that's real item-
  // master data, not a defect here either.

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

  async listItemVariantLines(inventoryReceiptItemId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_VARIANT_SELECT} FROM "IM_ReceiptItemVariant"
      WHERE "InventoryReceiptItemId" = ${inventoryReceiptItemId} AND "IsDeleted" = 0
      ORDER BY "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async createItemVariantLine(inventoryReceiptItemId: number, dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE) {
    if (!dto.inventoryVariantId) throw new BadRequestException('A variant is required');
    const toDb = await this.itemVariantToDb();
    const effective = { ...dto, receiptType };
    const cols = ITEM_VARIANT_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"InventoryReceiptItemId"', '"ReceiptType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_ReceiptItemVariant" (${colList})
      VALUES (${inventoryReceiptItemId}, ${receiptType}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_VARIANT_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async updateItemVariantLine(variantLineId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemVariantToDb();
    const cols = ITEM_VARIANT_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_VARIANT_SELECT} FROM "IM_ReceiptItemVariant" WHERE "RecId" = ${variantLineId}`);
      if (!rows.length) throw new NotFoundException('Variant line not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_ReceiptItemVariant" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${variantLineId} AND "IsDeleted" = 0
      RETURNING ${ITEM_VARIANT_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Variant line not found');
    return sanitizeRawRow(rows[0]);
  }

  async removeItemVariantLine(variantLineId: number, userId: number) {
    const result = await this.prisma.$executeRaw`
      UPDATE "IM_ReceiptItemVariant" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${variantLineId}
    `;
    if (!result) throw new NotFoundException('Variant line not found');
    return { message: 'Deleted' };
  }
}
