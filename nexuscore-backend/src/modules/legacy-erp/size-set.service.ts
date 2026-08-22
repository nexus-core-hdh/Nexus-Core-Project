import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { nextLegacySeqCode, previewLegacySeqCode } from './legacy-code-sequence.util';

// Header Code (MA_SizeSet.Code — the Size Set record's own identity, e.g. "Size Set: XL
// Range") is now server-generated via the shared LegacyCodeSequence table — "SZ-001", "SZ-002",
// ... Client-sent code is always ignored. The per-row item "code"/"name" (SpecialCode/ColorCode
// on MA_SizeSetItem, per the file comment below) are NOT touched — those are meaningful,
// manually-chosen size labels (e.g. "S", "M", "L", "XL"), not sequence-generated identities.
const CODE_ENTITY = 'MA_SizeSet';
const CODE_PREFIX = 'SZ';

// Size — NOT a new entity. MA_SizeSet (header) / MA_SizeSetItem (detail) is the same
// master/detail shape unit-set.service.ts already established for Unit Set (MD_UnitSet /
// MD_UnitSetItem) — confirmed via pg_catalog: both tables already existed in the migrated
// schema, 0 rows, first writer. No new table, no new column.
//
// Code/Name — MA_SizeSetItem has no columns literally named Code/Name. An earlier pass
// resolved them by joining SizeSetParameterId -> MA_SizeSetParameter, but that forced every
// detail row to be picked from that (empty, unmanaged-here) master. Per explicit follow-up
// spec, Code/Name are now plain manually-typed text, stored directly on MA_SizeSetItem using
// two of its own already-existing, otherwise-unused varchar columns on this screen:
// SpecialCode (varchar 15) -> Code, ColorCode (varchar 25) -> Name. Both are real pre-existing
// MA_SizeSetItem columns (confirmed via information_schema) simply repurposed for this
// screen's own use, the same way HEADER_COLUMNS below is a curated subset of MA_SizeSet's
// columns rather than every technical FK on the table. SizeSetParameterId itself is untouched
// in the schema and still FK's into MA_SizeSetParameter; this service just no longer reads or
// writes it, so no parameter record is ever required or fabricated for manual Code/Name entry.
// The rest of the Detail columns map onto MA_SizeSetItem's own columns exactly as before:
// Explanation -> Explanation, Value -> SValueText, Order By -> ItemOrderNo, In Use -> InUse.
const HEADER_TABLE = 'MA_SizeSet';
const ITEM_TABLE = 'MA_SizeSetItem';

// A curated subset of MA_SizeSet's real columns — the ones the reference screen's General tab
// actually needs (Code/Name/Explanation/Special Code/Access Code/In Use), mirroring how
// purchase-order.service.ts's own HEADER_COLUMNS is a curated subset of IM_OrderReceipt's full
// column list rather than every technical FK on the table (InventoryId/WorkOrderItemId/
// CurrentAccountId/... all stay nullable and untouched by this screen).
// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source).
export const HEADER_COLUMNS = ['Code', 'Name', 'Explanation', 'SpecialCode', 'AccessCode', 'InUse'] as const;
// ItemOrderNo/Explanation/SValueText/InUse/SpecialCode/ColorCode are the real, already-existing
// MA_SizeSetItem columns backing this screen's Detail tab (SpecialCode/ColorCode repurposed as
// Code/Name — see the file-level comment above).
const ITEM_COLUMNS = ['ItemOrderNo', 'Explanation', 'SValueText', 'InUse', 'SpecialCode', 'ColorCode'] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

// ITEM_SELECT below reads a few columns out under the reference screen's own field names
// (orderBy/value/code/name) instead of their bare camel() forms (itemOrderNo/sValueText/
// specialCode/colorCode) — so the write path (createItem/updateItem) has to look dto values up
// under those same friendly keys too, not camel(c). Explanation/InUse's dto key already equals
// camel(c), so this map only needs the four renamed exceptions.
const ITEM_DTO_KEY: Partial<Record<(typeof ITEM_COLUMNS)[number], string>> = {
  ItemOrderNo: 'orderBy',
  SValueText: 'value',
  SpecialCode: 'code',
  ColorCode: 'name',
};
const itemDtoKey = (c: (typeof ITEM_COLUMNS)[number]) => ITEM_DTO_KEY[c] ?? camel(c);

const ITEM_SELECT = Prisma.raw(`
  "RecId" as id, "SizeSetId" as "sizeSetId",
  "SpecialCode" as "code", "ColorCode" as "name",
  "Explanation" as "explanation", "SValueText" as "value", "ItemOrderNo" as "orderBy", "InUse" as "inUse"
`);

@Injectable()
export class SizeSetService {
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
          SELECT ${HEADER_SELECT} FROM "MA_SizeSet"
          WHERE "IsDeleted" = 0 AND ("Code" ILIKE ${`%${search}%`} OR "Name" ILIKE ${`%${search}%`})
          ORDER BY "Code" LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "MA_SizeSet" WHERE "IsDeleted" = 0 ORDER BY "Code" LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "MA_SizeSet" WHERE "RecId" = ${id} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Size not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByCode(code: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "MA_SizeSet" WHERE "Code" = ${code} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Size not found');
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
    const colList = Prisma.raw([...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "MA_SizeSet" (${colList})
      VALUES (${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
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
      UPDATE "MA_SizeSet" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$executeRaw`
      UPDATE "MA_SizeSet" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }

  // --- Detail rows (the grid) ---------------------------------------------------------------

  async listItems(sizeSetId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "MA_SizeSetItem"
      WHERE "SizeSetId" = ${sizeSetId} AND "IsDeleted" = 0
      ORDER BY "ItemOrderNo", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  private async getItem(itemId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "MA_SizeSetItem" WHERE "RecId" = ${itemId}
    `);
    if (!rows.length) throw new NotFoundException('Size detail row not found');
    return sanitizeRawRow(rows[0]);
  }

  async createItem(sizeSetId: number, dto: Record<string, any>, userId: number) {
    if (!String(dto.code ?? '').trim()) throw new BadRequestException('Code is required');
    const toDb = await this.itemToDb();
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[itemDtoKey(c)]) !== undefined);
    const colList = Prisma.raw(['"SizeSetId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, dto[itemDtoKey(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "MA_SizeSetItem" (${colList})
      VALUES (${sizeSetId}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING "RecId" as id
    `);
    return this.getItem(rows[0].id);
  }

  async updateItem(itemId: number, dto: Record<string, any>, userId: number) {
    const toDb = await this.itemToDb();
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[itemDtoKey(c)]) !== undefined);
    if (!cols.length) return this.getItem(itemId);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[itemDtoKey(c)])}`));
    const result = await this.prisma.$executeRaw`
      UPDATE "MA_SizeSetItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${itemId} AND "IsDeleted" = 0
    `;
    if (!result) throw new NotFoundException('Size detail row not found');
    return this.getItem(itemId);
  }

  async removeItem(itemId: number, userId: number) {
    const result = await this.prisma.$executeRaw`
      UPDATE "MA_SizeSetItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId}
    `;
    if (!result) throw new NotFoundException('Size detail row not found');
    return { message: 'Deleted' };
  }
}
