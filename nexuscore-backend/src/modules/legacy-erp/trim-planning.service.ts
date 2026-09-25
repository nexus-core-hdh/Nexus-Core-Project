import { Injectable } from '@nestjs/common';
import { FabricPlanningService } from './fabric-planning.service';
import { FabricYarnRequirementsService } from './fabric-yarn-requirements.service';
import { ItemAllocationService } from './item-allocation.service';

// ── Trim Planning — NOT a second calculation engine, and NOT a duplicate of Fabric/Yarn Planning.
// This is the exact same cross-Work-Order planning/reporting pattern Fabric Planning established
// (and Yarn Planning already reuses), applied to Trim's own real BOM source, with exactly TWO
// substitutions versus Fabric Planning:
//
// 1. Requirement source: FabricYarnRequirementsService.getMaterialRequirements(workOrderId,
//    'trim') — the SAME engine call Fabric Planning makes with 'fabric' instead. This is not a
//    guess: 'trim' is a first-class DirectBomTab this method has supported since the Fabric/Trim/
//    Yarn Requirements screen shipped its own Trim tab (see that method's own comment: "Trim
//    reuses this exact same method (lineType='trim') rather than a second, near-duplicate
//    implementation — MA_RecipeItem/listBom already natively support Trim (RecipeType=2)"). Its
//    output shape is IDENTICAL to Fabric's (consumption/applicableQuantity are both real, present
//    fields for Trim — unlike Yarn, which collapses them; see yarn-planning.service.ts's own
//    comment on why it omits Consumption), so Trim Planning's own row shape below mirrors Fabric
//    Planning's, not Yarn Planning's.
// 2. Candidate Work Order scoping: findCandidateWorkOrderIds(..., recipeType=2) — a Work Order's
//    OWN Trim BOM lives under MA_Recipe.RecipeType=2 (work-order.service.ts's own
//    RECIPE_TYPE_BY_LINE_TYPE: fabric=1, trim=2), not 1. Live-verified against this database: no
//    Work Order currently owns a real RecipeType=2 row of its own, but W/O-000212 (StyleCardId ->
//    SC-2026-8607) resolves a real Trim line (TRIM-00003, qty 10) via the Style Card BOM fallback
//    (StyleBomLine.lineType='trim') — exactly the "Work Order-specific BOM → otherwise Style Card
//    BOM" hierarchy getMaterialRequirements/resolveBomLines already implement, unchanged here.
//
// Reused verbatim from FabricPlanningService (injected, not copied — see that file's own comments
// on each, widened for this exact reuse the same way Yarn Planning's own reuse already
// established):
// - findCandidateWorkOrderIds(filters, limit, 2) — see point 2 above.
// - resolveHeaders — identical Work Order/Style/Customer header shape.
// - aggregatePurchase / aggregateReceipts — generic (Work Order, Inventory Item) procurement/
//   receiving aggregations; IM_OrderReceiptItem/IM_Receipt have no Fabric/Trim/Yarn-specific
//   column, so applying them to a Trim Inventory Item id is the same real query against the same
//   real tables Fabric/Yarn Planning already use.
//
// Row identity/grouping matches getMaterialRequirements' own — one row per (Work Order, BOM line,
// Production Color scope), i.e. exactly what the Fabric/Trim/Yarn Requirements screen's own Trim
// tab would show for that Work Order. Procurement/receiving columns are real data at (Work Order,
// Trim Inventory Item) granularity ONLY — same documented limitation as Fabric/Yarn Planning
// (neither IM_Receipt nor IM_OrderReceipt carries a Production Color dimension).
@Injectable()
export class TrimPlanningService {
  constructor(
    private readonly fabricPlanningSvc: FabricPlanningService,
    private readonly requirementsSvc: FabricYarnRequirementsService,
    private readonly allocationSvc: ItemAllocationService,
  ) {}

