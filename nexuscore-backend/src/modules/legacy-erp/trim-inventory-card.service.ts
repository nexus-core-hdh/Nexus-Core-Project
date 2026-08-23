import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { DeleteDependencyService } from './delete-dependency.service';

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
// Code is server-generated, same pattern/prefix-convention as yarn-card.service.ts's own
// nextInventoryCode() (same IM_Item table, same "{ACCESS_CODE}-NNNNN" shape). Client-sent
// inventoryCode is always ignored; the value assigned at create() time is the sole source of
// truth, matching Yarn Card/Fabric Card exactly.
const TABLE = 'IM_Item';
const ACCESS_CODE = 'TRIM';
const CODE_PREFIX = 'TRIM';

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source).
export const HEADER_COLUMNS = [
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly deleteGuard: DeleteDependencyService,
  ) {}

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

  async nextInventoryCode(): Promise<string> {
    // Numeric-safe on purpose: a naive `ORDER BY "InventoryCode" DESC LIMIT 1` (the approach
    // yarn-card.service.ts/fabric-card.service.ts use) breaks the moment any existing row's code
    // isn't zero-padded to the same width — a legacy "TRIM-001" (3 digits) sorts AFTER every
    // proper 5-digit "TRIM-000NN" code as a plain string ('1' > '0' at that position) despite
    // being numerically smaller. Confirmed live: exactly this malformed row is why every new
    // Trim Card kept computing the same already-taken "next" code and exhausting its retries.
    // MAX()'ing the cast numeric suffix instead finds the true highest sequence regardless of
    // how any existing row happened to be padded, while still generating the same
    // "PREFIX-NNNNN" shape every other IM_Item card uses.
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT MAX(SUBSTRING("InventoryCode" FROM '[0-9]+$')::int) as "maxSeq"
      FROM "IM_Item"
      WHERE "AccessCode" = ${ACCESS_CODE} AND "InventoryCode" ~ ${`^${CODE_PREFIX}-[0-9]+$`}
    `);
    const lastSeq = Number(rows[0]?.maxSeq ?? 0);
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${CODE_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private static readonly MAX_CODE_RETRIES = 5;

  async create(dto: Record<string, any>, userId: number, insertedByUserId?: string) {
    const toDb = await this.toDb();
    for (let attempt = 1; attempt <= TrimInventoryCardService.MAX_CODE_RETRIES; attempt++) {
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
        if (isCodeCollision && attempt < TrimInventoryCardService.MAX_CODE_RETRIES) continue;
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
    await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('IM_Item', id, tx);
      await tx.$executeRaw`
        UPDATE "IM_Item" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
      `;
    });
    return { message: 'Deleted' };
  }
}
