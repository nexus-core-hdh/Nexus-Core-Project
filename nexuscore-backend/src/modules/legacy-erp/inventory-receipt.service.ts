import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { ApprovalService } from '../approval/approval.service';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';
import { resolveLineUnitId, assertValidItemUnit, assertHasBaseUnit, baseQuantitySql, baseQuantityJoinSql, toBaseQuantity, fromBaseQuantitySql } from './unit-conversion.util';
import { DeleteDependencyService } from './delete-dependency.service';
import { ReceiptTraceabilityService } from './receipt-traceability.service';
import { RELATED_IMPORT_SOURCE_TYPES, getReceiptTypeConfig } from './receipt-types.config';
import { getOrderTypeConfig } from './order-types.config';

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
  // Subcontract Type / Subcontract Receipt — only ever populated by the frontend form for
  // receiptType in {11, 12, 134, 133} (see SUBCONTRACT_RECEIPT_TYPES in frontend's
  // receipt-types.ts), but present in HEADER_COLUMNS unconditionally, same convention as
  // DriverName/PlateNumber above (real columns on every row of this shared table, just only
  // meaningful/rendered for certain types). Two brand-new nullable columns — confirmed via a
  // whole-repo + live-schema search that no existing column represented either concept — FK'd
  // to MD_SubcontractType/MD_SubcontractReceipt respectively (see legacy-master-lookup.service.ts's
  // TABLES config), validated against the correct master by assertValidMasterRef() below so
  // neither can ever be cross-mapped into the other's id space.
  'SubcontractTypeId', 'SubcontractReceiptId',
  // Script — the parent Subcontract Order (IM_OrderReceipt, ReceiptType=3) this whole receipt
  // belongs to. A brand-new nullable column (confirmed via live-schema search: no existing
  // header-level FK from IM_Receipt to IM_OrderReceipt — the closest existing link,
  // IM_ReceiptItem.OrderReceiptItemId, is line-level/optional via Pending Orders import, not a
  // mandatory whole-document reference). Optional — no form field sets it on new records anymore
  // (removed per request); validated against IM_OrderReceipt ReceiptType=3 specifically by
  // assertValidScript whenever it IS present, so it can never point at a Purchase Order or any
  // other order type.
  'ScriptId',
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
// Also exported for worklist-fields.service.ts's "purchase-receipt-item" Customize Worklist
// source (see listRelatedImportable() below, the one place that source's fields are actually
// resolved against already-loaded data).
export const ITEM_COLUMNS = [
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
  // Universal Action Menu -> Return/Purchase Receipt submenu. Same precedent as
  // OrderReceiptItemId above: a real, pre-existing IM_ReceiptItem column (already read by
  // delete-dependency.service.ts's own dependency checks), previously never selected or written
  // by createItem/updateItem. Reused as-is to carry a Purchase Return (or Received Connection
  // Receipt) line back to the originating receipt line it's returning against — see
  // assertReturnQty() below, which is the write-time guard for it. No new column.
  'PurchaseReceiptItemId',
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
    private readonly deleteGuard: DeleteDependencyService,
    private readonly traceability: ReceiptTraceabilityService,
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

  // Item -> Unit backend enforcement — moved to unit-conversion.util.ts's resolveLineUnitId
  // (identical logic, unchanged) so Purchase Order can reuse the exact same normalization instead
  // of duplicating it. Thin wrapper kept here so every existing call site below is untouched.
  private resolveUnitId(inventoryId: any, unitId: any): Promise<number | null | undefined> {
    return resolveLineUnitId(this.masterLookupSvc, inventoryId, unitId);
  }

  // `receiptType`/`numberPrefix` default to Purchase Receipt's existing values everywhere below
  // — any caller that doesn't pass them (i.e. every existing InventoryReceiptController route)
  // generates byte-identical SQL to before. Added so receipt-type.controller.ts (the generic
  // "other 11 receipt types" route) can reuse this exact same service instead of duplicating it.
  // Qualified rebuild of HEADER_SELECT (rather than reusing that shared unqualified fragment as-
  // is) — MD_SubcontractType/MD_SubcontractReceipt/IM_OrderReceipt all have their own "RecId"
  // columns too, so an unqualified "RecId" in the SELECT list would be ambiguous the moment
  // they're joined in. Shared by list()/get() below so both resolve Subcontract Type/Receipt/
  // Script's display values identically. Deliberately NOT filtered by InUse/deleted-target-order
  // beyond IsDeleted=0 — an already-saved record referencing a since-deactivated Type/Receipt or
  // a since-deleted Script must still show its real value (spec requirement); only NEW selections
  // are Active-only, enforced client-side by each picker's own search().
  private subcontractJoinedSelect() {
    const qualifiedHeaderSelect = Prisma.raw(
      ['"IM_Receipt"."RecId" as id', ...HEADER_COLUMNS.map((c) => `"IM_Receipt"."${c}" as "${camel(c)}"`)].join(', '),
    );
    return Prisma.sql`
      SELECT ${qualifiedHeaderSelect},
        st."SubcontractTypeName" as "subcontractTypeName",
        sr."SubcontractReceiptName" as "subcontractReceiptName",
        sc."ReceiptNo" as "scriptReceiptNo"
      FROM "IM_Receipt"
      LEFT JOIN "MD_SubcontractType" st ON st."RecId" = "IM_Receipt"."SubcontractTypeId"
      LEFT JOIN "MD_SubcontractReceipt" sr ON sr."RecId" = "IM_Receipt"."SubcontractReceiptId"
      LEFT JOIN "IM_OrderReceipt" sc ON sc."RecId" = "IM_Receipt"."ScriptId"
    `;
  }

  // `subcontractTypeId` — Subcontract Receipts List's own "Subcontractation" filter dropdown;
  // every other existing caller omits it and gets byte-identical rows to before.
  //
  // The extra joins/aggregate here are List-specific (the single-record get() below has no need
  // for them — its own hydrate() already resolves Current Account/Warehouse separately, and has
  // no "Receipt Total" summary field): Current Account Code/Name (FI_Account), Warehouse Code
  // (IM_Warehouse) — both already-existing masters this table's own FK columns already point at,
  // same join shape as subcontractJoinedSelect() above — and a per-receipt "Receipt Total",
  // reusing the EXACT existing calculation already used on the detail form's own line grid
  // (inventory-receipt-line-grid.tsx's totalAmount: `realRows.reduce((s, r) => s +
  // num(r.netItemTotal ?? 0), 0)`) — same NetItemTotal column, same "null treated as 0" rule,
  // just computed server-side as SUM() instead of client-side reduce() so it can be a sortable/
  // searchable list column without loading every receipt's full line grid.
  async list(search?: string, receiptType: number = RECEIPT_TYPE, subcontractTypeId?: number) {
    const qualifiedHeaderSelect = Prisma.raw(
      ['"IM_Receipt"."RecId" as id', ...HEADER_COLUMNS.map((c) => `"IM_Receipt"."${c}" as "${camel(c)}"`)].join(', '),
    );
    const searchFilter = search
      ? Prisma.sql`AND (
          "IM_Receipt"."ReceiptNo" ILIKE ${`%${search}%`}
          OR "IM_Receipt"."DocumentNo" ILIKE ${`%${search}%`}
          OR acc."CurrentAccountCode" ILIKE ${`%${search}%`}
          OR acc."CurrentAccountName" ILIKE ${`%${search}%`}
          OR wh."WarehouseCode" ILIKE ${`%${search}%`}
          OR wh."WarehouseName" ILIKE ${`%${search}%`}
          OR st."SubcontractTypeName" ILIKE ${`%${search}%`}
        )`
      : Prisma.sql``;
    const subcontractTypeFilter = subcontractTypeId !== undefined
      ? Prisma.sql`AND "IM_Receipt"."SubcontractTypeId" = ${subcontractTypeId}`
      : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${qualifiedHeaderSelect},
        st."SubcontractTypeName" as "subcontractTypeName",
        acc."CurrentAccountCode" as "currentAccountCode",
        acc."CurrentAccountName" as "currentAccountName",
        wh."WarehouseCode" as "warehouseCode",
        COALESCE(tot."total", 0) as "receiptTotal"
      FROM "IM_Receipt"
      LEFT JOIN "MD_SubcontractType" st ON st."RecId" = "IM_Receipt"."SubcontractTypeId"
      LEFT JOIN "FI_Account" acc ON acc."RecId" = "IM_Receipt"."CurrentAccountId"
      LEFT JOIN "IM_Warehouse" wh ON wh."RecId" = "IM_Receipt"."InWarehouseId"
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(ri."NetItemTotal", 0)) as total
        FROM "IM_ReceiptItem" ri
        WHERE ri."InventoryReceiptId" = "IM_Receipt"."RecId" AND ri."IsDeleted" = 0
      ) tot ON true
      WHERE "IM_Receipt"."IsDeleted" = 0 AND "IM_Receipt"."ReceiptType" = ${receiptType} ${searchFilter} ${subcontractTypeFilter}
      ORDER BY "IM_Receipt"."ReceiptNo" DESC LIMIT 50
    `);
    return sanitizeRawRow(rows);
  }

  async get(id: number, receiptType: number = RECEIPT_TYPE) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      ${this.subcontractJoinedSelect()}
      WHERE "IM_Receipt"."RecId" = ${id} AND "IM_Receipt"."IsDeleted" = 0 AND "IM_Receipt"."ReceiptType" = ${receiptType}
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

  // Subcontract Type / Subcontract Receipt write-time guard — confirms a submitted id genuinely
  // exists in the SPECIFIC master table it's supposed to reference (soft-deleted rows excluded,
  // same "IsDeleted = 0" convention as every other master here), so an id that only exists in
  // the OTHER master (or doesn't exist at all) is rejected outright. This is what makes "no
  // cross-mapping between Type and Receipt" a backend guarantee rather than a frontend-only
  // convention — the frontend never being the authority on this was an explicit requirement.
  // Deliberately does NOT check InUse/Active: an already-saved record referencing a since-
  // deactivated value must keep loading/saving correctly (only NEW selections are restricted to
  // Active rows, and that restriction already lives client-side in the picker's own active-only
  // search — see legacy-master-lookup.service.ts's search()).
  private async assertValidMasterRef(table: 'MD_SubcontractType' | 'MD_SubcontractReceipt', id: number, fieldLabel: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM "${Prisma.raw(table)}" WHERE "RecId" = ${id} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new BadRequestException(`Invalid ${fieldLabel} selected.`);
  }

  // Script — validated against IM_OrderReceipt filtered to ReceiptType=3 specifically (Subcontract
  // Order), the same "validate against the CORRECT table" guarantee assertValidMasterRef gives
  // Subcontract Type/Receipt — an id belonging to a Purchase Order (ReceiptType=1) or any other
  // order type is rejected, not silently accepted.
  private async assertValidScript(scriptId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM "IM_OrderReceipt" WHERE "RecId" = ${scriptId} AND "ReceiptType" = 3 AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new BadRequestException('Invalid Script selected.');
  }

  private async assertValidSubcontractRefs(dto: Record<string, any>) {
    if (dto.subcontractTypeId !== undefined && dto.subcontractTypeId !== null) {
      await this.assertValidMasterRef('MD_SubcontractType', Number(dto.subcontractTypeId), 'Subcontract Type');
    }
    if (dto.subcontractReceiptId !== undefined && dto.subcontractReceiptId !== null) {
      await this.assertValidMasterRef('MD_SubcontractReceipt', Number(dto.subcontractReceiptId), 'Subcontract Receipt');
    }
    if (dto.scriptId !== undefined && dto.scriptId !== null) {
      await this.assertValidScript(Number(dto.scriptId));
    }
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
    await this.assertValidSubcontractRefs(dto);
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
    await this.assertValidSubcontractRefs(dto);
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
    await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('IM_Receipt', id, tx);
      await tx.$executeRaw`
        UPDATE "IM_Receipt" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
      `;
    });
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

  // Universal Action Menu -> "Return / Purchase Receipt" submenu, from the Receipt/Return/
  // Received-Connection screen side (mirror of purchase-order.service.ts's own
  // listRelatedReceipts, same shared ReceiptTraceabilityService — no duplicate SQL). Walks back
  // to the originating Purchase Order (if any) and returns that PO's whole receipt family minus
  // this record itself; a receipt never linked to a PO legitimately returns [].
  async listRelatedReceipts(id: number, receiptType: number = RECEIPT_TYPE) {
    return this.traceability.listForReceipt(id, receiptType);
  }

  // Purchase Return -> Current Account -> Universal Action Menu -> "Import Related Receipt".
  // Current-Account-aware source picker: every non-fully-consumed line from an existing receipt
  // of a required source type (RELATED_IMPORT_SOURCE_TYPES — Receipt Type 2 "Purchase Receipt"
  // and Receipt Type 11 "Outside Process Receive Receipt") under the given Current Account,
  // eligible to be linked onto a NEW Purchase Return line via the existing IM_ReceiptItem.
  // PurchaseReceiptItemId self-reference — the exact same column/relationship assertReturnQty()
  // already enforces. AvailableQty here uses the identical formula (ReceivedQty - SUM(already-
  // connected lines' Qty), Base-Unit normalized) purely as a read-side aggregate;
  // createItem()'s/updateItem()'s existing purchaseReceiptItemId branches re-run the single-line
  // version of this same check server-side at actual import/save time, so nothing here is
  // trusted as the final word — this method only decides what's OFFERED. Exposed only via the
  // generic receipt-type route (receipt-type.controller.ts), guarded to Purchase Return (122)
  // only — see assertRelatedImportSource's own comment for why Purchase Return is the one and
  // only valid TARGET for this workflow, even though this query itself doesn't need to know that.
  // Approval gate mirrors listPending()/stockSumSql()'s own NOT EXISTS pattern, keyed per-row by
  // the SOURCE line's own receipt type (2 and 11 have different screenKeys) via a CASE, since
  // source lines here can come from either type — a source receipt still pending_approval or
  // rejected isn't offered (nothing "received" yet to import from).
  async listRelatedImportable(currentAccountId: number) {
    const srcInvId = Prisma.sql`ri."InventoryId"`;
    const srcUnitId = Prisma.sql`ri."UnitId"`;
    const srcReceivedBaseQty = baseQuantitySql(Prisma.sql`ri."Quantity"`, srcInvId, srcUnitId, 'src');
    const srcUnitJoin = baseQuantityJoinSql(srcInvId, srcUnitId, 'src');
    const consumedBaseQty = baseQuantitySql(Prisma.sql`c."Quantity"`, Prisma.sql`c."InventoryId"`, Prisma.sql`c."UnitId"`, 'c');
    const consumedUnitJoin = baseQuantityJoinSql(Prisma.sql`c."InventoryId"`, Prisma.sql`c."UnitId"`, 'c');
    const purchaseReceiptKey = screenKeyFor(2);
    const outsideProcessReceiveKey = screenKeyFor(11);

    // Customize Worklist — "only render customized fields whose values can actually be resolved
    // from the dialog's existing loaded data" (no per-row/N+1 fetch for a selected extra field).
    // Every column worklist-fields.service.ts's "purchase-receipt"/"purchase-receipt-item"
    // sources can offer is selected here, in this SAME query, reusing HEADER_COLUMNS/ITEM_COLUMNS
    // wholesale — the handful already selected by name above (ReceiptNo/ReceiptType/ReceiptDate
    // on the header; InventoryId/UnitId/Quantity/UnitPrice/Explanation/ColorCardId on the item)
    // are excluded here only to avoid a duplicate SQL alias for the identical column.
    const CORE_HEADER_COLS = new Set<string>(['ReceiptNo', 'ReceiptType', 'ReceiptDate']);
    // BUG FIX: 'PurchaseReceiptItemId' must also be excluded here — it's a real ITEM_COLUMNS
    // entry (the self-reference column, mostly null on these SOURCE lines), but this query
    // already aliases ri."RecId" as "purchaseReceiptItemId" (the line's own identity — what the
    // frontend keys/imports by). Two SELECT columns sharing one alias means Postgres/Prisma just
    // returns both under that single JS property, with the LATER one silently overwriting the
    // earlier — extraItemSelect being appended after the dedicated alias meant every row's real
    // id was clobbered by its (usually null, occasionally coincidentally-colliding) self-
    // reference value, producing the "duplicate key" React warning from two lines both landing
    // on `line-null` (or, worse, two different lines colliding on the same non-null id).
    const CORE_ITEM_COLS = new Set<string>(['InventoryId', 'UnitId', 'Quantity', 'UnitPrice', 'Explanation', 'ColorCardId', 'PurchaseReceiptItemId']);
    const extraHeaderCols = HEADER_COLUMNS.filter((c) => !CORE_HEADER_COLS.has(c));
    const extraItemCols = ITEM_COLUMNS.filter((c) => !CORE_ITEM_COLS.has(c));
    const extraHeaderSelect = Prisma.raw(extraHeaderCols.map((c) => `rec."${c}" as "${camel(c)}"`).join(', '));
    const extraItemSelect = Prisma.raw(extraItemCols.map((c) => `ri."${c}" as "${camel(c)}"`).join(', '));

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        rec."RecId" as "sourceReceiptId", rec."ReceiptNo" as "sourceReceiptNo",
        rec."ReceiptType" as "sourceReceiptType", rec."ReceiptDate" as "sourceReceiptDate",
        ri."RecId" as "purchaseReceiptItemId", ri."InventoryId" as "inventoryId", ri."Explanation" as "explanation",
        ri."Quantity" as "receivedQty", ri."UnitId" as "unitId", ri."UnitPrice" as "unitPrice", ri."ColorCardId" as "colorCardId",
        i."InventoryCode" as "code", i."InventoryName" as "name",
        base_unit.id as "baseUnitId", base_unit.code as "baseUnitCode",
        ${srcReceivedBaseQty} as "receivedBaseQty",
        (${srcReceivedBaseQty} - COALESCE(consumed."baseQty", 0)) as "availableBaseQty",
        ${fromBaseQuantitySql(Prisma.sql`(${srcReceivedBaseQty} - COALESCE(consumed."baseQty", 0))`, 'src')} as "availableQty",
        ${extraHeaderSelect}, ${extraItemSelect}
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" rec ON rec."RecId" = ri."InventoryReceiptId" AND rec."IsDeleted" = 0
      LEFT JOIN "IM_Item" i ON i."RecId" = ri."InventoryId"
      ${srcUnitJoin}
      LEFT JOIN LATERAL (
        SELECT usi."RecId" as id, usi."UnitCode" as code
        FROM "IM_ItemUnitItemSize" iuis
        JOIN "MD_UnitSetItem" usi ON usi."RecId" = iuis."UnitItemId"
        WHERE iuis."InventoryId" = ri."InventoryId" AND iuis."IsDeleted" = 0 AND iuis."IsMainUnit" = 1
        LIMIT 1
      ) base_unit ON true
      LEFT JOIN LATERAL (
        SELECT SUM(${consumedBaseQty}) as "baseQty"
        FROM "IM_ReceiptItem" c
        ${consumedUnitJoin}
        WHERE c."PurchaseReceiptItemId" = ri."RecId" AND c."IsDeleted" = 0
      ) consumed ON true
      WHERE ri."IsDeleted" = 0
        AND rec."ReceiptType" IN (${Prisma.join(RELATED_IMPORT_SOURCE_TYPES)})
        AND rec."CurrentAccountId" = ${currentAccountId}
        AND (${srcReceivedBaseQty} - COALESCE(consumed."baseQty", 0)) > 0
        AND NOT EXISTS (
          SELECT 1 FROM "ApprovalRequest" ar
          WHERE ar."screenKey" = CASE rec."ReceiptType" WHEN 2 THEN ${purchaseReceiptKey} WHEN 11 THEN ${outsideProcessReceiveKey} END
            AND ar."transactionId" = rec."RecId"::text AND ar."status" <> 'approved'
        )
      ORDER BY rec."ReceiptDate" DESC, rec."RecId" DESC, ri."ItemOrderNo", ri."RecId"
    `);
    const clean = sanitizeRawRow(rows);

    const byReceipt = new Map<number, { id: number; receiptNo: string; receiptDate: any; receiptType: number; label: string; lines: any[] } & Record<string, any>>();
    for (const r of clean) {
      if (!byReceipt.has(r.sourceReceiptId)) {
        const headerExtra: Record<string, any> = {};
        for (const c of extraHeaderCols) headerExtra[camel(c)] = r[camel(c)];
        byReceipt.set(r.sourceReceiptId, {
          id: r.sourceReceiptId, receiptNo: r.sourceReceiptNo, receiptDate: r.sourceReceiptDate,
          receiptType: r.sourceReceiptType,
          label: r.sourceReceiptType === 2 ? 'Purchase Receipt' : (getReceiptTypeConfig(r.sourceReceiptType)?.label ?? `Receipt Type ${r.sourceReceiptType}`),
          lines: [],
          ...headerExtra,
        });
      }
      const itemExtra: Record<string, any> = {};
      for (const c of extraItemCols) itemExtra[camel(c)] = r[camel(c)];
      byReceipt.get(r.sourceReceiptId)!.lines.push({
        purchaseReceiptItemId: r.purchaseReceiptItemId, inventoryId: r.inventoryId, code: r.code, name: r.name,
        explanation: r.explanation, unitId: r.unitId, unitPrice: r.unitPrice, colorCardId: r.colorCardId,
        receivedQty: r.receivedQty, availableQty: r.availableQty,
        ...itemExtra,
        baseUnitId: r.baseUnitId, baseUnitCode: r.baseUnitCode,
        receivedBaseQty: r.receivedBaseQty, availableBaseQty: r.availableBaseQty,
      });
    }
    return Array.from(byReceipt.values());
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
    // Related Receipt import — same "separate small follow-up query" shape as the orderReceiptNo
    // lookup above, resolving each purchaseReceiptItemId-linked line's source receipt (ReceiptNo
    // + ReceiptType, so the frontend can show a real label via getReceiptTypeConfig) for display.
    const relatedSourceIds = clean.map((r: any) => r.purchaseReceiptItemId).filter((v: any) => v != null);
    if (relatedSourceIds.length) {
      const sourceRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT src."RecId" as "purchaseReceiptItemId", rec."ReceiptNo" as "sourceReceiptNo", rec."ReceiptType" as "sourceReceiptType"
        FROM "IM_ReceiptItem" src
        JOIN "IM_Receipt" rec ON rec."RecId" = src."InventoryReceiptId"
        WHERE src."RecId" IN (${Prisma.join(relatedSourceIds)})
      `);
      const byId = new Map(sourceRows.map((r: any) => [Number(r.purchaseReceiptItemId), r]));
      for (const r of clean) {
        if (r.purchaseReceiptItemId != null) {
          const src = byId.get(Number(r.purchaseReceiptItemId));
          r.sourceReceiptNo = src?.sourceReceiptNo ?? null;
          r.sourceReceiptType = src?.sourceReceiptType ?? null;
        }
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
  // Base Unit + Unit Conversion (spec Section 6): the PO line's OrderQty and every prior receipt
  // line's Quantity can legitimately be in different units (a Bag ordered, received partly in Kg),
  // so this now normalizes everything to Base Unit before comparing — reusing the one conversion
  // formula in unit-conversion.util.ts, not a second copy of purchase-order.service.ts's own
  // listPending logic. `requestedInventoryId`/`requestedUnitId` are the new receipt line's own
  // item/unit (needed to convert `requestedQty` into Base Unit the same way).
  // `excludeItemId` — same purpose as assertReturnQty's own (see that method's comment): when
  // re-validating a line that ALREADY holds this same orderReceiptItemId (updateItem editing an
  // existing imported line), that line's own current quantity is itself part of the "already
  // received" SUM below; excluding its own RecId is what lets an unchanged (or reduced) quantity
  // keep passing, correctly capping only genuine increases. Omitted by createItem's own call
  // site, where the row being inserted has no RecId yet.
  private async assertPendingQty(
    tx: Prisma.TransactionClient,
    orderReceiptItemId: number,
    requestedQty: number,
    requestedInventoryId: any,
    requestedUnitId: any,
    excludeItemId?: number,
  ) {
    const poLineRows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT poi."Quantity" as "orderQty",
        ${baseQuantitySql(Prisma.sql`poi."Quantity"`, Prisma.sql`poi."InventoryId"`, Prisma.sql`poi."UnitId"`, 'po')} as "orderBaseQty"
      FROM "IM_OrderReceiptItem" poi
      ${baseQuantityJoinSql(Prisma.sql`poi."InventoryId"`, Prisma.sql`poi."UnitId"`, 'po')}
      WHERE poi."RecId" = ${orderReceiptItemId} AND poi."IsDeleted" = 0
      FOR UPDATE OF poi
    `);
    if (!poLineRows.length) throw new BadRequestException('The originating order line was not found.');
    const excludeSql = excludeItemId !== undefined ? Prisma.sql`AND ri."RecId" != ${excludeItemId}` : Prisma.sql``;
    const receivedRows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM(
        ${baseQuantitySql(Prisma.sql`ri."Quantity"`, Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri')}
      ), 0) as "receivedBaseQty"
      FROM "IM_ReceiptItem" ri
      ${baseQuantityJoinSql(Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'ri')}
      WHERE ri."OrderReceiptItemId" = ${orderReceiptItemId} AND ri."IsDeleted" = 0 ${excludeSql}
    `);
    const requestedBaseQty = await toBaseQuantity(this.prisma, requestedInventoryId, requestedUnitId, requestedQty);
    const pendingBaseQty = Number(poLineRows[0].orderBaseQty) - Number(receivedRows[0].receivedBaseQty);
    if (requestedBaseQty > pendingBaseQty) {
      throw new BadRequestException(`Cannot receive this quantity — only ${pendingBaseQty} still pending (Base Unit) on this order line.`);
    }
  }

  // Workflow isolation (spec: "Purchase Receipt has no business role in the Subcontract Order
  // workflow and must not be used as ... a receiving target"). assertPendingQty above only ever
  // checked the QUANTITY still pending — nothing stopped a Purchase Receipt (or any other type)
  // from calling createItem with an orderReceiptItemId belonging to a DIFFERENT order type's line
  // (e.g. a Subcontract Order's), since that check is (correctly) type-agnostic by itself. This
  // is the missing write-time pairing guard: order-types.config.ts's own receivingReceiptType is
  // the single authoritative mapping (Purchase Order=1 -> Purchase Receipt=2, Subcontract
  // Order=3 -> Outside Process Receive Receipt=11) — the same source purchase-order.service.ts's
  // listPending() now reads for its own approval-gate/display-side filtering, so both the write
  // path (here) and the read path can never drift apart into two different pairings. Also closes
  // the Current-Account isolation gap this same "orderReceiptItemId" path had (mirrors
  // assertRelatedImportSource's identical Current-Account check for the sibling
  // "purchaseReceiptItemId" self-reference below) — a hand-crafted request naming another
  // account's order line is rejected regardless of what the UI ever showed.
  private async assertPendingSource(tx: Prisma.TransactionClient, inventoryReceiptId: number, orderReceiptItemId: number, receiptType: number) {
    const rows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT
        (SELECT "CurrentAccountId" FROM "IM_Receipt" WHERE "RecId" = ${inventoryReceiptId}) as "targetAccountId",
        source_po."CurrentAccountId" as "sourceAccountId",
        source_po."ReceiptType" as "sourceOrderType"
      FROM "IM_OrderReceiptItem" source_oi
      JOIN "IM_OrderReceipt" source_po ON source_po."RecId" = source_oi."OrderReceiptId"
      WHERE source_oi."RecId" = ${orderReceiptItemId} AND source_oi."IsDeleted" = 0
    `);
    if (!rows.length) throw new BadRequestException('The originating order line was not found.');
    const { targetAccountId, sourceAccountId, sourceOrderType } = rows[0];
    if (targetAccountId == null || sourceAccountId == null || Number(targetAccountId) !== Number(sourceAccountId)) {
      throw new BadRequestException('The originating order line belongs to a different Current Account and cannot be received.');
    }
    const expectedReceivingType = getOrderTypeConfig(Number(sourceOrderType))?.receivingReceiptType;
    if (expectedReceivingType != null && Number(receiptType) !== expectedReceivingType) {
      const orderLabel = getOrderTypeConfig(Number(sourceOrderType))?.label ?? `Order Type ${sourceOrderType}`;
      const receivingLabel = getReceiptTypeConfig(expectedReceivingType)?.label ?? `Receipt Type ${expectedReceivingType}`;
      throw new BadRequestException(`${orderLabel} lines can only be received via ${receivingLabel}.`);
    }
  }

  // Purchase Return / Received Connection Receipt quantity guard — same shape as
  // assertPendingQty() above (SELECT ... FOR UPDATE row lock, Base-Unit normalized, run inside
  // the caller's own transaction), applied to the mirror-image relationship: instead of capping
  // a Receipt line against its originating PO line's remaining quantity, this caps a Return line
  // against its originating Receipt line's remaining (received minus already-returned) quantity.
  // Available Return Quantity = Received Quantity - Previously Returned Quantity (spec formula).
  // `excludeItemId` — when re-validating a line that ALREADY holds this same purchaseReceiptItemId
  // (i.e. updateItem editing an existing imported line), that line's own current quantity is
  // itself part of the "already consumed" SUM below; excluding its own RecId from that SUM is
  // what lets an unchanged (or reduced) quantity keep passing, and correctly caps only genuine
  // increases against what's ACTUALLY still available to everyone else. Omitted (undefined) by
  // createItem's own call site, where the row being inserted has no RecId yet — behavior there
  // is completely unchanged.
  private async assertReturnQty(
    tx: Prisma.TransactionClient,
    purchaseReceiptItemId: number,
    requestedQty: number,
    requestedInventoryId: any,
    requestedUnitId: any,
    excludeItemId?: number,
  ) {
    const sourceRows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT ri."Quantity" as "receivedQty",
        ${baseQuantitySql(Prisma.sql`ri."Quantity"`, Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'src')} as "receivedBaseQty"
      FROM "IM_ReceiptItem" ri
      ${baseQuantityJoinSql(Prisma.sql`ri."InventoryId"`, Prisma.sql`ri."UnitId"`, 'src')}
      WHERE ri."RecId" = ${purchaseReceiptItemId} AND ri."IsDeleted" = 0
      FOR UPDATE OF ri
    `);
    if (!sourceRows.length) throw new BadRequestException('The originating receipt line was not found.');
    const excludeSql = excludeItemId !== undefined ? Prisma.sql`AND ret."RecId" != ${excludeItemId}` : Prisma.sql``;
    const returnedRows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM(
        ${baseQuantitySql(Prisma.sql`ret."Quantity"`, Prisma.sql`ret."InventoryId"`, Prisma.sql`ret."UnitId"`, 'ret')}
      ), 0) as "returnedBaseQty"
      FROM "IM_ReceiptItem" ret
      ${baseQuantityJoinSql(Prisma.sql`ret."InventoryId"`, Prisma.sql`ret."UnitId"`, 'ret')}
      WHERE ret."PurchaseReceiptItemId" = ${purchaseReceiptItemId} AND ret."IsDeleted" = 0 ${excludeSql}
    `);
    const requestedBaseQty = await toBaseQuantity(this.prisma, requestedInventoryId, requestedUnitId, requestedQty);
    const availableBaseQty = Number(sourceRows[0].receivedBaseQty) - Number(returnedRows[0].returnedBaseQty);
    if (requestedBaseQty > availableBaseQty) {
      throw new BadRequestException(`Cannot return this quantity — only ${availableBaseQty} still available to return (Base Unit) against this receipt line.`);
    }
  }

  // Current Account isolation (spec: "backend must enforce Current Account isolation so
  // receipts from another Current Account cannot be imported even if the API is called
  // manually") — a purchaseReceiptItemId link is only ever valid when its source line's own
  // receipt shares the SAME Current Account as the receipt being written into. listRelatedImportable()
  // already only OFFERS same-account lines, but that's a display-side filter only; this is the
  // actual write-time enforcement, so a hand-crafted request naming another account's line is
  // rejected here regardless of what the UI ever showed. For Purchase Return itself (target
  // header's own ReceiptType===122 — the only screen with a frontend for this feature), also
  // confines the source to RELATED_IMPORT_SOURCE_TYPES (Receipt Type 2/11 — Purchase Receipt and
  // Outside Process Receive Receipt), matching what listRelatedImportable() offers; every other
  // receipt type reusing this same purchaseReceiptItemId column (including Purchase Receipt
  // itself, type 2 — it is a valid SOURCE for this workflow but was never meant to be its
  // target) keeps today's fully-generic behavior for source type, since no other screen has a
  // picker for this column. The target's ReceiptType is read fresh from "IM_Receipt" here (not
  // taken as a caller-supplied parameter) so both createItem and updateItem share this one check
  // unchanged — the header row is always the single source of truth for "what kind of receipt
  // this is" (same convention inventory-card.service.ts's own stockSumSql established), never a
  // line's own denormalized copy, which is the one column documented elsewhere in this file as
  // sometimes stale.
  private async assertRelatedImportSource(
    tx: Prisma.TransactionClient,
    inventoryReceiptId: number,
    purchaseReceiptItemId: number,
  ) {
    const rows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT
        (SELECT "CurrentAccountId" FROM "IM_Receipt" WHERE "RecId" = ${inventoryReceiptId}) as "targetAccountId",
        (SELECT "ReceiptType" FROM "IM_Receipt" WHERE "RecId" = ${inventoryReceiptId}) as "targetReceiptType",
        source_rec."CurrentAccountId" as "sourceAccountId",
        source_rec."ReceiptType" as "sourceReceiptType"
      FROM "IM_ReceiptItem" source_ri
      JOIN "IM_Receipt" source_rec ON source_rec."RecId" = source_ri."InventoryReceiptId"
      WHERE source_ri."RecId" = ${purchaseReceiptItemId} AND source_ri."IsDeleted" = 0
    `);
    if (!rows.length) throw new BadRequestException('The originating receipt line was not found.');
    const { targetAccountId, targetReceiptType, sourceAccountId, sourceReceiptType } = rows[0];
    if (targetAccountId == null || sourceAccountId == null || Number(targetAccountId) !== Number(sourceAccountId)) {
      throw new BadRequestException('The originating receipt line belongs to a different Current Account and cannot be imported.');
    }
    if (Number(targetReceiptType) === 122 && !(RELATED_IMPORT_SOURCE_TYPES as readonly number[]).includes(Number(sourceReceiptType))) {
      throw new BadRequestException('The originating receipt is not an eligible source type for Purchase Return import.');
    }
  }

  async createItem(inventoryReceiptId: number, dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE) {
    if (!dto.inventoryId) throw new BadRequestException('An inventory item is required');
    const toDb = await this.itemToDb();
    const effective: Record<string, any> = { ...dto, receiptType };
    if (effective.colorCardId != null) await this.assertValidColorCard(String(effective.colorCardId));
    effective.unitId = await this.resolveUnitId(effective.inventoryId, effective.unitId);
    // Write-time enforcement (spec Section 3/10) — reject a unit with no configured conversion for
    // this item, rather than silently accepting an arbitrary combination.
    await assertValidItemUnit(this.prisma, effective.inventoryId, effective.unitId);
    // Missing-Base-Unit blocking (spec Section 9) — applies uniformly across every receipt type
    // this service backs (Purchase Receipt plus all 16 generic types in receipt-types.config.ts,
    // since receipt-type.controller.ts calls this same createItem() unconditionally).
    await assertHasBaseUnit(this.prisma, effective.inventoryId);
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
        await this.assertPendingSource(tx, inventoryReceiptId, Number(effective['orderReceiptItemId']), receiptType);
        await this.assertPendingQty(
          tx,
          Number(effective['orderReceiptItemId']),
          Number(effective['quantity'] ?? 0),
          effective.inventoryId,
          effective.unitId,
        );
        return insert(tx);
      });
      return sanitizeRawRow(rows[0]);
    }

    if (effective['purchaseReceiptItemId']) {
      const rows = await this.prisma.$transaction(async (tx) => {
        await this.assertRelatedImportSource(tx, inventoryReceiptId, Number(effective['purchaseReceiptItemId']));
        await this.assertReturnQty(
          tx,
          Number(effective['purchaseReceiptItemId']),
          Number(effective['quantity'] ?? 0),
          effective.inventoryId,
          effective.unitId,
        );
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
  async updateItem(itemId: number, dto: Record<string, any>, userId: number, inventoryReceiptId?: number, receiptType: number = RECEIPT_TYPE) {
    const toDb = await this.itemToDb();
    const owner = inventoryReceiptId !== undefined ? Prisma.sql`AND "InventoryReceiptId" = ${inventoryReceiptId}` : Prisma.sql``;
    const effective = { ...dto };
    if (effective.colorCardId != null) await this.assertValidColorCard(String(effective.colorCardId));
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
      await assertValidItemUnit(this.prisma, invId, effective.unitId);
      await assertHasBaseUnit(this.prisma, invId);
    }

    // Re-validation gap fix — covers BOTH traceability self-references a line can carry:
    // purchaseReceiptItemId (Related Receipt import — Purchase Return sourcing from Purchase
    // Receipt/Outside Process Receive Receipt) and orderReceiptItemId (Pending Orders import —
    // any order type's own correct receiving screen, per order-types.config.ts's
    // receivingReceiptType/assertPendingSource). createItem's own branches for both already
    // guard this at import time; without this, a user could import an eligible quantity and then
    // raise it past the source's remaining amount, past another Current Account's line, or (for
    // orderReceiptItemId) past what the order type's OWN receiving screen is even authorized to
    // consume — purely through updateItem, since neither check re-ran on a later edit before now.
    // Only reads the extra row (and only re-validates) when this edit could actually change what's
    // being consumed — quantity, unit, item, or either link — so an edit to an unrelated field
    // (Explanation, SpecialCode, ...) costs nothing extra and normal, never-imported lines never
    // reach this branch at all (spec Section 6: unaffected). A line is only ever linked to ONE of
    // these two sources in practice (Pending Orders vs Related Receipt import are mutually
    // exclusive import paths), so re-validating whichever is actually set is enough.
    const touchesLinkedFields =
      effective.purchaseReceiptItemId !== undefined ||
      effective.orderReceiptItemId !== undefined ||
      effective.quantity !== undefined ||
      effective.unitId !== undefined ||
      effective.inventoryId !== undefined;
    let effectivePurchaseReceiptItemId: any = effective.purchaseReceiptItemId;
    let effectiveOrderReceiptItemId: any = effective.orderReceiptItemId;
    let currentRow: { purchaseReceiptItemId: number | null; orderReceiptItemId: number | null; quantity: any; inventoryId: any; unitId: any } | undefined;
    if (touchesLinkedFields) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT "PurchaseReceiptItemId" as "purchaseReceiptItemId", "OrderReceiptItemId" as "orderReceiptItemId",
          "Quantity" as "quantity", "InventoryId" as "inventoryId", "UnitId" as "unitId"
        FROM "IM_ReceiptItem" WHERE "RecId" = ${itemId} AND "IsDeleted" = 0 ${owner}
      `);
      if (!rows.length) throw new NotFoundException('Line not found');
      currentRow = rows[0];
      // A dto that doesn't mention a given link field at all (the overwhelming majority of real
      // edits — quantity/unit/item changes on an already-imported line) keeps whatever link the
      // row already has; only an explicit value in the dto (including explicit null, e.g.
      // clearRelatedImportedLines's detach call) changes it.
      if (effectivePurchaseReceiptItemId === undefined) effectivePurchaseReceiptItemId = currentRow!.purchaseReceiptItemId;
      if (effectiveOrderReceiptItemId === undefined) effectiveOrderReceiptItemId = currentRow!.orderReceiptItemId;
    }

    const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "IM_ReceiptItem" WHERE "RecId" = ${itemId} ${owner}`);
      if (!rows.length) throw new NotFoundException('Line not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, effective[camel(c)])}`));
    const doUpdate = (client: Prisma.TransactionClient | PrismaService) => client.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_ReceiptItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${itemId} AND "IsDeleted" = 0 ${owner}
      RETURNING ${ITEM_SELECT}
    `);

    // effectivePurchaseReceiptItemId/effectiveOrderReceiptItemId are only ever null/undefined here
    // when the line either never had that link, or this edit explicitly clears it (dto:
    // { purchaseReceiptItemId: null } / { orderReceiptItemId: null }) — removing a link needs no
    // quantity re-validation, same as a normal line. A line only ever carries one of these two
    // links in practice, so at most one branch below actually runs.
    if (effectivePurchaseReceiptItemId != null) {
      const requestedQty = Number(effective.quantity !== undefined ? effective.quantity : currentRow!.quantity ?? 0);
      const requestedInventoryId = effective.inventoryId !== undefined ? effective.inventoryId : currentRow!.inventoryId;
      const requestedUnitId = effective.unitId !== undefined ? effective.unitId : currentRow!.unitId;
      const rows = await this.prisma.$transaction(async (tx) => {
        if (inventoryReceiptId !== undefined) {
          await this.assertRelatedImportSource(tx, inventoryReceiptId, Number(effectivePurchaseReceiptItemId));
        }
        await this.assertReturnQty(tx, Number(effectivePurchaseReceiptItemId), requestedQty, requestedInventoryId, requestedUnitId, itemId);
        return doUpdate(tx);
      });
      if (!rows.length) throw new NotFoundException('Line not found');
      return sanitizeRawRow(rows[0]);
    }

    if (effectiveOrderReceiptItemId != null) {
      const requestedQty = Number(effective.quantity !== undefined ? effective.quantity : currentRow!.quantity ?? 0);
      const requestedInventoryId = effective.inventoryId !== undefined ? effective.inventoryId : currentRow!.inventoryId;
      const requestedUnitId = effective.unitId !== undefined ? effective.unitId : currentRow!.unitId;
      const rows = await this.prisma.$transaction(async (tx) => {
        if (inventoryReceiptId !== undefined) {
          await this.assertPendingSource(tx, inventoryReceiptId, Number(effectiveOrderReceiptItemId), receiptType);
        }
        await this.assertPendingQty(tx, Number(effectiveOrderReceiptItemId), requestedQty, requestedInventoryId, requestedUnitId, itemId);
        return doUpdate(tx);
      });
      if (!rows.length) throw new NotFoundException('Line not found');
      return sanitizeRawRow(rows[0]);
    }

    const rows = await doUpdate(this.prisma);
    if (!rows.length) throw new NotFoundException('Line not found');
    return sanitizeRawRow(rows[0]);
  }

  // Same bug/fix as updateItem() above.
  async removeItem(itemId: number, userId: number, inventoryReceiptId?: number) {
    const owner = inventoryReceiptId !== undefined ? Prisma.sql`AND "InventoryReceiptId" = ${inventoryReceiptId}` : Prisma.sql``;
    const result = await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('IM_ReceiptItem', itemId, tx);
      return tx.$executeRaw(Prisma.sql`
        UPDATE "IM_ReceiptItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId} ${owner}
      `);
    });
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

  // Color + Variant1 enhancement — backend validation: ColorCardId has no DB-level FK (it's a
  // plain nullable text column added for this feature, not a real constrained FK — see the
  // ColorCardId ITEM_COLUMNS comment above), so an invalid id would otherwise write silently and
  // just fail to resolve a display name later. Reject unless it's a real ColorCard row.
  private async assertValidColorCard(colorCardId: string) {
    const card = await this.prisma.colorCard.findUnique({ where: { id: colorCardId }, select: { id: true } });
    if (!card) throw new BadRequestException('Selected color does not exist');
  }

  // Color + Variant1 enhancement — backend validation (spec section 7): a submitted
  // InventoryVariantId must be one of the SELECTED LINE'S OWN item's IM_ItemVariant rows, never
  // just any valid IM_ItemVariant row (which the base FK constraint alone would accept). Mirrors
  // assertValidMasterRef's own "confirm it belongs to the right table/scope" convention elsewhere
  // in this file, just against the real Item<->Variant relationship instead of a lookup table.
  private async assertVariantBelongsToLineItem(inventoryReceiptItemId: number, inventoryVariantId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM "IM_ReceiptItem" ri
      JOIN "IM_ItemVariant" iv ON iv."InventoryId" = ri."InventoryId" AND iv."RecId" = ${inventoryVariantId} AND iv."IsDeleted" = 0
      WHERE ri."RecId" = ${inventoryReceiptItemId} AND ri."IsDeleted" = 0
    `);
    if (!rows.length) throw new BadRequestException('Selected Variant1 does not belong to this line\'s Item.');
  }

  async createItemVariantLine(inventoryReceiptItemId: number, dto: Record<string, any>, userId: number, receiptType: number = RECEIPT_TYPE) {
    if (!dto.inventoryVariantId) throw new BadRequestException('A variant is required');
    await this.assertVariantBelongsToLineItem(inventoryReceiptItemId, Number(dto.inventoryVariantId));
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
    if (dto.inventoryVariantId !== undefined && dto.inventoryVariantId !== null) {
      const lineRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT "InventoryReceiptItemId" as id FROM "IM_ReceiptItemVariant" WHERE "RecId" = ${variantLineId} AND "IsDeleted" = 0
      `);
      if (!lineRows.length) throw new NotFoundException('Variant line not found');
      await this.assertVariantBelongsToLineItem(Number(lineRows[0].id), Number(dto.inventoryVariantId));
    }
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
