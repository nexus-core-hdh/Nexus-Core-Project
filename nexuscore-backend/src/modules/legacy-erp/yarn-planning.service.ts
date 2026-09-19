import { Injectable } from '@nestjs/common';
import { FabricPlanningService } from './fabric-planning.service';
import { FabricYarnRequirementsService } from './fabric-yarn-requirements.service';

// ── Yarn Planning — NOT a second calculation engine, and NOT a duplicate of Fabric Planning. This
// is the exact same cross-Work-Order planning/reporting pattern Fabric Planning already
// established, reused as-is via FabricPlanningService's own now-shared helpers, with exactly ONE
// substitution: the per-Work-Order requirement source is
// FabricYarnRequirementsService.getYarnRequirements(workOrderId) — the SAME engine the Fabric/Yarn
// Requirements screen's own Yarn tab already uses (Fabric BOM line -> color-wise Applicable
// Quantity -> Will-Be-Cut -> Common/Color-Specific Yarn Recipe resolution -> Yarn Recipe % ->
// Requirement Calculation Unit conversion — all untouched, called exactly as that screen calls it,
// never re-derived here) — instead of getMaterialRequirements(workOrderId, 'fabric').
//
// Reused verbatim from FabricPlanningService (see that file's own comments on each, added when
// their visibility was widened for this exact reuse):
// - findCandidateWorkOrderIds — a Work Order is a Yarn Planning candidate under precisely the same
//   condition it's a Fabric Planning candidate (a resolvable Fabric BOM source), since Yarn
//   Requirement is always derived FROM that same Fabric BOM.
// - resolveHeaders — identical Work Order/Style/Customer header shape.
// - aggregatePurchase / aggregateReceipts — generic (Work Order, Inventory Item) procurement/
//   receiving aggregations; these never distinguished Fabric from Yarn to begin with (IM_
//   OrderReceiptItem/IM_Receipt have no Fabric/Yarn-specific column), so applying them to Yarn
//   Inventory Item ids is the same real query against the same real tables.
//
// Row identity/grouping matches getYarnRequirements' own — one row per (Work Order, exploded Yarn
// line), i.e. exactly what the Fabric/Yarn Requirements screen's own Yarn tab would show for that
// Work Order, merged with the same header fields Fabric Planning uses. Procurement/receiving
// columns are real data at (Work Order, Yarn Inventory Item) granularity ONLY (same documented
// limitation as Fabric Planning: neither table carries a Production Color dimension), so those
// columns are the SAME total across every color-split row of the same Yarn item within one Work
// Order.
//
// Consumption/Applicable Quantity — deliberately NOT surfaced here (unlike Fabric Planning).
// getYarnRequirements' own row shape has no single "Consumption" figure of its own: a Yarn row's
// Requirement is already the product of the source Fabric line's Consumption x Applicable Quantity
// x Wastage x Recipe % (see that method's own comment) collapsed into one number, not a separate
// per-unit rate a planning screen could meaningfully show alongside a quantity. Inventing a
// "Consumption" column here would misrepresent a figure that doesn't exist at this granularity —
// the same "don't fabricate a column with no real backing" rule this task itself states.
@Injectable()
export class YarnPlanningService {
  constructor(
    private readonly fabricPlanningSvc: FabricPlanningService,
    private readonly requirementsSvc: FabricYarnRequirementsService,
  ) {}

  async listPlanningRows(filters: {
    orderNo?: string; styleQuery?: string; customerQuery?: string;
    inventoryQuery?: string; processQuery?: string; variantQuery?: string; colorQuery?: string;
  }) {
    const workOrderIds = await this.fabricPlanningSvc.findCandidateWorkOrderIds(filters);
    if (!workOrderIds.length) return [];
    const headers = await this.fabricPlanningSvc.resolveHeaders(workOrderIds);

    // One getYarnRequirements call per candidate Work Order — same "one call per Work Order, not
    // per output row" shape as Fabric Planning's own listPlanningRows (see that method's own
    // comment); getYarnRequirements itself already batches everything it needs (recipe resolution,
    // inventory/color name resolution, unit resolution) inside that single call.
    const perWoRows = await Promise.all(workOrderIds.map(async (workOrderId) => {
      const header = headers.get(workOrderId);
      if (!header) return [];
      const rows = await this.requirementsSvc.getYarnRequirements(workOrderId);
      return rows.map((r: any) => ({ workOrderId, header, ...r }));
    }));
    let flat = perWoRows.flat();

    // Line-level filters — same fields/semantics as Fabric Planning's own (Inventory
    // code-or-name, Process, Variant-1, Production-Color-or-Material-Color) — applied here since
    // they only exist once getYarnRequirements has resolved the real exploded Yarn rows per Work
    // Order. garmentColor is included alongside variant2 for the color filter (unlike Fabric
    // Planning) because a Yarn row's own variant2 mirrors the SOURCE Fabric line's raw mapping
    // (can be blank for a common material before color-expansion), while garmentColor is always
    // the actually-resolved Production Color for that specific exploded row — the same field this
    // screen's own "Production Color" column displays.
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
      flat = flat.filter((r) => norm(r.variant2).includes(q) || norm(r.garmentColor).includes(q) || norm(r.colorName).includes(q) || norm(r.colorCode).includes(q));
    }
    if (!flat.length) return [];

    const inventoryIds = Array.from(new Set(flat.map((r) => r.inventoryId).filter((id): id is number => id != null)));
    const [purchaseByKey, receiptsByKey] = await Promise.all([
      this.fabricPlanningSvc.aggregatePurchase(workOrderIds, inventoryIds),
      this.fabricPlanningSvc.aggregateReceipts(workOrderIds, inventoryIds),
    ]);

    return flat.map((r) => {
      const key = r.inventoryId != null ? `${r.workOrderId}:${r.inventoryId}` : null;
      const receipts = key ? receiptsByKey.get(key) : undefined;
      const purchase = key ? purchaseByKey.get(key) ?? 0 : 0;
      const required = Number(r.quantity) || 0;
      const received = receipts?.received ?? 0;
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
        // Production Color — the exploded row's own resolved color (see the filter comment above
        // on why this differs from Fabric Planning's raw variant2), never blank for a real row.
        variant2: r.garmentColor ?? r.variant2,
        // Material Color — the SOURCE Fabric line's own Material Color this Yarn row was exploded
        // from (getYarnRequirements' own colorCardId/colorCode/colorName — see that method's own
        // comment: "Yarn has no color selection of its own... it inherits the Fabric BOM line's
        // REAL Material Color it was exploded from").
        colorCardId: r.colorCardId,
        colorCode: r.colorCode,
        colorName: r.colorName,
        requirementUnit: r.requirementUnit,
        required,
        purchase,
        received,
        processSent: receipts?.processSent ?? 0,
        processReceived: receipts?.processReceived ?? 0,
        manufacturingSend: receipts?.manufacturingSend ?? 0,
        // Same Required-minus-Received formula as Fabric Planning — no second balance concept.
        balance: Math.round((required - received) * 10000) / 10000,
      };
    });
  }
}
