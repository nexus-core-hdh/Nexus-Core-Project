import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { DeleteDependencyService } from './delete-dependency.service';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';
import { AuditService, AUDIT_ACTIONS, hasRealChanges, enrichDisplayRefs, FkResolver } from '../audit/audit.service';

// Yarn Card is NOT a new master entity — it's the existing, already-migrated IM_Item
// table (the legacy Item/Product master used by every "card" screen in this ERP family:
// Yarn, Fabric, Trim classes, etc.), scoped to rows where AccessCode = 'YARN'. Confirmed
// via IM_Item's own FK list that YarnTypeId already points at MD_Yarn, Denier/DenierType/
// FComposition/UD_YComposition/UD_YCount are already yarn-specific columns on this same
// table — no dedicated Yarn table exists or is needed. AccessCode itself is a free-text
// column (no FK/CHECK constraint), same "minimal convention" footing already used for
// FI_Account.CurrentAccountType and MA_YarnTrimCard.Explanation elsewhere in this module.
const TABLE = 'IM_Item';
const ACCESS_CODE = 'YARN';

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source) — raw
// column names as-is, matching exactly what unified-grid.service.ts's own `SELECT *` returns.
export const HEADER_COLUMNS = [
  // Top section + General tab / General Information
  'InventoryCode', 'InventoryName', 'InUse', 'InventoryType', 'AccessCode', 'SpecialCode',
  'GroupId', 'CategoryId', 'YarnTypeId', 'ShelfLife', 'ShelfLifeUnit', 'MarkId', 'ModelId',
  // Unit — IM_Item.UnitId already FKs to MD_UnitSet (confirmed via pg_catalog), the same
  // header table the Unit Sets screen manages. Reused as-is, no new column.
  'UnitId',
  // VAT Rates / Taxes
  'VatId', 'RetailVatId', 'WholeSaleVatId', 'RetailReturnVatId', 'WholeSaleReturnVatId', 'TaxId',
  // Withholding
  'WithholdingFactor', 'WithholdingDivisor', 'SWithholdingFactor', 'SWithholdingDivisor',
  // Using For
  'UseForCommon', 'UseForPurchase', 'UseForSale',
  // Follow-up Types
  'HasVariant', 'HasRowVariant', 'HasSeries', 'HasSeparableSeries',
  // Supplier / Manufacturer Info
  'CurrentAccountId', 'ProducerInventoryCode',
  // Detail tab — yarn/fiber technical fields, all pre-existing IM_Item columns
  'Denier', 'DenierType', 'FComposition', 'Density', 'IsWarp', 'IsFinally', 'WashCare',
  'UD_YComposition', 'UD_YCount', 'RecipeQuantity', 'RecipeUnitItemId',
  // Variant Types tab
  'Variant1TypeId', 'Variant2TypeId', 'Variant3TypeId', 'Variant4TypeId', 'Variant5TypeId',
  // Integration tab
  'IsoDocumentNo', 'WebContent', 'SeasonCode', 'GenderCode', 'CampaignGroup', 'PriceGroup', 'PlanCapacityGroup',
] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class YarnCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deleteGuard: DeleteDependencyService,
    private readonly masterLookup: LegacyMasterLookupService,
    private readonly audit: AuditService,
  ) {}

  // Only fields with an already-registered LegacyMasterLookupService key are enriched
  // (group, category, mark, model, unit, current-account, tax) — YarnTypeId/Variant1-5TypeId
  // have no existing key and are left as raw ids rather than inventing one.
  private displayResolvers(): Record<string, FkResolver> {
    const byKey = (key: string): FkResolver => (id) => this.masterLookup.getById(key, Number(id), { includeInactive: true });
    return {
      groupId: byKey('group'),
      categoryId: byKey('category'),
      markId: byKey('mark'),
      modelId: byKey('model'),
      unitId: byKey('unit'),
      currentAccountId: byKey('current-account'),
      vatId: byKey('tax'),
      retailVatId: byKey('tax'),
      wholeSaleVatId: byKey('tax'),
      retailReturnVatId: byKey('tax'),
      wholeSaleReturnVatId: byKey('tax'),
      taxId: byKey('tax'),
    };
  }

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
    if (!rows.length) throw new NotFoundException('Yarn card not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByCode(code: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_Item" WHERE "InventoryCode" = ${code} AND "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
    `);
    if (!rows.length) throw new NotFoundException('Yarn card not found');
    return sanitizeRawRow(rows[0]);
  }

  // Sequential "YARN-00001" codes, scoped to this screen's AccessCode so Yarn Card's
  // numbering never collides with any other future IM_Item-based card screen. No shared
  // numbering service exists anywhere in the codebase to reuse (verified — the closest
  // thing, `AutoNumbering`/`nextNumber()` in plm-cards.service.ts etc., is either an
  // unwired settings stub or hard-coded to typed Prisma models + a year-segmented format,
  // neither usable against a raw-SQL legacy table). Scans ALL rows including soft-deleted
  // ones so a deleted record's code is never reissued. Public (not private) so the
  // controller can expose a preview-only endpoint for the Create screen to display the
  // code it's about to get, before Save is ever pressed.
  async nextInventoryCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "InventoryCode" as code FROM "IM_Item"
      WHERE "AccessCode" = ${ACCESS_CODE} AND "InventoryCode" LIKE 'YARN-%'
      ORDER BY "InventoryCode" DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `YARN-${String(next).padStart(5, '0')}`;
  }

  // Application-level uniqueness check — IM_Item has a real DB unique constraint on
  // (CompanyId, InventoryCode) already (confirmed live), but nothing enforces InventoryName
  // uniqueness at the DB level, and neither produces the friendly messages this screen
  // needs. Mirrors the ConflictException("<field> already exists") convention already used
  // by fabric.service.ts/roles.service.ts/users.service.ts elsewhere in the backend.
  // Comparison is case-insensitive (LOWER() on both sides) and both inputs are trimmed by
  // the caller before this runs — "YARN-00001" / "yarn-00001", "Shahbaz" / "SHAHBAZ" etc.
  // are all treated as the same value.
  private async assertUnique(code: string, name: string, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "InventoryCode" as code, "InventoryName" as name FROM "IM_Item"
      WHERE "AccessCode" = ${ACCESS_CODE} AND "IsDeleted" = 0
        AND (LOWER("InventoryCode") = LOWER(${code}) OR LOWER("InventoryName") = LOWER(${name}))
        ${exclude}
    `);
    const codeDup = rows.some((r) => String(r.code).toLowerCase() === code.toLowerCase());
    const nameDup = rows.some((r) => String(r.name).toLowerCase() === name.toLowerCase());
    if (codeDup && nameDup) throw new ConflictException('A record already exists with this Code and Name.');
    if (codeDup) throw new ConflictException('A record already exists with this Code.');
    if (nameDup) throw new ConflictException('A record already exists with this Name.');
  }

  private static readonly MAX_CODE_RETRIES = 5;

  async create(dto: Record<string, any>, userId: number, insertedByUserId?: string, currentUserId?: string, companyId?: string) {
    const name = String(dto.inventoryName ?? '').trim();
    if (!name) throw new BadRequestException('Name is required');
    const toDb = await this.toDb();

    // Retry loop covers the race where a second user's Save lands between this request's
    // preview/generation and its INSERT: the DB's real (CompanyId, InventoryCode) unique
    // constraint is the actual source of truth (this can never silently create a
    // duplicate), and a collision against it just regenerates the next code and retries —
    // it never surfaces the raw Postgres error to the user.
    for (let attempt = 1; attempt <= YarnCardService.MAX_CODE_RETRIES; attempt++) {
      const inventoryCode = await this.nextInventoryCode();
      await this.assertUnique(inventoryCode, name);
      // AccessCode always defaults to YARN for this screen — it's what scopes IM_Item rows
      // to "Yarn Card" in list()/get()/getByCode(), regardless of what the form sends.
      // InventoryCode is always server-generated — client input for it is ignored.
      const effective = { ...dto, accessCode: ACCESS_CODE, inventoryCode, inventoryName: name };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      // InsertedByUserId is the real NexusCore User.id (text/uuid) — separate from the legacy
      // InsertedBy integer (which Number(uuid) always collapses to a fallback value, so it
      // can never resolve to a real user). Lets the Inventory Card List join back to the real
      // Users/Auth table for a real creator name instead of a placeholder.
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"InsertedByUserId"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_Item" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, ${insertedByUserId ?? null}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        const created = sanitizeRawRow(rows[0]);
        if (currentUserId && companyId) {
          const enriched = await enrichDisplayRefs(created, this.displayResolvers());
          this.audit.recordSafe({
            userId: currentUserId, companyId, screenKey: '/dashboard/legacy-erp/yarn-cards-list',
            entityType: 'YarnCard', entityId: String(created.id), action: AUDIT_ACTIONS.CREATE,
            documentNo: created.inventoryCode, after: { 'Yarn Card (IM_Item)': enriched },
          });
        }
        return created;
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('InventoryCode');
        if (isCodeCollision && attempt < YarnCardService.MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Code — please try again.');
  }

  async update(id: number, dto: Record<string, any>, userId: number, currentUserId?: string, companyId?: string) {
    const current = await this.get(id);
    if (dto.inventoryName !== undefined) {
      const name = String(dto.inventoryName ?? '').trim();
      if (!name) throw new BadRequestException('Name is required');
      await this.assertUnique(current.inventoryCode, name, id);
    }
    const toDb = await this.toDb();
    // InventoryCode is immutable after creation — never editable via update, regardless
    // of what the client sends.
    const cols = HEADER_COLUMNS.filter((c) => c !== 'InventoryCode' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_Item" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    const updated = sanitizeRawRow(rows[0]);
    if (currentUserId && companyId && hasRealChanges(current, updated)) {
      const resolvers = this.displayResolvers();
      const [enrichedBefore, enrichedAfter] = await Promise.all([enrichDisplayRefs(current, resolvers), enrichDisplayRefs(updated, resolvers)]);
      this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: '/dashboard/legacy-erp/yarn-cards-list',
        entityType: 'YarnCard', entityId: String(id), action: AUDIT_ACTIONS.UPDATE,
        documentNo: updated.inventoryCode,
        before: { 'Yarn Card (IM_Item)': enrichedBefore }, after: { 'Yarn Card (IM_Item)': enrichedAfter },
      });
    }
    return updated;
  }

  async remove(id: number, userId: number, currentUserId?: string, companyId?: string) {
    const before = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('IM_Item', id, tx);
      await tx.$executeRaw`
        UPDATE "IM_Item" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
      `;
    });
    if (currentUserId && companyId) {
      const enriched = await enrichDisplayRefs(before, this.displayResolvers());
      this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: '/dashboard/legacy-erp/yarn-cards-list',
        entityType: 'YarnCard', entityId: String(id), action: AUDIT_ACTIONS.DELETE,
        documentNo: before.inventoryCode, before: { 'Yarn Card (IM_Item)': enriched },
      });
    }
    return { message: 'Deleted' };
  }
}
