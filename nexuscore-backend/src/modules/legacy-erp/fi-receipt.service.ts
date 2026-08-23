import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { DeleteDependencyService } from './delete-dependency.service';

// Financial Receipt — a genuinely separate legacy entity from IM_Receipt (Inventory Receipt):
// FI_Receipt/FI_ReceiptItem is the Finance module's cash/bank/GL receipt voucher spine
// (CashId/CostCenterId/Debit/Credit/GLReceiptId), confirmed via pg_catalog (47 header columns,
// 0 rows, first writer). The party/account allocation lives one level down, on FI_ReceiptItem
// (real FK "CurrentAccountId" -> FI_Account), whose own FK back to this header is
// "CurrentAccountReceiptId" (confirmed via pg_constraint — NOT "ReceiptId", which is instead
// FI_ReceiptAttachment's FK column). Both tables already existed in the migrated schema — no
// new table, no new column.
const HEADER_TABLE = 'FI_Receipt';
const ITEM_TABLE = 'FI_ReceiptItem';
const RECEIPT_TYPE = 1; // single voucher type for now — column stays for future extension.

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source) — raw
// column names as-is, matching exactly what unified-grid.service.ts's own `SELECT *` returns.
export const HEADER_COLUMNS = [
  'ReceiptNo', 'ReceiptType', 'ReceiptDate', 'DocumentNo', 'Explanation', 'SpecialCode',
  'CashId', 'CostCenterId', 'ForexId', 'ForexRate', 'Debit', 'Credit', 'IsApproved',
] as const;

const ITEM_COLUMNS = [
  'ItemOrderNo', 'CurrentAccountId', 'DocumentNo', 'Explanation', 'SpecialCode',
  'Debit', 'Credit', 'ForexId', 'ForexRate', 'IsApproved',
] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', '"CurrentAccountReceiptId" as "fiReceiptId"', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class FiReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deleteGuard: DeleteDependencyService,
  ) {}

  private async headerToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE));
  }
  private async itemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE));
  }

  async list(search?: string) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "FI_Receipt"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${RECEIPT_TYPE}
            AND ("ReceiptNo" ILIKE ${`%${search}%`} OR "DocumentNo" ILIKE ${`%${search}%`})
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "FI_Receipt"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${RECEIPT_TYPE}
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "FI_Receipt" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "ReceiptType" = ${RECEIPT_TYPE}
    `);
    if (!rows.length) throw new NotFoundException('Financial receipt not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByReceiptNo(receiptNo: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "FI_Receipt" WHERE "ReceiptNo" = ${receiptNo} AND "IsDeleted" = 0 AND "ReceiptType" = ${RECEIPT_TYPE}
    `);
    if (!rows.length) throw new NotFoundException('Financial receipt not found');
    return sanitizeRawRow(rows[0]);
  }

  // "FR-1", "FR-2", ... scoped to ReceiptType=1 on this table — same pattern as
  // inventory-receipt.service.ts's own nextReceiptNo, own independent numbering namespace on a
  // physically separate table so it can never collide with IM_Receipt's "IR-N" sequence.
  async nextReceiptNo(numberPrefix = 'FR'): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "ReceiptNo" as code FROM "FI_Receipt"
      WHERE "ReceiptType" = ${RECEIPT_TYPE} AND "ReceiptNo" ~ ${`^${numberPrefix}-[0-9]+$`}
      ORDER BY (regexp_replace("ReceiptNo", ${`^${numberPrefix}-`}, ''))::int DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${numberPrefix}-${next}`;
  }

  private async assertReceiptNoAvailable(receiptNo: string, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" FROM "FI_Receipt"
      WHERE "ReceiptType" = ${RECEIPT_TYPE} AND "IsDeleted" = 0 AND LOWER("ReceiptNo") = LOWER(${receiptNo}) ${exclude}
    `);
    if (rows.length) throw new ConflictException('A financial receipt already exists with this number.');
  }

  private static readonly MAX_CODE_RETRIES = 5;

  async create(dto: Record<string, any>, userId: number, numberPrefix = 'FR') {
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
          INSERT INTO "FI_Receipt" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        if (msg.includes('23505') && msg.includes('ReceiptNo')) throw new ConflictException('A financial receipt already exists with this number.');
        throw err;
      }
    }

    for (let attempt = 1; attempt <= FiReceiptService.MAX_CODE_RETRIES; attempt++) {
      const receiptNo = await this.nextReceiptNo(numberPrefix);
      const effective = { ...dto, receiptType: RECEIPT_TYPE, receiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "FI_Receipt" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('ReceiptNo');
        if (isCodeCollision && attempt < FiReceiptService.MAX_CODE_RETRIES) continue;
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
      UPDATE "FI_Receipt" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('FI_Receipt', id, tx);
      await tx.$executeRaw`
        UPDATE "FI_Receipt" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
      `;
    });
    return { message: 'Deleted' };
  }

  // --- Detail lines (the grid) ------------------------------------------------------------

  async listItems(fiReceiptId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "FI_ReceiptItem"
      WHERE "CurrentAccountReceiptId" = ${fiReceiptId} AND "IsDeleted" = 0
      ORDER BY "ItemOrderNo", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async createItem(fiReceiptId: number, dto: Record<string, any>, userId: number) {
    if (!dto.currentAccountId) throw new BadRequestException('A current account is required');
    const toDb = await this.itemToDb();
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"CurrentAccountReceiptId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, dto[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "FI_ReceiptItem" (${colList})
      VALUES (${fiReceiptId}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async updateItem(itemId: number, dto: Record<string, any>, userId: number, fiReceiptId?: number) {
    const toDb = await this.itemToDb();
    const owner = fiReceiptId !== undefined ? Prisma.sql`AND "CurrentAccountReceiptId" = ${fiReceiptId}` : Prisma.sql``;
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "FI_ReceiptItem" WHERE "RecId" = ${itemId} ${owner}`);
      if (!rows.length) throw new NotFoundException('Line not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "FI_ReceiptItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${itemId} AND "IsDeleted" = 0 ${owner}
      RETURNING ${ITEM_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Line not found');
    return sanitizeRawRow(rows[0]);
  }

  async removeItem(itemId: number, userId: number, fiReceiptId?: number) {
    const owner = fiReceiptId !== undefined ? Prisma.sql`AND "CurrentAccountReceiptId" = ${fiReceiptId}` : Prisma.sql``;
    const result = await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('FI_ReceiptItem', itemId, tx);
      return tx.$executeRaw(Prisma.sql`
        UPDATE "FI_ReceiptItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId} ${owner}
      `);
    });
    if (!result) throw new NotFoundException('Line not found');
    return { message: 'Deleted' };
  }
}
