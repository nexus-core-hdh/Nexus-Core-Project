import { Injectable } from '@nestjs/common';
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
  private async getManufacturingQuantityTotals(workOrderId: number): Promise<{ byColor: Map<string, number>; total: number; hasAny: boolean }> {
    const items = await this.workOrderSvc.listItems(workOrderId);
    const primaryItemId = items[0]?.id;
    const byColor = new Map<string, number>();
    let total = 0;
    if (primaryItemId == null) return { byColor, total, hasAny: false };
    const variants = await this.workOrderSvc.listItemVariants(primaryItemId);
    for (const v of variants) {
      const qty = Number(v.quantity) || 0;
      total += qty;
      const [colorRaw] = String(v.explanation || '').split(COLOR_SIZE_SEP);
      const color = colorRaw.trim().toLowerCase();
      if (color) byColor.set(color, (byColor.get(color) || 0) + qty);
    }
    return { byColor, total, hasAny: variants.length > 0 };
  }

  // Resolves which production quantity applies to one BOM line: match its own Variant-1 text
  // against a Manufacturing Quantity Color (case-insensitive/trimmed) — e.g. a "Navy" Main Fabric
  // row only requires Navy's own produced quantity, never the whole order's. A BOM line whose
  // Variant-1 doesn't match any entered Color (blank, or a fixed-variant material like Reflector's
  // "Medium Grey" / Velcro's "Black" that carries no per-garment-color BOM variant at all) falls
  // back to the Work Order's TOTAL production quantity across every color/size — it still needs to
  // be sized to the full run, just without a color to narrow it by. Color is only ever used as a
  // matching key here, never as the material's own identity — the returned quantity is multiplied
  // against that specific BOM line's own Consumption below, so two different BOM
  // items/Inventory Items sharing the same color are never merged into one figure.
  private resolveApplicableQuantity(
    variant1: string | null | undefined,
    mfgQty: { byColor: Map<string, number>; total: number },
  ): { quantity: number; matchedColor: string | null } {
    const key = (variant1 || '').trim().toLowerCase();
    if (key && mfgQty.byColor.has(key)) return { quantity: mfgQty.byColor.get(key)!, matchedColor: (variant1 as string).trim() };
    return { quantity: mfgQty.total, matchedColor: null };
  }

  // Public summary for the Requirement Planning screen's own "Production Quantities" readout —
  // same totals resolveApplicableQuantity's callers already compute, just reshaped for display
  // (Map -> array) instead of a second query.
  async getManufacturingQuantitySummary(workOrderId: number) {
    const { byColor, total, hasAny } = await this.getManufacturingQuantityTotals(workOrderId);
    return {
      hasAny,
      total,
      byColor: Array.from(byColor.entries()).map(([color, quantity]) => ({ color, quantity })),
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

  // ── Requirements grid — Fabric/Trim tabs: the Work Order's own BOM lines for that lineType,
  // unchanged. Trim reuses this exact same method (lineType='trim') rather than a second,
  // near-duplicate implementation — MA_RecipeItem/listBom already natively support Trim (a real
  // BomLineType alongside Fabric/Ornament/Process, RecipeType=2, see work-order.service.ts's own
  // RECIPE_TYPE_BY_LINE_TYPE) with zero code changes needed to that layer.
  async getMaterialRequirements(workOrderId: number, lineType: DirectBomTab) {
    const [lines, mfgQty] = await Promise.all([
      this.workOrderSvc.listBom(workOrderId, lineType),
      this.getManufacturingQuantityTotals(workOrderId),
    ]);
    const names = await this.resolveInventoryNames(lines.map((l: any) => l.inventoryId));
    return lines.map((l: any) => {
      const consumption = Number(l.quantity) || 0;
      const { quantity: applicableQuantity, matchedColor } = this.resolveApplicableQuantity(l.variant1, mfgQty);
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
        // Consumption — this BOM line's OWN existing Quantity field, unchanged (still exactly what
        // bom-tab.tsx's own "Quantity" column already saved/shows on the Work Order's BOM tab).
        consumption,
        // Applicable Quantity — the production quantity resolved for THIS line (Color-matched, or
        // the Work Order's total when unmatched/fixed-variant) — see resolveApplicableQuantity.
        applicableQuantity,
        matchedColor,
        // Requirement = Consumption x Applicable Quantity — the task's own "Required Material =
        // Applicable Production Quantity x BOM Item's Consumption" formula, per BOM line. This is
        // the field getTotalRequirements/save() already sum/persist, so Total Requirements and the
        // saved MA_Requirement now reflect the real requirement instead of a raw BOM-quantity echo.
        quantity: Math.round(consumption * applicableQuantity * 10000) / 10000,
      };
    });
  }

  // ── Requirements grid — Yarn tab: each Fabric BOM row exploded through its OWN Fabric Card's
  // Yarn Recipe (FabricYarnRecipeLine) — the exact same data + the exact same "Calculated
  // Quantity x recipe %" formula bom-tab.tsx's yarnBreakdownFromRecipe already implements
  // client-side, ported here so this screen has one real source instead of duplicating it.
  async getYarnRequirements(workOrderId: number) {
    const [fabricLines, mfgQty] = await Promise.all([
      this.workOrderSvc.listBom(workOrderId, 'fabric'),
      this.getManufacturingQuantityTotals(workOrderId),
    ]);
    const exploded: { fabricLineId: number; yarnInventoryId: number | null; process: string | null; variant1: string | null; variant2: string | null; quantity: number }[] = [];
    for (const line of fabricLines) {
      if (line.inventoryId == null) continue;
      const recipeLines = await this.yarnRecipeSvc.getRecipe(Number(line.inventoryId));
      if (!recipeLines.length) continue;
      // Same "Applicable Quantity x Consumption" step getMaterialRequirements applies, folded in
      // before the existing Wastage/recipe-% math below so that math is completely unchanged in
      // shape — just fed the real fabric requirement instead of the raw per-unit BOM Quantity.
      const { quantity: applicableQuantity } = this.resolveApplicableQuantity(line.variant1, mfgQty);
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
        });
      }
    }
    const names = await this.resolveInventoryNames(exploded.map((e) => e.yarnInventoryId));
    return exploded.map((e, i) => ({
      id: `${e.fabricLineId}-${i}`,
      inventoryId: e.yarnInventoryId,
      inventoryCode: e.yarnInventoryId != null ? names.get(Number(e.yarnInventoryId))?.code ?? null : null,
      inventoryName: e.yarnInventoryId != null ? names.get(Number(e.yarnInventoryId))?.name ?? null : null,
      process: e.process,
      variant1: e.variant1,
      variant1Explanation: null,
      variant2: e.variant2,
      variant2Explanation: null,
      quantity: e.quantity,
    }));
  }

  private async getRequirementRows(workOrderId: number, tab: RequirementTab) {
    return tab === 'yarn' ? this.getYarnRequirements(workOrderId) : this.getMaterialRequirements(workOrderId, tab);
  }

  // ── Total Requirements Table — GROUP BY InventoryId SUM(Quantity) over the rows above. A pure
  // aggregation of already-real data, not an invented business formula (no calculation logic for
  // this exists anywhere in the codebase — confirmed via exhaustive grep).
  async getTotalRequirements(workOrderId: number, tab: RequirementTab) {
    const rows = await this.getRequirementRows(workOrderId, tab);
    const byInventory = new Map<string, { inventoryId: any; inventoryCode: any; inventoryName: any; quantity: number }>();
    for (const r of rows) {
      const key = String(r.inventoryId ?? `unresolved-${r.id}`);
      const existing = byInventory.get(key);
      if (existing) existing.quantity += Number(r.quantity) || 0;
      else byInventory.set(key, { inventoryId: r.inventoryId, inventoryCode: r.inventoryCode, inventoryName: r.inventoryName, quantity: Number(r.quantity) || 0 });
    }
    return Array.from(byInventory.values());
  }

  // "Calculate" — a pure preview/refresh (no persistence side effect); Save below is what
  // actually writes MA_Requirement. Matches the reference screen's own two-step Calculate-then-
  // Save workflow.
  async calculate(workOrderId: number, tab: RequirementTab) {
    return this.getTotalRequirements(workOrderId, tab);
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
  // construction. Also sets the matching lock flag already on MA_WorkOrder — IsRequirementLocked
  // (Fabric), IsTRequirementLocked (Trim), IsYRequirementLocked (Yarn) — all three real,
  // pre-existing columns, confirmed via information_schema.
  async save(workOrderId: number, tab: RequirementTab, userId: number) {
    await this.workOrderSvc.get(workOrderId);
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
        await this.prisma.$executeRaw(Prisma.sql`
          INSERT INTO "MA_Requirement" ("RequirementType", "WorkOrderItemId", "InventoryId", "Quantity", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
          VALUES (${requirementType}, ${workOrderItemId}, ${inventoryId}, ${quantity}, now(), ${userId}, 0, gen_random_uuid())
        `);
      }
    }

    const lockedColumn = tab === 'yarn'
      ? Prisma.sql`"IsYRequirementLocked" = 1, "YRequirementLockedAt" = now(), "YRequirementLockedBy" = ${userId}`
      : tab === 'trim'
      ? Prisma.sql`"IsTRequirementLocked" = 1, "TRequirementLockedAt" = now(), "TRequirementLockedBy" = ${userId}`
      : Prisma.sql`"IsRequirementLocked" = 1, "RequirementLockedAt" = now(), "RequirementLockedBy" = ${userId}`;
    await this.prisma.$executeRaw(Prisma.sql`UPDATE "MA_WorkOrder" SET ${lockedColumn} WHERE "RecId" = ${workOrderId}`);

    return this.getTotalRequirements(workOrderId, tab);
  }

  // Reads back whatever was last Saved (MA_Requirement rows for this Work Order + tab) — used on
  // reopen, so a reload shows the persisted requirement, not a freshly recomputed one.
  async getSavedRequirements(workOrderId: number, tab: RequirementTab) {
    const requirementType = REQUIREMENT_TYPE[tab];
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT req."RecId" as id, req."InventoryId" as "inventoryId", req."Quantity" as quantity
      FROM "MA_Requirement" req
      WHERE req."RequirementType" = ${requirementType}
        AND req."WorkOrderItemId" IN (SELECT "RecId" FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId})
        AND req."IsDeleted" = 0
    `);
    const clean = sanitizeRawRow(rows);
    const names = await this.resolveInventoryNames(clean.map((r: any) => r.inventoryId));
    return clean.map((r: any) => ({
      ...r,
      inventoryCode: r.inventoryId != null ? names.get(Number(r.inventoryId))?.code ?? null : null,
      inventoryName: r.inventoryId != null ? names.get(Number(r.inventoryId))?.name ?? null : null,
    }));
  }
}
