"use client";

// The Serial Card detail layout — QR Code, production details, roll details and Yarn Recipe —
// shared by the ERP's Serial Card dialog and the phone page a scanned label opens
// (/s/<Serial No>), so both always show the same fields the same way. Pure presentation: the
// caller loads the data. Empty values read "Not specified"; the recipe is always a table.
import { useMemo, type ReactNode } from "react";
import { qrSvg } from "@/lib/legacy-erp/qr";
import { serialCardQr, localToday } from "@/lib/legacy-erp/serial-card-qr-text";
import { planLabelSize, moduleMm, TARGET_MODULE_MM } from "./serial-card-labels";
import type { SerialCardRow } from "./serial-card-edit-dialog";

const RECIPE_SOURCE: Record<string, string> = { color: "Color-specific recipe", common: "Common / overall recipe" };
/** What an empty field reads as — never a blank, a dash or a raw null. */
export const NOT_SPECIFIED = "Not specified";
const fmtDate = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);
const fmtNum = (v: number | string | null | undefined) =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });
const fmtPct = (v: number | string | null | undefined) => {
  const n = fmtNum(v);
  return n == null ? null : `${n}%`;
};
/** "code — name", either alone, or null; the same text twice is shown once. */
const codeName = (code: string | null | undefined, name: string | null | undefined) => {
  const c = code?.trim() || null;
  const n = name?.trim() || null;
  return c && n && c !== n ? `${c} — ${n}` : c || n;
};

export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  const empty = value == null || value === "";
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium">
        {empty ? <span className="font-normal text-muted-foreground">{NOT_SPECIFIED}</span> : value}
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{children}</p>;
}

/** The label's QR Code as inline SVG, or why it can't be drawn. */
export function qrMarkup(payload: string | null | undefined): { svg: string | null; error: string | null } {
  if (!payload) return { svg: null, error: null };
  try { return { svg: qrSvg(payload, ["M"]), error: null }; } catch (e: any) { return { svg: null, error: e.message }; }
}

