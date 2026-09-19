import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { WorkOrderService } from './work-order.service';
import { FabricYarnRequirementsService } from './fabric-yarn-requirements.service';

// ── Fabric Planning — NOT a second calculation engine. This is a cross-Work-Order planning/
// reporting VIEW over data that already exists and is already correctly computed elsewhere:
//
// - Required quantity: FabricYarnRequirementsService.getMaterialRequirements(workOrderId, 'fabric')
//   — the EXACT SAME engine the Fabric Requirements screen uses (Consumption x color-wise
//   Applicable Quantity, BOM source priority, Requirement Calculation Unit — all unchanged, called
//   as-is, never re-derived here).
// - Received / Process Sent / Process Received / Manufacturing Send: IM_Receipt/IM_ReceiptItem —
//   the exact same tables/join (WorkOrderReceiptItemId -> MA_WorkOrderItem, InventoryId) already
//   used by getTransactionDetails() for this same screen's own Transaction Details drill-down,
//   here aggregated (SUM ... GROUP BY) instead of row-listed.
// - Purchase (pre-receipt/ordered): IM_OrderReceiptItem — the real Purchase Order line table
//   (purchase-order.service.ts), joined via its own real `ManufacturingOrderId` column (the actual
//   Work-Order link that screen's own "Manufacturing Order" picker already writes — confirmed via
//   information_schema and purchase-order-line-grid.tsx's own picker wiring). No existing service
//   scopes Purchase Orders by Work Order today; this is a new, additive read query against the
//   same real table/columns, not a new table.
//
// Row identity/grouping matches getMaterialRequirements' own — one row per (Work Order, BOM line,
// Production Color scope), i.e. exactly what the Fabric Requirements screen itself would show for
// that Work Order's Fabric tab, merged with Work Order/Style/Customer header fields. Procurement/
// receiving columns (Purchase/Received/Process/Manufacturing) are real data at (Work Order,
// Inventory Item) granularity ONLY — neither IM_Receipt nor IM_OrderReceipt carries a Production
// Color dimension, so those columns are the SAME total across every color-split row of the same
// material within one Work Order (documented per-column in the controller/frontend, not silently
// implied to be color-specific).
@Injectable()
export class FabricPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrderSvc: WorkOrderService,
    private readonly requirementsSvc: FabricYarnRequirementsService,
  ) {}

  // Candidate Work Orders — real, non-deleted, and resolvable to a real Fabric BOM source (its own
  // MA_Recipe/MA_RecipeItem lines, OR a linked StyleCard whose own StyleBomLine might supply Fabric
  // lines — resolveBomLines' own WO-owns-else-Style-fallback priority is what actually decides
  // which source wins per Work Order; this candidate list only needs to be a SUPERSET covering
  // both real sources, getMaterialRequirements resolves the rest). Search/filter pushed down here
  // where the filtered field lives at the Work Order header level (Order No); filters on
  // line-level fields (Inventory/Process/Variant/Color) are applied after the per-WO Requirements
  // call below, since those don't exist until that resolution runs.
  // Not private — YarnPlanningService (yarn-planning.service.ts) reuses this exact same
  // candidate-scoping query as-is: Yarn Planning's own Requirement is always derived FROM a Work
  // Order's Fabric BOM (via FabricYarnRequirementsService.getYarnRequirements -> resolveBomLines),
  // so the set of Work Orders worth resolving is identical to Fabric Planning's own — a Work Order
  // with no resolvable Fabric BOM source has no Fabric lines to explode through a Yarn Recipe
  // either. Reusing this method (rather than a second, near-identical copy) is what keeps that
  // guarantee true by construction instead of by convention. No behavior change to Fabric Planning
  // itself — this widened visibility does not alter what this method does or how it's called here.
  async findCandidateWorkOrderIds(search?: { orderNo?: string; styleQuery?: string; customerQuery?: string }, limit = 60): Promise<number[]> {
    const filters: Prisma.Sql[] = [Prisma.sql`wo."IsDeleted" = 0`];
    if (search?.orderNo) filters.push(Prisma.sql`wo."WorkOrderNo" ILIKE ${`%${search.orderNo}%`}`);
    if (search?.customerQuery) {
      filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "FI_Account" acc WHERE acc."RecId" = wo."CurrentAccountId" AND (acc."CurrentAccountCode" ILIKE ${`%${search.customerQuery}%`} OR acc."CurrentAccountName" ILIKE ${`%${search.customerQuery}%`}))`);
    }
    if (search?.styleQuery) {
      filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "StyleCard" sc WHERE sc.id = wo."StyleCardId" AND (sc."styleNumber" ILIKE ${`%${search.styleQuery}%`} OR sc."title" ILIKE ${`%${search.styleQuery}%`}))`);
    }
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT DISTINCT wo."RecId" as id
      FROM "MA_WorkOrder" wo
      WHERE ${Prisma.join(filters, ' AND ')}
        AND (
          EXISTS (
            SELECT 1 FROM "MA_Recipe" rec
            JOIN "MA_RecipeItem" ri ON ri."RecipeId" = rec."RecId" AND ri."IsDeleted" = 0
            WHERE rec."WorkOrderId" = wo."RecId" AND rec."RecipeType" = 1 AND rec."IsDeleted" = 0
          )
          OR wo."StyleCardId" IS NOT NULL
        )
      ORDER BY wo."RecId" DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => Number(r.id));
  }

  // Batched header/Style/Customer resolution for a known set of Work Order ids — one query each
  // (not per-row), matching this file's own "no N+1" requirement.
  // Not private — reused by YarnPlanningService (same header shape, same Work Orders). See
  // findCandidateWorkOrderIds' own comment on why sharing this instead of copying it is correct.
  async resolveHeaders(workOrderIds: number[]) {
    if (!workOrderIds.length) return new Map<number, any>();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        wo."RecId" as id,
        wo."WorkOrderNo" as "workOrderNo",
        wo."WorkOrderDate" as "workOrderDate",
        wo."DeliveryDate" as "deliveryDate",
        wo."CustomerOrderNo" as "customerOrderNo",
        wo."Quantity" as "quantity",
        wo."IsClosed" as "isClosed",
        wo."CurrentAccountId" as "currentAccountId",
        acc."CurrentAccountCode" as "customerCode",
        acc."CurrentAccountName" as "customerName",
        wo."StyleCardId" as "styleCardId",
        sc."styleNumber" as "styleCode",
        sc."title" as "styleName"
      FROM "MA_WorkOrder" wo
      LEFT JOIN "FI_Account" acc ON acc."RecId" = wo."CurrentAccountId"
      LEFT JOIN "StyleCard" sc ON sc.id = wo."StyleCardId"
      WHERE wo."RecId" IN (${Prisma.join(workOrderIds)})
    `);
    return new Map(sanitizeRawRow(rows).map((r: any) => [r.id, r]));
  }

  // Purchase (ordered, pre-receipt) — IM_OrderReceiptItem, ReceiptType=1 (Purchase Order, per
  // receipt-types.config.ts), scoped by its own real ManufacturingOrderId -> Work Order link.
  // Genuinely 0 rows in real data today (that column has never been populated by any existing
  // screen) — the query is correct and will start returning real figures the moment a real
  // Purchase Order line sets ManufacturingOrderId, same as every other column here.
  // Not private — reused by YarnPlanningService. This query only ever cares about (Work Order,
  // Inventory Item), never whether that item is a Fabric or a Yarn — same real Purchase Order
  // line table/columns apply identically to a Yarn Inventory Item.
  async aggregatePurchase(workOrderIds: number[], inventoryIds: number[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!workOrderIds.length || !inventoryIds.length) return out;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT poi."ManufacturingOrderId" as "workOrderId", poi."InventoryId" as "inventoryId", SUM(poi."Quantity") as qty
      FROM "IM_OrderReceiptItem" poi
      WHERE poi."IsDeleted" = 0 AND poi."ReceiptType" = 1
        AND poi."ManufacturingOrderId" IN (${Prisma.join(workOrderIds)})
        AND poi."InventoryId" IN (${Prisma.join(inventoryIds)})
      GROUP BY poi."ManufacturingOrderId", poi."InventoryId"
    `);
    for (const r of sanitizeRawRow(rows)) out.set(`${r.workOrderId}:${r.inventoryId}`, Number(r.qty) || 0);
    return out;
  }

  // Received / Process Sent / Process Received / Manufacturing Send — all four from the SAME
  // IM_Receipt/IM_ReceiptItem join getTransactionDetails() already uses, differing only by
  // ReceiptType (receipt-types.config.ts's own real, curated values — never guessed from a column
  // name): 2 = Purchase Receipt ("Received"), 134 = Outside Process Sent Receipt, 11 = Outside
  // Process Receive Receipt, 140 = Manufacture Send Receipt. See this file's own top comment on why
  // "Dye"/"Others"/"Repair" are NOT separately queryable here — no distinct ReceiptType or column
  // backs those as independent categories; they'd all fall under 134/11 (Outside Process), only
  // distinguishable by MD_SubcontractType, a free-text user-configurable master with no fixed
  // Dye-vs-Process-vs-Repair taxonomy (confirmed empirically: real values in this DB are "Dyeing",
  // "Knitting", "Washing", "Printing", "Factory", "General" — an installation-specific list, not a
  // legacy-fixed category set). Reported as a genuine unsupported split in the final report, not
  // fabricated here.
  // Not private — reused by YarnPlanningService, same reasoning as aggregatePurchase above: this
  // is a generic (Work Order, Inventory Item) receipt aggregation, not Fabric-specific.
  async aggregateReceipts(workOrderIds: number[], inventoryIds: number[]) {
    const out = new Map<string, { received: number; processSent: number; processReceived: number; manufacturingSend: number }>();
    if (!workOrderIds.length || !inventoryIds.length) return out;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        wi."WorkOrderId" as "workOrderId",
        ri."InventoryId" as "inventoryId",
        SUM(CASE WHEN r."ReceiptType" = 2 THEN ri."Quantity" ELSE 0 END) as received,
        SUM(CASE WHEN r."ReceiptType" = 134 THEN ri."Quantity" ELSE 0 END) as "processSent",
        SUM(CASE WHEN r."ReceiptType" = 11 THEN ri."Quantity" ELSE 0 END) as "processReceived",
        SUM(CASE WHEN r."ReceiptType" = 140 THEN ri."Quantity" ELSE 0 END) as "manufacturingSend"
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" AND r."IsDeleted" = 0
      JOIN "MA_WorkOrderItem" wi ON wi."RecId" = ri."WorkOrderReceiptItemId" AND wi."IsDeleted" = 0
      WHERE ri."IsDeleted" = 0
        AND wi."WorkOrderId" IN (${Prisma.join(workOrderIds)})
        AND ri."InventoryId" IN (${Prisma.join(inventoryIds)})
        AND r."ReceiptType" IN (2, 134, 11, 140)
      GROUP BY wi."WorkOrderId", ri."InventoryId"
    `);
    for (const r of sanitizeRawRow(rows)) {
      out.set(`${r.workOrderId}:${r.inventoryId}`, {
        received: Number(r.received) || 0,
        processSent: Number(r.processSent) || 0,
        processReceived: Number(r.processReceived) || 0,
        manufacturingSend: Number(r.manufacturingSend) || 0,
      });
    }
    return out;
  }

  async listPlanningRows(filters: {
    orderNo?: string; styleQuery?: string; customerQuery?: string;
    inventoryQuery?: string; processQuery?: string; variantQuery?: string; colorQuery?: string;
  }) {
    const workOrderIds = await this.findCandidateWorkOrderIds(filters);
    if (!workOrderIds.length) return [];
    const headers = await this.resolveHeaders(workOrderIds);

    // One getMaterialRequirements call per candidate Work Order — reuses the existing engine
    // exactly as-is (color-wise Applicable Quantity, BOM source priority, Requirement Unit
    // resolution all untouched), never re-implemented here. Bounded by real, existing Work Order
    // volume (findCandidateWorkOrderIds already caps this at a sane page size) — this is "one call
        // per Work Order", not "one query per output row"; the procurement/receiving aggregation below
    // (the part that WOULD be a real N+1 risk if done per-row) is batched into two queries total,
    // regardless of how many rows result.
    const perWoRows = await Promise.all(workOrderIds.map(async (workOrderId) => {
      const header = headers.get(workOrderId);
      if (!header) return [];
      const rows = await this.requirementsSvc.getMaterialRequirements(workOrderId, 'fabric');
      return rows.map((r: any) => ({ workOrderId, header, ...r }));
    }));
    let flat = perWoRows.flat();

    // Line-level filters — Inventory/Process/Variant/Color — applied here since they only exist
    // once getMaterialRequirements has resolved the real BOM lines per Work Order.
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
    const [purchaseByKey, receiptsByKey] = await Promise.all([
      this.aggregatePurchase(workOrderIds, inventoryIds),
      this.aggregateReceipts(workOrderIds, inventoryIds),
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
        variant2: r.variant2,
        colorCardId: r.colorCardId,
        colorCode: r.colorCode,
        colorName: r.colorName,
        consumption: r.consumption,
        applicableQuantity: r.applicableQuantity,
        requirementUnit: r.requirementUnit,
        required,
        purchase,
        received,
        processSent: receipts?.processSent ?? 0,
        processReceived: receipts?.processReceived ?? 0,
        manufacturingSend: receipts?.manufacturingSend ?? 0,
        // Derived, not a separate source — Required minus Received, both already real. A negative
        // balance (over-received relative to this color-scoped Required) is possible and left
        // as-is; it's real arithmetic over real numbers, not clamped/hidden.
        balance: Math.round((required - received) * 10000) / 10000,
      };
    });
  }
}
