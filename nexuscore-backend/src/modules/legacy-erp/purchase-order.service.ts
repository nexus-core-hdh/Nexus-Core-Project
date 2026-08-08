import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

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

const HEADER_COLUMNS = [
  'ReceiptNo', 'ReceiptType', 'ReceiptDate', 'DocumentNo',
  'CurrentAccountId', 'WarehouseId', 'ForexId',
  'SubTotal', 'VatAmount', 'GrandTotal',
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
  'ItemOrderNo', 'ItemType', 'InventoryId', 'ServiceCardId', 'UnitId', 'Quantity',
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
  constructor(private readonly prisma: PrismaService) {}

  private async headerToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE));
  }
  private async itemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE));
  }
  private async itemVariantToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_VARIANT_TABLE));
  }

  async list(search?: string) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "IM_OrderReceipt"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${RECEIPT_TYPE}
            AND ("ReceiptNo" ILIKE ${`%${search}%`} OR "DocumentNo" ILIKE ${`%${search}%`})
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "IM_OrderReceipt"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${RECEIPT_TYPE}
          ORDER BY "ReceiptNo" DESC LIMIT 50
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

  async create(dto: Record<string, any>, userId: number) {
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
