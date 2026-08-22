import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { nextLegacySeqCode, previewLegacySeqCode } from './legacy-code-sequence.util';

// Header Code (MD_UnitSet.SetCode) is server-generated via the shared LegacyCodeSequence table
// — "US-001", "US-002", ... Client-sent setCode is always ignored. The per-row item UnitCode
// (e.g. "KG", "PCS") is NOT touched — a meaningful, manually-chosen unit symbol, not a
// sequence-generated identity.
const CODE_ENTITY = 'MD_UnitSet';
const CODE_PREFIX = 'US';

const HEADER_TABLE = 'MD_UnitSet';
const ITEM_TABLE = 'MD_UnitSetItem';

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source).
export const HEADER_COLUMNS = ['SetCode', 'SetName', 'SpecialCode', 'AccessCode', 'SystemSet', 'InUse'] as const;
const ITEM_COLUMNS = [
  'UnitCode', 'UnitName', 'UnitFactor', 'UnitDivisor',
  'UnitWidth', 'UnitWidthUnitId', 'UnitLength', 'UnitLengthUnitId', 'UnitHeight', 'UnitHeightUnitId',
  'UnitArea', 'UnitAreaUnitId', 'UnitVolume', 'UnitVolumeUnitId', 'UnitWeight', 'UnitWeightUnitId',
  'IsMainUnit', 'UseForRecipe', 'IsDivisible', 'UniversalCode',
] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', '"UnitSetId" as "unitSetId"', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

// Legacy-ERP "Unit Set" master data: MD_UnitSet (e.g. "Weight Units") is the
// master/header, MD_UnitSetItem (e.g. "KG", "G") is the child/detail list —
// the reference case for the reusable Master-Detail Workspace Layout. Both
// tables already existed in the restored legacy schema; nothing new is
// created here.
@Injectable()
export class UnitSetService {
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
          SELECT ${HEADER_SELECT} FROM "MD_UnitSet"
          WHERE "IsDeleted" = 0 AND ("SetCode" ILIKE ${`%${search}%`} OR "SetName" ILIKE ${`%${search}%`})
          ORDER BY "SetCode" LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "MD_UnitSet" WHERE "IsDeleted" = 0 ORDER BY "SetCode" LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "MD_UnitSet" WHERE "RecId" = ${id} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Unit set not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByCode(code: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "MD_UnitSet" WHERE "SetCode" = ${code} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Unit set not found');
    return sanitizeRawRow(rows[0]);
  }

  async previewNextCode(): Promise<string> {
    return previewLegacySeqCode(this.prisma, CODE_ENTITY, CODE_PREFIX, HEADER_TABLE, 'SetCode');
  }

  async create(dto: Record<string, any>, userId: number) {
    const toDb = await this.headerToDb();
    const setCode = await nextLegacySeqCode(this.prisma, CODE_ENTITY, CODE_PREFIX, HEADER_TABLE, 'SetCode');
    const effective = { ...dto, setCode };
    const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw([...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "MD_UnitSet" (${colList})
      VALUES (${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    await this.get(id);
    const toDb = await this.headerToDb();
    // SetCode is immutable after creation — never editable via update, regardless of what
    // the client sends. Matches yarn-card.service.ts's own update() guard.
    const cols = HEADER_COLUMNS.filter((c) => c !== 'SetCode' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "MD_UnitSet" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$executeRaw`
      UPDATE "MD_UnitSet" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }

  // Child units (the Master-Detail Layout's left-panel list) — ordered by
  // insertion (RecId), not alphabetically by code, because insertion order is
  // meaningful here: the first row is the set's Base Unit (see createItem).
  async listItems(unitSetId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "MD_UnitSetItem"
      WHERE "UnitSetId" = ${unitSetId} AND "IsDeleted" = 0
      ORDER BY "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  // `IsMainUnit` (an existing MD_UnitSetItem column — no schema change) is
  // never client-settable: the FIRST unit ever created for a set is
  // automatically the Base Unit, and it only ever changes via removeItem's
  // promotion below when that base unit is deleted. This is what every other
  // unit's conversion is expressed against, instead of the Unit Set header's
  // own Code/Name (which is master data, not a convertible unit).
  async createItem(unitSetId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemToDb();
    const cols = ITEM_COLUMNS.filter((c) => c !== 'IsMainUnit' && toDb(c, dto[camel(c)]) !== undefined);
    const existing = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM "MD_UnitSetItem" WHERE "UnitSetId" = ${unitSetId} AND "IsDeleted" = 0 LIMIT 1
    `);
    const isMainUnit = existing.length === 0 ? 1 : 0;
    const colList = Prisma.raw(['"UnitSetId"', ...cols.map((c) => `"${c}"`), '"IsMainUnit"', '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, dto[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "MD_UnitSetItem" (${colList})
      VALUES (${unitSetId}, ${Prisma.join(values)}, ${isMainUnit}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async updateItem(itemId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemToDb();
    // `IsMainUnit` excluded here too — Base Unit status is immutable via edits,
    // only reassigned by removeItem's promotion.
    const cols = ITEM_COLUMNS.filter((c) => c !== 'IsMainUnit' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "MD_UnitSetItem" WHERE "RecId" = ${itemId}`);
      if (!rows.length) throw new NotFoundException('Unit not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "MD_UnitSetItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${itemId} AND "IsDeleted" = 0
      RETURNING ${ITEM_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Unit not found');
    return sanitizeRawRow(rows[0]);
  }

  async removeItem(itemId: number, userId: number) {
    const existing = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "UnitSetId" as "unitSetId", "IsMainUnit" as "isMainUnit" FROM "MD_UnitSetItem" WHERE "RecId" = ${itemId} AND "IsDeleted" = 0
    `);
    if (!existing.length) throw new NotFoundException('Unit not found');
    const { unitSetId, isMainUnit } = existing[0];

    await this.prisma.$executeRaw`
      UPDATE "MD_UnitSetItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId}
    `;

    // Deleting every unit is allowed (no restriction) — this only fires when
    // the deleted row actually was the Base Unit and at least one other
    // survives, promoting the next-oldest (lowest RecId) remaining row.
    if (isMainUnit) {
      const next = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT "RecId" as id FROM "MD_UnitSetItem" WHERE "UnitSetId" = ${unitSetId} AND "IsDeleted" = 0 ORDER BY "RecId" ASC LIMIT 1
      `);
      if (next.length) {
        await this.prisma.$executeRaw`UPDATE "MD_UnitSetItem" SET "IsMainUnit" = 1 WHERE "RecId" = ${next[0].id}`;
      }
    }
    return { message: 'Deleted' };
  }
}
