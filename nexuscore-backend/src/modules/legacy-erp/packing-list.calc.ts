// Packing List calculations — the ONE place every Packing List formula lives (pure functions, no
// I/O). The service only gathers inputs and calls these; the UI mirrors them in
// frontend/lib/legacy-erp/packing-list-calc.ts for live editing, and a parity test keeps the two
// in step. Each rule below is marked PROVISIONAL where it is the agreed initial interpretation
// rather than a rule recovered from legacy source — change it here and nothing else has to move.
//
// Sizes are always a caller-supplied array (the Work Order's own resolved sizes, in Order
// sequence). Nothing here knows or hardcodes any size code.

/** Separator inside a Work Order variant key, exactly as MA_WorkOrderItemVariant.Explanation stores it. */
export const VARIANT_KEY_SEP = '‖';

export const variantKey = (color: string, size: string) => `${color.trim()}${VARIANT_KEY_SEP}${size.trim()}`;

export function parseVariantKey(key: string): { color: string; size: string } | null {
  const i = key.indexOf(VARIANT_KEY_SEP);
  if (i < 0) return null;
  const color = key.slice(0, i).trim();
  const size = key.slice(i + VARIANT_KEY_SEP.length).trim();
  return color && size ? { color, size } : null;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ── Line (one row = a range of identical boxes) ──────────────────────────────────────────────

/** PROVISIONAL: number of boxes a line covers — an inclusive From/To box range. */
export function boxCount(startBox: unknown, endBox: unknown): number {
  const s = num(startBox);
  const e = num(endBox);
  if (s <= 0 || e < s) return 0;
  return Math.floor(e) - Math.floor(s) + 1;
}

/** PROVISIONAL: quantity in ONE box = the sum of the line's per-size quantities. */
export function inBoxQuantity(sizeQuantities: Record<string, number>, sizes: readonly string[]): number {
  return sizes.reduce((sum, s) => sum + num(sizeQuantities[s]), 0);
}

/** PROVISIONAL: total pieces on the line = in-box quantity × boxes. */
export function totalQuantity(inBoxQty: number, boxes: number): number {
  return inBoxQty * boxes;
}

/** PROVISIONAL: net weight = total pieces × style (per-piece) weight. */
export function netWeight(totalQty: number, styleWeight: unknown): number {
  return totalQty * num(styleWeight);
}

/** PROVISIONAL: packaging weight for the line = boxes × weight of one (empty) package. */
export function totalPackageWeight(boxes: number, packageWeight: unknown): number {
  return boxes * num(packageWeight);
}

/** PROVISIONAL: gross weight = net weight + packaging weight. */
export function grossWeight(net: number, packageTotal: number): number {
  return net + packageTotal;
}

export interface PackingLineInput {
  startBox: unknown;
  endBox: unknown;
  styleWeight: unknown;
  packageWeight: unknown;
  /** Quantity per size code (one box). */
  sizes: Record<string, number>;
}

export interface PackingLineTotals {
  boxes: number;
  inBoxQuantity: number;
  totalQuantity: number;
  netWeight: number;
  totalPackageWeight: number;
  grossWeight: number;
  /** Pieces per size across all of the line's boxes (quantity per box × boxes). */
  packedBySize: Record<string, number>;
}

export function lineTotals(line: PackingLineInput, sizes: readonly string[]): PackingLineTotals {
  const boxes = boxCount(line.startBox, line.endBox);
  const inBox = inBoxQuantity(line.sizes, sizes);
  const total = totalQuantity(inBox, boxes);
  const net = netWeight(total, line.styleWeight);
  const pkg = totalPackageWeight(boxes, line.packageWeight);
  const packedBySize: Record<string, number> = {};
  for (const s of sizes) packedBySize[s] = num(line.sizes[s]) * boxes;
  return { boxes, inBoxQuantity: inBox, totalQuantity: total, netWeight: net, totalPackageWeight: pkg, grossWeight: grossWeight(net, pkg), packedBySize };
}

/** Grand totals over every line — plain sums of the per-line results above. */
export function packingTotals(lines: PackingLineInput[], sizes: readonly string[]) {
  const bySize: Record<string, number> = Object.fromEntries(sizes.map((s) => [s, 0]));
  let boxes = 0, totalQty = 0, net = 0, pkg = 0, gross = 0;
  for (const line of lines) {
    const t = lineTotals(line, sizes);
    boxes += t.boxes; totalQty += t.totalQuantity; net += t.netWeight; pkg += t.totalPackageWeight; gross += t.grossWeight;
    for (const s of sizes) bySize[s] += t.packedBySize[s];
  }
  return { bySize, boxes, totalQuantity: totalQty, netWeight: net, totalPackageWeight: pkg, grossWeight: gross };
}

// ── Order-level summary (per size) ───────────────────────────────────────────────────────────

/** PROVISIONAL: a Packing List counts as SHIPPED once it references an Inventory Receipt
 *  (IM_PackagingList.InventoryReceiptId → IM_Receipt). Approval is not required for this first
 *  implementation; change this predicate to tighten the rule (e.g. `&& isApproved`). */
export function isShippedPackingList(header: { inventoryReceiptId?: unknown; isApproved?: unknown }): boolean {
  return header.inventoryReceiptId != null && Number(header.inventoryReceiptId) > 0;
}

/** PROVISIONAL: Order − Shipment as a percentage of Order, rounded to 2 decimals; 0 when Order is 0. */
export function orderShipmentPercent(orderQty: number, shippedQty: number): number {
  if (!orderQty) return 0;
  return Math.round(((orderQty - shippedQty) / orderQty) * 10000) / 100;
}

export interface SizeSummaryInputs {
  /** Order quantity per size (all colors of the Work Order). */
  order: Record<string, number>;
  /** Will Be Cut per size — computed by CuttingCardService (its own willBeCutQty), never here. */
  willBeCut: Record<string, number>;
  /** Cut per size — CuttingCardService's saved Cutting Entry totals (order-level aggregate). */
  cut: Record<string, number>;
  /** Packed on THIS Packing List, per size. */
  packed: Record<string, number>;
  /** Packed on every SHIPPED Packing List of the same Work Order, per size. */
  shipped: Record<string, number>;
}

export const SUMMARY_ROWS = [
  'order', 'willBeCut', 'cut', 'packed', 'shipment',
  'orderMinusShipment', 'orderMinusShipmentPercent', 'willBeCutMinusShipped', 'cutMinusShipped',
] as const;
export type SummaryRowKey = (typeof SUMMARY_ROWS)[number];

/** One value per (summary row, size) plus a Total column — built from the SAME size array as the grid. */
export function sizeSummary(sizes: readonly string[], inp: SizeSummaryInputs) {
  const rows: Record<SummaryRowKey, Record<string, number>> = Object.fromEntries(SUMMARY_ROWS.map((r) => [r, {}])) as any;
  const totals: Record<SummaryRowKey, number> = Object.fromEntries(SUMMARY_ROWS.map((r) => [r, 0])) as any;
  for (const s of sizes) {
    const order = num(inp.order[s]);
    const willBeCut = num(inp.willBeCut[s]);
    const cut = num(inp.cut[s]);
    const packed = num(inp.packed[s]);
    const shipped = num(inp.shipped[s]);
    const values: Record<Exclude<SummaryRowKey, 'orderMinusShipmentPercent'>, number> = {
      order, willBeCut, cut, packed, shipment: shipped,
      orderMinusShipment: order - shipped,
      willBeCutMinusShipped: willBeCut - shipped,
      cutMinusShipped: cut - shipped,
    };
    for (const [k, v] of Object.entries(values)) { rows[k as SummaryRowKey][s] = v; totals[k as SummaryRowKey] += v; }
    rows.orderMinusShipmentPercent[s] = orderShipmentPercent(order, shipped);
  }
  totals.orderMinusShipmentPercent = orderShipmentPercent(totals.order, totals.shipment);
  return { sizes: [...sizes], rows, totals };
}
