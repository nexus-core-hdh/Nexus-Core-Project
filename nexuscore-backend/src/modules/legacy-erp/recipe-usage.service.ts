import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';

// Recipe Usage ("Where Used") — ONE generic resolver shared by Fabric Cards, Yarn Cards, Trim
// Cards and Inventory Cards (fabric-card.service.ts / yarn-card.service.ts /
// trim-inventory-card.service.ts / inventory-card.service.ts). All four screens are views over
// the SAME underlying IM_Item table, just AccessCode-scoped ('FABRIC' / 'YARN' / 'TRIM' / the
// inventory-card.service.ts UNION of all three + FIXEDASSET) — confirmed via that service's own
// list() query, where every row's `id` is IM_Item."RecId". So "where is item X used" is a single,
// item-id-keyed question regardless of which of the four screens the right-click happened on; no
// per-card-type resolver is needed, only this one service.
//
// Real, persisted relationships this resolves against (confirmed via schema.prisma / pg_catalog
// inspection, and live-verified against YARN-00008/70-DNR LYCRA — see this file's own git history
// for that verification):
//   DIRECT (the item is itself the Fabric/Trim a BOM/recipe line points at):
//   - StyleBomLine.fabricInventoryId  -> StyleCard   (despite the column's name, it holds BOTH
//     Fabric and Trim IM_Item ids — see that model's own comment; Trim Card usage is already
//     covered by this same branch, no separate Trim query needed)
//   - SampleBomLine.fabricInventoryId -> SampleCard  (same convention)
//   - MA_RecipeItem.InventoryId -> MA_Recipe.WorkOrderId -> MA_WorkOrder (Work Order's own BOM)
//   - FabricYarnRecipeLine.yarnInventoryId -> the recipe's own fabricInventoryId (IM_Item) — "this
//     Yarn is used in Fabric X's yarn recipe" (Color-Wise Yarn Recipe, Common + Color-Specific)
//
//   TRANSITIVE (the item is a Yarn that only appears inside a FABRIC's own yarn recipe, and that
//   Fabric is what a Style/Sample/Work Order's BOM actually references — a Yarn is never picked
//   directly on a Style/Sample/Work Order BOM line in this schema, only a Fabric/Trim is, so a
//   query that only checked the DIRECT relationship above would always report zero Style/Sample/
//   Order usage for any Yarn, which is the exact bug this two-hop join fixes):
//   - StyleBomLine.fabricInventoryId = FabricYarnRecipeLine.fabricInventoryId, filtered on that
//     recipe line's own yarnInventoryId -> StyleCard
//   - same join shape for SampleBomLine -> SampleCard
//   - same join shape for MA_RecipeItem.InventoryId -> MA_Recipe -> MA_WorkOrder
//
// Deliberately NOT resolved (confirmed absent, not silently skipped): ProductCard has no BOM/line
// table of its own anywhere in this schema (no fabricInventoryId-shaped column exists on it or any
// child of it) — so unlike the legacy reference screenshot's "Product" row, there is no real
// "Product" usage type to report here. Transactional consumption (Purchase Order/Receipt lines
// referencing this item) is a different, already-existing concern (delete-dependency.service.ts's
// IM_Item checks) — this screen is specifically "Recipe Usage" (BOM/recipe references), matching
// its own title.
export type RecipeUsageType = 'Style' | 'Sample' | 'Order' | 'Fabric';

export interface RecipeUsageRow {
  type: RecipeUsageType;
  code: string | null;
  name: string | null;
  documentNo: string | null;
  sourceId: string;
  quantity: number | null;
}

export interface RecipeUsageListParams {
  inventoryId: number;
  branchId?: string;
  search?: string;
  type?: RecipeUsageType;
  skip?: number;
  take?: number;
}

const ALL_TYPES: RecipeUsageType[] = ['Style', 'Sample', 'Order', 'Fabric'];