  async listPlanningRows(filters: {
    orderNo?: string; styleQuery?: string; customerQuery?: string;
    inventoryQuery?: string; processQuery?: string; variantQuery?: string; colorQuery?: string;
  }) {
    const workOrderIds = await this.fabricPlanningSvc.findCandidateWorkOrderIds(filters, 60, 2);
    if (!workOrderIds.length) return [];
    const headers = await this.fabricPlanningSvc.resolveHeaders(workOrderIds);

    // One getMaterialRequirements(workOrderId, 'trim') call per candidate Work Order — same "one
    // call per Work Order, not per output row" shape as Fabric Planning's own listPlanningRows.
    const perWoRows = await Promise.all(workOrderIds.map(async (workOrderId) => {
      const header = headers.get(workOrderId);
      if (!header) return [];
      const rows = await this.requirementsSvc.getMaterialRequirements(workOrderId, 'trim');
      return rows.map((r: any) => ({ workOrderId, header, ...r }));
    }));
    let flat = perWoRows.flat();

    // Line-level filters — same fields/semantics as Fabric Planning's own (Inventory
    // code-or-name, Process, Variant-1, Production-Color-or-Material-Color) — applied here since
    // they only exist once getMaterialRequirements has resolved the real BOM lines per Work Order.
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    if (filters.inventoryQuery) {
      const q = norm(filters.inventoryQuery);
      flat = flat.filter((r) => norm(r.inventoryCode).includes(q) || norm(r.inventoryName).includes(q));
    }
    if (filters.processQuery) {
      const q = norm(filters.processQuery);
      flat = flat.filter((r) => norm(r.process).includes(q));
    }
    if (filters.variantQuery) {
      const q = norm(filters.variantQuery);
      flat = flat.filter((r) => norm(r.variant1).includes(q));
    }
    if (filters.colorQuery) {
      const q = norm(filters.colorQuery);
      flat = flat.filter((r) => norm(r.variant2).includes(q) || norm(r.colorName).includes(q) || norm(r.colorCode).includes(q));
    }
    if (!flat.length) return [];

    const inventoryIds = Array.from(new Set(flat.map((r) => r.inventoryId).filter((id): id is number => id != null)));
    const [purchaseByKey, receiptsByKey, subcontractByKey, allocatedByKey] = await Promise.all([
      this.fabricPlanningSvc.aggregatePurchase(workOrderIds, inventoryIds),
      this.fabricPlanningSvc.aggregateReceipts(workOrderIds, inventoryIds),
      this.fabricPlanningSvc.aggregateSubcontractReceipts(workOrderIds, inventoryIds),
      this.allocationSvc.aggregateAllocations(workOrderIds, inventoryIds),
    ]);

    return flat.map((r) => {
      const key = r.inventoryId != null ? `${r.workOrderId}:${r.inventoryId}` : null;
      const receipts = key ? receiptsByKey.get(key) : undefined;
      const purchase = key ? purchaseByKey.get(key) ?? 0 : 0;
      const allocated = key ? allocatedByKey.get(key) ?? 0 : 0;
      const required = Number(r.quantity) || 0;
      const received = receipts?.received ?? 0;
      // Same dynamic per-Subcontract-Type breakdown as Fabric Planning — see
      // fabric-planning.service.ts's own aggregateSubcontractReceipts comment.
      const subcontractTransactions = Object.fromEntries(
        Array.from((key ? subcontractByKey.get(key) : undefined) ?? new Map()).map(([typeId, v]) => [String(typeId), v]),
      );
      return {
        id: `${r.workOrderId}:${r.id}`,
        workOrderId: r.workOrderId,
        workOrderNo: r.header.workOrderNo,
        workOrderDate: r.header.workOrderDate,
        styleCode: r.header.styleCode,
        styleName: r.header.styleName,
        customerOrderNo: r.header.customerOrderNo,
        deliveryDate: r.header.deliveryDate,
        orderQuantity: r.header.quantity,
        customerCode: r.header.customerCode,
        customerName: r.header.customerName,
        inventoryId: r.inventoryId,
        inventoryCode: r.inventoryCode,
        inventoryName: r.inventoryName,
        process: r.process,
        variant1: r.variant1,
        variant1Explanation: r.variant1Explanation,
        variant2: r.variant2,
        colorCardId: r.colorCardId,
        colorCode: r.colorCode,
        colorName: r.colorName,
        consumption: r.consumption,
        applicableQuantity: r.applicableQuantity,
        requirementUnit: r.requirementUnit,
        // NEW, additive — see getMaterialRequirements' own comment on why this differs from
        // requirementUnit (real Consumption Unit, e.g. "cone" for TRIM-00003, vs. the separate,
        // often-unconfigured "Requirement Calculation" unit). The frontend's Unit column falls
        // back to this when requirementUnit is null, rather than showing a blank dash for a real,
        // already-quantified row.
        consumptionUnit: r.consumptionUnit,
        required,
        purchase,
        received,
        subcontractTransactions,
        manufacturingSend: receipts?.manufacturingSend ?? 0,
        allocated,
        // Same Required-minus-Received formula as Fabric/Yarn Planning — no second balance
        // concept. Unaffected by subcontractTransactions/allocated, same as Fabric Planning's own balance.
        balance: Math.round((required - received) * 10000) / 10000,
      };
    });
  }
}
