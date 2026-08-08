import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

// Trim Card — the third IM_Item-based inventory card, alongside Fabric Card and Yarn Card,
// scoped to rows where AccessCode = 'TRIM'. Not to be confused with "Customer Define Trims"
// (trim-card.service.ts / MA_YarnTrimCard) — that's a customer/style-scoped trim BOM header,
// a completely different entity with no InventoryCode/InventoryType/stock concept at all, and
// is untouched by this file. This mirrors fabric-card.service.ts's exact shape (same table,
// same generic-column convention) minus fabric-only technical fields (UD_Fab*, FabricTypeId) —
// Trim items have no material-specific attributes analogous to Fabric's Composition/GSM/Dye
// Type or Yarn's Denier/Count, so General Information stays generic, exactly like Yarn Card's
// own shape. Unit is handled via the same satellite "unit" tab Fabric Card uses (IM_Item
// UnitItemSize, reused as-is via YarnCardSatellitesService — see fabric-card.controller.ts's
// own comment: that service is entity-agnostic, built for Yarn Card, reused everywhere since).
const TABLE = 'IM_Item';
const ACCESS_CODE = 'TRIM';

const HEADER_COLUMNS = [
  // Top section + General tab / General Information
  'InventoryCode', 'InventoryName', 'InUse', 'InventoryType', 'AccessCode', 'SpecialCode',
  'GroupId', 'ProcessId',
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
  // Variant Types tab
  'Variant1TypeId', 'Variant2TypeId', 'Variant3TypeId', 'Variant4TypeId', 'Variant5TypeId',
  // Integration tab
  'IsoDocumentNo', 'WebContent', 'SeasonCode', 'GenderCode', 'CampaignGroup', 'PriceGroup', 'PlanCapacityGroup',
] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class TrimInventoryCardService {
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
    if (!rows.length) throw new NotFoundException('Trim card not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByCode(code: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_Item" WHERE "InventoryCode" = ${code} AND "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
    `);
    if (!rows.length) throw new NotFoundException('Trim card not found');
    return sanitizeRawRow(rows[0]);
  }

  async create(dto: Record<string, any>, userId: number, insertedByUserId?: string) {
    if (!dto.inventoryCode) throw new NotFoundException('inventoryCode is required');
    const toDb = await this.toDb();
    const effective = { ...dto, accessCode: ACCESS_CODE };
    const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    // InsertedByUserId is the real NexusCore User.id (text/uuid) — separate from the legacy
    // InsertedBy integer (which Number(uuid) always collapses to a fallback value, so it can
    // never resolve to a real user). Lets the Inventory Card List join back to the real
    // Users/Auth table for a real creator name instead of a placeholder.
    const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"InsertedByUserId"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_Item" (${colList})
      VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, ${insertedByUserId ?? null}, 0, gen_random_uuid())
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    await this.get(id);
    const toDb = await this.toDb();
    const cols = HEADER_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
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
