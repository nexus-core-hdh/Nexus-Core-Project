import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { nextLegacySeqCode, previewLegacySeqCode } from './legacy-code-sequence.util';

// Code is server-generated via the shared LegacyCodeSequence table (same one account.service.ts
// already established) — "TC-001", "TC-002", ... Client-sent code is always ignored.
const CODE_ENTITY = 'MA_YarnTrimCard';
const CODE_PREFIX = 'TC';

const HEADER_TABLE = 'MA_YarnTrimCard';
const ITEM_TABLE = 'MA_YarnTrimCardItem';

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source).
export const HEADER_COLUMNS = ['Code', 'Explanation', 'InUse', 'CustomerId', 'StyleGroupId', 'BrandId', 'StyleDepartmentId'] as const;
const ITEM_COLUMNS = ['TrimCode', 'TrimName', 'Explanation', 'OrderQuantity', 'Unit', 'Quantity', 'WastePct', 'ForexId', 'ForexPrice', 'UnitPrice', 'SortOrder'] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
// Same columns as HEADER_SELECT, table-qualified — needed only by list() below, which LEFT
// JOINs FI_Account (for the customer's display name) and FI_Account also has its own
// same-named RecId/InUse columns; without qualifying, Postgres would reject the query as
// "column reference is ambiguous."
const LIST_SELECT = Prisma.raw(['t."RecId" as id', ...HEADER_COLUMNS.map((c) => `t."${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class TrimCardService {
  constructor(private readonly prisma: PrismaService) {}

  private async headerToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE));
  }
  private async itemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE));
  }

  // Adds the customer's own name/code alongside the raw CustomerId FK, via the same FI_Account
  // table Current Account already reads — a listing screen showing a bare numeric CustomerId
  // isn't usable, and this join costs nothing HEADER_SELECT wasn't already doing (still one
  // query, same WHERE/ORDER/LIMIT). get()/getByCode() below are left as plain HEADER_SELECT —
  // the Customer Define Trim form already resolves the customer via its own LookupField.
  async list(search?: string) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${LIST_SELECT}, a."CurrentAccountName" as "customerName"
          FROM "MA_YarnTrimCard" t
          LEFT JOIN "FI_Account" a ON a."RecId" = t."CustomerId"
          WHERE t."IsDeleted" = 0 AND (t."Code" ILIKE ${`%${search}%`} OR t."Explanation" ILIKE ${`%${search}%`})
          ORDER BY t."Code" LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${LIST_SELECT}, a."CurrentAccountName" as "customerName"
          FROM "MA_YarnTrimCard" t
          LEFT JOIN "FI_Account" a ON a."RecId" = t."CustomerId"
          WHERE t."IsDeleted" = 0 ORDER BY t."Code" LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "MA_YarnTrimCard" WHERE "RecId" = ${id} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Trim card not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByCode(code: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "MA_YarnTrimCard" WHERE "Code" = ${code} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Trim card not found');
    return sanitizeRawRow(rows[0]);
  }

  async previewNextCode(): Promise<string> {
    return previewLegacySeqCode(this.prisma, CODE_ENTITY, CODE_PREFIX, HEADER_TABLE, 'Code');
  }

  async create(dto: Record<string, any>, userId: number) {
    const toDb = await this.headerToDb();
    const code = await nextLegacySeqCode(this.prisma, CODE_ENTITY, CODE_PREFIX, HEADER_TABLE, 'Code');
    const effective = { ...dto, code };
    const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "MA_YarnTrimCard" (${colList})
      VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    await this.get(id);
    const toDb = await this.headerToDb();
    // Code is immutable after creation — never editable via update, regardless of what the
    // client sends. Matches yarn-card.service.ts's own update() guard.
    const cols = HEADER_COLUMNS.filter((c) => c !== 'Code' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "MA_YarnTrimCard" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$executeRaw`
      UPDATE "MA_YarnTrimCard" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }

  // Grid lines
  async listItems(trimCardId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "MA_YarnTrimCardItem"
      WHERE "YarnTrimCardId" = ${trimCardId} AND "IsDeleted" = 0
      ORDER BY "SortOrder", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async createItem(trimCardId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemToDb();
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"YarnTrimCardId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, dto[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "MA_YarnTrimCardItem" (${colList})
      VALUES (${trimCardId}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async updateItem(itemId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemToDb();
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "MA_YarnTrimCardItem" WHERE "RecId" = ${itemId}`);
      if (!rows.length) throw new NotFoundException('Trim line not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "MA_YarnTrimCardItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${itemId} AND "IsDeleted" = 0
      RETURNING ${ITEM_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Trim line not found');
    return sanitizeRawRow(rows[0]);
  }

  async removeItem(itemId: number, userId: number) {
    const result = await this.prisma.$executeRaw`
      UPDATE "MA_YarnTrimCardItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId}
    `;
    if (!result) throw new NotFoundException('Trim line not found');
    return { message: 'Deleted' };
  }
}
