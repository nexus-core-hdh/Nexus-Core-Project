import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

// Purchase Contract / Sale Contract — built on the pre-existing SM_Contract/SM_ContractItem
// tables (see contract-types.config.ts's own comment for why these, not IM_PurchaseContract/
// SM_SalesContract). Same generic "one table, many types" shape as inventory-receipt.service.ts,
// parameterized by receiptType instead of hardcoded to one — there is no single "master" type
// here (unlike Purchase Receipt), both contract kinds are equally generic, so every method takes
// receiptType explicitly rather than defaulting to one.
const HEADER_TABLE = 'SM_Contract';
const ITEM_TABLE = 'SM_ContractItem';

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source).
export const HEADER_COLUMNS = [
  'ReceiptNo', 'ReceiptType', 'ReceiptDate', 'DocumentNo',
  'CurrentAccountId', 'WarehouseId', 'ForexId', 'StartDate', 'EndDate',
  'SubTotal', 'VatAmount', 'GrandTotal',
] as const;

// Grid columns — Type(via InventoryId or ServiceCardId)/Quantity/Unit/Rate/Forex/VAT/Item Amount,
// same shape as purchase-order-line-grid.tsx's own column set, using only columns that actually
// exist on SM_ContractItem (no Color/Manufacturing Order FK exists on this table, so those two
// Purchase Order columns are not replicated here — nothing to map them to without inventing a
// relationship). WorkOrderReceiptItemId mirrors Purchase Order's own plain-numeric field.
const ITEM_COLUMNS = [
  'ItemOrderNo', 'ItemType', 'InventoryId', 'ServiceCardId', 'UnitId', 'Quantity', 'GrossQuantity',
  'UnitPrice', 'ForexId', 'ForexRate', 'ForexUnitPrice',
  'VatIncluded', 'VatRate', 'VatAmount', 'ItemTotal', 'NetItemTotal',
  'ReceivedQuantity', 'WorkOrderReceiptItemId',
  'DeliveryDate', 'Explanation', 'SpecialCode',
] as const;

const ITEM_TYPE_SERVICE = 2;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', '"ReceiptId" as "receiptId"', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class ContractService {
  constructor(private readonly prisma: PrismaService) {}

  private async headerToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE));
  }
  private async itemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE));
  }

  async list(search: string | undefined, receiptType: number) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "SM_Contract"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
            AND ("ReceiptNo" ILIKE ${`%${search}%`} OR "DocumentNo" ILIKE ${`%${search}%`})
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "SM_Contract"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number, receiptType: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "SM_Contract" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
    `);
    if (!rows.length) throw new NotFoundException('Contract not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByReceiptNo(receiptNo: string, receiptType: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "SM_Contract" WHERE "ReceiptNo" = ${receiptNo} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
    `);
    if (!rows.length) throw new NotFoundException('Contract not found');
    return sanitizeRawRow(rows[0]);
  }

  async nextReceiptNo(receiptType: number, numberPrefix: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "ReceiptNo" as code FROM "SM_Contract"
      WHERE "ReceiptType" = ${receiptType} AND "ReceiptNo" ~ ${`^${numberPrefix}-[0-9]+$`}
      ORDER BY (regexp_replace("ReceiptNo", ${`^${numberPrefix}-`}, ''))::int DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${numberPrefix}-${next}`;
  }

  private async assertReceiptNoAvailable(receiptNo: string, receiptType: number, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" FROM "SM_Contract"
      WHERE "ReceiptType" = ${receiptType} AND "IsDeleted" = 0 AND LOWER("ReceiptNo") = LOWER(${receiptNo}) ${exclude}
    `);
    if (rows.length) throw new ConflictException('A contract already exists with this number.');
  }

  private static readonly MAX_CODE_RETRIES = 5;

  async create(dto: Record<string, any>, userId: number, receiptType: number, numberPrefix: string) {
    const toDb = await this.headerToDb();
    const manualReceiptNo = String(dto.receiptNo ?? '').trim();

    if (manualReceiptNo) {
      await this.assertReceiptNoAvailable(manualReceiptNo, receiptType);
      const effective = { ...dto, receiptType, receiptNo: manualReceiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "SM_Contract" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        if (msg.includes('23505') && msg.includes('ReceiptNo')) throw new ConflictException('A contract already exists with this number.');
        throw err;
      }
    }

    for (let attempt = 1; attempt <= ContractService.MAX_CODE_RETRIES; attempt++) {
      const receiptNo = await this.nextReceiptNo(receiptType, numberPrefix);
      const effective = { ...dto, receiptType, receiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "SM_Contract" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('ReceiptNo');
        if (isCodeCollision && attempt < ContractService.MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Receipt No — please try again.');
  }

  async update(id: number, dto: Record<string, any>, userId: number, receiptType: number) {
    await this.get(id, receiptType);
    const toDb = await this.headerToDb();
    const cols = HEADER_COLUMNS.filter((c) => c !== 'ReceiptNo' && c !== 'ReceiptType' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id, receiptType);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "SM_Contract" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number, receiptType: number) {
    await this.get(id, receiptType);
    await this.prisma.$executeRaw`
      UPDATE "SM_Contract" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }

  // --- Detail lines (the grid) ------------------------------------------------------------

  async listItems(receiptId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "SM_ContractItem"
      WHERE "ReceiptId" = ${receiptId} AND "IsDeleted" = 0
      ORDER BY "ItemOrderNo", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async createItem(receiptId: number, dto: Record<string, any>, userId: number, receiptType: number) {
    if (Number(dto.itemType) === ITEM_TYPE_SERVICE) {
      if (!dto.serviceCardId) throw new BadRequestException('A service is required');
    } else if (!dto.inventoryId) {
      throw new BadRequestException('An inventory item is required');
    }
    const toDb = await this.itemToDb();
    const effective = { ...dto, receiptType };
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"ReceiptId"', '"ReceiptType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "SM_ContractItem" (${colList})
      VALUES (${receiptId}, ${receiptType}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async updateItem(itemId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemToDb();
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "SM_ContractItem" WHERE "RecId" = ${itemId}`);
      if (!rows.length) throw new NotFoundException('Line not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "SM_ContractItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${itemId} AND "IsDeleted" = 0
      RETURNING ${ITEM_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Line not found');
    return sanitizeRawRow(rows[0]);
  }

  async removeItem(itemId: number, userId: number) {
    const result = await this.prisma.$executeRaw`
      UPDATE "SM_ContractItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId}
    `;
    if (!result) throw new NotFoundException('Line not found');
    return { message: 'Deleted' };
  }
}
