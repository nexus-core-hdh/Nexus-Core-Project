// Serial Card "Label" — one printable label per card with exactly ONE QR Code holding the card's
// complete data snapshot (format NXSC/2, offline: no URL, server or login needed to read it —
// see lib/legacy-erp/serial-card-qr-text.ts) plus the Serial No and key details. The QR is a
// snapshot of the card at printing time. Opens a print window; nothing is saved.
//
// Label stock: 100 mm wide, 60 / 100 / 150 mm tall. A taller label prints the SAME QR bigger, so
// each module is physically larger (easier for a phone camera at a normal distance) — the QR is
// re-rendered at that size, not stretched. "Auto" picks, per print job (one roll of labels in the
// printer), the smallest stock on which every card's QR meets TARGET_MODULE_MM.
import { qrSvg } from "@/lib/legacy-erp/qr";
import { serialCardQr, localToday, LABEL_QR_LEVEL, type SerialCardQr } from "@/lib/legacy-erp/serial-card-qr-text";
import type { SerialCardRow } from "./serial-card-edit-dialog";

/** A card as GET /legacy-erp/serial-cards/labels returns it: the row + its Yarn Recipe. */
export type SerialCardLabel = SerialCardRow;

export interface LabelSize {
  id: "100x60" | "100x100" | "100x150";
  widthMm: number;
  heightMm: number;
  /** Printed QR side (incl. its 4-module quiet zone). */
  qrMm: number;
  /** "side": QR left, details right. "stacked": details band on top, QR below. */
  layout: "side" | "stacked";
}
const PAD_MM = 3;
const GAP_MM = 2.5;
export const LABEL_SIZES: LabelSize[] = [
  { id: "100x60", widthMm: 100, heightMm: 60, qrMm: 54, layout: "side" },
  { id: "100x100", widthMm: 100, heightMm: 100, qrMm: 70, layout: "stacked" },
  { id: "100x150", widthMm: 100, heightMm: 150, qrMm: 94, layout: "stacked" },
];
export type LabelSizeChoice = "auto" | LabelSize["id"];
/** Smallest printed module (mm) treated as reliable at normal scanning distance — from the
 *  distance-based simulation in scripts/serial-card-qr-offline.test.mjs. */
export const TARGET_MODULE_MM = 0.5;

/** Printed module size (mm) of `qr` on `size`. */
export const moduleMm = (qr: Pick<SerialCardQr, "matrix">, size: LabelSize) => size.qrMm / (qr.matrix.size + 8);
/** Height of the details band on a stacked label (everything above the QR). */
export const stackedHeadMm = (size: LabelSize) => size.heightMm - 2 * PAD_MM - size.qrMm - GAP_MM;

export interface LabelPlan {
  size: LabelSize;
  choice: LabelSizeChoice;
  /** Cards whose QR modules print smaller than TARGET_MODULE_MM on `size`. */
  belowTarget: { serialNo: string; moduleMm: number; version: number }[];
}

/** The label stock for a print job: `choice`, or (auto) the smallest stock meeting the target for every card. */
export function planLabelSize(qrs: Pick<SerialCardQr, "matrix" | "snapshot">[], choice: LabelSizeChoice = "auto"): LabelPlan {
  const below = (size: LabelSize) => qrs
    .filter((q) => moduleMm(q, size) < TARGET_MODULE_MM - 1e-9)
    .map((q) => ({ serialNo: q.snapshot.serialNo, moduleMm: +moduleMm(q, size).toFixed(3), version: q.matrix.version }));
  const size = choice === "auto"
    ? LABEL_SIZES.find((s) => below(s).length === 0) ?? LABEL_SIZES[LABEL_SIZES.length - 1]
    : LABEL_SIZES.find((s) => s.id === choice) ?? LABEL_SIZES[0];
  return { size, choice, belowTarget: below(size) };
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const qty = (v: number | null | undefined) =>
  v == null ? "" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });

