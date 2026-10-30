// Packing List formulas for live editing on the Packing List screen — a mirror of the
// authoritative backend module (nexuscore-backend/src/modules/legacy-erp/packing-list.calc.ts),
// which also computes the server-side summary. The backend test suite asserts both give identical
// results ("UI formulas give identical results"), so change both together. PROVISIONAL rules —
// see the backend file for each one's status. Pure functions only; no size codes are known here,
// sizes are always the caller's (the Work Order's) array.

export const VARIANT_KEY_SEP = "‖";

export const variantKey = (color: string, size: string) => `${color.trim()}${VARIANT_KEY_SEP}${size.trim()}`;

export function parseVariantKey(key: string): { color: string; size: string } | null {
  const i = key.indexOf(VARIANT_KEY_SEP);
  if (i < 0) return null;
  const color = key.slice(0, i).trim();
  const size = key.slice(i + VARIANT_KEY_SEP.length).trim();
  return color && size ? { color, size } : null;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** PROVISIONAL: boxes in an inclusive From/To range. */
export function boxCount(startBox: unknown, endBox: unknown): number {
  const s = num(startBox);
  const e = num(endBox);
  if (s <= 0 || e < s) return 0;
  return Math.floor(e) - Math.floor(s) + 1;
}

/** PROVISIONAL: pieces in one box = sum of the line's size quantities. */
export function inBoxQuantity(sizeQuantities: Record<string, number>, sizes: readonly string[]): number {
  return sizes.reduce((sum, s) => sum + num(sizeQuantities[s]), 0);
}

/** PROVISIONAL: total pieces = in-box quantity × boxes. */
export function totalQuantity(inBoxQty: number, boxes: number): number {
  return inBoxQty * boxes;
}

/** PROVISIONAL: net weight = total pieces × style weight. */
export function netWeight(totalQty: number, styleWeight: unknown): number {
  return totalQty * num(styleWeight);
}

/** PROVISIONAL: packaging weight = boxes × package weight. */
export function totalPackageWeight(boxes: number, packageWeight: unknown): number {
  return boxes * num(packageWeight);
}

/** PROVISIONAL: gross weight = net + packaging. */
export function grossWeight(net: number, packageTotal: number): number {
  return net + packageTotal;
}

export interface PackingLineInput {
  startBox: unknown;
  endBox: unknown;
  styleWeight: unknown;
  packageWeight: unknown;
  sizes: Record<string, number>;
}

export interface PackingLineTotals {
  boxes: number;
  inBoxQuantity: number;
  totalQuantity: number;
  netWeight: number;
  totalPackageWeight: number;
  grossWeight: number;
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

/** A box number belongs to ONE line (totals add up line by line). Every overlapping pair of lines
 *  (indexes, first < second); lines with an invalid range are skipped. Adjacent ranges are fine. */
export function overlappingBoxRanges(lines: { startBox: unknown; endBox: unknown }[]): [number, number][] {
  const ranges = lines.map((l) => (boxCount(l.startBox, l.endBox) > 0 ? [Math.floor(num(l.startBox)), Math.floor(num(l.endBox))] : null));
  const pairs: [number, number][] = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i], b = ranges[j];
      if (a && b && a[0] <= b[1] && b[0] <= a[1]) pairs.push([i, j]);
    }
  }
  return pairs;
}

/** PROVISIONAL: shipped once it references an Inventory Receipt (Shipment). */
export function isShippedPackingList(header: { inventoryReceiptId?: unknown }): boolean {
  return header.inventoryReceiptId != null && Number(header.inventoryReceiptId) > 0;
}

/** PROVISIONAL: Order − Shipment as a percentage of Order, 2 decimals; 0 when Order is 0. */
export function orderShipmentPercent(orderQty: number, shippedQty: number): number {
  if (!orderQty) return 0;
  return Math.round(((orderQty - shippedQty) / orderQty) * 10000) / 100;
}

export const SUMMARY_ROWS = [
  "order", "willBeCut", "cut", "packed", "shipment",
  "orderMinusShipment", "orderMinusShipmentPercent", "willBeCutMinusShipped", "cutMinusShipped",
] as const;
export type SummaryRowKey = (typeof SUMMARY_ROWS)[number];

/** One value per (summary row, size) plus a Total column. */
export function sizeSummary(sizes: readonly string[], inp: { order: Record<string, number>; willBeCut: Record<string, number>; cut: Record<string, number>; packed: Record<string, number>; shipped: Record<string, number> }) {
  const rows = Object.fromEntries(SUMMARY_ROWS.map((r) => [r, {}])) as Record<SummaryRowKey, Record<string, number>>;
  const totals = Object.fromEntries(SUMMARY_ROWS.map((r) => [r, 0])) as Record<SummaryRowKey, number>;
  for (const s of sizes) {
    const order = num(inp.order[s]);
    const willBeCut = num(inp.willBeCut[s]);
    const cut = num(inp.cut[s]);
    const packed = num(inp.packed[s]);
    const shipped = num(inp.shipped[s]);
    const values: Record<Exclude<SummaryRowKey, "orderMinusShipmentPercent">, number> = {
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

/** The server summary (as of the last save) re-based on the lines being edited: Order / Will Be
 *  Cut / Cut stay the server's; Packed is this list's live packed quantities; Shipment swaps this
 *  list's saved contribution (if it was shipped when saved) for its live one (if it is shipped now). */
export function liveSizeSummary(
  sizes: readonly string[],
  saved: { rows: Partial<Record<SummaryRowKey, Record<string, number>>> },
  packedNow: Record<string, number>,
  shipping: { wasShipped: boolean; isShipped: boolean },
) {
  const r = saved.rows;
  const shipped: Record<string, number> = {};
  for (const s of sizes) {
    shipped[s] = num(r.shipment?.[s]) - (shipping.wasShipped ? num(r.packed?.[s]) : 0) + (shipping.isShipped ? num(packedNow[s]) : 0);
  }
  return sizeSummary(sizes, { order: r.order ?? {}, willBeCut: r.willBeCut ?? {}, cut: r.cut ?? {}, packed: packedNow, shipped });
}

/** Display labels for the server summary's rows (keys = backend SUMMARY_ROWS). */
export const SUMMARY_ROW_LABELS: [key: string, label: string][] = [
  ["order", "Order"],
  ["willBeCut", "Will Be Cut"],
  ["cut", "Cut"],
  ["packed", "Packed (this list)"],
  ["shipment", "Shipment"],
  ["orderMinusShipment", "Order − Shipment"],
  ["orderMinusShipmentPercent", "Order − Shipment %"],
  ["willBeCutMinusShipped", "Will Cut Qty − Shipped"],
  ["cutMinusShipped", "Cut − Shipped"],
];
