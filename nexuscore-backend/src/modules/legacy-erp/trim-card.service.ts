import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

const HEADER_TABLE = 'MA_YarnTrimCard';
const ITEM_TABLE = 'MA_YarnTrimCardItem';

const HEADER_COLUMNS = ['Code', 'Explanation', 'InUse', 'CustomerId', 'StyleGroupId', 'BrandId', 'StyleDepartmentId'] as const;
const ITEM_COLUMNS = ['TrimCode', 'TrimName', 'Explanation', 'OrderQuantity', 'Unit', 'Quantity', 'WastePct', 'ForexId', 'ForexPrice', 'UnitPrice', 'SortOrder'] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class TrimCardService {
  constructor(private readonly prisma: PrismaService) {}

  private async headerToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE));
  }
  private async itemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE));
  }

  async list(search?: string) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "MA_YarnTrimCard"
          WHERE "IsDeleted" = 0 AND ("Code" ILIKE ${`%${search}%`} OR "Explanation" ILIKE ${`%${search}%`})
          ORDER BY "Code" LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "MA_YarnTrimCard" WHERE "IsDeleted" = 0 ORDER BY "Code" LIMIT 50
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

  async create(dto: Record<string, any>, userId: number) {
    if (!dto.code) throw new NotFoundException('code is required');
    const toDb = await this.headerToDb();
    const cols = HEADER_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, dto[camel(c)]));
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
    const cols = HEADER_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
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