function detailRows(c: SerialCardLabel): [string, string, boolean?][] {
  const style = [c.styleNumber, c.styleName].filter(Boolean).join(" — ");
  const fabric = [c.inventoryCode, c.inventoryName].filter(Boolean).join(" — ");
  // Color and variant are usually the same value on fabric lines (variant falls back to color).
  const color = [...new Set([c.colorName || c.colorCode, c.variantName || c.variantCode].filter(Boolean))].join(" / ");
  // The roll's own measured Width / Grams; the Fabric Card's spec when the roll has none.
  const width = c.Width != null ? qty(c.Width) : c.fabricWidth != null ? qty(c.fabricWidth) : "";
  const gsm = c.Weight != null ? qty(c.Weight) : c.fabricGsm || (c.fabricWeight != null ? qty(c.fabricWeight) : "");
  return [
    ["Order No", c.workOrderNo ?? ""],
    ["Style", style, true],
    ["Fabric", fabric, true],
    ["Width / GSM", width || gsm ? `${width || "—"} / ${gsm || "—"}` : ""],
    ["Color", color],
    ["Quantity", [qty(c.Quantity), c.unitCode].filter(Boolean).join(" ")],
    ["Receipt No", c.receiptNo ?? ""],
  ];
}

const sizeLabel = (s: LabelSize) => `${s.widthMm} × ${s.heightMm} mm`;

export interface LabelsHtmlOptions {
  printedOn?: string;
  size?: LabelSizeChoice;
  /** Open the print dialog when the page loads (skipped while a below-target warning is shown). */
  autoPrint?: boolean;
}

/** The print page. `printedOn` (YYYY-MM-DD) is the snapshot date written into every QR. */
export function serialCardLabelsHtml(cards: SerialCardLabel[], opts: LabelsHtmlOptions | string = {}): string {
  const o: LabelsHtmlOptions = typeof opts === "string" ? { printedOn: opts } : opts;
  const printedOn = o.printedOn ?? localToday();
  const qrs = cards.map((c) => {
    try {
      return serialCardQr(c, { printedOn });
    } catch (e: any) {
      throw new Error(`Serial card ${c.SerialCode}: ${e.message}`);
    }
  });
  const plan = planLabelSize(qrs, o.size ?? "auto");
  const { size } = plan;
  const labels = cards.map((c, i) => {
    const qr = `<div class="qr">${qrSvg(qrs[i].text, [LABEL_QR_LEVEL])}</div>`;
    const rows = detailRows(c).map(([k, v, wrap]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v${wrap ? " wrap" : ""}">${esc(v) || "—"}</span></div>`).join("");
    const info = `<div class="info"><div class="serial">${esc(c.SerialCode)}</div><div class="rows">${rows}</div></div>`;
    return `<section class="label ${size.layout}">${size.layout === "side" ? qr + info : info + qr}</section>`;
  });

  const options = [["auto", "Auto"] as const, ...LABEL_SIZES.map((s) => [s.id, sizeLabel(s)] as const)];
  const warn = plan.belowTarget.length
    ? `<div class="warn">On ${sizeLabel(size)} labels the QR modules of ${plan.belowTarget.length} card(s) print smaller than ${TARGET_MODULE_MM} mm (${plan.belowTarget.map((b) => `${esc(b.serialNo)}: ${b.moduleMm} mm`).join(", ")}) — they may need close-up scanning.${size.id !== LABEL_SIZES[LABEL_SIZES.length - 1].id ? " Choose a taller label for larger modules." : " This is the tallest label available."}</div>`
    : "";
  const toolbar = `<div class="toolbar">
    <span>Label size:</span>
    ${options.map(([id, text]) => `<button type="button" data-size="${id}" class="${plan.choice === id ? "on" : ""}">${text}${id === "auto" ? ` (${sizeLabel(size)})` : ""}</button>`).join("")}
    <button type="button" data-print="1" class="print">Print</button>
    <div class="note">QR ${size.qrMm} mm · load ${sizeLabel(size)} label stock in the printer.</div>
    ${warn}
  </div>`;

  const H = size.heightMm, W = size.widthMm, Q = size.qrMm;
  const css = `
  @page { size: ${W}mm ${H}mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  .label { width: ${W}mm; height: ${H}mm; padding: ${PAD_MM}mm; display: flex; gap: ${GAP_MM}mm; page-break-after: always; break-after: page; overflow: hidden; }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .qr { flex: 0 0 ${Q}mm; width: ${Q}mm; height: ${Q}mm; }
  .qr svg { display: block; width: ${Q}mm; height: ${Q}mm; }
  .info { min-width: 0; overflow: hidden; display: flex; flex-direction: column; gap: 0.9mm; }
  .serial { font: bold 11pt "Courier New", monospace; word-break: break-all; margin-bottom: 0.6mm; }
  .row { font-size: 7pt; line-height: 1.2; min-width: 0; }
  .k { display: block; font-weight: 700; font-size: 5.6pt; text-transform: uppercase; letter-spacing: .2px; color: #333; }
  .v { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .v.wrap { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
  .side .qr { align-self: center; }
  .side .info { flex: 1; }
  .side .rows { display: flex; flex-direction: column; gap: 0.9mm; }
  .stacked { flex-direction: column; align-items: center; }
  .stacked .info { flex: 0 0 ${stackedHeadMm(size)}mm; height: ${stackedHeadMm(size)}mm; width: 100%; }
  .stacked .rows { display: grid; grid-template-columns: repeat(${stackedHeadMm(size) >= 30 ? 3 : 4}, minmax(0, 1fr)); gap: 0.9mm 2.5mm; }
  .stacked .v.wrap { -webkit-line-clamp: ${stackedHeadMm(size) >= 30 ? 2 : 1}; }
  .toolbar { font: 12px Arial, sans-serif; max-width: ${Math.max(W, 120)}mm; margin: 0 auto 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .toolbar button { font: inherit; padding: 4px 8px; border: 1px solid #9ca3af; background: #fff; border-radius: 4px; cursor: pointer; }
  .toolbar button.on { background: #111827; color: #fff; border-color: #111827; }
  .toolbar button.print { margin-left: auto; font-weight: 700; }
  .toolbar .note { flex-basis: 100%; color: #374151; }
  .warn { flex-basis: 100%; padding: 6px 8px; background: #fef3c7; color: #78350f; border-radius: 4px; }
  @media screen { body { background: #e5e7eb; padding: 8px; } .label { background: #fff; margin: 0 auto 8px; box-shadow: 0 1px 3px rgba(0,0,0,.2); } }
  @media print { .toolbar { display: none; } }`;
  const autoPrint = (o.autoPrint ?? true) && plan.belowTarget.length === 0;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Serial Card Labels</title>
<style>${css}
</style></head><body data-label-size="${size.id}">${toolbar}${labels.join("")}
${autoPrint ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 150); });</script>` : ""}
</body></html>`;
}

