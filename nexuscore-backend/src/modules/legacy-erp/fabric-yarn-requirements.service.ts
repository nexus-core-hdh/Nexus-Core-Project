import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { WorkOrderService } from './work-order.service';
import { FabricYarnRecipeService } from './fabric-yarn-recipe.service';
import { assertNonNegative } from './numeric-guards.util';
import { toBaseAmount, applyUnitFactor } from './unit-conversion.util';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { WORK_ORDER_SCREEN_KEY } from './work-order.service';

// Fabric/Trim/Yarn Requirements — NOT a new entity. Reuses the exact same Work Order BOM data
// (MA_Recipe/MA_RecipeItem, already served by WorkOrderService.listBom) as its Requirements
// grid source for both Fabric and Trim (MA_RecipeItem already natively distinguishes them via
// RecipeType — see work-order.service.ts's own RECIPE_TYPE_BY_LINE_TYPE), and the exact same
// Fabric Card Yarn Recipe (FabricYarnRecipeLine, already served by FabricYarnRecipeService — the
// same one bom-tab.tsx's own Yarn Recipe Detail dialog uses) to explode Fabric rows into Yarn
// rows, so this file introduces zero new BOM/recipe logic for any of the three.
//
// `MA_Requirement` (RequirementType, WorkOrderItemId, InventoryId, Variant1, Variant2, ProcessId,
// Quantity, wastage breakdown columns, RecipeItemNo — confirmed via information_schema) is a
// real, pre-existing legacy table already in this migrated schema, but has ZERO rows and is
// touched by NO other code anywhere in this codebase (confirmed via a whole-repo grep) — it is
// the correct persistence target for Calculate/Save below, not a new table. Since it has never
// held data, there is no existing RequirementType convention to reverse-engineer; the 1/2/3
// values below are a new, explicit convention this file introduces (documented, not inferred),
// matching the same 1-based-per-lineType style work-order.service.ts's own
// RECIPE_TYPE_BY_LINE_TYPE uses. Trim added as 3 (not 2, to avoid disturbing the already-shipped
// Yarn=2 meaning) rather than reassigning existing values.
export const REQUIREMENT_TYPE = { fabric: 1, yarn: 2, trim: 3 } as const;
export type RequirementTab = keyof typeof REQUIREMENT_TYPE;
// The Requirements-grid tabs that map directly onto an existing Work Order BOM lineType (see
// work-order.service.ts's own BomLineType/RECIPE_TYPE_BY_LINE_TYPE) — i.e. everything except
// "yarn", which instead explodes Fabric rows through their own Yarn Recipe (see
// getYarnRequirements below).
type DirectBomTab = Extract<RequirementTab, 'fabric' | 'trim'>;

const REQUIREMENT_TABLE = 'MA_Requirement';

// Matches work-orders/page.tsx's own COLOR_SIZE_SEP exactly — the existing client-side convention
// that already encodes Manufacturing Quantities' Color+Size into MA_WorkOrderItemVariant.Explanation
// (documented in work-order.service.ts's own ITEM_VARIANT_COLUMNS comment: "client-side convention
// only, no schema change"). This is the first backend reader of that convention; do not diverge
// from this separator without updating the frontend's own constant.
const COLOR_SIZE_SEP = '‖';

