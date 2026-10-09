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