const SIZE_PREF_KEY = "serialCardLabelSize";
function readSizePref(): LabelSizeChoice {
  try {
    const v = localStorage.getItem(SIZE_PREF_KEY);
    return v === "auto" || LABEL_SIZES.some((s) => s.id === v) ? (v as LabelSizeChoice) : "auto";
  } catch {
    return "auto";
  }
}
function writeSizePref(v: LabelSizeChoice) {
  try { localStorage.setItem(SIZE_PREF_KEY, v); } catch { /* per-browser convenience only */ }
}

/** Opens the print window right away (inside the click, so pop-up blockers allow it), then fills
 *  it with the labels once `loadLabels` resolves. The window's toolbar switches the label size
 *  (remembered in this browser). Returns false when the pop-up was blocked; rejects (and closes
 *  the window) when the labels can't be loaded or built. */
export async function printSerialCardLabels(loadLabels: () => Promise<SerialCardLabel[]>): Promise<boolean> {
  const w = window.open("", "_blank", "width=560,height=720");
  if (!w) return false;
  w.document.write('<!doctype html><title>Serial Card Labels</title><p style="font:14px Arial;padding:16px">Preparing labels…</p>');
  try {
    const cards = await loadLabels();
    const printedOn = localToday();
    const render = (size: LabelSizeChoice, autoPrint: boolean) => {
      w.document.open();
      w.document.write(serialCardLabelsHtml(cards, { printedOn, size, autoPrint }));
      w.document.close();
      w.document.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((b) =>
        b.addEventListener("click", () => {
          const next = b.dataset.size as LabelSizeChoice;
          writeSizePref(next);
          render(next, false);
        }));
      w.document.querySelector("[data-print]")?.addEventListener("click", () => w.print());
    };
    render(readSizePref(), true);
    return true;
  } catch (e) {
    w.close();
    throw e;
  }
}
