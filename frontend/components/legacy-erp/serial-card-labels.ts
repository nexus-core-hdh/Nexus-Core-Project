// Serial Card "Label" — one printable label per card: a QR Code holding the card's complete
// information (the server-built JSON payload, readable by any QR scanner with no ERP lookup) and
// the key details printed beside it. Opens a print window; nothing is saved.
import { qrSvg } from "@/lib/legacy-erp/qr";
import type { SerialCardRow } from "./serial-card-edit-dialog";

/** A card as GET /legacy-erp/serial-cards/labels returns it: the row + its QR payload. */
export type SerialCardLabel = SerialCardRow & { qrPayload: string };

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const qty = (v: number | null | undefined) =>
  v == null ? "" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });

export function serialCardLabelsHtml(cards: SerialCardLabel[]): string {
  const labels = cards.map((c) => {
    if (!c.qrPayload) throw new Error(`Serial card ${c.SerialCode} has no QR payload.`);
    let qr: string;
    try {
      qr = qrSvg(c.qrPayload);
    } catch (e: any) {
      throw new Error(`Serial card ${c.SerialCode}: ${e.message}`);
    }
    const style = [c.styleNumber, c.styleName].filter(Boolean).join(" — ");
    const fabric = [c.inventoryCode, c.inventoryName].filter(Boolean).join(" — ");
    // Color and variant are usually the same value on fabric lines (variant falls back to color).
    const color = [...new Set([c.colorName || c.colorCode, c.variantName || c.variantCode].filter(Boolean))].join(" / ");
    // The roll's own measured Width / Grams; the Fabric Card's spec when the roll has none.
    const width = c.Width != null ? qty(c.Width) : c.fabricWidth != null ? qty(c.fabricWidth) : "";
    const gsm = c.Weight != null ? qty(c.Weight) : c.fabricGsm || (c.fabricWeight != null ? qty(c.fabricWeight) : "");
    const rows: [string, string, boolean?][] = [
      ["Order No", c.workOrderNo ?? ""],
      ["Style", style, true],
      ["Fabric", fabric, true],
      ["Width / GSM", width || gsm ? `${width || "—"} / ${gsm || "—"}` : ""],
      ["Color", color],
      ["Quantity", [qty(c.Quantity), c.unitCode].filter(Boolean).join(" ")],
    ];
    return `<section class="label">
      <div class="qr">${qr}</div>
      <div class="info">
        <div class="serial">${esc(c.SerialCode)}</div>
        ${rows.map(([k, v, wrap]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v${wrap ? " wrap" : ""}">${esc(v) || "—"}</span></div>`).join("")}
      </div>
    </section>`;
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Serial Card Labels</title>
<style>
  @page { size: 100mm 60mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  .label { width: 100mm; height: 60mm; padding: 3mm; display: flex; gap: 2.5mm; page-break-after: always; break-after: page; overflow: hidden; }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .qr { flex: 0 0 54mm; height: 54mm; }
  .qr svg { display: block; width: 54mm; height: 54mm; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.9mm; }
  .serial { font: bold 10.5pt "Courier New", monospace; word-break: break-all; margin-bottom: 0.6mm; }
  .row { font-size: 6.6pt; line-height: 1.2; }
  .k { display: block; font-weight: 700; font-size: 5.6pt; text-transform: uppercase; letter-spacing: .2px; color: #333; }
  .v { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .v.wrap { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
  @media screen { body { background: #e5e7eb; padding: 8px; } .label { background: #fff; margin: 0 auto 8px; box-shadow: 0 1px 3px rgba(0,0,0,.2); } }
</style></head><body>${labels.join("")}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 150); });</script>
</body></html>`;
}

/** Opens the print window right away (inside the click, so pop-up blockers allow it), then fills
 *  it with the labels once `loadLabels` resolves. Returns false when the pop-up was blocked;
 *  rejects (and closes the window) when the labels can't be loaded or built. */
export async function printSerialCardLabels(loadLabels: () => Promise<SerialCardLabel[]>): Promise<boolean> {
  const w = window.open("", "_blank", "width=520,height=680");
  if (!w) return false;
  w.document.write('<!doctype html><title>Serial Card Labels</title><p style="font:14px Arial;padding:16px">Preparing labels…</p>');
  try {
    const html = serialCardLabelsHtml(await loadLabels());
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
  } catch (e) {
    w.close();
    throw e;
  }
}
