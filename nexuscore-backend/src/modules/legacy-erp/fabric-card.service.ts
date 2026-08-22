import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

// Fabric Card, like Yarn Card, is NOT a new master entity — it's the same already-migrated
// IM_Item table, scoped to rows where AccessCode = 'FABRIC'. Confirmed via pg_catalog that
// IM_Item already carries dedicated fabric columns (FabricTypeId -> MD_Fabric, UD_FabGSM,
// UD_FabDyeType, UD_FabComposition, UD_FabYarnCount/1/2/3, UD_FYarnRatio1-4, FWidth/FWeight/
// FRawWidth/FRawWeight, UD_FabDia, UD_FabGuage, UD_FinWidth, ...) — no dedicated Fabric table
// exists or is needed. Code is server-generated, same pattern/prefix-convention as
// yarn-card.service.ts's own nextInventoryCode() (same IM_Item table, same "{ACCESS_CODE}-NNNNN"
// shape) — see that file's own comment for why no shared numbering service exists to reuse
// instead. Client-sent inventoryCode is always ignored; the value assigned at create() time is
// the sole source of truth, matching Yarn Card exactly.
const TABLE = 'IM_Item';
const ACCESS_CODE = 'FABRIC';
const CODE_PREFIX = 'FABRIC';

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source) — raw
// column names as-is, matching exactly what unified-grid.service.ts's own `SELECT *` returns.
export const HEADER_COLUMNS = [
  // Top section + General tab / General Information
  'InventoryCode', 'InventoryName', 'InUse', 'InventoryType', 'AccessCode', 'SpecialCode',
  'GroupId', 'ProcessId', 'FabricTypeId',
  'UD_FabGSM', 'UD_FabDyeType',
  // General tab — Composition / Yarn Count 1-4 (all pre-existing IM_Item columns)
  'UD_FabComposition', 'UD_FabYarnCount', 'UD_FabYarnCount1', 'UD_FabYarnCount2', 'UD_FabYarnCount3',
  // VAT Rates / Taxes
  'VatId', 'RetailVatId', 'WholeSaleVatId', 'RetailReturnVatId', 'WholeSaleReturnVatId', 'TaxId',
  // Withholding
  'WithholdingFactor', 'WithholdingDivisor', 'SWithholdingFactor', 'SWithholdingDivisor',
  // Using For
  'UseForCommon', 'UseForPurchase', 'UseForSale',
  // Follow-up Types
  'HasVariant', 'HasRowVariant', 'HasSeries', 'HasSeparableSeries',
  // Manufacturer Info
  'CurrentAccountId', 'ProducerInventoryCode',
  // Detail tab — fabric technical/dimensional fields, all pre-existing IM_Item columns
  'FWidth', 'FWeight', 'FRawWidth', 'FRawWeight', 'FPus', 'FFine',
  'WidthShrinkage', 'LengthShrinkage', 'WashCare', 'UD_FabDia', 'UD_FabGuage', 'UD_FinWidth',
  // Variant Types tab
  'Variant1TypeId', 'Variant2TypeId', 'Variant3TypeId', 'Variant4TypeId', 'Variant5TypeId',
  // Integration tab
  'IsoDocumentNo', 'WebContent', 'SeasonCode', 'GenderCode', 'CampaignGroup', 'PriceGroup', 'PlanCapacityGroup',
] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class FabricCardService {
  constructor(private readonly prisma: PrismaService) {}

  private async toDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, TABLE));
  }

  async list(search?: string) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "IM_Item"
          WHERE "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
            AND ("InventoryCode" ILIKE ${`%${search}%`} OR "InventoryName" ILIKE ${`%${search}%`})
          ORDER BY "InventoryCode" LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "IM_Item"
          WHERE "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
          ORDER BY "InventoryCode" LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_Item" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
    `);
    if (!rows.length) throw new NotFoundException('Fabric card not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByCode(code: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_Item" WHERE "InventoryCode" = ${code} AND "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
    `);
    if (!rows.length) throw new NotFoundException('Fabric card not found');
    return sanitizeRawRow(rows[0]);
  }

  // Same shape/prefix convention as yarn-card.service.ts's own nextInventoryCode() — scans ALL
  // rows including soft-deleted ones so a deleted card's code is never reissued. Public so the
  // controller can expose a preview-only endpoint for the Create screen.
  async nextInventoryCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "InventoryCode" as code FROM "IM_Item"
      WHERE "AccessCode" = ${ACCESS_CODE} AND "InventoryCode" LIKE ${CODE_PREFIX + '-%'}
      ORDER BY "InventoryCode" DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${CODE_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private static readonly MAX_CODE_RETRIES = 5;

  async create(dto: Record<string, any>, userId: number, insertedByUserId?: string) {
    const toDb = await this.toDb();
    // AccessCode always defaults to FABRIC for this screen — it's what scopes IM_Item rows
    // to "Fabric Card" in list()/get()/getByCode(), regardless of what the form sends.
    // InventoryCode is always server-generated — client input for it is ignored, same as
    // Yarn Card. The DB's real (CompanyId, InventoryCode) unique constraint is the actual
    // source of truth; a collision against it just regenerates the next code and retries.
    for (let attempt = 1; attempt <= FabricCardService.MAX_CODE_RETRIES; attempt++) {
      const inventoryCode = await this.nextInventoryCode();
      const effective = { ...dto, accessCode: ACCESS_CODE, inventoryCode };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      // InsertedByUserId is the real NexusCore User.id (text/uuid) — separate from the legacy
      // InsertedBy integer (which Number(uuid) always collapses to a fallback value, so it can
      // never resolve to a real user). Lets the Inventory Card List join back to the real
      // Users/Auth table for a real creator name instead of a placeholder.
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"InsertedByUserId"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_Item" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, ${insertedByUserId ?? null}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('InventoryCode');
        if (isCodeCollision && attempt < FabricCardService.MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Code — please try again.');
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    await this.get(id);
    const toDb = await this.toDb();
    // InventoryCode is immutable after creation — never editable via update, regardless of
    // what the client sends. Matches yarn-card.service.ts's own update() guard.
    const cols = HEADER_COLUMNS.filter((c) => c !== 'InventoryCode' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_Item" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$executeRaw`
      UPDATE "IM_Item" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }
}