export function SerialCardDetailView({
  card, detail, detailError, actions, showRollFields = false, showQr = true,
}: {
  /** The row the view opened with (shown immediately); `detail` replaces it once loaded. */
  card: SerialCardRow;
  detail: SerialCardRow | null;
  detailError?: string | null;
  /** Buttons beside the QR (e.g. Print Label). */
  actions?: ReactNode;
  /** Also list the roll's own measurements/quantity (the dialog shows them as form fields instead). */
  showRollFields?: boolean;
  /** The label's QR Code (ERP dialog). The /s/ page that earlier link-QR labels open turns it off. */
  showQr?: boolean;
}) {
  const info = detail ?? card;
  const recipe = detail?.yarnRecipe;
  // The label's ONE QR: this card's complete data snapshot (the same text the printed label carries).
  const labelQr = useMemo(() => {
    if (!detail || !showQr) return null;
    try {
      const qr = serialCardQr(detail, { printedOn: localToday() });
      return { qr, plan: planLabelSize([qr], "auto"), error: null };
    } catch (e: any) {
      return { qr: null, plan: null, error: e.message as string };
    }
  }, [detail, showQr]);
  const qr = labelQr?.qr ? qrMarkup(labelQr.qr.text) : { svg: null, error: labelQr?.error ?? null };
  const qty = fmtNum(info.Quantity);
  const manCa = codeName(info.currentAccountCode, info.currentAccountName);

  return (
    <div className="space-y-4">
      {showQr && (
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2">
          <div className="h-48 w-48 shrink-0 rounded bg-white p-1">
            {qr.svg
              ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" aria-label={`QR Code for serial card ${card.SerialCode}`} dangerouslySetInnerHTML={{ __html: qr.svg }} />
              : <p className="p-2 text-[11px] text-muted-foreground">{qr.error ?? (detailError ? "QR unavailable" : "Loading…")}</p>}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-mono text-sm font-semibold">{card.SerialCode}</p>
            <p className="text-xs text-muted-foreground">
              The label&apos;s QR Code holds this card&apos;s complete details as text, readable by a phone QR scanner
              without a connection or ERP login. It is a snapshot: after changing the card, reprint its label.
            </p>
            {labelQr?.qr && (
              <p className={`text-[11px] ${labelQr.plan.belowTarget.length ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                QR version {labelQr.qr.matrix.version} ({labelQr.qr.bytes} bytes) · Auto label {labelQr.plan.size.widthMm} × {labelQr.plan.size.heightMm} mm,
                QR {labelQr.plan.size.qrMm} mm, {moduleMm(labelQr.qr, labelQr.plan.size).toFixed(2)} mm modules
                {labelQr.plan.belowTarget.length > 0 && ` — below the ${TARGET_MODULE_MM} mm target even on the tallest label: scan it close up in good light.`}
              </p>
            )}
            {labelQr?.qr && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-primary">What a scanner shows</summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[10.5px]">{labelQr.qr.text}</pre>
              </details>
            )}
            {actions}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <SectionTitle>Production Details</SectionTitle>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 min-[420px]:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Work Order" value={info.workOrderNo} />
          <DetailField label="Style Number" value={info.styleNumber} />
          <DetailField label="Style Name" value={info.styleName} />
          <DetailField label="Fabric Code" value={info.inventoryCode} />
          <DetailField label="Fabric Name" value={info.inventoryName} />
          <DetailField label="Composition" value={info.fabricComposition} />
          <DetailField label="Finish GSM" value={info.fabricGsm} />
          <DetailField label="Spec Width" value={fmtNum(info.fabricWidth)} />
          <DetailField label="Spec Weight" value={fmtNum(info.fabricWeight)} />
          <DetailField label="Color Code/Name" value={codeName(info.colorCode, info.colorName)} />
          <DetailField label="Variant" value={codeName(info.variantCode, info.variantName)} />
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <SectionTitle>Roll Details</SectionTitle>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {showRollFields ? (
            <>
              <DetailField label="Serial Number" value={info.SerialCode} />
              <DetailField label="Width" value={fmtNum(info.Width)} />
              <DetailField label="Grams" value={fmtNum(info.Weight)} />
              <DetailField label="Quantity" value={qty == null ? null : [qty, info.unitCode].filter(Boolean).join(" ")} />
              <DetailField label="Receipt Number" value={info.receiptNo} />
              <DetailField label="Product Date" value={fmtDate(info.ManufacturingDate)} />
              <DetailField label="Expiration Date" value={fmtDate(info.ExpirationDate)} />
              <DetailField label="Shelf Life" value={fmtNum(info.ShelfLife)} />
              <DetailField label="Party Number" value={info.PartyNo} />
              <DetailField label="Man. C/A Code" value={manCa} />
              <DetailField label="Quality Type" value={info.qualityTypeName} />
              <DetailField label="Resource" value={info.resourceCode} />
              <DetailField label="Manufacturer Serial" value={info.ProducerSerialCode} />
              <DetailField label="Explanation" value={info.Explanation} />
              <DetailField label="Quantity II" value={fmtNum(info.QuantityMT)} />
              <DetailField label="Quantity III" value={fmtNum(info.Quantity3)} />
              <DetailField label="Raw Width" value={fmtNum(info.RawWidth)} />
              <DetailField label="Raw Weight" value={fmtNum(info.RawWeight)} />
              <DetailField label="Raw Length" value={fmtNum(info.RawLength)} />
              <DetailField label="Product Length" value={fmtNum(info.ProductLength)} />
              <DetailField label="M2" value={fmtNum(info.WeightM2)} />
              <DetailField label="Mtul" value={fmtNum(info.WeightMt)} />
              <DetailField label="Pus" value={fmtNum(info.Pus)} />
              <DetailField label="Fine" value={fmtNum(info.Fine)} />
              <DetailField label="Piece Count" value={fmtNum(info.PieceCount)} />
            </>
          ) : (
            <>
              <DetailField label="Unit" value={info.unitCode} />
              <DetailField label="Receipt Number" value={info.receiptNo} />
              <DetailField label="Man. C/A Code" value={manCa} />
            </>
          )}
          <DetailField label="Warehouse Quantity" value={fmtNum(info.warehouseQuantity)} />
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <SectionTitle>
          Yarn Recipe
          {recipe?.source && <span className="ml-1.5 font-normal normal-case">— {RECIPE_SOURCE[recipe.source]} from Work Order {info.workOrderNo}&apos;s Fabric BOM</span>}
        </SectionTitle>
        {detailError ? (
          <p className="text-xs text-red-700 dark:text-red-400">{detailError}</p>
        ) : !detail ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : recipe?.status === "ok" && recipe.lines.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Yarn Code</th>
                  <th className="py-1 pr-2 font-medium">Yarn Name</th>
                  <th className="py-1 pr-2 font-medium">Process</th>
                  <th className="py-1 pr-2 font-medium">Variant</th>
                  <th className="py-1 pr-2 text-right font-medium">Percentage</th>
                  <th className="py-1 pr-2 text-right font-medium">Waste %</th>
                  <th className="py-1 text-right font-medium">Dye Waste %</th>
                </tr>
              </thead>
              <tbody>
                {recipe.lines.map((l, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="py-1 pr-2 font-mono">{l.yarnCode || "—"}</td>
                    <td className="py-1 pr-2">{l.yarnName || "—"}</td>
                    <td className="py-1 pr-2">{l.process || "—"}</td>
                    <td className="py-1 pr-2">{[l.variant1, l.variant2].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtPct(l.percentage) ?? "—"}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtPct(l.wastePct) ?? "—"}</td>
                    <td className="py-1 text-right tabular-nums">{fmtPct(l.dyeWastagePct) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{recipe?.message ?? "No Yarn Recipe available."}</p>
        )}
      </div>
    </div>
  );
}
