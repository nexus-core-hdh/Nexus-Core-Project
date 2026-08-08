import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap } from './legacy-db-types.util';

// Read-only aggregation over the three existing IM_Item-based inventory cards (Fabric, Yarn,
// Trim) for the "Inventory Card List" screen — a UNION ALL of the same three AccessCode-
// scoped slices fabric-card.service.ts / yarn-card.service.ts / trim-inventory-card.service.ts
// already query individually, not a new table or materialized view: nothing here can drift
// out of sync with those services, because it reads the exact same rows they do.
//
// Unit resolution differs per card, matching how each one's own screen already stores it —
// this is deliberately NOT unified, since unifying it would mean changing Fabric/Yarn Card's
// existing behavior, which is explicitly off-limits:
//  - Fabric & Trim: no direct Unit column — resolved from their own "unit" satellite tab
//    (IM_ItemUnitItemSize -> MD_UnitSetItem), preferring whichever row is flagged the item's
//    Main Unit, falling back to the first one.
//  - Yarn: IM_Item.UnitId is a direct FK straight to MD_UnitSet (its own screen's "Unit"
//    field resolves the same way — see yarn-cards/page.tsx).
//
// InsertedBy resolves against the real Users/Auth table ("User", the same one every other
// part of NexusCore signs in against) via IM_Item.InsertedByUserId — a separate, additive
// column from the legacy InsertedBy integer (which every fabric/yarn/trim-card.service.ts
// create() populates from CurrentUser('id'), a real uuid, unlike the legacy InsertedBy int
// which Number(uuid) always collapses to a meaningless fallback). Falls back to "Unknown
// User" when the column is null (record created before this column existed) or the user was
// deleted since — never a fabricated placeholder like "User #1".
const SORTABLE_COLUMNS: Record<string, string> = {
  inventoryCode: 'inventoryCode',
  inventoryName: 'inventoryName',
  insertedAt: 'insertedAt',
  insertedBy: 'insertedBy',
};

export interface InventoryCardListParams {
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

@Injectable()
export class InventoryCardService {
  constructor(private readonly prisma: PrismaService) {}

  // Display-name priority, per spec: User.name, else User.fullName (if that column exists),
  // else CONCAT(firstName, lastName) (if both exist), else "Unknown User" — never a raw id.
  // Built from a live column introspection of "User" (reusing the same pg_catalog lookup
  // legacy-db-types.util.ts already uses for domain-type coercion) rather than hardcoding
  // the assumption that fullName/firstName/lastName exist: today's schema only has `name`,
  // so this resolves to `COALESCE(NULLIF(creator."name",''), 'Unknown User')` — but if
  // fullName or firstName+lastName are ever added to User, this starts using them with zero
  // code changes, and never errors by referencing a column that doesn't exist.
  private async creatorNameExpr(): Promise<Prisma.Sql> {
    const userColumns = await getColumnTypeMap(this.prisma, 'User');
    const tiers: Prisma.Sql[] = [];
    if (userColumns.has('name')) tiers.push(Prisma.sql`NULLIF(creator."name", '')`);
    if (userColumns.has('fullName')) tiers.push(Prisma.sql`NULLIF(creator."fullName", '')`);
    if (userColumns.has('firstName') && userColumns.has('lastName')) {
      tiers.push(Prisma.sql`NULLIF(TRIM(CONCAT(creator."firstName", ' ', creator."lastName")), '')`);
    }
    tiers.push(Prisma.sql`'Unknown User'`);
    return Prisma.sql`COALESCE(${Prisma.join(tiers, ', ')})`;
  }