@Injectable()
export class RecipeUsageService {
  constructor(private readonly prisma: PrismaService) {}

  // Raw (pre-dedup) candidate rows from every real relationship above, UNION ALL'd — same "UNION
  // ALL of scoped slices" shape inventory-card.service.ts's own list() already uses. Quantity is
  // carried through only where a real persisted field represents it (StyleBomLine/SampleBomLine/
  // MA_RecipeItem's own `quantity`/`Quantity` column on the DIRECT branches); every TRANSITIVE and
  // the Fabric-recipe-percentage branch pass NULL — a fabric's own BOM quantity is not the same
  // unit as "quantity of yarn", and FabricYarnRecipeLine.percentage is a composition ratio, not a
  // quantity, so neither is shown as one (Section 5's own "do not confuse percentage with
  // quantity" / "never invent" rules) rather than a computed, unstored blend of the two.
  private rawUsageCte(inventoryId: number, branchId?: string): Prisma.Sql {
    const branchFilterStyle = branchId ? Prisma.sql`AND sc."branchId" = ${branchId}` : Prisma.sql``;
    const branchFilterSample = branchId ? Prisma.sql`AND sam."branchId" = ${branchId}` : Prisma.sql``;
    return Prisma.sql`
      raw_usage AS (
        -- Style — direct (item itself is the Fabric/Trim on the BOM line)
        SELECT 'Style' as type, sc."styleNumber" as code, sc."title" as name,
          NULL::text as "documentNo", sc."id" as "sourceId", bl."quantity" as quantity
        FROM "StyleBomLine" bl
        JOIN "StyleCard" sc ON sc."id" = bl."styleCardId"
        WHERE bl."fabricInventoryId" = ${inventoryId} ${branchFilterStyle}

        UNION ALL

        -- Style — transitive (item is a Yarn used inside the recipe of a Fabric this style's BOM references)
        SELECT 'Style' as type, sc."styleNumber" as code, sc."title" as name,
          NULL::text as "documentNo", sc."id" as "sourceId", NULL::numeric as quantity
        FROM "StyleBomLine" bl
        JOIN "StyleCard" sc ON sc."id" = bl."styleCardId"
        JOIN "FabricYarnRecipeLine" fyl ON fyl."fabricInventoryId" = bl."fabricInventoryId"
        WHERE bl."fabricInventoryId" IS NOT NULL AND fyl."yarnInventoryId" = ${inventoryId} ${branchFilterStyle}

        UNION ALL

        -- Sample — direct
        SELECT 'Sample' as type, sam."sampleNumber" as code, sam."title" as name,
          NULL::text as "documentNo", sam."id" as "sourceId", bl."quantity" as quantity
        FROM "SampleBomLine" bl
        JOIN "SampleCard" sam ON sam."id" = bl."sampleCardId"
        WHERE bl."fabricInventoryId" = ${inventoryId} ${branchFilterSample}

        UNION ALL

        -- Sample — transitive
        SELECT 'Sample' as type, sam."sampleNumber" as code, sam."title" as name,
          NULL::text as "documentNo", sam."id" as "sourceId", NULL::numeric as quantity
        FROM "SampleBomLine" bl
        JOIN "SampleCard" sam ON sam."id" = bl."sampleCardId"
        JOIN "FabricYarnRecipeLine" fyl ON fyl."fabricInventoryId" = bl."fabricInventoryId"
        WHERE bl."fabricInventoryId" IS NOT NULL AND fyl."yarnInventoryId" = ${inventoryId} ${branchFilterSample}

        UNION ALL

        -- Fabric (item is a Yarn used directly in a Fabric's own yarn recipe)
        SELECT 'Fabric' as type, fab."InventoryCode" as code, fab."InventoryName" as name,
          NULL::text as "documentNo", fab."RecId"::text as "sourceId", NULL::numeric as quantity
        FROM "FabricYarnRecipeLine" fyl
        JOIN "IM_Item" fab ON fab."RecId" = fyl."fabricInventoryId"
        WHERE fyl."yarnInventoryId" = ${inventoryId} AND fab."IsDeleted" = 0

        UNION ALL

        -- Order — direct
        SELECT 'Order' as type, wo."WorkOrderNo" as code, NULL::text as name,
          wo."WorkOrderNo" as "documentNo", wo."RecId"::text as "sourceId", ri."Quantity" as quantity
        FROM "MA_RecipeItem" ri
        JOIN "MA_Recipe" rec ON rec."RecId" = ri."RecipeId" AND rec."IsDeleted" = 0
        JOIN "MA_WorkOrder" wo ON wo."RecId" = rec."WorkOrderId" AND wo."IsDeleted" = 0
        WHERE ri."InventoryId" = ${inventoryId} AND ri."IsDeleted" = 0

        UNION ALL

        -- Order — transitive (item is a Yarn used inside the recipe of a Fabric this Work Order's BOM references)
        SELECT 'Order' as type, wo."WorkOrderNo" as code, NULL::text as name,
          wo."WorkOrderNo" as "documentNo", wo."RecId"::text as "sourceId", NULL::numeric as quantity
        FROM "MA_RecipeItem" ri
        JOIN "MA_Recipe" rec ON rec."RecId" = ri."RecipeId" AND rec."IsDeleted" = 0
        JOIN "MA_WorkOrder" wo ON wo."RecId" = rec."WorkOrderId" AND wo."IsDeleted" = 0
        JOIN "FabricYarnRecipeLine" fyl ON fyl."fabricInventoryId" = ri."InventoryId"
        WHERE ri."IsDeleted" = 0 AND ri."InventoryId" IS NOT NULL AND fyl."yarnInventoryId" = ${inventoryId}
      )
    `;
  }