@Injectable()
export class FabricYarnRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrderSvc: WorkOrderService,
    private readonly yarnRecipeSvc: FabricYarnRecipeService,
    private readonly audit: AuditService,
  ) {}

  // Extra Cutting % -> Will Be Cut — MA_WorkOrder.Quantity2 ("Cutting Extra" on the header Detail
  // tab, work-orders/page.tsx) is the Work Order's own saved Extra Cutting percentage; each
  // Manufacturing Quantity row's ORIGINAL size quantity is rounded UP independently per the task's
  // exact formula (WillBeCut = Math.ceil(OriginalSizeQuantity * (1 + ExtraCuttingPercent / 100))) —
  // never total-then-round, so summing rounded per-size values never equals rounding the sum. A
  // Work Order with no Extra Cutting set (the pre-existing default, 0) rounds every integer
  // quantity up to itself, so every Work Order created before this fix keeps its exact prior
  // requirement figures unchanged.
  // Math.max(0, ...) is a defensive floor, not the primary guard — Manufacturing Quantity and
  // Extra Cutting % are already rejected as negative at the write path (work-order.service.ts's
  // upsertItemVariants/assertHeaderQuantitiesNonNegative), so this only protects against
  // pre-existing legacy data. Will Be Cut must never surface as a negative quantity (the
  // screenshot's -1 case) regardless of how a negative value got into either input.
  private willBeCutQty(originalQty: number, extraCuttingPercent: number): number {
    return Math.max(0, Math.ceil(originalQty * (1 + extraCuttingPercent / 100)));
  }

  // ── Manufacturing Quantity totals — the Order/Production quantity side of "Required Material =
  // Applicable Production Quantity x BOM Item's Consumption". Reads the Work Order's own existing
  // Manufacturing Quantities grid (MA_WorkOrderItemVariant, entered on the Work Order's "C/S
  // Details" tab — work-order.service.ts's listItems/listItemVariants, unchanged), decoded and
  // summed per Color (case-insensitive) and overall. This was previously never read by this
  // service at all (see the module's own historical comment above) — this is the missing link the
  // task asks for, not a redefinition of how Manufacturing Quantities are entered or stored.
  // Scoped to the Work Order's own "primary" Style Info line (listItems(...)[0]), the exact same
  // convention both the Manufacturing Quantities grid itself (work-orders/page.tsx's own `primId`)
  // and this service's own save() (its `ORDER BY "ItemOrderNo","RecId" LIMIT 1`) already use.
  //
  // Each row here is already one real Color+Size combination (work-orders/page.tsx saves one
  // MA_WorkOrderItemVariant per Color x Size cell — see ITEM_VARIANT_COLUMNS's own comment), so
  // applying willBeCutQty() per row here IS applying it per size independently, exactly as
  // required — total/byColor are sums of already-rounded per-size values, never a rounded sum.
  private async getManufacturingQuantityTotals(workOrderId: number): Promise<{ byColor: Map<string, number>; colorLabels: Map<string, string>; total: number; hasAny: boolean; extraCuttingPercent: number }> {
    const [items, headerRows] = await Promise.all([
      this.workOrderSvc.listItems(workOrderId),
      this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "Quantity2" as "quantity2" FROM "MA_WorkOrder" WHERE "RecId" = ${workOrderId} AND "IsDeleted" = 0`),
    ]);
    const extraCuttingPercent = Number(headerRows[0]?.quantity2) || 0;
    const primaryItemId = items[0]?.id;
    const byColor = new Map<string, number>();
    // Original-casing display text per lowercased color key (e.g. "CRIMSON" for "crimson") — kept
    // separate from `byColor`'s own lowercased keys (needed for case-insensitive matching) so a
    // common-material expansion (resolveApplicableQuantityScopes) can label each generated row with
    // the color exactly as the user typed it on Manufacturing Quantities, not a lowercased copy.
    const colorLabels = new Map<string, string>();
    let total = 0;
    if (primaryItemId == null) return { byColor, colorLabels, total, hasAny: false, extraCuttingPercent };
    const variants = await this.workOrderSvc.listItemVariants(primaryItemId);
    for (const v of variants) {
      const originalQty = Number(v.quantity) || 0;
      const qty = this.willBeCutQty(originalQty, extraCuttingPercent);
      total += qty;
      const [colorRaw] = String(v.explanation || '').split(COLOR_SIZE_SEP);
      const colorTrimmed = colorRaw.trim();
      const color = colorTrimmed.toLowerCase();
      if (color) {
        byColor.set(color, (byColor.get(color) || 0) + qty);
        if (!colorLabels.has(color)) colorLabels.set(color, colorTrimmed);
      }
    }
    return { byColor, colorLabels, total, hasAny: variants.length > 0, extraCuttingPercent };
  }

  // Resolves which production quantity applies to one BOM line: match its own Production Color
  // text against a Manufacturing Quantity Color (case-insensitive/trimmed) — e.g. a "Navy" Main
  // Fabric row only requires Navy's own produced quantity, never the whole order's. A BOM line
  // whose Production Color doesn't match any entered Color (blank, or a common/fixed material like
  // Reflector's "Medium Grey" / Velcro's "Black" that applies to every garment color) falls back to
  // the Work Order's TOTAL production quantity across every color/size — it still needs to be
  // sized to the full run, just without a color to narrow it by.
  //
  // IMPORTANT: this reads `Variant2` (MA_RecipeItem's second variant column), NOT `Variant1`.
  // Variant1 is this BOM line's own Material Variant/Type (e.g. "Fleece", "Rib", "Twill Tape") —
  // a completely different, pre-existing concept that must never be overwritten or reinterpreted
  // as a color. Variant2 had no established meaning anywhere else in this codebase before this
  // feature (confirmed: blank/unused on every Work Order BOM row, and StyleBomLine/SampleBomLine
  // have no equivalent column at all — a Style Card fallback line now gets one assigned live via
  // getStyleCardBomLinesAsWorkOrderShape's own resolveProductionColors/assignProductionColorCycle
  // reuse, see that method's own comment), which is exactly why it was chosen for this: an
  // existing, real, currently-empty column on exactly the right table (MA_RecipeItem, Work Order's
  // own BOM), needing zero schema migration.
  private resolveApplicableQuantity(
    productionColor: string | null | undefined,
    mfgQty: { byColor: Map<string, number>; total: number },
  ): { quantity: number; matchedColor: string | null } {
    const key = (productionColor || '').trim().toLowerCase();
    if (key && mfgQty.byColor.has(key)) return { quantity: mfgQty.byColor.get(key)!, matchedColor: (productionColor as string).trim() };
    return { quantity: mfgQty.total, matchedColor: null };
  }

  // ── Color-Wise Requirement Calculation (global rule) ────────────────────────────────────────
  // A BOM line's color mapping resolves to one OR MORE independent quantity scopes, never a single
  // blended figure that silently discards color identity:
  //
  // - This line has an EXPLICIT color mapping -> exactly one scope: that color's own Will-Be-Cut,
  //   or the Work Order's total as a documented (buildMappingWarnings-surfaced) fallback when the
  //   mapped text doesn't match any real Manufacturing Quantity color. A color-specific line NEVER
  //   expands into other colors — RED-mapped fleece must never also generate a BLACK/ORANGE row.
  //
  //   "Explicit color mapping" means EITHER of the two real, existing fields this app lets a user
  //   set on a BOM line (see the Color Mapping Rule this fix implements — reuse existing fields,
  //   never invent a new one), Variant-2 taking priority when both happen to be set:
  //     (a) Variant-2 (this line's own free-text Production-Color match key — see
  //         resolveApplicableQuantity's own comment), or
  //     (b) Material Color (colorCardId -> its ColorCard's own code/name — the "Choose Color" cell
  //         on the BOM grid). THIS is the actual real-world mapping path most BOM lines use in
  //         practice (Variant-2 has no dedicated single-cell editor anywhere outside the Material x
  //         Production Color matrix/C-S Details grid — see bom-tab.tsx/work-orders page.tsx's own
  //         "Choose Color" cells) — a BOM line whose user picked "DEEP LICHEN GREEN" as its Material
  //         Color, with Variant-2 left blank, previously fell all the way through to the "common
  //         material" branch below and was wrongly multiplied against EVERY Production Color
  //         instead of only its own — this is the exact cross-join defect this fix corrects. This
  //         is the ONLY resolver a single-Material-Color line ever gets: a Style Card fallback line
  //         belonging to a material with MORE than one distinct Material Color is instead resolved
  //         earlier, by getStyleCardBomLinesAsWorkOrderShape's own reuse of
  //         resolveProductionColors/assignProductionColorCycle — the app's existing, already-
  //         established "Nth Material Color -> Nth Production Color, by position" convention for a
  //         multi-color Style material whose own color swatches don't share text with any
  //         Production Color name at all (see that method's own comment) — so this text-match path
  //         only ever needs to handle the single-color case. A Material Color whose text doesn't
  //         match any real Manufacturing Quantity color (e.g. a fixed swatch like Reflector's own
  //         "Medium Grey") is still an explicit mapping, just an unmatched one — same documented
  //         total-quantity fallback as an unmatched Variant-2, not a silent reclassification as
  //         "common".
  // - NEITHER Variant-2 nor Material Color is set (a genuinely COMMON material — applies to every
  //   garment color, e.g. a shared interlining with no color selection at all) -> one independent
  //   scope PER real Production Color entered on this Work Order (mfgQty.byColor), each carrying
  //   that color's own Will-Be-Cut quantity and its own display label — the already-established
  //   common-material rule, unchanged by this fix. This is the business rule this feature exists to
  //   enforce: "Fabric | RED | 2x100=200" + "Fabric | BLACK | 2x200=400" + "Fabric | ORANGE |
  //   2x50=100", never a single "Fabric | Total(350) | 700" row that is numerically equal but has
  //   silently discarded which color needs how much. A Work Order with exactly one Production Color
  //   naturally yields exactly one scope here (byColor.size === 1) — no separate single-color branch
  //   needed, it falls out of the same loop.
  // - No usable Production Color data at all (byColor empty — a legacy/blank Manufacturing
  //   Quantities grid) -> the pre-existing safe fallback, one scope against the Work Order's raw
  //   total (0 when nothing is entered). Never invents a color that was never entered.
  //
  // Called by getMaterialRequirements (Fabric/Trim) and getYarnRequirements (per Fabric BOM line,
  // BEFORE exploding through the Yarn Recipe — see that method's own comment on why the expansion
  // must happen upstream of the recipe math, not downstream of it) — the ONE place this resolution
  // happens, so Fabric/Trim/Yarn can never disagree on which colors a common material expands into.
  private resolveApplicableQuantityScopes(
    productionColor: string | null | undefined,
    materialColorName: string | null | undefined,
    mfgQty: { byColor: Map<string, number>; colorLabels: Map<string, string>; total: number },
  ): { quantity: number; matchedColor: string | null }[] {
    const explicitColorText = String(productionColor || '').trim() || String(materialColorName || '').trim();
    if (explicitColorText) return [this.resolveApplicableQuantity(explicitColorText, mfgQty)];
    if (mfgQty.byColor.size > 0) {
      return Array.from(mfgQty.byColor.entries()).map(([colorKey, quantity]) => ({
        quantity,
        matchedColor: mfgQty.colorLabels.get(colorKey) ?? colorKey,
      }));
    }
    return [{ quantity: mfgQty.total, matchedColor: null }];
  }

  // Public summary for the Requirement Planning screen's own "Production Quantities" readout —
  // same totals resolveApplicableQuantity's callers already compute, just reshaped for display
  // (Map -> array) instead of a second query.
  async getManufacturingQuantitySummary(workOrderId: number) {
    const { byColor, total, hasAny, extraCuttingPercent } = await this.getManufacturingQuantityTotals(workOrderId);
    return {
      hasAny,
      total,
      byColor: Array.from(byColor.entries()).map(([color, quantity]) => ({ color, quantity })),
      // Both already reflect Will Be Cut (Extra Cutting % applied + rounded up per size) — see
      // getManufacturingQuantityTotals/willBeCutQty — not the raw entered Manufacturing Quantity.
      extraCuttingPercent,
    };
  }

  // Resolves InventoryId -> real Inventory Code/Name via IM_Item, batched (one query for every
  // distinct id a page of rows references) rather than N+1 — the same "InventoryId is a plain
  // IM_Item reference, resolved live" convention every other Fabric/Trim/Yarn Card lookup in this
  // app already follows (see work-order.service.ts's own comments on InventoryId).
  private async resolveInventoryNames(ids: (number | null | undefined)[]): Promise<Map<number, { code: string; name: string }>> {
    const distinct = Array.from(new Set(ids.filter((id): id is number => id != null)));
    if (!distinct.length) return new Map();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "InventoryCode" as code, "InventoryName" as name
      FROM "IM_Item" WHERE "RecId" IN (${Prisma.join(distinct)})
    `);
    return new Map(sanitizeRawRow(rows).map((r: any) => [r.id, { code: r.code, name: r.name }]));
  }

  // Material Color (bom-tab.tsx's "Choose Color" cell -> ColorCard, the same master/relation the
  // 20260909130000 migration bound StyleBomLine/SampleBomLine/MA_RecipeItem to) resolved for a
  // batch of BOM lines' colorCardId — the Multi-Color BOM feature's "which physical color this
  // material line is" identity, kept deliberately separate from `variant2`/`matchedColor` below
  // (the PRODUCTION color a line applies to, per the Manufacturing Quantities color breakdown) AND
  // from `variant1` (the line's own Material Variant/Type, e.g. "Fleece" — never a color).
  private async resolveColorCards(ids: (string | null | undefined)[]): Promise<Map<string, { code: string; name: string }>> {
    const distinct = Array.from(new Set(ids.filter((id): id is string => !!id)));
    if (!distinct.length) return new Map();
    const rows = await this.prisma.colorCard.findMany({ where: { id: { in: distinct } }, select: { id: true, code: true, name: true } });
    return new Map(rows.map((r) => [r.id, { code: r.code, name: r.name }]));
  }

  // ── Requirement Calculation Unit ────────────────────────────────────────────────────────────
  // An Inventory Item's Unit tab (Fabric/Trim/Yarn Card — "unit" satellite tab, backed by the
  // real, pre-existing IM_ItemUnitItemSize table) can carry several units at once (e.g. KG, GRM,
  // BAG), each independently a real row. That same table already carries a real, pre-existing
  // "UseForRecipe" column — surfaced in the Unit tab's own UI as the "Requirement Calculation"
  // switch (see unit-item-detail-grid.tsx) — which is the ONLY existing mechanism in this schema
  // that identifies which ONE of an item's units the Requirements Engine should use. This is NOT
  // an invented rule: confirmed via pg_catalog that this column already exists and is already
  // wired into the Unit tab's own save path (yarn-card-satellites.service.ts's SATELLITES.unit
  // config), just never previously read by anything. Deliberately NOT "first unit" / not
  // IsMainUnit ("Base Unit" — a completely different, already-established concept used for unit
  // *conversion*, not recipe/requirement calculation) / not any hardcoded code like "KG" — none
  // of those are what this flag means, and assuming so would silently mislabel a correctly
  // computed quantity for any item whose real Base Unit differs from its real Requirement
  // Calculation Unit.
  //
  // IM_ItemUnitItemSize itself stores no Code/Name of its own — only a UnitItemId reference back
  // to the Unit Set template row (MD_UnitSetItem) it was copied from (confirmed via schema
  // inspection: SATELLITES.unit's own column list has no UnitCode/UnitName) — so resolving a
  // real, displayable Code/Name requires this join.
  //
  // Resolution, per item: among this item's own In-Use (InUse=1), non-deleted units, the one(s)
  // flagged UseForRecipe=1. Exactly one -> that's the resolved unit. Zero -> `unresolvedIds`
  // (this item's real Unit configuration simply hasn't had this flag set on anything yet — a real
  // data-completeness gap, confirmed empirically: as of this feature, every existing Item in this
  // database has zero units flagged, see the final report's own note).
  //
  // More than one flagged -> `ambiguousIds`, and `units` gets NOTHING for that item — never a
  // silent pick. The Item Unit save path itself now enforces exactly-zero-or-one
  // (yarn-card-satellites.service.ts's own assertSingleRequirementUnit, unit-set.service.ts's own
  // copy) BEFORE any write commits, so this case should be unreachable for any configuration saved
  // through this app from here on; it is kept as an explicit, honest "don't guess" backstop only
  // for legacy/bad data that predates that guard (or bypassed it via a direct DB write) — an
  // earlier version of this method picked the lowest-RecId unit deterministically in this case,
  // which is exactly the silent-fallback behavior this update removes: better to show `null`
  // Requirement Unit with a loud warning than to quietly compute a real quantity against a unit
  // nobody actually confirmed. Both `unresolvedIds`/`ambiguousIds` flow into getMappingWarnings
  // (see buildUnitWarnings) as non-fatal, surfaced warnings — never blocking Calculate/Save,
  // matching this file's own established color-mapping-warning precedent (buildMappingWarnings)
  // for exactly this kind of "real but actionable gap".
  // unitFactor/unitDivisor — this exact resolved row's OWN conversion pair (relative to the item's
  // Base Unit, IsMainUnit=1 — the same "Base Unit + Unit Conversion" convention
  // unit-conversion.util.ts already documents), additive alongside id/code/name. Lets
  // getMaterialRequirements/getYarnRequirements convert the FINAL Requirement quantity into this
  // unit (via that file's own applyUnitFactor) without a second query — this row was already the
  // one being joined to find WHICH unit is flagged "Requirement Calculation" in the first place.
  // `unitItemId` (additive) — the real MD_UnitSetItem.RecId (u."UnitItemId", the same value the
  // JOIN below already matches msi."RecId" against) — deliberately NOT the same value as `id`
  // (IM_ItemUnitItemSize.RecId, this ITEM's own per-unit configuration row). Every existing
  // consumer of this method only ever reads id/code/name/unitFactor/unitDivisor, so adding this
  // one field changes nothing about current behavior; it exists so a caller that needs to set a
  // real transaction LINE's own "Unit" field (Purchase Order/Inventory Receipt line grids, both
  // of which validate/persist UnitId against MD_UnitSetItem.RecId — confirmed via
  // legacy-master-lookup.service.ts's own `listItemUnits`, the exact resolver those two grids'
  // own Unit dropdowns already call) has the correct id to use, instead of the wrong one
  // (IM_ItemUnitItemSize.RecId is a different table entirely and would silently corrupt the
  // line's Unit if used here).
  private async resolveRequirementUnits(inventoryIds: (number | null | undefined)[]): Promise<{
    units: Map<number, { id: number; code: string; name: string; unitFactor: number; unitDivisor: number; unitItemId: number }>;
    unresolvedIds: Set<number>;
    ambiguousIds: Set<number>;
  }> {
    const distinct = Array.from(new Set(inventoryIds.filter((id): id is number => id != null)));
    const units = new Map<number, { id: number; code: string; name: string; unitFactor: number; unitDivisor: number; unitItemId: number }>();
    const ambiguousIds = new Set<number>();
    if (distinct.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT u."InventoryId" as "inventoryId", u."RecId" as id, msi."UnitCode" as code, msi."UnitName" as name,
          u."UnitFactor" as "unitFactor", u."UnitDivisor" as "unitDivisor", u."UnitItemId" as "unitItemId"
        FROM "IM_ItemUnitItemSize" u
        JOIN "MD_UnitSetItem" msi ON msi."RecId" = u."UnitItemId"
        WHERE u."InventoryId" IN (${Prisma.join(distinct)})
          AND u."IsDeleted" = 0 AND u."InUse" = 1 AND u."UseForRecipe" = 1
        ORDER BY u."InventoryId", u."RecId"
      `);
      const byItem = new Map<number, { id: number; code: string; name: string; unitFactor: number; unitDivisor: number; unitItemId: number }[]>();
      for (const r of sanitizeRawRow(rows)) {
        const invId = Number(r.inventoryId);
        const list = byItem.get(invId) ?? [];
        list.push({ id: Number(r.id), code: r.code, name: r.name, unitFactor: Number(r.unitFactor), unitDivisor: Number(r.unitDivisor), unitItemId: Number(r.unitItemId) });
        byItem.set(invId, list);
      }
      for (const [invId, list] of byItem) {
        if (list.length > 1) ambiguousIds.add(invId);
        else units.set(invId, list[0]);
      }
    }
    const unresolvedIds = new Set(distinct.filter((id) => !units.has(id) && !ambiguousIds.has(id)));
    return { units, unresolvedIds, ambiguousIds };
  }

  // ── Unit Code resolution (portable unit identity across items) ─────────────────────────────
  // MD_UnitSetItem.RecId (a "UnitItemId") is NOT a universal unit identifier — it is a row inside
  // ONE Unit Set template (MD_UnitSetItem.UnitSetId), and different Items can be configured off
  // DIFFERENT Unit Sets (confirmed live: Fabric-00007's own "GRM" is MD_UnitSetItem RecId 10 under
  // UnitSetId 5, while Yarn-00003/00004/00008's own "grm" is a COMPLETELY DIFFERENT row, RecId 3
  // under UnitSetId 1 — same real unit, two different template rows/ids). A BOM line's own UnitId
  // (e.g. a Fabric line's Consumption Unit) is only ever meaningful as an id WITHIN that line's own
  // Item's Unit Set — reusing it as-is to look up a DIFFERENT Item's own IM_ItemUnitItemSize row
  // (as getYarnRequirements must, since a Yarn Requirement's target Item is the Yarn, not the
  // source Fabric) can silently miss entirely and leave the quantity unconverted (see
  // convertRawRequirementToUnit's own comment on the fallback this caused). UnitCode is the one
  // portable identity across Unit Sets a real user actually intends ("GRM means GRM no matter whose
  // Unit Set the row lives in") — resolved here, batched, from MD_UnitSetItem itself (no join to
  // any Item), and matched case-insensitively since real data already has both "GRM" and "grm".
  private async resolveUnitCodes(unitItemIds: (number | null | undefined)[]): Promise<Map<number, string>> {
    const distinct = Array.from(new Set(unitItemIds.filter((id): id is number => id != null).map(Number)));
    const map = new Map<number, string>();
    if (!distinct.length) return map;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "UnitCode" as code FROM "MD_UnitSetItem" WHERE "RecId" IN (${Prisma.join(distinct)})
    `);
    for (const r of sanitizeRawRow(rows)) map.set(Number(r.id), String(r.code || '').toUpperCase());
    return map;
  }

  // Display-only sibling of resolveUnitCodes above (same table, same batched-by-unitItemId shape,
  // same "MD_UnitSetItem.RecId is a real, portable id, no Item-scoping needed to resolve it"
  // reasoning) — the difference is this one keeps the human-facing {id,code,name} shape instead of
  // collapsing to a bare uppercased code, because it feeds a NEW, purely additive output field
  // (`consumptionUnit` on getMaterialRequirements below), not the internal conversion math
  // resolveUnitCodes' own callers use. Added for Trim Planning (trim-planning.service.ts): a BOM
  // line's own Consumption Unit (MA_RecipeItem.UnitId / StyleBomLine.unitId — the exact unit its
  // own real, persisted Quantity was entered in) is a real, always-present fact whenever a line
  // has a unitId at all, unlike `requirementUnit` below (null whenever the target Item's Unit tab
  // has no Unit flagged "Requirement Calculation" yet — confirmed live: TRIM-00003 has two real
  // configured units, "cone"/"yard", neither flagged for Requirement Calculation, so
  // `requirementUnit` is correctly null for it and always will be until that master-data flag is
  // set). Exposing the real Consumption Unit alongside gives a caller that wants to show SOME real
  // unit rather than a blank dash an honest, DB-backed fallback to use — this method never guesses
  // or hardcodes a unit, it only surfaces what resolveUnitCodes' own query already proves exists.
  private async resolveUnitDisplay(unitItemIds: (number | null | undefined)[]): Promise<Map<number, { id: number; code: string; name: string }>> {
    const distinct = Array.from(new Set(unitItemIds.filter((id): id is number => id != null).map(Number)));
    const map = new Map<number, { id: number; code: string; name: string }>();
    if (!distinct.length) return map;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "UnitCode" as code, "UnitName" as name FROM "MD_UnitSetItem" WHERE "RecId" IN (${Prisma.join(distinct)})
    `);
    for (const r of sanitizeRawRow(rows)) map.set(Number(r.id), { id: Number(r.id), code: r.code, name: r.name });
    return map;
  }

  // ── Final Requirement Unit Conversion ───────────────────────────────────────────────────────
  // Resolves, batched across every distinct target Item a page of BOM/recipe lines needs, that
  // Item's OWN IM_ItemUnitItemSize rows — used ONLY to convert a line's own Consumption (entered in
  // whatever Unit its own UnitId names — MA_RecipeItem.UnitId/StyleBomLine.unitId, e.g. GRM) into
  // that item's Base Unit, as the first hop of the same "Base Unit + Unit Conversion" two-hop
  // pattern unit-conversion.util.ts's own convertToBaseUnit/convertFromBaseUnit already establish
  // (Consumption's own Unit -> Base -> Requirement Calculation Unit). The second hop reuses
  // resolveRequirementUnits' own already-resolved unitFactor/unitDivisor directly (see
  // convertRawRequirementToUnit below) rather than a second query, since that row was already
  // fetched for an unrelated reason (finding which unit is flagged "Requirement Calculation"). No
  // new table, no new column — the exact same IM_ItemUnitItemSize row every other Unit-tab consumer
  // already reads. Keyed by (InventoryId, UPPER(UnitCode)) — NOT (InventoryId, UnitItemId) — per
  // resolveUnitCodes' own comment: the caller resolves whichever raw UnitItemId the source line
  // used down to its portable Code first (still correct/self-consistent for Fabric/Trim, where
  // source and target Item are the same; the fix this enables is for Yarn, where they differ).
  private async resolveConsumptionUnitFactors(inventoryIds: (number | null | undefined)[]): Promise<Map<string, { unitFactor: number; unitDivisor: number }>> {
    const distinct = Array.from(new Set(inventoryIds.filter((id): id is number => id != null).map(Number)));
    const map = new Map<string, { unitFactor: number; unitDivisor: number }>();
    if (!distinct.length) return map;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT u."InventoryId" as "inventoryId", msi."UnitCode" as "unitCode", u."UnitFactor" as "unitFactor", u."UnitDivisor" as "unitDivisor"
      FROM "IM_ItemUnitItemSize" u
      JOIN "MD_UnitSetItem" msi ON msi."RecId" = u."UnitItemId"
      WHERE u."InventoryId" IN (${Prisma.join(distinct)}) AND u."IsDeleted" = 0
    `);
    for (const r of sanitizeRawRow(rows)) {
      map.set(`${Number(r.inventoryId)}:${String(r.unitCode || '').toUpperCase()}`, { unitFactor: Number(r.unitFactor), unitDivisor: Number(r.unitDivisor) });
    }
    return map;
  }

  // Consumption × Applicable Qty (the RAW Requirement, in whatever Unit the BOM line's own
  // Consumption was entered in — e.g. GRM) is left completely untouched by this: it converts the
  // FINAL raw number, once, into the item's configured Requirement Calculation Unit — first hop
  // (Consumption's own entered Unit -> item's Base Unit) via toBaseAmount, second hop (Base Unit ->
  // Requirement Calculation Unit) via applyUnitFactor — both the exact, already-established
  // unit-conversion.util.ts formulas, never re-derived. `unitInventoryId` is the item whose
  // Requirement Unit this conversion targets — the SAME item for Fabric/Trim, but the YARN item
  // (not the source Fabric's) for getYarnRequirements, per that method's own comment on why Yarn's
  // Requirement Unit is always resolved from its own Inventory Item. `consumptionUnitCode` is the
  // source line's own Consumption Unit already resolved down to its portable Code (resolveUnitCodes)
  // — NOT the raw UnitItemId, which is only meaningful within the SOURCE item's own Unit Set (see
  // resolveConsumptionUnitFactors' own comment on why matching by raw id silently failed whenever
  // the target Item's Unit Set differs from the source line's). Falls back to the raw, unconverted
  // quantity whenever no Requirement Unit is configured (unresolvedIds/ambiguousIds — already
  // surfaced separately via getMappingWarnings/buildUnitWarnings) or the target item has no unit
  // configured under that same Code — never silently guesses a factor.
  private convertRawRequirementToUnit(
    rawQuantity: number,
    unitInventoryId: number | null | undefined,
    consumptionUnitCode: string | null | undefined,
    requirementUnit: { unitFactor: number; unitDivisor: number } | null | undefined,
    consumptionUnitFactors: Map<string, { unitFactor: number; unitDivisor: number }>,
  ): number {
    if (!requirementUnit || unitInventoryId == null) return rawQuantity;
    const consumptionFactors = consumptionUnitCode ? consumptionUnitFactors.get(`${Number(unitInventoryId)}:${consumptionUnitCode.toUpperCase()}`) : null;
    const baseQuantity = consumptionFactors ? toBaseAmount(rawQuantity, consumptionFactors.unitFactor, consumptionFactors.unitDivisor) : rawQuantity;
    return applyUnitFactor(baseQuantity, requirementUnit.unitFactor, requirementUnit.unitDivisor);
  }

  // Shared by getMappingWarnings for both the color-mapping check (buildMappingWarnings, above/
  // unchanged) and this one — `rows` is any already-computed Requirements-grid rows array
  // (getMaterialRequirements or getYarnRequirements' own output), which already carries
  // `requirementUnit`/`inventoryId`/`inventoryCode` per row, so no second resolution pass is
  // needed here beyond re-deriving the ambiguous-vs-unresolved distinction for the message text.
  private buildUnitWarnings(rows: { inventoryId: any; inventoryCode: any }[], unresolvedIds: Set<number>, ambiguousIds: Set<number>): string[] {
    const warnings: string[] = [];
    const seen = new Set<number>();
    for (const r of rows) {
      if (r.inventoryId == null) continue;
      const invId = Number(r.inventoryId);
      if (seen.has(invId)) continue;
      seen.add(invId);
      const label = r.inventoryCode || `Inventory #${invId}`;
      if (ambiguousIds.has(invId)) warnings.push(`${label}: multiple Requirement Calculation units are configured for this item — Requirement Unit is unresolved until only one Unit is flagged in its Unit tab.`);
      else if (unresolvedIds.has(invId)) warnings.push(`${label}: no Unit is flagged "Requirement Calculation" in its Unit tab — this material's Requirement Unit could not be resolved.`);
    }
    return warnings;
  }

  // ── BOM source resolution — Priority 1: the Work Order's OWN BOM (MA_Recipe/MA_RecipeItem via
  // WorkOrderService.listBom, unchanged). Priority 2: ONLY when the Work Order has zero lines of
  // THIS specific lineType, fall back to the linked Style Card's own BOM (StyleBomLine —
  // style-extras.service.ts's real, pre-existing table; queried directly here via the same
  // Prisma model rather than injecting StyleExtrasService, which would create a circular module
  // dependency since StyleExtrasModule already imports LegacyErpModule). Decided independently
  // per lineType — a Work Order with Fabric lines but no Trim lines gets Fabric from itself and
  // Trim from the Style Card, never merged, never written back anywhere. Sample Card is NOT a
  // fallback source: MA_WorkOrder has no column or FK to SampleCard at all (verified against
  // information_schema — IsSample/UD_SampleRevision on MA_WorkOrder describe the Work Order
  // itself, not a link to a SampleCard row), so there is no Work Order to resolve a Sample BOM
  // from even though SampleBomLine itself is a real table.
  // Not private — cutting-card.service.ts's own listApplicableFabrics() reuses this exact same
  // WO-owns-else-Style-Card-fallback resolution (including raw fields like markerWidth/
  // markerLength/m2Weight that getMaterialRequirements' own mapped shape below doesn't carry) so
  // the Cutting Entry screen's Fabric list can never diverge from what Requirements itself sees.
  async resolveBomLines(workOrderId: number, lineType: DirectBomTab): Promise<any[]> {
    const ownLines = await this.workOrderSvc.listBom(workOrderId, lineType);
    if (ownLines.length) return ownLines;
    const wo = await this.workOrderSvc.get(workOrderId).catch(() => null);
    const styleCardId = (wo as any)?.styleCardId;
    if (!styleCardId) return [];
    return this.getStyleCardBomLinesAsWorkOrderShape(workOrderId, styleCardId, lineType);
  }

  // Reads StyleBomLine (the exact table/query style-extras.service.ts's own getBomLines() uses —
  // no new query logic) and reshapes each row into the same field names
  // getMaterialRequirements()/getYarnRequirements() already read off a WorkOrderService.listBom()
  // row, so neither method needs to know which source it got. wastage sums StyleBomLine's own 4
  // percentage columns (wastePct/dyeWastagePct/otherWastagePct/printWastagePct) — the exact same
  // sum bom-tab.tsx's own applyWaste() already does for these columns, not a new formula.
  //
  // variant2 — StyleBomLine has no Variant-2 column of its own, so every line starts null here, but
  // is then run through work-order.service.ts's own resolveProductionColors/
  // assignProductionColorCycle (the SAME, already-existing, already-persisted-at-transfer-time
  // resolver transferBomFromStyleCardForType uses the moment one of these fallback lines is
  // actually promoted into a real Work Order BOM line — see that method's own comment). Reusing it
  // here, rather than leaving every fallback line's Variant-2 permanently null, is what makes a
  // material given SEVERAL Material Colors on the Style Card (e.g. two Fabric-00006 lines, one per
  // color) resolve to its own ordinally-matched Production Color in the LIVE Requirements preview
  // too — previously only true after the user had already opened the BOM tab and transferred/edited
  // that line once. A material with only one (or zero) distinct Material Color is left untouched by
  // the cycle (still null) and instead falls back to resolveApplicableQuantityScopes' own
  // Material-Color-name match (see that method's own comment) — the two resolvers are complementary,
  // never duplicated: the cycle only ever acts on genuinely multi-color materials.
  private async getStyleCardBomLinesAsWorkOrderShape(workOrderId: number, styleCardId: string, lineType: DirectBomTab) {
    // Ordered by StyleBomLine's own sortOrder — must match transferBomFromStyleCardForType's own
    // identical orderBy exactly, since setMaterialColorForLine below matches a clicked Requirements
    // row back to its newly-transferred own BOM line by POSITION in this same list.
    const [rows, productionColors] = await Promise.all([
      this.prisma.styleBomLine.findMany({ where: { styleCardId, lineType }, orderBy: { sortOrder: 'asc' } }),
      this.workOrderSvc.resolveProductionColors(workOrderId),
    ]);
    const mapped = rows.map((r: any) => ({
      id: r.id,
      inventoryId: r.fabricInventoryId,
      quantity: Number(r.quantity) || 0,
      variant1: r.variant,
      variant2: null as string | null,
      // StyleBomLine's own real colorCardId (Choose Color -> ColorCard, same relation as
      // MA_RecipeItem's) -- carried through so a Fabric/Trim type the Work Order does NOT own
      // still resolves its real Material Color from the Style Card fallback, not just its garment-
      // color match key.
      colorCardId: r.colorCardId ?? null,
      // StyleBomLine's own real unitId (Consumption's own entered Unit, e.g. "GRM") -- carried
      // through so convertRawRequirementToUnit can resolve it the exact same way as an own-BOM
      // line's MA_RecipeItem.UnitId (see RECIPE_ITEM_COLUMNS) — a Style-Card-fallback line's
      // Consumption is no less real just because the Work Order hasn't promoted it into its own BOM
      // yet.
      unitId: r.unitId ?? null,
      wastage: (Number(r.wastePct) || 0) + (Number(r.dyeWastagePct) || 0) + (Number(r.otherWastagePct) || 0) + (Number(r.printWastagePct) || 0),
      uD_Remarks: r.process,
    }));
    return this.workOrderSvc.assignProductionColorCycle(mapped, productionColors);
  }

  // ── Requirements grid — Fabric/Trim tabs: BOM lines resolved per the priority above. Trim
  // reuses this exact same method (lineType='trim') rather than a second, near-duplicate
  // implementation — MA_RecipeItem/listBom already natively support Trim (a real BomLineType
  // alongside Fabric/Ornament/Process, RecipeType=2, see work-order.service.ts's own
  // RECIPE_TYPE_BY_LINE_TYPE) with zero code changes needed to that layer.
  async getMaterialRequirements(workOrderId: number, lineType: DirectBomTab) {
    const [lines, mfgQty] = await Promise.all([
      this.resolveBomLines(workOrderId, lineType),
      this.getManufacturingQuantityTotals(workOrderId),
    ]);
    const names = await this.resolveInventoryNames(lines.map((l: any) => l.inventoryId));
    const colors = await this.resolveColorCards(lines.map((l: any) => l.colorCardId));
    const { units: requirementUnits } = await this.resolveRequirementUnits(lines.map((l: any) => l.inventoryId));
    const consumptionUnitFactors = await this.resolveConsumptionUnitFactors(lines.map((l: any) => l.inventoryId));
    // Each line's own Consumption Unit resolved down to its portable Code (see resolveUnitCodes'
    // own comment) — self-referential here (source and target Item are the same for Fabric/Trim),
    // but resolved the same way convertRawRequirementToUnit now requires everywhere.
    const consumptionUnitCodes = await this.resolveUnitCodes(lines.map((l: any) => l.unitId));
    // Display-only sibling of the line above — see resolveUnitDisplay's own comment. Feeds the new
    // `consumptionUnit` output field only; never used in the quantity/conversion math.
    const consumptionUnitDisplay = await this.resolveUnitDisplay(lines.map((l: any) => l.unitId));
    // flatMap, not map — a single BOM line can now generate MULTIPLE Requirement rows. A
    // color-specific line (Variant2 set) still yields exactly one row, unchanged. A COMMON line
    // (Variant2 blank) on a Work Order with more than one Production Color expands into one row PER
    // color (resolveApplicableQuantityScopes) — this is the Color-Wise Requirement Calculation rule:
    // color identity must survive into the Requirements grid/persisted records, never collapse into
    // one row carrying the Work Order's blended total. See that method's own comment for the full
    // rule (including the single-color/no-color fallback cases, which fall out of the same loop).
    return lines.flatMap((l: any) => {
      const consumption = Number(l.quantity) || 0;
      const color = l.colorCardId ? colors.get(String(l.colorCardId)) : null;
      // Material Color's own resolved code/name feeds scope resolution as a fallback color-mapping
      // key when Variant-2 is blank — see resolveApplicableQuantityScopes' own comment on why.
      const scopes = this.resolveApplicableQuantityScopes(l.variant2, color?.code || color?.name || null, mfgQty);
      const requirementUnit = l.inventoryId != null ? requirementUnits.get(Number(l.inventoryId)) ?? null : null;
      return scopes.map((scope) => ({
        // A common line expanded into N rows must still edit back to the SAME one real BOM line —
        // Consumption and Material Color are properties of the BOM line itself, not of any one
        // color scope (a "common" material has ONE consumption rate applied to every color's own
        // quantity, by definition). `::` never appears in either a real MA_RecipeItem numeric id or
        // a StyleBomLine UUID, so it's a safe, unambiguous separator; updateRequirementLine strips
        // it back off before resolving which real line to patch (it strips everything from the
        // first `::` onward regardless of what follows, so the literal marker text here doesn't
        // matter to it).
        //
        // ALWAYS suffixed with `::` — even for a non-expanded line (scopes.length === 1) — not just
        // the multi-color-expanded case. This is a real bug fix, not cosmetic: getSavedRequirements
        // (below) overwrites a MATCHED row's `id` with the real MA_Requirement.RecId (a bare
        // integer), while an UNMATCHED row keeps whatever this method returns. MA_RecipeItem.RecId
        // and MA_Requirement.RecId are two completely independent auto-increment sequences on two
        // different tables — nothing stops them from coinciding on a real Work Order with enough
        // rows (confirmed live: WO 222's own Fabric grid produced two rows both id=253, one a
        // matched MA_Requirement.RecId, the other an unmatched live row's own bare MA_RecipeItem.id
        // — a real "Encountered two children with the same key" React warning, not a hypothetical
        // one). A duplicate React list key silently conflates the two rows' component instances,
        // which is what broke the right-click context menu for one of them — RowContextMenu itself
        // was correctly wired all along; the actual failure was upstream, in `id` not being unique
        // across the two different id-namespaces this method can draw from. Suffixing every
        // unmatched row's id with `::` guarantees it can never again collide with a bare-integer
        // MA_Requirement.RecId, which never contains `::`.
        id: scopes.length > 1 ? `${l.id}::${scope.matchedColor}` : `${l.id}::line`,
        inventoryId: l.inventoryId,
        inventoryCode: l.inventoryId != null ? names.get(Number(l.inventoryId))?.code ?? null : null,
        inventoryName: l.inventoryId != null ? names.get(Number(l.inventoryId))?.name ?? null : null,
        // Process has no free-text column on MA_RecipeItem — the Work Order BOM tab already
        // repurposes UD_Remarks for it (see work-order.service.ts's own RECIPE_ITEM_COLUMNS
        // comment), so this is already the same display text a user typed/saved through that tab,
        // not a second resolution path. listBom's raw row exposes this camelized as "uD_Remarks"
        // (see work-order.service.ts's own `camel()` helper — first char lowercased only).
        process: l.uD_Remarks ?? null,
        variant1: l.variant1,
        variant1Explanation: null,
        // Variant2/Production Color — the BOM line's own explicit mapping when it has one
        // (unchanged); for a common line, this is now the RESOLVED color this particular expanded
        // row is for (never left blank) — Variant2's own established identity is "which production
        // color this row is for," whether a user typed it or the system resolved it for a common
        // material, so populating it here doesn't invent a new meaning for the field.
        variant2: l.variant2 || scope.matchedColor,
        variant2Explanation: null,
        // Material Color — new, additive fields (existing consumers that don't know about them are
        // unaffected). colorCardId is the real FK; colorCode/colorName are resolved for display so
        // the frontend needs no second lookup round trip.
        colorCardId: l.colorCardId ?? null,
        colorCode: color?.code ?? null,
        colorName: color?.name ?? null,
        // Requirement Calculation Unit — resolved once per Inventory Item (resolveRequirementUnits,
        // never per color scope, since it's a property of the ITEM, not of any one color's own
        // quantity), so every color-expansion of this one line always carries the identical unit —
        // this is what keeps Total Requirements' per-item SUM always unit-safe by construction (see
        // getTotalRequirements' own comment). `null` when this item's own Unit tab has no Unit
        // flagged "Requirement Calculation" yet — see resolveRequirementUnits' own comment; never
        // guessed/defaulted to Base Unit or any hardcoded code. Response shape kept to exactly
        // {id,code,name,unitItemId} (unitItemId additive — see resolveRequirementUnits' own
        // comment: the real MD_UnitSetItem.RecId a Planning-menu-opened transaction line's own
        // "Unit" field needs, distinct from `id`) even though the resolved object also now
        // carries unitFactor/unitDivisor for the conversion below — those two stay an internal
        // calculation input, not part of this field's own public contract.
        requirementUnit: requirementUnit ? { id: requirementUnit.id, code: requirementUnit.code, name: requirementUnit.name, unitItemId: requirementUnit.unitItemId } : null,
        // Consumption Unit — NEW, purely additive field (existing consumers that don't read it are
        // byte-for-byte unaffected — see resolveUnitDisplay's own comment). This BOM line's own
        // real Consumption Unit (l.unitId — the exact unit its persisted Quantity was entered in),
        // always present whenever the line has a unitId at all, unlike requirementUnit above (only
        // set when the target Item has an explicit "Requirement Calculation" unit configured). A
        // caller that wants to show SOME real unit rather than a blank dash when requirementUnit is
        // null (e.g. trim-planning.service.ts's own Unit column) uses this as its fallback; this
        // method itself makes no choice between the two — that's the caller's own display decision.
        consumptionUnit: l.unitId != null ? consumptionUnitDisplay.get(Number(l.unitId)) ?? null : null,
        // Consumption — this BOM line's OWN existing Quantity field, unchanged (still exactly what
        // bom-tab.tsx's own "Quantity" column already saved/shows on the Work Order's BOM tab), the
        // SAME value across every color-expansion of this one line. NEVER converted — see
        // convertRawRequirementToUnit's own comment: only the FINAL Requirement below is.
        consumption,
        // Applicable Quantity — THIS row's own resolved scope: one Production Color's Will-Be-Cut,
        // or the Work Order's total only for the documented unmatched/no-color-data fallback cases.
        applicableQuantity: scope.quantity,
        matchedColor: scope.matchedColor,
        // Garment Color — explicit alias of matchedColor, for a caller that doesn't already know
        // the older field's name means the same thing.
        garmentColor: scope.matchedColor,
        // Requirement = Consumption x this row's own Applicable Quantity — the task's own "Required
        // Material = Applicable Production Quantity x BOM Item's Consumption" formula, per BOM
        // line PER COLOR SCOPE, computed FIRST in whatever Unit Consumption was entered in (e.g.
        // GRM) exactly as before — then, and ONLY then, converted ONCE into the item's configured
        // Requirement Calculation Unit (convertRawRequirementToUnit — Consumption's own Unit -> item
        // Base Unit -> Requirement Calculation Unit). An item with no Requirement Unit configured
        // gets the identical raw number this method has always returned (requirementUnit is null,
        // so convertRawRequirementToUnit's own first check passes it through unconverted) — zero
        // behavior change for every item that hasn't been configured for this feature yet. This is
        // the field getTotalRequirements/save() already sum/persist, so both now reflect the real,
        // unit-converted requirement instead of a raw same-unit-as-Consumption echo.
        quantity: Math.round(this.convertRawRequirementToUnit(consumption * scope.quantity, l.inventoryId, l.unitId != null ? consumptionUnitCodes.get(Number(l.unitId)) ?? null : null, requirementUnit, consumptionUnitFactors) * 10000) / 10000,
      }));
    });
  }

  // Shared by every field this Requirements screen lets a user edit directly (Material Color,
  // Consumption — Fabric/Trim only; Yarn has neither of its own, see each wrapper's own comment).
  // `lineId` is a live-preview row's own `id` from getMaterialRequirements above, which is EITHER
  // a real MA_RecipeItem.id (the Work Order already owns this lineType's BOM) or a StyleBomLine.id
  // (still on the fallback — see resolveBomLines). Both cases are handled without disturbing the
  // other lineType's own BOM or any other line already mapped: an own-BOM edit patches just that
  // one row in place; a fallback edit promotes only THIS lineType's Style lines into the Work
  // Order's own real BOM (never the other three — see transferBomFromStyleCardForType's own
  // comment), then applies `patch` to whichever newly-created line is at the same position the
  // originally-clicked Style line was at (both queries share the identical sortOrder ordering).
  private async updateRequirementLine(workOrderId: number, lineType: DirectBomTab, lineId: string, patch: Record<string, any>, userId: number, currentUserId: string) {
    await this.assertMutationAllowed(workOrderId, lineType, currentUserId);
    // A common-material row's id may be a color-expansion composite (`${realLineId}::${color}` —
    // see getMaterialRequirements' own comment) rather than the real BOM line id itself. Every
    // color-expansion of the same common line shares one real underlying id, so stripping the
    // suffix here routes an edit made from ANY of its color rows back to that one real line —
    // exactly right, since Consumption/Material Color belong to the line, not to any one color.
    const realLineId = lineId.includes('::') ? lineId.slice(0, lineId.indexOf('::')) : lineId;
    const ownLines = await this.workOrderSvc.listBom(workOrderId, lineType);
    const numericLineId = Number(realLineId);
    if (ownLines.length) {
      if (!ownLines.some((l: any) => l.id === numericLineId)) {
        throw new NotFoundException('This requirement line no longer exists — reload and try again.');
      }
      const updated = ownLines.map((l: any) => (l.id === numericLineId ? { ...l, ...patch } : l));
      return this.workOrderSvc.upsertBom(workOrderId, lineType, updated, userId);
    }
    const wo = await this.workOrderSvc.get(workOrderId);
    const styleCardId = (wo as any)?.styleCardId;
    if (!styleCardId) throw new NotFoundException('This Work Order has no linked Style Card to transfer from.');
    const styleLines = await this.prisma.styleBomLine.findMany({ where: { styleCardId, lineType }, orderBy: { sortOrder: 'asc' } });
    const clickedIndex = styleLines.findIndex((l: any) => l.id === realLineId);
    if (clickedIndex === -1) throw new NotFoundException('Requirement line not found — reload and try again.');
    const created = await this.workOrderSvc.transferBomFromStyleCardForType(workOrderId, styleCardId, lineType, userId);
    if (!created[clickedIndex]) throw new NotFoundException('Failed to transfer this BOM line.');
    const finalLines = created.map((l: any, i: number) => (i === clickedIndex ? { ...l, ...patch } : l));
    return this.workOrderSvc.upsertBom(workOrderId, lineType, finalLines, userId);
  }

  // Manual Material Color selection directly on the Requirements screen (Fabric/Trim only — Yarn
  // has no color of its own, it inherits sourceColorCardId from the Fabric line it was exploded
  // from, so editing it here would have nothing real to write to).
  async setMaterialColorForLine(workOrderId: number, lineType: DirectBomTab, lineId: string, colorCardId: string | null, userId: number, currentUserId: string) {
    return this.updateRequirementLine(workOrderId, lineType, lineId, { colorCardId }, userId, currentUserId);
  }

  // Manual Consumption (this BOM line's own per-unit Quantity — the exact same field bom-tab.tsx's
  // own "Quantity" column already manages) edit directly on the Requirements screen. Fabric/Trim
  // only — Yarn's own Consumption is derived by exploding the Fabric line's own Quantity through
  // its Yarn Recipe %, not a field of its own to edit (see getYarnRequirements).
  async setConsumptionForLine(workOrderId: number, lineType: DirectBomTab, lineId: string, quantity: number, userId: number, currentUserId: string) {
    assertNonNegative(quantity, 'Consumption');
    return this.updateRequirementLine(workOrderId, lineType, lineId, { quantity }, userId, currentUserId);
  }

  // Validation — "if a mapping is required but missing, surface it instead of silently calculating
  // against the wrong color". Applies ONLY when the Work Order actually has Manufacturing
  // Quantities entered with more than one distinct color (mfgQty.byColor.size > 1) — a single-color
  // (or zero-color, legacy) Work Order has no ambiguity to warn about, and a BOM line with NEITHER
  // Variant-2 nor a Material Color set is the pre-existing, intentional "common material" convention
  // (falls back to the Work Order's TOTAL quantity — correct, not a missing mapping). Deliberately
  // non-fatal: returned as warnings, never thrown, so Calculate/Save keep working exactly as before
  // for every case that isn't this specific new ambiguity (Test 1/Test 13's own "existing behavior
  // still works"). Resolves each line's own Material Color the same way resolveApplicableQuantityScopes
  // itself now does (Variant-2 first, Material Color as fallback) so a warning is never missed for a
  // line whose only color identity comes from "Choose Color" rather than Variant-2.
  private async buildMappingWarnings(lines: any[], mfgQty: { byColor: Map<string, number>; total: number }): Promise<string[]> {
    if (mfgQty.byColor.size <= 1) return [];
    const colors = await this.resolveColorCards(lines.map((l: any) => l.colorCardId));
    const warnings: string[] = [];
    for (const l of lines) {
      const color = l.colorCardId ? colors.get(String(l.colorCardId)) : null;
      const explicitColorText = String(l.variant2 || '').trim() || String(color?.code || color?.name || '').trim();
      const key = explicitColorText.toLowerCase();
      if (key && !mfgQty.byColor.has(key)) {
        const label = l.inventoryId != null ? `Inventory #${l.inventoryId}` : `BOM line ${l.id}`;
        warnings.push(`${label}: color mapping "${explicitColorText}" does not match any of this Work Order's Manufacturing Quantity colors (${Array.from(mfgQty.byColor.keys()).join(', ')}) — it is being calculated against the Work Order's TOTAL quantity instead.`);
      }
    }
    return warnings;
  }

  // "Yarn Recipe Not Defined" — the task's own explicit requirement: when neither a Color-Specific
  // nor a Common/Overall Yarn Recipe exists for a Fabric BOM line's item, getYarnRequirements
  // silently produces zero Yarn rows for that line (`if (!recipeLines.length) continue;`) rather
  // than guessing/blending in some other recipe — this surfaces that gap as a non-fatal warning
  // instead of a silent, easy-to-miss absence, matching the file's own established
  // buildMappingWarnings/buildUnitWarnings precedent for "real but actionable gap, never blocks
  // Calculate/Save". One warning per distinct Fabric Inventory Item (not per BOM line/color scope)
  // — every color of the same fabric with no recipe at all shares the identical root cause (no
  // Common recipe exists for that fabric), so listing it once per fabric is clearer than once per
  // color row.
  private async buildYarnRecipeWarnings(fabricLines: any[]): Promise<string[]> {
    const distinctIds = Array.from(new Set(fabricLines.map((l: any) => l.inventoryId).filter((id: any) => id != null).map(Number)));
    if (!distinctIds.length) return [];
    const names = await this.resolveInventoryNames(distinctIds);
    const warnings: string[] = [];
    for (const l of fabricLines) {
      if (l.inventoryId == null) continue;
      const invId = Number(l.inventoryId);
      const recipeLines = await this.yarnRecipeSvc.resolveEffectiveRecipe(invId, l.colorCardId ?? null);
      if (recipeLines.length) continue;
      const label = names.get(invId)?.code || `Inventory #${invId}`;
      const msg = `${label}: Yarn Recipe Not Defined — no Color-Specific or Common/Overall Yarn Recipe is configured for this Fabric, so its Yarn Requirement cannot be calculated.`;
      if (!warnings.includes(msg)) warnings.push(msg);
    }
    return warnings;
  }

  // Public — surfaced as its own endpoint (additive, does not change any existing response shape)
  // so the frontend can show a warning banner before/alongside Calculate without risking any
  // existing caller of getMaterialRequirements/getYarnRequirements/getTotalRequirements.
  async getMappingWarnings(workOrderId: number, tab: RequirementTab): Promise<string[]> {
    const mfgQty = await this.getManufacturingQuantityTotals(workOrderId);
    if (tab === 'yarn') {
      const fabricLines = await this.resolveBomLines(workOrderId, 'fabric');
      const colorWarnings = await this.buildMappingWarnings(fabricLines, mfgQty);
      const recipeWarnings = await this.buildYarnRecipeWarnings(fabricLines);
      // Unit warnings for Yarn are checked against the YARN item's own inventoryId (see
      // getYarnRequirements' own comment on why), not the source Fabric's — reuses its own
      // already-computed rows rather than re-deriving the recipe explosion a second time.
      const yarnRows = await this.getYarnRequirements(workOrderId);
      const { unresolvedIds, ambiguousIds } = await this.resolveRequirementUnits(yarnRows.map((r: any) => r.inventoryId));
      const unitWarnings = this.buildUnitWarnings(yarnRows, unresolvedIds, ambiguousIds);
      return [...colorWarnings, ...recipeWarnings, ...unitWarnings];
    }
    const lines = await this.resolveBomLines(workOrderId, tab);
    const colorWarnings = await this.buildMappingWarnings(lines, mfgQty);
    const { unresolvedIds, ambiguousIds } = await this.resolveRequirementUnits(lines.map((l: any) => l.inventoryId));
    const unitWarnings = this.buildUnitWarnings(lines.map((l: any) => ({ inventoryId: l.inventoryId, inventoryCode: null })), unresolvedIds, ambiguousIds);
    return [...colorWarnings, ...unitWarnings];
  }

  // ── Requirements grid — Yarn tab: each Fabric BOM row exploded through its OWN Fabric Card's
  // Yarn Recipe (FabricYarnRecipeLine) — the exact same data + the exact same "Calculated
  // Quantity x recipe %" formula bom-tab.tsx's yarnBreakdownFromRecipe already implements
  // client-side, ported here so this screen has one real source instead of duplicating it. Yarn
  // has no BOM of its own to resolve a source for — it is always derived FROM the Fabric source,
  // so routing through the same resolveBomLines() the Fabric tab uses is what gives Yarn the
  // correct "Work Order Fabric first, Style Card Fabric only if the Work Order has none" priority
  // automatically, with no separate Yarn-specific fallback logic needed.
  async getYarnRequirements(workOrderId: number) {
    const [fabricLines, mfgQty] = await Promise.all([
      this.resolveBomLines(workOrderId, 'fabric'),
      this.getManufacturingQuantityTotals(workOrderId),
    ]);
    // Resolved up front (same as getMaterialRequirements) so each Fabric line's own Material Color
    // can feed resolveApplicableQuantityScopes as a fallback color-mapping key when Variant-2 is
    // blank — this is what makes Yarn inherit the SAME corrected color scope Fabric now resolves
    // to, instead of re-deriving its own (potentially still cross-joined) scope independently.
    const fabricColors = await this.resolveColorCards(fabricLines.map((l: any) => l.colorCardId));
    const exploded: { fabricLineId: number; yarnInventoryId: number | null; process: string | null; variant1: string | null; variant2: string | null; quantity: number; recipePercentage: number; sourceColorCardId: string | null; garmentColor: string | null; sourceConsumptionUnitId: number | null }[] = [];
    for (const line of fabricLines) {
      if (line.inventoryId == null) continue;
      // Color-Specific Yarn Recipe if one exists for THIS line's own Material Color, otherwise the
      // Fabric's Common/Overall recipe, otherwise neither -> [] (surfaced as a non-fatal "Yarn
      // Recipe Not Defined" warning by buildYarnRecipeWarnings below, never a silent zero/wrong
      // recipe). Keyed by the Fabric BOM line's own colorCardId — in this app's real BOM data a
      // fabric's different colors are already separate BOM lines each with their own colorCardId
      // (the same Multi-Color BOM identity resolveApplicableQuantityScopes already keys off of),
      // so resolving once per LINE here is already resolving once per COLOR for every fabric that
      // actually has distinct color-mapped BOM lines — no restructuring of the scopes loop below
      // needed. A line with no Material Color at all (genuinely common/unmapped, expanding into
      // multiple scopes below) has no per-scope color identity to look a color-specific recipe up
      // by, so it always resolves to the Common recipe for every scope — the same "common material"
      // treatment this file already gives such a line everywhere else.
      const recipeLines = await this.yarnRecipeSvc.resolveEffectiveRecipe(Number(line.inventoryId), line.colorCardId ?? null);
      if (!recipeLines.length) continue;
      // Same color-wise expansion getMaterialRequirements applies (resolveApplicableQuantityScopes
      // — see its own comment), done HERE, upstream of the Yarn Recipe math below, not downstream
      // of it: a common Fabric line must apply its OWN Yarn Recipe independently to EACH color's own
      // Fabric Requirement ("Fabric/RED -> apply Yarn Recipe independently", "Fabric/BLACK -> apply
      // the same recipe independently" — never combined-then-recipe'd, which would blend colors
      // before the recipe % even runs and lose color identity from the Yarn side entirely). The
      // recipe percentages/wastage themselves are completely unchanged — only WHICH fabric quantity
      // scope they're applied to, once per scope, changes.
      const fabricColor = line.colorCardId ? fabricColors.get(String(line.colorCardId)) : null;
      const scopes = this.resolveApplicableQuantityScopes(line.variant2, fabricColor?.code || fabricColor?.name || null, mfgQty);
      for (const scope of scopes) {
        // Same "Applicable Quantity x Consumption" step getMaterialRequirements applies, folded in
        // before the existing Wastage/recipe-% math below so that math is completely unchanged in
        // shape — just fed the real fabric requirement instead of the raw per-unit BOM Quantity.
        const fabricRequirement = Number(line.quantity || 0) * scope.quantity;
        // Calculated Quantity = Fabric Requirement x (1 + Wastage/100) — MA_RecipeItem's single
        // combined Wastage column, the same basis BomTab's own applyWaste()/Calculated Qty column
        // uses (previously applied to the raw BOM Quantity directly; now to that same quantity once
        // it's been sized to the actual production run).
        const calculatedQty = fabricRequirement * (1 + Number(line.wastage || 0) / 100);
        for (const r of recipeLines) {
          const pct = Number(r.percentage);
          if (!Number.isFinite(pct) || pct <= 0) continue;
          exploded.push({
            fabricLineId: line.id,
            yarnInventoryId: r.yarnInventoryId,
            process: r.process ?? null,
            variant1: r.variant1 ?? null,
            variant2: r.variant2 ?? null,
            // RAW quantity still (in whatever Unit the source Fabric line's own Consumption was
            // entered in, e.g. GRM) — the FINAL conversion into the YARN item's own Requirement
            // Calculation Unit happens once, below, after requirementUnits is resolved against
            // e.yarnInventoryId (never here — this loop has no Yarn Requirement Unit to convert
            // into yet, and converting a per-recipe-line partial sum instead of the final quantity
            // would be the exact "convert before the calculation is complete" mistake this fix
            // exists to avoid).
            quantity: Math.round(calculatedQty * (pct / 100) * 10000) / 10000,
            // The exact resolved FabricYarnRecipeLine.percentage this row's own Requirement was
            // just computed from above — Common or Color-Specific, whichever resolveEffectiveRecipe
            // actually returned for THIS line's own colorCardId (never re-derived/guessed on the
            // frontend, never a second recipe lookup — see the DTO's own comment on why this is
            // additive/display-only and never feeds back into the Requirement math itself).
            recipePercentage: pct,
            // Yarn has no color selection of its own anywhere in this app (FabricYarnRecipeLine's
            // own variant1/variant2 are plain free text, never linked to ColorCard — confirmed
            // during the Multi-Color BOM audit) — it inherits the Fabric BOM line's REAL Material
            // Color it was exploded from ("Fabric BOM Line -> Mapped Fabric Material Color -> Fabric
            // Recipe -> Yarn Recipe -> Yarn Requirement", per the task's own flow), so a Yarn
            // requirement never loses which colored Fabric it actually came from.
            sourceColorCardId: line.colorCardId ?? null,
            garmentColor: scope.matchedColor,
            // The source Fabric line's own Consumption Unit (e.g. GRM) — carried through so the
            // final conversion below can resolve it against the YARN item's OWN per-item conversion
            // row for that same Unit (see convertRawRequirementToUnit's own comment on why the
            // target item for this lookup is always the item whose Requirement Unit is being
            // resolved into, not the source's).
            sourceConsumptionUnitId: line.unitId ?? null,
          });
        }
      }
    }
    const names = await this.resolveInventoryNames(exploded.map((e) => e.yarnInventoryId));
    const colors = await this.resolveColorCards(exploded.map((e) => e.sourceColorCardId));
    // Resolved against the YARN's own inventoryId, not the source Fabric's — a Yarn requirement is
    // a quantity of yarn, so it belongs in the YARN item's own configured Requirement Calculation
    // Unit (its own Unit tab), completely independent of whatever unit the Fabric it came from uses.
    const { units: requirementUnits } = await this.resolveRequirementUnits(exploded.map((e) => e.yarnInventoryId));
    // Also resolved against the YARN's own inventoryId (paired with each row's OWN
    // sourceConsumptionUnitId — the source Fabric's Consumption Unit) — see
    // convertRawRequirementToUnit's own comment on why the item side of this lookup is always the
    // item whose Requirement Unit is being converted into.
    const consumptionUnitFactors = await this.resolveConsumptionUnitFactors(exploded.map((e) => e.yarnInventoryId));
    // Each row's OWN sourceConsumptionUnitId is a UnitItemId in the SOURCE FABRIC's own Unit Set —
    // resolved here down to its portable Code (resolveUnitCodes) BEFORE being matched against the
    // YARN item's own (different) Unit Set below. This is the actual fix for the "millions of KG/
    // BAG" bug: matching by raw UnitItemId across two different items' Unit Sets could silently miss
    // (Fabric's own "GRM" and Yarn's own "grm" are two different MD_UnitSetItem rows, confirmed live
    // — see resolveUnitCodes' own comment), leaving the raw Fabric-scale quantity unconverted and
    // then multiplied by the Yarn's own Requirement Unit factor as if it were already in the Yarn's
    // Base Unit.
    const consumptionUnitCodes = await this.resolveUnitCodes(exploded.map((e) => e.sourceConsumptionUnitId));
    return exploded.map((e, i) => {
      const color = e.sourceColorCardId ? colors.get(String(e.sourceColorCardId)) : null;
      const requirementUnit = e.yarnInventoryId != null ? requirementUnits.get(Number(e.yarnInventoryId)) ?? null : null;
      return {
        // Yarn rows are never individually edited (see the two wrapper methods' own comments), so a
        // plain positional suffix is sufficient here — unlike getMaterialRequirements' own ids,
        // nothing needs to decode this back to a real line.
        id: `${e.fabricLineId}-${i}`,
        inventoryId: e.yarnInventoryId,
        inventoryCode: e.yarnInventoryId != null ? names.get(Number(e.yarnInventoryId))?.code ?? null : null,
        inventoryName: e.yarnInventoryId != null ? names.get(Number(e.yarnInventoryId))?.name ?? null : null,
        process: e.process,
        variant1: e.variant1,
        variant1Explanation: null,
        variant2: e.variant2,
        variant2Explanation: null,
        // Material Color — inherited from the source Fabric BOM line (see comment above), same new
        // additive field shape as getMaterialRequirements.
        colorCardId: e.sourceColorCardId,
        colorCode: color?.code ?? null,
        colorName: color?.name ?? null,
        // Response shape kept to exactly {id,code,name,unitItemId} — see getMaterialRequirements'
        // own identical comment.
        requirementUnit: requirementUnit ? { id: requirementUnit.id, code: requirementUnit.code, name: requirementUnit.name, unitItemId: requirementUnit.unitItemId } : null,
        // Additive, display-only — the real FabricYarnRecipeLine.percentage this row was actually
        // computed from (see the exploded-row comment above for exactly which one/why). Never used
        // in the Requirement math itself (that already happened, above, via `e.quantity`) — a
        // frontend consumer must never recompute Requirement from this, only display it alongside.
        recipePercentage: e.recipePercentage,
        garmentColor: e.garmentColor,
        // e.quantity is still the RAW exploded quantity (Fabric Requirement x Wastage x Recipe %,
        // in the source Fabric's own Consumption Unit) — converted here, once, into the YARN item's
        // own configured Requirement Calculation Unit, exactly the same final-step-only rule
        // getMaterialRequirements applies to Fabric/Trim (see that method's own comment).
        quantity: Math.round(this.convertRawRequirementToUnit(e.quantity, e.yarnInventoryId, e.sourceConsumptionUnitId != null ? consumptionUnitCodes.get(Number(e.sourceConsumptionUnitId)) ?? null : null, requirementUnit, consumptionUnitFactors) * 10000) / 10000,
      };
    });
  }

  private async getRequirementRows(workOrderId: number, tab: RequirementTab) {
    return tab === 'yarn' ? this.getYarnRequirements(workOrderId) : this.getMaterialRequirements(workOrderId, tab);
  }

  // ── Total Requirements Table — GROUP BY InventoryId SUM(Quantity) over the rows above. A pure
  // aggregation of already-real data, not an invented business formula (no calculation logic for
  // this exists anywhere in the codebase — confirmed via exhaustive grep).
  // ── Multi-Color BOM -> Color-Wise Requirement Calculation ──────────────────────────────────────
  // Total Requirements now key on (InventoryId, Material Color, Production Color) — NOT InventoryId
  // alone, and NOT Material Color alone either (see the Color-Wise Requirement Calculation global
  // rule this fix implements: "F1 + RED / F1 + BLACK / F1 + ORANGE must be independent records").
  // Material Color = colorCardId (the real ColorCard FK, "Choose Color"); Production Color =
  // Variant2, always included now whenever it's set — this is the fix for a real bug this exact
  // feature's own color-wise expansion exposed: a COMMON material (getMaterialRequirements now
  // expands it into one row per Production Color, each carrying its OWN Variant2) that ALSO happens
  // to have a real Material Color assigned used to collapse straight back into ONE grouped row here,
  // because the previous version of this key treated Material Color and Variant2 as mutually
  // exclusive alternatives (colorCardId present -> Variant2 ignored entirely) rather than both being
  // part of one row's identity — silently re-merging the exact color-split rows the expansion had
  // just produced, right at the Total Requirements/Save boundary. A Variant1-only line (no
  // colorCardId, no Variant2 — a genuinely common, ungrouped legacy line) still keys on Variant1
  // alone, unchanged. NOTE: this intentionally supersedes this method's own earlier "two colored
  // rows that legitimately share the same Material Color still consolidate into one total" rule —
  // under the Color-Wise Requirement Calculation's own explicit instruction, Production Color
  // identity must never be silently discarded by aggregation, even when two rows share one Material
  // Color. Rows saved under the PREVIOUS key format simply won't re-match until their next Save
  // (see getSavedRequirements' own comment on why that's safe, not destructive) — the same
  // documented, non-corrupting re-keying precedent this table already established once before.
  //
  // The ONE grouping key both getTotalRequirements (what gets summed into a single row) and
  // save() (what gets persisted as ONE MA_Requirement row) already agreed on — extracted here so
  // getSavedRequirements below can match a live, freshly-recomputed row back to its own
  // already-saved record using the EXACT same identity, never a second/divergent one.
  //
  // `r.id` is used as the LAST-RESORT disambiguator only — a row with no InventoryId, no Material
  // Color, and no Variant-1/Variant-2 text at all (a genuinely blank/degenerate BOM line) has
  // nothing else to key on. It must never be used when a real identity (Material Color and/or
  // Variant-1/Variant-2) IS available: `r.id` means something completely different across two
  // separate calls to this function — a live row's `id` is that BOM line's own real id (or, for a
  // color-expanded common line, a composite `${lineId}::${color}` — see getMaterialRequirements'
  // own comment), while a saved row's `id` is MA_Requirement's own freshly-generated RecId — so
  // keying on it whenever InventoryId happened to be null meant a color-specific line with no
  // linked Inventory Card could NEVER be matched back to its own saved record after a reload, which
  // is what originally caused Consumption/Applicable Qty to read as saved-but-unmatched. A fixed
  // `no-item` placeholder keeps the SAME key across both calls whenever a real identity exists.
  private requirementGroupKey(r: { inventoryId: any; id: any; variant1?: any; variant2?: any; colorCardId?: any }): string {
    const variant1Key = String(r.variant1 || '').trim().toLowerCase();
    const variant2Key = String(r.variant2 || '').trim().toLowerCase();
    const materialColorKey = r.colorCardId ? `c:${r.colorCardId}` : '';
    const identityKey = [materialColorKey, variant1Key ? `v1:${variant1Key}` : '', variant2Key ? `v2:${variant2Key}` : '']
      .filter(Boolean)
      .join('|');
    const itemKey = r.inventoryId != null ? String(r.inventoryId) : (identityKey ? 'no-item' : `unresolved-${r.id}`);
    return `${itemKey}${identityKey ? `|${identityKey}` : ''}`;
  }

  // ── Color-Wise Requirement rows — one row per (Item, Material Color, Production Color) group,
  // via requirementGroupKey. This is the PERSISTENCE-GRANULARITY view: what save() writes as
  // independent MA_Requirement records, and what a saved row is matched back to on reload (see
  // getSavedRequirements). NOT the same thing as the "Total Requirements Table" the Requirements
  // screen itself renders — see getTotalRequirements' own comment on why those are two genuinely
  // different views, matching the legacy reference screen's own two-grid structure.
  private async getColorWiseRequirements(workOrderId: number, tab: RequirementTab) {
    const rows = await this.getRequirementRows(workOrderId, tab);
    const byGroup = new Map<string, {
      id: string; inventoryId: any; inventoryCode: any; inventoryName: any; quantity: number;
      colorCardId: string | null; colorCode: string | null; colorName: string | null;
      requirementUnit: { id: number; code: string; name: string } | null;
    }>();
    for (const r of rows) {
      const key = this.requirementGroupKey(r as any);
      const existing = byGroup.get(key);
      if (existing) existing.quantity += Number(r.quantity) || 0;
      else byGroup.set(key, {
        id: key, inventoryId: r.inventoryId, inventoryCode: r.inventoryCode, inventoryName: r.inventoryName, quantity: Number(r.quantity) || 0,
        colorCardId: (r as any).colorCardId ?? null, colorCode: (r as any).colorCode ?? null, colorName: (r as any).colorName ?? null,
        // Same resolved unit for every row a group ever merges — requirementUnit is a pure function
        // of inventoryId (resolveRequirementUnits), and requirementGroupKey always includes
        // inventoryId, so every row landing in this SAME group is, by construction, for the SAME
        // item and therefore already carries the SAME requirementUnit. Never mixes KG-resolved and
        // GRM-resolved quantities into one SUM — there is structurally no way for two different
        // resolved units to reach the same group key.
        requirementUnit: (r as any).requirementUnit ?? null,
      });
    }
    return Array.from(byGroup.values());
  }

  // ── Total Requirements Table — matches the legacy reference screen exactly: GROUP BY Inventory
  // Code, SUM(Required), ONE row per distinct material — no Material Color/Production Color
  // breakdown in this table at all (verified against the legacy screen's own "Total Requirements
  // Table": 3 rows, one per Inventory Code, e.g. two color-specific Requirements-grid rows for the
  // same Fabric Card — 180.1033 + 2,836.4920 — summed into that ONE material's single 3,016.5953
  // total row; a material with only one Requirements-grid row shows that same figure unchanged).
  // The per-color/per-Material-Color DETAIL lives in the separate Requirements grid above this one
  // (getMaterialRequirements/getYarnRequirements — unchanged, already color-wise since the earlier
  // Color-Wise Requirement Calculation fix) and in the independently-persisted MA_Requirement
  // records (getColorWiseRequirements/save, also unchanged) — this table was previously
  // interleaving that same per-color detail (plus a separate "Cumulative Total" row) into itself,
  // which the legacy screen never does; this is the one difference this fix corrects.
  async getTotalRequirements(workOrderId: number, tab: RequirementTab) {
    const colorWiseRows = await this.getColorWiseRequirements(workOrderId, tab);
    const byItem = new Map<string, {
      id: string; inventoryId: any; inventoryCode: any; inventoryName: any; quantity: number;
      requirementUnit: { id: number; code: string; name: string } | null;
    }>();
    for (const r of colorWiseRows) {
      // Grouped purely by inventoryId, exactly like the legacy screen — and, exactly like the
      // grouping above, always unit-safe by construction: requirementUnit is resolved solely from
      // inventoryId, so every row this SUM ever combines for the same key already shares the same
      // resolved unit. Never silently adds a KG-resolved quantity to a GRM-resolved one — there is
      // no code path by which two different units could land in the same `key` here.
      const key = r.inventoryId != null ? String(r.inventoryId) : `unresolved:${r.id}`;
      const existing = byItem.get(key);
      if (existing) existing.quantity += r.quantity;
      else byItem.set(key, { id: key, inventoryId: r.inventoryId, inventoryCode: r.inventoryCode, inventoryName: r.inventoryName, quantity: r.quantity, requirementUnit: r.requirementUnit });
    }
    return Array.from(byItem.values());
  }

  // ── Requirement Locking ──────────────────────────────────────────────────────────────────────
  // Reuses the 3 real, pre-existing per-type lock-flag column triples on MA_WorkOrder — NOT a new
  // lock system. save() below already WRITES IsRequirementLocked/RequirementLockedAt/
  // RequirementLockedBy (Fabric), IsTRequirementLocked/T.../T... (Trim), IsYRequirementLocked/
  // Y.../Y... (Yarn) on every successful save; this section is what finally reads them back and
  // exposes real lock/unlock actions, rather than adding a second, parallel lock mechanism. The
  // *LockedBy columns were widened from integer to text in this same change (see migration
  // 20260909120000) — the previous integer typing could never hold this app's real (UUID) user
  // id, so no lock has ever actually recorded who set it; this is a correctness fix to already-
  // existing columns, not new schema.
  private lockColumns(tab: RequirementTab) {
    return tab === 'yarn'
      ? { isLocked: Prisma.raw('"IsYRequirementLocked"'), lockedAt: Prisma.raw('"YRequirementLockedAt"'), lockedBy: Prisma.raw('"YRequirementLockedBy"') }
      : tab === 'trim'
      ? { isLocked: Prisma.raw('"IsTRequirementLocked"'), lockedAt: Prisma.raw('"TRequirementLockedAt"'), lockedBy: Prisma.raw('"TRequirementLockedBy"') }
      : { isLocked: Prisma.raw('"IsRequirementLocked"'), lockedAt: Prisma.raw('"RequirementLockedAt"'), lockedBy: Prisma.raw('"RequirementLockedBy"') };
  }

  private tabLabel(tab: RequirementTab) {
    return tab === 'yarn' ? 'Yarn' : tab === 'trim' ? 'Trim' : 'Fabric';
  }

  // Mirrors RolesGuard's own permission-check query (Role -> RolePermission -> Permission via
  // UserRole) — the same Role/Permission/UserRole tables and shape the rest of the app's
  // authorization already uses, not a second permission system. RolesGuard itself enforces the
  // dedicated lock/unlock ROUTES (see the controller's @Permissions decorators); this is used
  // where a MUTATING action (Calculate/Save/Delete) needs to ask "if this Requirement turns out
  // to be locked, is the CALLER unlock-authorized" from inside the service layer, and where the
  // lock-status endpoint needs to tell the frontend whether the CURRENT viewer could unlock it.
  private async userHasPermission(userId: string, module: string, action: string): Promise<boolean> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    return userRoles.some((ur) => ur.role.permissions.some((rp) => rp.permission.module === module && rp.permission.action === action));
  }

  // Real DB round trip, scoped to this exact Work Order + Requirement type — never global state.
  // lockedBy is resolved from the stored user id back to a real {id, name} via the same Prisma
  // User table auth already uses (request.user, via JwtStrategy), not a second user directory.
  async getLockStatus(workOrderId: number, tab: RequirementTab, currentUserId: string) {
    await this.workOrderSvc.get(workOrderId);
    const c = this.lockColumns(tab);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${c.isLocked} as "isLocked", ${c.lockedAt} as "lockedAt", ${c.lockedBy} as "lockedBy"
      FROM "MA_WorkOrder" WHERE "RecId" = ${workOrderId}
    `);
    const row = rows[0];
    const isLocked = !!(row?.isLocked && Number(row.isLocked) === 1);
    let lockedByUser: { id: string; name: string } | null = null;
    if (isLocked && row.lockedBy) {
      lockedByUser = await this.prisma.user.findUnique({ where: { id: row.lockedBy }, select: { id: true, name: true } });
    }
    return {
      isLocked,
      lockedAt: isLocked ? row.lockedAt : null,
      lockedBy: isLocked ? (lockedByUser ?? (row.lockedBy ? { id: row.lockedBy, name: 'Unknown user' } : null)) : null,
      canUnlock: isLocked ? await this.userHasPermission(currentUserId, 'requirements', 'unlock') : false,
      // Symmetric with canUnlock — lets the frontend show/enable "Lock Requirement" only for a
      // caller who is actually route-level authorized to reach POST .../lock (same permission
      // check RolesGuard itself enforces there), instead of letting anyone click it and only
      // finding out via a failed request.
      canLock: !isLocked ? await this.userHasPermission(currentUserId, 'requirements', 'lock') : false,
    };
  }

  // Route-level @Permissions({module:'requirements',action:'lock'}) already gates who can even
  // reach this method — see the controller. "Already locked" is checked against the DATABASE's
  // current state (not any frontend-supplied assumption), satisfying "check is not already
  // locked" and the multi-user-safety requirement in one place.
  async lockRequirement(workOrderId: number, tab: RequirementTab, currentUserId: string) {
    const status = await this.getLockStatus(workOrderId, tab, currentUserId);
    if (status.isLocked) {
      throw new ConflictException(`${this.tabLabel(tab)} Requirement is already locked${status.lockedBy ? ` by ${status.lockedBy.name}` : ''}.`);
    }
    const c = this.lockColumns(tab);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "MA_WorkOrder" SET ${c.isLocked} = 1, ${c.lockedAt} = now(), ${c.lockedBy} = ${currentUserId}
      WHERE "RecId" = ${workOrderId}
    `);
    return this.getLockStatus(workOrderId, tab, currentUserId);
  }

  // Route-level @Permissions({module:'requirements',action:'unlock'}) is the primary enforcement
  // (this is "the most important rule" per the task — NOT every user can unlock). The in-method
  // check below is kept too so unlockRequirement() stays safe to call even if a future second
  // route ever reached it without going through the guard.
  async unlockRequirement(workOrderId: number, tab: RequirementTab, currentUserId: string) {
    const allowed = await this.userHasPermission(currentUserId, 'requirements', 'unlock');
    if (!allowed) throw new ForbiddenException('You do not have permission to unlock Requirements.');
    const status = await this.getLockStatus(workOrderId, tab, currentUserId);
    if (!status.isLocked) throw new ConflictException(`${this.tabLabel(tab)} Requirement is not locked.`);
    const c = this.lockColumns(tab);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "MA_WorkOrder" SET ${c.isLocked} = 0, ${c.lockedAt} = NULL, ${c.lockedBy} = NULL
      WHERE "RecId" = ${workOrderId}
    `);
    return this.getLockStatus(workOrderId, tab, currentUserId);
  }

  // Called at the top of every mutating Requirement action (Calculate/Save/Delete/Delete All).
  // Re-reads the PERSISTED lock state fresh on every call — never trusts frontend/stale state, so
  // a second user's stale-open tab is rejected based on the real, current database row (Step 8 /
  // multi-user safety).
  //
  // IMPORTANT: a locked Requirement blocks EVERY mutation unconditionally, including a caller who
  // currently holds requirements:unlock permission. An earlier version of this method let an
  // unlock-authorized caller silently bypass the lock on ANY mutating call — which meant Calculate
  // (and Save/Delete) appeared to ignore the lock entirely whenever tested by an admin/manager
  // account, since that account legitimately holds unlock permission. That was a real, reported
  // defect, not a deliberate feature: the ONLY path past a lock is now to explicitly call
  // unlockRequirement() first (itself still gated by requirements:unlock — see the controller's
  // own @Permissions on POST .../unlock), which clears isLocked in the database; every mutation
  // here always re-reads that same fresh, real DB state, so once actually unlocked, all of
  // Calculate/Save/Delete/Delete All work normally again with zero special-casing.
  private async assertMutationAllowed(workOrderId: number, tab: RequirementTab, currentUserId: string) {
    const status = await this.getLockStatus(workOrderId, tab, currentUserId);
    if (!status.isLocked) return;
    throw new ForbiddenException(`${this.tabLabel(tab)} Requirement is locked${status.lockedBy ? ` by ${status.lockedBy.name}` : ''} and cannot be modified. Unlock it first.`);
  }

  // "Calculate" — a pure preview/refresh (no persistence side effect); Save below is what
  // actually writes MA_Requirement. Matches the reference screen's own two-step Calculate-then-
  // Save workflow.
  async calculate(workOrderId: number, tab: RequirementTab, currentUserId: string) {
    await this.assertMutationAllowed(workOrderId, tab, currentUserId);
    return this.getTotalRequirements(workOrderId, tab);
  }

  // Delete ONE selected Requirement record (soft-delete, matching MA_Requirement's own existing
  // IsDeleted convention — the same one save()'s own delete-then-recreate already uses; not a new
  // deletion mechanism). `recordId` is a real MA_Requirement.RecId — see getSavedRequirements'
  // own `id` field, which is exactly this. Scoped to (RecId AND RequirementType AND this Work
  // Order's own items) so a caller can never delete a record belonging to a different Work Order
  // or a different Requirement type by guessing/reusing an id. This REPLACES a previous version of
  // this method that took no id at all and bulk-deleted every saved record of the type — which is
  // exactly the "Delete" action was wired to a misleading "delete everything, not just the
  // selected row" confirmation and endpoint; fixed by giving Delete a real target instead.
  async deleteRequirement(workOrderId: number, tab: RequirementTab, recordId: number, currentUserId: string, companyId?: string) {
    const workOrder = await this.workOrderSvc.get(workOrderId);
    await this.assertMutationAllowed(workOrderId, tab, currentUserId);
    const requirementType = REQUIREMENT_TYPE[tab];
    // Last valid state before deletion (Section 3/4) — the raw persisted MA_Requirement row is
    // captured BEFORE the soft-delete below, not a live requery of it afterward.
    const beforeRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM "MA_Requirement"
      WHERE "RecId" = ${recordId} AND "RequirementType" = ${requirementType}
        AND "WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND "IsDeleted" = 0
    `);
    const affected = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "MA_Requirement" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${Number(currentUserId) || 1}
      WHERE "RecId" = ${recordId}
        AND "RequirementType" = ${requirementType}
        AND "WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND "IsDeleted" = 0
    `);
    if (Number(affected) === 0) {
      throw new NotFoundException(`${this.tabLabel(tab)} Requirement record not found — it may already be deleted, or belong to a different Work Order/type.`);
    }
    if (companyId && beforeRows.length) {
      await this.audit.recordSafe({
        userId: currentUserId,
        companyId,
        screenKey: WORK_ORDER_SCREEN_KEY,
        entityType: 'MA_Requirement',
        entityId: String(recordId),
        parentEntityType: 'MA_WorkOrder',
        parentEntityId: String(workOrderId),
        parentDocumentNo: (workOrder as any)?.workOrderNo,
        action: AUDIT_ACTIONS.DELETE,
        documentNo: (workOrder as any)?.workOrderNo,
        before: { [`${this.tabLabel(tab)} Requirement (MA_Requirement)`]: sanitizeRawRow(beforeRows)[0] },
      });
    }
    return { message: `${this.tabLabel(tab)} Requirement record deleted.` };
  }

  // Delete All Records — scoped to exactly ONE Requirement type (whichever screen/tab the caller
  // is on), never the other two. This REPLACES a previous version of this method that deleted
  // every MA_Requirement row for the Work Order regardless of type — a real, reported bug: opening
  // Fabric Requirements and clicking "Delete All" silently wiped out that Work Order's Trim and
  // Yarn records too, even though the confirmation dialog and button both only ever talked about
  // "this screen". Fixed the exact same way deleteRequirement (single-record delete, just above)
  // already scopes its own DELETE: by real `RequirementType` on MA_Requirement — REQUIREMENT_TYPE
  // is this file's own existing fabric/yarn/trim convention, reused here, not a new field/table.
  // Lock check also narrowed to match: only THIS tab's own lock is consulted
  // (assertMutationAllowed — the same helper every other mutation on this tab already uses), so
  // Fabric Delete All is no longer blocked by Trim or Yarn being locked, and vice versa.
  async deleteAllRequirements(workOrderId: number, tab: RequirementTab, currentUserId: string, companyId?: string) {
    const workOrder = await this.workOrderSvc.get(workOrderId);
    await this.assertMutationAllowed(workOrderId, tab, currentUserId);
    const requirementType = REQUIREMENT_TYPE[tab];
    const beforeRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM "MA_Requirement"
      WHERE "RequirementType" = ${requirementType}
        AND "WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND "IsDeleted" = 0
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "MA_Requirement" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${Number(currentUserId) || 1}
      WHERE "RequirementType" = ${requirementType}
        AND "WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND "IsDeleted" = 0
    `);
    if (companyId && beforeRows.length) {
      await this.audit.recordSafe({
        userId: currentUserId,
        companyId,
        screenKey: WORK_ORDER_SCREEN_KEY,
        entityType: 'MA_Requirement',
        entityId: String(workOrderId),
        parentEntityType: 'MA_WorkOrder',
        parentEntityId: String(workOrderId),
        parentDocumentNo: (workOrder as any)?.workOrderNo,
        action: AUDIT_ACTIONS.DELETE,
        documentNo: (workOrder as any)?.workOrderNo,
        before: { [`${this.tabLabel(tab)} Requirements (MA_Requirement, all)`]: sanitizeRawRow(beforeRows) },
      });
    }
    return { message: `${this.tabLabel(tab)} Requirement records deleted.` };
  }

  // ── Transaction Details ──────────────────────────────────────────────────────────────────────
  // IM_ReceiptItem.WorkOrderReceiptItemId is a real, pre-existing column on this table (confirmed
  // via information_schema — already listed in inventory-receipt.service.ts's own ITEM_COLUMNS,
  // additive/read-only there, never written by the existing receipt UI) — the most direct
  // existing link from a receipt line back to a Work Order line. A second, also-real junction
  // table, MA_WorkOrderItemReceipt (WorkOrderReceiptItemId/InventoryReceiptItemId/Quantity), also
  // exists and is currently empty with no writer anywhere either. Genuine ambiguity: neither link
  // has ever been populated by any existing code path in this codebase, so which one the legacy
  // system actually used cannot be confirmed here — this query joins through the direct
  // IM_ReceiptItem column (the simpler, one-hop reading) and is documented as such; see the final
  // report's "genuine missing DB/business logic" note.
  // `inventoryId`/`colorCardId` are optional — omitted (the default), every receipt linked to
  // this Work Order is returned exactly as before. When a caller clicks a specific item on the
  // Requirements/Total Requirements grid, both (or just inventoryId, for a Material Color-less
  // row) are passed through to scope this down to receipts for exactly that material, using
  // IM_ReceiptItem's own real InventoryId/ColorCardId columns (confirmed via information_schema
  // — the same physical columns this table already carries for every other receipt screen).
  //
  // `receiptId` (IM_Receipt.RecId, the real header primary key — additive, every existing
  // consumer that doesn't read it is unaffected) lets the frontend open the EXACT persisted
  // receipt this row came from via the existing inventory-receipts screen's own real
  // `?id=<receiptId>&mode=view|edit&receiptType=<receiptType>` convention (the same one
  // receipt-menu.ts's own openReceipt/openSubcontractReceipt already navigate to) — never a
  // second lookup by ReceiptNo/DocumentNo/date, none of which are guaranteed unique.
  async getTransactionDetails(workOrderId: number, inventoryId?: number, colorCardId?: string) {
    const itemIds = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId} AND "IsDeleted" = 0
    `);
    const ids = itemIds.map((r) => Number(r.id));
    if (!ids.length) return [];
    const filters = [Prisma.sql`ri."WorkOrderReceiptItemId" IN (${Prisma.join(ids)})`, Prisma.sql`ri."IsDeleted" = 0`];
    if (inventoryId != null) filters.push(Prisma.sql`ri."InventoryId" = ${inventoryId}`);
    if (colorCardId) filters.push(Prisma.sql`ri."ColorCardId" = ${colorCardId}`);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        ri."RecId" as id,
        ri."InventoryId" as "inventoryId",
        ri."ColorCardId" as "colorCardId",
        r."RecId" as "receiptId",
        r."ReceiptDate" as "receiptDate",
        r."ReceiptType" as "receiptType",
        st."SubcontractTypeName" as subcontractor,
        r."ReceiptNo" as "receiptNo",
        r."DocumentNo" as "documentNo",
        wh."WarehouseCode" as warehouse,
        ri."PartyNo" as "partyNo",
        ri."SpecialCode" as "specialCode",
        ri."Explanation" as explanation,
        acc."CurrentAccountCode" as "currentAccountCode",
        acc."CurrentAccountName" as "currentAccountName",
        ri."GrossQuantity" as "grossQuantity",
        ri."Quantity" as quantity,
        ri."Quantity" as "receiptQuantity"
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" AND r."IsDeleted" = 0
      LEFT JOIN "MD_SubcontractType" st ON st."RecId" = r."SubcontractTypeId"
      LEFT JOIN "FI_Account" acc ON acc."RecId" = r."CurrentAccountId"
      LEFT JOIN "IM_Warehouse" wh ON wh."RecId" = r."InWarehouseId"
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY r."ReceiptDate" DESC
    `);
    return sanitizeRawRow(rows);
  }

  // ── Save — delete-then-insert into MA_Requirement for this (workOrderId, tab), matching this
  // codebase's own established BOM-line upsert idiom (StyleBomLine/SampleBomLine/MA_RecipeItem
  // above all delete-all-then-recreate) — guarantees no duplicate rows on a repeated Save by
  // construction.
  //
  // IMPORTANT correction made alongside the new Lock/Unlock feature below: this method used to
  // unconditionally SET IsRequirementLocked/IsTRequirementLocked/IsYRequirementLocked = 1 (plus
  // LockedAt/LockedBy) at the end of every single successful save, regardless of anything the
  // user asked for. Nothing in the codebase ever read those columns back (confirmed via a whole-
  // repo grep), so this was silent, inert write-only behavior — but it is exactly the wrong thing
  // to keep once these columns back a REAL, explicit Lock action: with it left in place, the very
  // next Calculate->auto-save (routine, expected behavior) would immediately re-lock a Requirement
  // the user had just explicitly unlocked, and would lock every Requirement after its first-ever
  // save, breaking normal iterative use. Locking is now ONLY ever set by lockRequirement() below,
  // triggered ONLY by an explicit user action — save() no longer touches these columns at all,
  // it only respects them via assertMutationAllowed() just below.
  async save(workOrderId: number, tab: RequirementTab, userId: number, currentUserId: string) {
    await this.workOrderSvc.get(workOrderId);
    await this.assertMutationAllowed(workOrderId, tab, currentUserId);
    // Persists at Color-Wise Requirement granularity (getColorWiseRequirements — one real record
    // per Item+Material Color/Production Color group), NOT getTotalRequirements' own pure
    // per-Item aggregate (that method now matches the legacy screen's "Total Requirements Table"
    // exactly — see its own comment — and would silently combine every color into ONE persisted
    // row, undoing the Color-Wise Requirement Calculation fix and double-counting nothing but also
    // recording nothing useful once more than one color is in play).
    const totals = await this.getColorWiseRequirements(workOrderId, tab);
    const requirementType = REQUIREMENT_TYPE[tab];
    const toDb = buildDbValueCoercer(await getColumnTypeMap(this.prisma, REQUIREMENT_TABLE));

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "MA_Requirement" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId}
      WHERE "RequirementType" = ${requirementType}
        AND "WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND "IsDeleted" = 0
    `);

    const itemIdRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId} AND "IsDeleted" = 0 ORDER BY "ItemOrderNo", "RecId" LIMIT 1
    `);
    const workOrderItemId = itemIdRows[0]?.id;
    if (workOrderItemId != null) {
      for (const t of totals) {
        const inventoryId = toDb('InventoryId', t.inventoryId);
        const quantity = toDb('Quantity', t.quantity);
        // ColorCardId (Material Color) — the real FK, sole source of truth for identity; a live
        // ColorCard lookup on read (getSavedRequirements) resolves its Code/Name for display, so
        // there is no need to also cram a denormalized label into Variant1 here (MA_Requirement's
        // real column is varchar(25) — a real ColorCard code/name can exceed that, which silently
        // aborted this insert loop partway through before this fix; left NULL/unused instead,
        // matching this column's own pre-existing "never written" state).
        //
        // RequirementGroup (a real, pre-existing varchar(100) column — confirmed via information_
        // schema, unused anywhere else in this codebase) stores `t.id`: getTotalRequirements' own
        // grouping key for this exact row (requirementGroupKey() — see that method), sliced
        // defensively to fit. This is what lets getSavedRequirements() below match a saved record
        // back to its own live row on reload/after a Delete with 100% precision, including the
        // case where neither InventoryId nor ColorCardId is set (nothing else reliable to key on)
        // — a plain positional/order-based fallback was tried first and rejected: it silently
        // reassigns a DIFFERENT row's saved id to the wrong live row the moment any ONE row in
        // that same ambiguous group is deleted, which is exactly wrong.
        await this.prisma.$executeRaw(Prisma.sql`
          INSERT INTO "MA_Requirement" ("RequirementType", "WorkOrderItemId", "InventoryId", "Quantity", "ColorCardId", "RequirementGroup", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
          VALUES (${requirementType}, ${workOrderItemId}, ${inventoryId}, ${quantity}, ${t.colorCardId ?? null}, ${String(t.id).slice(0, 100)}, now(), ${userId}, 0, gen_random_uuid())
        `);
      }
    }

    return this.getTotalRequirements(workOrderId, tab);
  }

  // Reads back whatever was last Saved (MA_Requirement rows for this Work Order + tab) — used on
  // reopen, so a reload confirms which records are genuinely persisted (and therefore deletable),
  // WITHOUT freezing a stale snapshot of everything else.
  //
  // BUG FIX (Consumption/Applicable Qty showing 0/blank after reload): MA_Requirement only ever
  // stored the final combined Quantity — Consumption, Applicable Quantity, Variant-1, Variant-2
  // were never columns on it at all (see save()'s own INSERT column list, unchanged). The previous
  // version of this method returned only the bare saved row, and the frontend then hardcoded
  // consumption/applicableQuantity to 0 and variant1/variant2 to null for every "saved" row — not
  // because that data was lost, but because it was never being looked up. Consumption is, and
  // always has been, the real BOM line's own MA_RecipeItem.Quantity; Applicable Quantity is
  // derived live from the Work Order's CURRENT Manufacturing Quantities. Both are already
  // recomputed correctly by getRequirementRows() (the exact same source Calculate uses) at any
  // time — this method now reuses that directly instead of re-deriving/duplicating the math.
  //
  // Matching a live row back to its own already-saved record: save() now persists
  // requirementGroupKey()'s own value into RequirementGroup (a real, pre-existing varchar(100)
  // column — see save()'s own comment on why this, not Variant1/Variant2, which are varchar(25)
  // and can't safely hold a real production color name in this app's own data). Since the SAME
  // key formula is used on both sides, a saved row's RequirementGroup and a live row's freshly-
  // computed key are directly comparable — exact, deterministic, and correct even after a Delete
  // (a plain position/order-based fallback was tried first and rejected: deleting any ONE row in
  // an ambiguous "no InventoryId, no Material Color" group silently reassigns its saved id to the
  // WRONG live row once matched by position instead of identity). A saved-before-this-fix row has
  // no RequirementGroup value yet (NULL) and simply won't match until the next Save refreshes it —
  // no migration, no schema change beyond using an already-existing, already-empty column. A live
  // row with no matching saved group at all (e.g. a BOM line added since the last Save) is still
  // shown — with `isSaved: false` — rather than silently hidden; the frontend uses that flag (not
  // a single page-level "is this whole grid saved" boolean) to decide which specific rows are
  // deletable/editable.
  async getSavedRequirements(workOrderId: number, tab: RequirementTab) {
    const requirementType = REQUIREMENT_TYPE[tab];
    const savedRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT req."RecId" as id, req."RequirementGroup" as "requirementGroup"
      FROM "MA_Requirement" req
      WHERE req."RequirementType" = ${requirementType}
        AND req."WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND req."IsDeleted" = 0
    `);
    const clean = sanitizeRawRow(savedRows);
    if (!clean.length) return []; // nothing saved yet — caller falls back to the live preview grid, unchanged

    const savedIdByGroup = new Map<string, number>();
    for (const r of clean) {
      if (!r.requirementGroup) continue; // saved before this fix — no stored key to match against yet
      if (!savedIdByGroup.has(r.requirementGroup)) savedIdByGroup.set(r.requirementGroup, Number(r.id));
    }

    const liveRows = await this.getRequirementRows(workOrderId, tab);
    return liveRows.map((r: any) => {
      const key = this.requirementGroupKey(r).slice(0, 100); // must match the same slice save() persisted
      const savedId = savedIdByGroup.get(key);
      // `lineId` — the real, always-editable BOM line reference (a live row's own id from
      // getMaterialRequirements/getYarnRequirements — either a real MA_RecipeItem.id, a StyleBomLine
      // UUID, or a `::`-suffixed composite for a color-expanded common line), captured BEFORE `id`
      // gets overwritten below. setMaterialColorForLine/setConsumptionForLine both resolve their own
      // `lineId` param against this exact same live-BOM-line identity (updateRequirementLine's own
      // `ownLines.some(l => l.id === numericLineId)` check) — never against a MA_Requirement.RecId,
      // which has no relationship to any BOM line at all. Previously the ONLY id a row carried was
      // `id`, and `id` gets overwritten to the matched MA_Requirement.RecId the moment a row becomes
      // saved (`isSaved: true`) — meaning any edit attempted on an already-saved row was silently
      // sending the WRONG identifier (a MA_Requirement.RecId where a MA_RecipeItem.id was expected),
      // which is exactly why Consumption editing had to be disabled entirely once a row was saved.
      // `lineId` fixes that at the root: it always stays the real BOM line reference regardless of
      // `isSaved`, so an edit made on a saved row can still resolve correctly. Purely additive — `id`
      // itself is completely unchanged, so Delete (which targets a real MA_Requirement.RecId only
      // when isSaved) keeps working exactly as before.
      return { ...r, lineId: r.id, id: savedId ?? r.id, isSaved: savedId != null };
    });
  }

  // Distinguishes two states getSavedRequirements' own "nothing currently active" case collapses
  // into one (`[]`): a Work Order/type that has NEVER been saved at all, vs one that WAS saved and
  // has since had every one of its MA_Requirement rows explicitly soft-deleted (a single Delete
  // that removed the last one, or Delete All). Deliberately ignores "IsDeleted" (checks for ANY
  // row, deleted or not) — the real, reported bug this exists to fix: the Requirements screen's own
  // reload previously had no way to tell these two apart, so after Delete All it silently fell back
  // to the SAME live BOM/Yarn-Recipe preview a never-yet-saved Work Order shows (loadGrids' own
  // "else" branch) — meaning a genuinely successful, confirmed DB deletion (see deleteRequirement/
  // deleteAllRequirements above) was immediately, invisibly overwritten by a live recalculation on
  // the very next load, which is exactly why the deleted row kept reappearing. The frontend uses
  // this flag to show genuinely empty Requirements/Total Requirements after a delete instead of
  // regenerating them — only an explicit Calculate (which also re-Saves, see this screen's own
  // calculate()) is allowed to repopulate them again.
  async hasSavedHistory(workOrderId: number, tab: RequirementTab): Promise<boolean> {
    const requirementType = REQUIREMENT_TYPE[tab];
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM "MA_Requirement"
      WHERE "RequirementType" = ${requirementType}
        AND "WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
      LIMIT 1
    `);
    return rows.length > 0;
  }
}