  async list(params: InventoryCardListParams) {
    const sortColumn = SORTABLE_COLUMNS[params.sortBy ?? 'inventoryCode'] ?? 'inventoryCode';
    const sortDir = params.sortDir === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
    if (params.sortBy && !SORTABLE_COLUMNS[params.sortBy]) {
      throw new BadRequestException(`Cannot sort by "${params.sortBy}"`);
    }

    const whereSearch = params.search
      ? Prisma.sql`WHERE ("inventoryCode" ILIKE ${`%${params.search}%`} OR "inventoryName" ILIKE ${`%${params.search}%`} OR "inventoryType" ILIKE ${`%${params.search}%`} OR "insertedBy" ILIKE ${`%${params.search}%`})`
      : Prisma.sql``;

    const creatorName = await this.creatorNameExpr();

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM (
        ${this.fabricAndTrimSlice('FABRIC', 'Fabric', 'fabric', creatorName)}
        UNION ALL
        ${this.yarnSlice(creatorName)}
        UNION ALL
        ${this.fabricAndTrimSlice('TRIM', 'Trim', 'trim', creatorName)}
        UNION ALL
        ${this.fabricAndTrimSlice('FIXEDASSET', 'Fixed Asset', 'fixedasset', creatorName)}
      ) combined
      ${whereSearch}
      ORDER BY "${Prisma.raw(sortColumn)}" ${sortDir}
      LIMIT 200
    `);
    return sanitizeRawRow(rows);
  }

  // Fabric, Trim and Fixed Asset share the exact same "no direct Unit column, resolve via the
  // unit satellite tab" shape, so this one query template serves all three — just the
  // AccessCode/display label/sourceType differ. Fixed Asset has no dedicated item master of
  // its own (confirmed via pg_catalog): IM_FixedAssetDepreciation/Expense/Inflation all key
  // off InventoryId -> IM_Item the same way Fabric/Trim/Yarn do, so a Fixed Asset item is
  // just an IM_Item row with AccessCode = 'FIXEDASSET' (0 rows today — no fake data).
  private fabricAndTrimSlice(accessCode: string, label: string, sourceType: string, creatorName: Prisma.Sql) {
    return Prisma.sql`
      SELECT
        i."RecId" AS id,
        ${sourceType} AS "sourceType",
        i."InventoryCode" AS "inventoryCode",
        i."InventoryName" AS "inventoryName",
        ${label} AS "inventoryType",
        COALESCE(unit_lookup."unitName", '') AS "unit",
        0 AS "stockOnHand",
        i."InsertedAt" AS "insertedAt",
        ${creatorName} AS "insertedBy"
      FROM "IM_Item" i
      LEFT JOIN LATERAL (
        SELECT usi."UnitName" AS "unitName"
        FROM "IM_ItemUnitItemSize" iuis
        JOIN "MD_UnitSetItem" usi ON usi."RecId" = iuis."UnitItemId"
        WHERE iuis."InventoryId" = i."RecId" AND iuis."IsDeleted" = 0
        ORDER BY iuis."IsMainUnit" DESC NULLS LAST, iuis."RecId" ASC
        LIMIT 1
      ) unit_lookup ON true
      LEFT JOIN "User" creator ON creator."id" = i."InsertedByUserId"
      WHERE i."IsDeleted" = 0 AND i."AccessCode" = ${accessCode}
    `;
  }

  private yarnSlice(creatorName: Prisma.Sql) {
    return Prisma.sql`
      SELECT
        i."RecId" AS id,
        'yarn' AS "sourceType",
        i."InventoryCode" AS "inventoryCode",
        i."InventoryName" AS "inventoryName",
        'Yarn' AS "inventoryType",
        COALESCE(us."SetName", '') AS "unit",
        0 AS "stockOnHand",
        i."InsertedAt" AS "insertedAt",
        ${creatorName} AS "insertedBy"
      FROM "IM_Item" i
      LEFT JOIN "MD_UnitSet" us ON us."RecId" = i."UnitId"
      LEFT JOIN "User" creator ON creator."id" = i."InsertedByUserId"
      WHERE i."IsDeleted" = 0 AND i."AccessCode" = 'YARN'
    `;
  }
}