  // Collapses raw_usage down to one row per real referencing document (Section 7: many raw BOM/
  // recipe lines in the SAME Style/Sample/Order/Fabric must never fan out into duplicate rows —
  // confirmed live that SC-2026-8606 alone has 4 separate StyleBomLine rows for one fabric), while
  // still reporting a real total: SUM(quantity) over that document's own matching lines (NULLs from
  // the transitive/percentage branches contribute nothing, so a document reachable only
  // transitively still correctly shows a blank quantity rather than a fabricated 0).
  private usageCte(inventoryId: number, branchId?: string): Prisma.Sql {
    return Prisma.sql`
      ${this.rawUsageCte(inventoryId, branchId)},
      usage AS (
        SELECT type, code, name, "documentNo", "sourceId", SUM(quantity) as quantity
        FROM raw_usage
        GROUP BY type, code, name, "documentNo", "sourceId"
      )
    `;
  }

  async list(params: RecipeUsageListParams): Promise<{ rows: RecipeUsageRow[]; total: number; skip: number; take: number }> {
    const skip = Math.max(params.skip ?? 0, 0);
    const take = Math.min(Math.max(params.take ?? 50, 1), 200);
    const cte = this.usageCte(params.inventoryId, params.branchId);
    const typeFilter = params.type && ALL_TYPES.includes(params.type) ? Prisma.sql`AND type = ${params.type}` : Prisma.sql``;
    const term = params.search?.trim();
    const searchFilter = term
      ? Prisma.sql`AND (code ILIKE ${`%${term}%`} OR name ILIKE ${`%${term}%`} OR "documentNo" ILIKE ${`%${term}%`})`
      : Prisma.sql``;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        WITH ${cte}
        SELECT * FROM usage WHERE true ${typeFilter} ${searchFilter}
        ORDER BY type, code NULLS LAST
        LIMIT ${take} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        WITH ${cte}
        SELECT COUNT(*)::int as count FROM usage WHERE true ${typeFilter} ${searchFilter}
      `),
    ]);
    return { rows: sanitizeRawRow(rows), total: countRows[0]?.count ?? 0, skip, take };
  }
}
