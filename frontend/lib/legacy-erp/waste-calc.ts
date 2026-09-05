const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * The one centralized "sum independent waste %s, then multiply the ORIGINAL base quantity once"
 * calculation for BOM/Yarn Recipe waste — used by both style-cards/[id]/_components/bom-tab.tsx
 * (Fabric row's own Waste/Dye Wastage/Other Wastage %, and Yarn distribution from the resulting
 * Final Quantity) and components/legacy-erp/yarn-recipe-dialog.tsx (each Yarn row's own Waste %/
 * Dye Wastage %, applied to that row's own allocation). Waste percentages are ADDED together
 * first (independent %s of the same base), then applied as a SINGLE multiplier — never
 * recalculated against an already-inflated quantity (no compounding):
 *
 *   Total Waste % = sum of the given percentages
 *   Final Quantity = Base Quantity x (1 + Total Waste % / 100)
 */
export function applyWaste(baseQty: number, ...wastePercentages: number[]): { totalWastePct: number; finalQty: number } {
  const totalWastePct = wastePercentages.reduce((sum, p) => sum + (Number(p) || 0), 0);
  return { totalWastePct, finalQty: round4(baseQty * (1 + totalWastePct / 100)) };
}
