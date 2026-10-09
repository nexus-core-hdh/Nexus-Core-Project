// Work Order BOM line <-> grid row mapping (MA_RecipeItem shape), used by BomTab in "workOrder" mode:
// load() and Transfer from Style Card both turn lines into rows with workOrderLineToBomRow, and
// save() (plus its unsaved-change tracking) turns rows back into lines with workOrderRowToRecipeLine.
// Pure functions with no UI imports, so the round trip is testable (scripts/work-order-bom-lines.test.mjs).
import type { BomRow } from "./bom-tab";

// Same as grid-input.tsx's num (kept local so this module stays free of UI imports).
const num = (v: any) => (v === null || v === undefined || v === "" ? 0 : Number(v));

/** MA_RecipeItem line (a listBom row, or a Transfer-from-Style-Card line of the same shape) -> grid
 *  row. fabricCode/fabricName/unit have no denormalized column there; codes come from `cardCache`
 *  (Fabric/Trim cards by id) and unit text is patched in once its card's units resolve. */
export function workOrderLineToBomRow(l: any, cardCache: Record<string, any>): BomRow {
  const src = l.inventoryId != null ? cardCache[String(l.inventoryId)] : null;
  return {
    id: l.id, lineType: l.lineType, fabricInventoryId: l.inventoryId ?? null,
    fabricCode: src?.inventoryCode || "", fabricName: src?.inventoryName || "",
    explanation: l.explanation || "", placement: l.uD_Placement || "", process: l.uD_Remarks || "",
    variant: l.variant1 || "", variant2: l.variant2 || "", rowColumn: "", colorCardId: l.colorCardId || "",
    // No relation join available here (MA_RecipeItem is a raw legacy table) — the display
    // label is backfilled from `colors` once it loads, same as Work Order mode already does
    // for `unit` below via itemUnitsByCard.
    color: "",
    extraColorCardIds: [],
    willBeCut: !!l.isCutting, mainFabric: !!l.isMaster, unitId: l.unitId ?? null, unit: "",
    marketLength: num(l.markerLength), marketWidth: num(l.markerWidth), marketWeight: num(l.m2Weight),
    quantity: num(l.quantity),
    wastePct: num(l.wastage), dyeWastagePct: 0, otherWastagePct: 0,
    unitPrice: num(l.price), component: l.uD_Component || "", dia: l.uD_Dia || "", gauge: l.uD_Guage || "",
    finishWidth: l.uD_FinishWidth || "", finishRoute: l.uD_FinishRoute || "", revision: l.uD_Revision || "",
    // NOT for Requirement / Use Fix Quantity: MA_RecipeItem.NotForRequirement/IsFixQuantity
    // (the Work Order's effective value, inherited from the Style Card unless changed here).
    // The rest of this extension has no MA_RecipeItem column — blank here, never sent.
    notForRequirement: !!l.notForRequirement, useFixQuantity: !!l.isFixQuantity, printWastagePct: 0, forex: "", manProductCode: "",
    orderCondition: "", condition: "", reasonRevision: "", dyeingInstruction: "", remarks: "",
    category: "", bodyColor: "", printColor: "", dyeingProcess: "",
  };
}

/** Grid row -> the MA_RecipeItem line save() persists via upsertBom. */
export function workOrderRowToRecipeLine(r: BomRow) {
  return {
    inventoryId: r.fabricInventoryId ?? undefined, explanation: r.explanation || undefined,
    variant1: r.variant || undefined, variant2: r.variant2 || undefined, isCutting: r.willBeCut ? 1 : 0, isMaster: r.mainFabric ? 1 : 0,
    unitId: r.unitId ?? undefined, quantity: r.quantity, price: r.unitPrice,
    // Real ColorCard.id (text/uuid) as of the 20260909130000 migration — previously this
    // was wrongly cast with Number(), which silently produced NaN for every UUID and meant
    // Work Order's own "Choose Color" selection never actually persisted.
    colorCardId: r.colorCardId || undefined,
    // Same combined-total mapping previewBomTransferFromStyleCard uses — see RECIPE_ITEM_COLUMNS'
    // own comment on why only one Wastage column exists here.
    wastage: (r.wastePct || 0) + (r.dyeWastagePct || 0) + (r.otherWastagePct || 0) + (r.printWastagePct || 0),
    uD_Component: r.component || undefined, uD_Dia: r.dia || undefined, uD_Guage: r.gauge || undefined,
    uD_FinishWidth: r.finishWidth || undefined, uD_FinishRoute: r.finishRoute || undefined,
    uD_Revision: r.revision || undefined, uD_Placement: r.placement || undefined, uD_Remarks: r.process || undefined,
    markerWidth: r.marketWidth || undefined, markerLength: r.marketLength || undefined, m2Weight: r.marketWeight || undefined,
    notForRequirement: r.notForRequirement ? 1 : 0, isFixQuantity: r.useFixQuantity ? 1 : 0,
  };
}
