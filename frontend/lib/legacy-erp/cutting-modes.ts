// Cutting Card — the two ways of cutting a Work Order (chosen on the Cutting Card screen, switchable
// from either Cutting screen). Both open the SAME Cutting Entry screen
// (components/legacy-erp/cutting-entry-screen.tsx):
//  - "color": Colour-wise Cutting — one Production Color + Fabric (./cutting-card/entry);
//  - "order": Complete Order Cutting — every Production Color of the Work Order for one Fabric
//    (./cutting-card/order), with one size-wise summary added up across the colors.
// Both read and write the same per-(Work Order, Color, Fabric) Cutting Cards, so switching modes
// never copies, merges or loses an entry.

export type CuttingMode = "color" | "order";

export const CUTTING_MODES: { value: CuttingMode; label: string; hint: string }[] = [
  { value: "color", label: "Colour-wise", hint: "Cut one Production Color at a time" },
  { value: "order", label: "Complete Order", hint: "Cut every Production Color of the Work Order together" },
];

export function cuttingHref(mode: CuttingMode, workOrderId: number, color?: string | null): string {
  if (mode === "order") return `/legacy-erp/cutting-card/order?id=${workOrderId}`;
  return `/legacy-erp/cutting-card/entry?id=${workOrderId}&color=${encodeURIComponent(color ?? "")}`;
}

export interface CuttingSizeRow { sizeCode: string; orderQty: number; willBeCutQty: number; cutQty: number; less: number; over: number }
export type CuttingTotals = Omit<CuttingSizeRow, "sizeCode">;

/** Complete Order's summary rows, in the row shape Colour-wise shows for one color: the server's
 *  per-size totals (cutting-card.service.ts getOrderCutting — each figure already the sum of the
 *  colors' own per-size figures) in the server's size order; a size it has no total for shows 0. */
export function orderSummaryRows(sizes: string[], bySize: Record<string, CuttingTotals>): CuttingSizeRow[] {
  return sizes.map((sizeCode) => ({ sizeCode, ...(bySize[sizeCode] ?? { orderQty: 0, willBeCutQty: 0, cutQty: 0, less: 0, over: 0 }) }));
}
