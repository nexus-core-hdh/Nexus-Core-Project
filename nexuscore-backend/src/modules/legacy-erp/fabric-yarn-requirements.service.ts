import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { WorkOrderService } from './work-order.service';
import { FabricYarnRecipeService } from './fabric-yarn-recipe.service';

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
  private async getManufacturingQuantityTotals(workOrderId: number): Promise<{ byColor: Map<string, number>; total: number; hasAny: boolean; extraCuttingPercent: number }> {
    const [items, headerRows] = await Promise.all([
      this.workOrderSvc.listItems(workOrderId),
      this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "Quantity2" as "quantity2" FROM "MA_WorkOrder" WHERE "RecId" = ${workOrderId} AND "IsDeleted" = 0`),
    ]);
    const extraCuttingPercent = Number(headerRows[0]?.quantity2) || 0;
    const primaryItemId = items[0]?.id;
    const byColor = new Map<string, number>();
    let total = 0;
    if (primaryItemId == null) return { byColor, total, hasAny: false, extraCuttingPercent };
    const variants = await this.workOrderSvc.listItemVariants(primaryItemId);
    for (const v of variants) {
      const originalQty = Number(v.quantity) || 0;
      const qty = this.willBeCutQty(originalQty, extraCuttingPercent);
      total += qty;
      const [colorRaw] = String(v.explanation || '').split(COLOR_SIZE_SEP);
      const color = colorRaw.trim().toLowerCase();
      if (color) byColor.set(color, (byColor.get(color) || 0) + qty);
    }
    return { byColor, total, hasAny: variants.length > 0, extraCuttingPercent };
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
  // as a color. Variant2 has no established meaning anywhere else in this codebase (confirmed:
  // blank/unused on every Work Order BOM row before this feature, and StyleBomLine/SampleBomLine
  // have no equivalent column at all — see getStyleCardBomLinesAsWorkOrderShape's own comment on
  // why a Style Card fallback line always resolves as "common"), which is exactly why it was
  // chosen for this: an existing, real, currently-empty column on exactly the right table
  // (MA_RecipeItem, Work Order's own BOM), needing zero schema migration.
  private resolveApplicableQuantity(
    productionColor: string | null | undefined,
    mfgQty: { byColor: Map<string, number>; total: number },
  ): { quantity: number; matchedColor: string | null } {
    const key = (productionColor || '').trim().toLowerCase();
    if (key && mfgQty.byColor.has(key)) return { quantity: mfgQty.byColor.get(key)!, matchedColor: (productionColor as string).trim() };
    return { quantity: mfgQty.total, matchedColor: null };
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
  private async resolveBomLines(workOrderId: number, lineType: DirectBomTab): Promise<any[]> {
    const ownLines = await this.workOrderSvc.listBom(workOrderId, lineType);
    if (ownLines.length) return ownLines;
    const wo = await this.workOrderSvc.get(workOrderId).catch(() => null);
    const styleCardId = (wo as any)?.styleCardId;
    if (!styleCardId) return [];
    return this.getStyleCardBomLinesAsWorkOrderShape(styleCardId, lineType);
  }

  // Reads StyleBomLine (the exact table/query style-extras.service.ts's own getBomLines() uses —
  // no new query logic) and reshapes each row into the same field names
  // getMaterialRequirements()/getYarnRequirements() already read off a WorkOrderService.listBom()
  // row, so neither method needs to know which source it got. wastage sums StyleBomLine's own 4
  // percentage columns (wastePct/dyeWastagePct/otherWastagePct/printWastagePct) — the exact same
  // sum bom-tab.tsx's own applyWaste() already does for these columns, not a new formula. variant2
  // has no StyleBomLine equivalent (it only carries one `variant` field) and is left null.
  private async getStyleCardBomLinesAsWorkOrderShape(styleCardId: string, lineType: DirectBomTab) {
    const rows = await this.prisma.styleBomLine.findMany({ where: { styleCardId, lineType } });
    return rows.map((r: any) => ({
      id: r.id,
      inventoryId: r.fabricInventoryId,
      quantity: Number(r.quantity) || 0,
      variant1: r.variant,
      variant2: null,
      // StyleBomLine's own real colorCardId (Choose Color -> ColorCard, same relation as
      // MA_RecipeItem's) -- carried through so a Fabric/Trim type the Work Order does NOT own
      // still resolves its real Material Color from the Style Card fallback, not just its garment-
      // color match key.
      colorCardId: r.colorCardId ?? null,
      wastage: (Number(r.wastePct) || 0) + (Number(r.dyeWastagePct) || 0) + (Number(r.otherWastagePct) || 0) + (Number(r.printWastagePct) || 0),
      uD_Remarks: r.process,
    }));
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
    return lines.map((l: any) => {
      const consumption = Number(l.quantity) || 0;
      // Garment/Production Color — which Work Order production color this line applies to
      // (matched against Manufacturing Quantities via Variant2 — see resolveApplicableQuantity's
      // own comment on why Variant2, never Variant1). Material Color — the REAL color of the
      // material itself (colorCardId -> ColorCard, the BOM grid's own "Choose Color" cell). Three
      // deliberately separate identities: Variant1 (Material Variant/Type, e.g. "Fleece"),
      // Variant2/matchedColor (Production Color, e.g. "NAVY BLAZER"), colorCardId (Material Color,
      // e.g. "NAVY") — see the Multi-Color BOM feature's own top-level design note in
      // getTotalRequirements below.
      const { quantity: applicableQuantity, matchedColor } = this.resolveApplicableQuantity(l.variant2, mfgQty);
      const color = l.colorCardId ? colors.get(String(l.colorCardId)) : null;
      return {
        id: l.id,
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
        variant2: l.variant2,
        variant2Explanation: null,
        // Material Color — new, additive fields (existing consumers that don't know about them are
        // unaffected). colorCardId is the real FK; colorCode/colorName are resolved for display so
        // the frontend needs no second lookup round trip.
        colorCardId: l.colorCardId ?? null,
        colorCode: color?.code ?? null,
        colorName: color?.name ?? null,
        // Consumption — this BOM line's OWN existing Quantity field, unchanged (still exactly what
        // bom-tab.tsx's own "Quantity" column already saved/shows on the Work Order's BOM tab).
        consumption,
        // Applicable Quantity — the production quantity resolved for THIS line (Color-matched, or
        // the Work Order's total when unmatched/fixed-variant) — see resolveApplicableQuantity.
        applicableQuantity,
        matchedColor,
        // Garment Color — explicit alias of matchedColor, for a caller that doesn't already know
        // the older field's name means the same thing.
        garmentColor: matchedColor,
        // Requirement = Consumption x Applicable Quantity — the task's own "Required Material =
        // Applicable Production Quantity x BOM Item's Consumption" formula, per BOM line. This is
        // the field getTotalRequirements/save() already sum/persist, so Total Requirements and the
        // saved MA_Requirement now reflect the real requirement instead of a raw BOM-quantity echo.
        quantity: Math.round(consumption * applicableQuantity * 10000) / 10000,
      };
    });
  }

  // Validation — "if a mapping is required but missing, surface it instead of silently calculating
  // against the wrong color". Applies ONLY when the Work Order actually has Manufacturing
  // Quantities entered with more than one distinct color (mfgQty.byColor.size > 1) — a single-color
  // (or zero-color, legacy) Work Order has no ambiguity to warn about, and a BOM line's blank
  // Production Color (Variant2) is the pre-existing, intentional "common material" convention
  // (falls back to the Work Order's TOTAL quantity — correct, not a missing mapping). Deliberately
  // non-fatal: returned as warnings, never thrown, so Calculate/Save keep working exactly as before
  // for every case that isn't this specific new ambiguity (Test 1/Test 13's own "existing behavior
  // still works").
  private buildMappingWarnings(lines: any[], mfgQty: { byColor: Map<string, number>; total: number }): string[] {
    if (mfgQty.byColor.size <= 1) return [];
    const warnings: string[] = [];
    for (const l of lines) {
      const key = String(l.variant2 || '').trim().toLowerCase();
      if (key && !mfgQty.byColor.has(key)) {
        const label = l.inventoryId != null ? `Inventory #${l.inventoryId}` : `BOM line ${l.id}`;
        warnings.push(`${label}: Production Color "${l.variant2}" does not match any of this Work Order's Manufacturing Quantity colors (${Array.from(mfgQty.byColor.keys()).join(', ')}) — it is being calculated against the Work Order's TOTAL quantity instead.`);
      }
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
      return this.buildMappingWarnings(fabricLines, mfgQty);
    }
    const lines = await this.resolveBomLines(workOrderId, tab);
    return this.buildMappingWarnings(lines, mfgQty);
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
    const exploded: { fabricLineId: number; yarnInventoryId: number | null; process: string | null; variant1: string | null; variant2: string | null; quantity: number; sourceColorCardId: string | null; garmentColor: string | null }[] = [];
    for (const line of fabricLines) {
      if (line.inventoryId == null) continue;
      const recipeLines = await this.yarnRecipeSvc.getRecipe(Number(line.inventoryId));
      if (!recipeLines.length) continue;
      // Same "Applicable Quantity x Consumption" step getMaterialRequirements applies, folded in
      // before the existing Wastage/recipe-% math below so that math is completely unchanged in
      // shape — just fed the real fabric requirement instead of the raw per-unit BOM Quantity.
      const { quantity: applicableQuantity, matchedColor } = this.resolveApplicableQuantity(line.variant2, mfgQty);
      const fabricRequirement = Number(line.quantity || 0) * applicableQuantity;
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
          quantity: Math.round(calculatedQty * (pct / 100) * 10000) / 10000,
          // Yarn has no color selection of its own anywhere in this app (FabricYarnRecipeLine's
          // own variant1/variant2 are plain free text, never linked to ColorCard — confirmed
          // during the Multi-Color BOM audit) — it inherits the Fabric BOM line's REAL Material
          // Color it was exploded from ("Fabric BOM Line -> Mapped Fabric Material Color -> Fabric
          // Recipe -> Yarn Recipe -> Yarn Requirement", per the task's own flow), so a Yarn
          // requirement never loses which colored Fabric it actually came from.
          sourceColorCardId: line.colorCardId ?? null,
          garmentColor: matchedColor,
        });
      }
    }
    const names = await this.resolveInventoryNames(exploded.map((e) => e.yarnInventoryId));
    const colors = await this.resolveColorCards(exploded.map((e) => e.sourceColorCardId));
    return exploded.map((e, i) => {
      const color = e.sourceColorCardId ? colors.get(String(e.sourceColorCardId)) : null;
      return {
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
        garmentColor: e.garmentColor,
        quantity: e.quantity,
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
  // Total Requirements now key on (InventoryId, Material Color) instead of InventoryId alone —
  // otherwise RED fleece and BLUE fleece sharing the same physical Fabric Card would silently
  // collapse into one wrong combined figure the moment a Work Order has more than one production
  // color (the exact bug this feature fixes). Material Color = colorCardId (the real ColorCard FK,
  // "Choose Color") when the line has one; a legacy line with no colorCardId at all falls back to
  // its own Variant1 (Material Variant/Type) + Variant2 (Production Color) as the distinguishing
  // key — NOT because either represents color identity on its own (Variant1 never does; Variant2
  // is the production-color match key, not a "color of the material"), but so two colorless rows
  // that differ by material type or by which production color they apply to are never silently
  // treated as "the same row" just because neither has a real Material Color assigned yet. Two
  // colored rows that legitimately share the SAME Material Color (e.g. RED garment's Rib/NAVY +
  // BLUE garment's Rib/NAVY) still consolidate into one total, by design — see the feature's own
  // consolidation rule.
  async getTotalRequirements(workOrderId: number, tab: RequirementTab) {
    const rows = await this.getRequirementRows(workOrderId, tab);
    const byInventory = new Map<string, {
      id: string; inventoryId: any; inventoryCode: any; inventoryName: any; quantity: number;
      colorCardId: string | null; colorCode: string | null; colorName: string | null;
    }>();
    for (const r of rows) {
      const legacyKey = [r.variant1, r.variant2].map((v) => String(v || '').trim().toLowerCase()).join('|');
      const colorKey = (r as any).colorCardId ? `c:${(r as any).colorCardId}` : (legacyKey !== '|' ? `legacy:${legacyKey}` : '');
      const key = `${r.inventoryId ?? `unresolved-${r.id}`}${colorKey ? `|${colorKey}` : ''}`;
      const existing = byInventory.get(key);
      if (existing) existing.quantity += Number(r.quantity) || 0;
      // `id` was previously missing from this aggregation entirely (only inventoryId/Code/Name/
      // quantity were returned) even though the frontend's TotalRow type has always declared it
      // required and ReportGrid keys every row by row.id — with 0-1 total rows React never had two
      // equal (undefined) keys to warn about, so this stayed invisible until a real multi-row
      // total appeared. `key` is already guaranteed unique per returned row (it's the Map's own
      // dedup key), so reusing it as `id` needs no new identifier scheme.
      else byInventory.set(key, {
        id: key, inventoryId: r.inventoryId, inventoryCode: r.inventoryCode, inventoryName: r.inventoryName, quantity: Number(r.quantity) || 0,
        colorCardId: (r as any).colorCardId ?? null, colorCode: (r as any).colorCode ?? null, colorName: (r as any).colorName ?? null,
      });
    }
    return Array.from(byInventory.values());
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
  async deleteRequirement(workOrderId: number, tab: RequirementTab, recordId: number, currentUserId: string) {
    await this.workOrderSvc.get(workOrderId);
    await this.assertMutationAllowed(workOrderId, tab, currentUserId);
    const requirementType = REQUIREMENT_TYPE[tab];
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
    return { message: `${this.tabLabel(tab)} Requirement record deleted.` };
  }

  // Delete All Records — clears ALL THREE types for this Work Order at once (existing, deliberate
  // business rule — see this method's own history; unchanged by this fix). All-or-nothing: if ANY
  // of the 3 is currently locked, the WHOLE action is rejected — no bypass for an unlock-
  // authorized caller either now (see assertMutationAllowed's own comment on why); they must
  // explicitly unlock each locked type first, same as every other mutation.
  async deleteAllRequirements(workOrderId: number, currentUserId: string) {
    await this.workOrderSvc.get(workOrderId);
    const tabs: RequirementTab[] = ['fabric', 'trim', 'yarn'];
    const statuses = await Promise.all(tabs.map((t) => this.getLockStatus(workOrderId, t, currentUserId)));
    const blocked = tabs.filter((_, i) => statuses[i].isLocked);
    if (blocked.length) {
      throw new ForbiddenException(`Cannot delete all Requirement records — ${blocked.map((t) => this.tabLabel(t)).join(', ')} ${blocked.length > 1 ? 'are' : 'is'} locked. Unlock ${blocked.length > 1 ? 'them' : 'it'} first.`);
    }
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "MA_Requirement" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${Number(currentUserId) || 1}
      WHERE "WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND "IsDeleted" = 0
    `);
    return { message: 'All Requirement records deleted for this Work Order.' };
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
  async getTransactionDetails(workOrderId: number) {
    const itemIds = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId} AND "IsDeleted" = 0
    `);
    const ids = itemIds.map((r) => Number(r.id));
    if (!ids.length) return [];
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        ri."RecId" as id,
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
      WHERE ri."WorkOrderReceiptItemId" IN (${Prisma.join(ids)}) AND ri."IsDeleted" = 0
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
    const totals = await this.getTotalRequirements(workOrderId, tab);
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
        await this.prisma.$executeRaw(Prisma.sql`
          INSERT INTO "MA_Requirement" ("RequirementType", "WorkOrderItemId", "InventoryId", "Quantity", "ColorCardId", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
          VALUES (${requirementType}, ${workOrderItemId}, ${inventoryId}, ${quantity}, ${t.colorCardId ?? null}, now(), ${userId}, 0, gen_random_uuid())
        `);
      }
    }

    return this.getTotalRequirements(workOrderId, tab);
  }

  // Reads back whatever was last Saved (MA_Requirement rows for this Work Order + tab) — used on
  // reopen, so a reload shows the persisted requirement, not a freshly recomputed one.
  async getSavedRequirements(workOrderId: number, tab: RequirementTab) {
    const requirementType = REQUIREMENT_TYPE[tab];
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT req."RecId" as id, req."InventoryId" as "inventoryId", req."Quantity" as quantity,
             req."ColorCardId" as "colorCardId"
      FROM "MA_Requirement" req
      WHERE req."RequirementType" = ${requirementType}
        AND req."WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND req."IsDeleted" = 0
    `);
    const clean = sanitizeRawRow(rows);
    const names = await this.resolveInventoryNames(clean.map((r: any) => r.inventoryId));
    const colors = await this.resolveColorCards(clean.map((r: any) => r.colorCardId));
    return clean.map((r: any) => {
      // A ColorCardId with no live match (the ColorCard was deleted after this Save) resolves to
      // null here — a safe, documented fallback, never a crash; the row itself is still fully
      // readable, it just can no longer show a color label.
      const color = r.colorCardId ? colors.get(String(r.colorCardId)) : null;
      return {
        ...r,
        inventoryCode: r.inventoryId != null ? names.get(Number(r.inventoryId))?.code ?? null : null,
        inventoryName: r.inventoryId != null ? names.get(Number(r.inventoryId))?.name ?? null : null,
        colorCode: color?.code ?? null,
        colorName: color?.name ?? null,
      };
    });
  }
}
