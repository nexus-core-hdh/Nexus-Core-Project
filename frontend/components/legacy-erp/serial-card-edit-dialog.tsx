"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { legacyErpApi, type SerialCardUpdateItem } from "@/lib/nexuscore-api";
import { serialCardToUpdateItem } from "@/lib/legacy-erp/serial-card-update";
import { qrSvg } from "@/lib/legacy-erp/qr";
import { printSerialCardLabels } from "./serial-card-labels";
import { toast } from "sonner";
import { Printer, Save, Tag } from "lucide-react";

// Generate Serial Cards — the per-record View/Update surface for one already-persisted
// IM_SerialCard row, opened from the Serial Cards list dialog's own right-click menu ("View/
// Detail" and "Update" both open this same form — a serial card is pure metadata, there's no
// separate read-only "detail" shape distinct from its editable form). Reuses the exact same
// SerialCardService.update() (via the flat, receipt-agnostic PATCH) the original Generate
// Serial Cards dialog's own grid already used — no new persistence logic here.

export interface SerialCardRow {
  /** Same value as RecId — ReportGrid's own row-identity convention (hooks/use-row-selection.ts,
   *  report-grid.tsx) requires a plain `id` field; kept alongside the real column name RecId so
   *  every other field still matches IM_SerialCard's own schema 1:1. */
  id: number;
  RecId: number;
  SerialCode: string;
  inventoryCode: string | null;
  inventoryName: string | null;
  variantCode: string | null;
  variantName: string | null;
  colorCode: string | null;
  colorName: string | null;
  unitCode: string | null;
  workOrderNo: string | null;
  receiptNo: string | null;
  Explanation: string | null;
  PartyNo: string | null;
  QualityTypeId: number | null;
  qualityTypeName?: string | null;
  ResourceId: number | null;
  resourceCode?: string | null;
  EmployeeId: number | null;
  employeeName?: string | null;
  ProducerSerialCode: string | null;
  ManufacturingDate: string | null;
  Quantity: number | null;
  Width: number | null;
  Weight: number | null;
  RawWidth: number | null;
  RawWeight: number | null;
  RawLength: number | null;
  ProductLength: number | null;
  WeightM2: number | null;
  Pus: number | null;
  Fine: number | null;
  PieceCount: number | null;
  CurrentAccountId?: number | null;
  ExpirationDate?: string | null;
  ShelfLife?: number | null;
  QuantityMT?: number | null;
  Quantity3?: number | null;
  WeightMt?: number | null;
  receiptItemId?: number | null;
  warehouseQuantity?: number;
  hasTransaction?: boolean;
  currentAccountCode?: string | null;
  currentAccountName?: string | null;
  // Production identity, read live from the linked Work Order / Style Card / Fabric Card.
  workOrderId?: number | null;
  styleNumber?: string | null;
  styleName?: string | null;
  colorCardId?: string | null;
  fabricComposition?: string | null;
  fabricGsm?: string | null;
  fabricWidth?: number | null;
  fabricWeight?: number | null;
  /** Only on the detail / scan / labels responses. */
  yarnRecipe?: SerialCardYarnRecipe;
  /** The label QR Code's text — the card's complete information as JSON (built by the server). */
  qrPayload?: string;
}

export interface SerialCardYarnRecipe {
  status: "ok" | "no-work-order" | "not-in-bom" | "ambiguous" | "not-defined";
  message: string | null;
  source: "color" | "common" | null;
  lines: { yarnInventoryId: number | null; yarnCode: string | null; yarnName: string | null; percentage: number; process: string | null; variant1: string | null; variant2: string | null; explanation: string | null; wastePct: number; dyeWastagePct: number }[];
}

export { serialCardToUpdateItem };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "view" | "update";
  card: SerialCardRow | null;
  onSaved?: () => void;
}

const fmtDate = (v: string | null) => (v ? v.slice(0, 10) : "");

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium" title={value != null ? String(value) : undefined}>
        {value != null && value !== "" ? value : <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}

const RECIPE_SOURCE: Record<string, string> = { color: "Color-specific recipe", common: "Common / overall recipe" };

/** The label's QR Code (the card's full information) as inline SVG, or why it can't be drawn. */
function qrMarkup(payload: string | null | undefined): { svg: string | null; error: string | null } {
  if (!payload) return { svg: null, error: null };
  try { return { svg: qrSvg(payload), error: null }; } catch (e: any) { return { svg: null, error: e.message }; }
}

/** The QR payload pretty-printed — exactly what a scanner shows, formatted for reading. */
function prettyPayload(payload: string): string {
  try { return JSON.stringify(JSON.parse(payload), null, 2); } catch { return payload; }
}

export function SerialCardEditDialog({ open, onOpenChange, mode, card, onSaved }: Props) {
  const [form, setForm] = useState<Partial<SerialCardRow>>({});
  const [saving, setSaving] = useState(false);
  // Production details + Yarn Recipe, fetched fresh for the open card (the barcode lookup key is its Serial No).
  const [detail, setDetail] = useState<SerialCardRow | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (open && card) setForm(card);
  }, [open, card]);

  useEffect(() => {
    if (!open || !card) return;
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    legacyErpApi.serialCards.detail(card.RecId)
      .then((d: any) => { if (!cancelled) setDetail(d); })
      .catch((e: any) => { if (!cancelled) setDetailError(e.message || "Could not load production details"); });
    return () => { cancelled = true; };
  }, [open, card]);

  const set = (patch: Partial<SerialCardRow>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!card) return;
    setSaving(true);
    try {
      // Fields this form doesn't show (Man. C/A, expiry, shelf life, Quantity II/3, Mtul) carry
      // over from the card instead of being sent as NULL.
      const item: SerialCardUpdateItem = serialCardToUpdateItem({ ...card, ...form, RecId: card.RecId });
      await legacyErpApi.serialCards.updateFlat([item]);
      toast.success("Serial card updated.");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to update serial card");
    } finally {
      setSaving(false);
    }
  };

  if (!card) return null;
  const readOnly = mode === "view";
  const info = detail ?? card;
  const qr = qrMarkup(detail?.qrPayload);
  const recipe = detail?.yarnRecipe;
  // Reprint uses the same server endpoint as every label, so the payload is the saved card's.
  const printLabel = async () => {
    try {
      const opened = await printSerialCardLabels(() => legacyErpApi.serialCards.labels([card.RecId]) as Promise<any>);
      if (!opened) toast.error("The label window was blocked — allow pop-ups for this site and try again.");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate the label");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(94vw,760px)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-2.5">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Tag className="h-4 w-4 text-primary" />
            {readOnly ? "Serial Card" : "Update Serial Card"} — <span className="font-mono">{card.SerialCode}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2">
            <div className="h-36 w-36 shrink-0 rounded bg-white p-1">
              {qr.svg
                ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" aria-label={`QR Code for serial card ${card.SerialCode}`} dangerouslySetInnerHTML={{ __html: qr.svg }} />
                : <p className="p-2 text-[11px] text-muted-foreground">{qr.error ?? (detailError ? "QR unavailable" : "Loading…")}</p>}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-mono text-sm font-semibold">{card.SerialCode}</p>
              <p className="text-xs text-muted-foreground">
                The label&apos;s QR Code holds this card&apos;s complete information (production details and Yarn Recipe) as JSON — any QR scanner can read it without the ERP.
              </p>
              <Button size="sm" variant="outline" className="h-7" onClick={printLabel} disabled={!qr.svg}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />Print Label
              </Button>
              {detail?.qrPayload && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show QR contents ({new TextEncoder().encode(detail.qrPayload).length} bytes)</summary>
                  <pre className="mt-1 max-h-56 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-snug">{prettyPayload(detail.qrPayload)}</pre>
                </details>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 lg:grid-cols-3">
            <Field label="Order No" value={info.workOrderNo} />
            <Field label="Style No" value={info.styleNumber} />
            <Field label="Style Name" value={info.styleName} />
            <Field label="Inventory Code" value={card.inventoryCode} />
            <Field label="Inventory Name" value={card.inventoryName} />
            <Field label="Composition" value={info.fabricComposition} />
            <Field label="Finish GSM (Fabric Card)" value={info.fabricGsm} />
            <Field label="Width / Weight (Fabric Card)" value={info.fabricWidth != null || info.fabricWeight != null ? `${info.fabricWidth ?? "—"} / ${info.fabricWeight ?? "—"}` : null} />
            <Field label="Variant" value={card.variantCode || card.variantName} />
            <Field label="Color" value={card.colorCode || card.colorName} />
            <Field label="Unit" value={card.unitCode} />
            <Field label="Receipt No" value={card.receiptNo} />
            <Field label="Man. C/A Code" value={[info.currentAccountCode, info.currentAccountName].filter(Boolean).join(" — ") || null} />
            <Field label="Warehouse Quantity" value={card.warehouseQuantity != null ? card.warehouseQuantity.toLocaleString() : null} />
          </div>

          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Yarn Recipe
              {recipe?.source && <span className="ml-1.5 font-normal normal-case">— {RECIPE_SOURCE[recipe.source]} from Work Order {info.workOrderNo}&apos;s Fabric BOM</span>}
            </p>
            {detailError ? (
              <p className="text-xs text-red-700 dark:text-red-400">{detailError}</p>
            ) : !detail ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : recipe?.status === "ok" ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Yarn Code</th>
                    <th className="py-1 pr-2 font-medium">Yarn Name</th>
                    <th className="py-1 pr-2 font-medium">Process</th>
                    <th className="py-1 pr-2 font-medium">Variant</th>
                    <th className="py-1 pr-2 text-right font-medium">%</th>
                    <th className="py-1 text-right font-medium">Waste / Dye %</th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="py-1 pr-2 font-mono">{l.yarnCode || "—"}</td>
                      <td className="py-1 pr-2">{l.yarnName || "—"}</td>
                      <td className="py-1 pr-2">{l.process || "—"}</td>
                      <td className="py-1 pr-2">{[l.variant1, l.variant2].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{l.percentage.toLocaleString()}</td>
                      <td className="py-1 text-right tabular-nums">{l.wastePct.toLocaleString()} / {l.dyeWastagePct.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground">{recipe?.message ?? "No Yarn Recipe available."}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Explanation</label>
              <Input className="h-8 text-sm" disabled={readOnly} value={form.Explanation ?? ""} onChange={(e) => set({ Explanation: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Party No</label>
              <Input className="h-8 text-sm" disabled={readOnly} value={form.PartyNo ?? ""} onChange={(e) => set({ PartyNo: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Manufacturer Serial</label>
              <Input className="h-8 text-sm" disabled={readOnly} value={form.ProducerSerialCode ?? ""} onChange={(e) => set({ ProducerSerialCode: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Quality Type</label>
              <MasterAutocompleteField
                label="" masterKey="quality-type"
                displayValue={form.qualityTypeName ?? ""}
                onSelect={(o) => set({ QualityTypeId: Number(o.id), qualityTypeName: o.name })}
                onClear={() => set({ QualityTypeId: null, qualityTypeName: null })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Resource</label>
              <MasterAutocompleteField
                label="" masterKey="resource"
                displayValue={form.resourceCode ?? ""}
                onSelect={(o) => set({ ResourceId: Number(o.id), resourceCode: o.code ?? o.name })}
                onClear={() => set({ ResourceId: null, resourceCode: null })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Employee</label>
              <MasterAutocompleteField
                label="" masterKey="employee"
                displayValue={form.employeeName ?? ""}
                onSelect={(o) => set({ EmployeeId: Number(o.id), employeeName: o.name })}
                onClear={() => set({ EmployeeId: null, employeeName: null })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Product Date</label>
              <Input type="date" className="h-8 text-sm" disabled={readOnly} value={fmtDate(form.ManufacturingDate ?? null)} onChange={(e) => set({ ManufacturingDate: e.target.value || null })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Quantity</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.Quantity ?? ""} onChange={(e) => set({ Quantity: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Piece Count</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.PieceCount ?? ""} onChange={(e) => set({ PieceCount: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Width</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.Width ?? ""} onChange={(e) => set({ Width: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">GSM (Grams)</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.Weight ?? ""} onChange={(e) => set({ Weight: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">M2</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.WeightM2 ?? ""} onChange={(e) => set({ WeightM2: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Raw Width</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.RawWidth ?? ""} onChange={(e) => set({ RawWidth: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Raw Weight</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.RawWeight ?? ""} onChange={(e) => set({ RawWeight: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Raw Length</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.RawLength ?? ""} onChange={(e) => set({ RawLength: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Product Length</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.ProductLength ?? ""} onChange={(e) => set({ ProductLength: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Pus</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.Pus ?? ""} onChange={(e) => set({ Pus: e.target.value as any })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Fine</label>
              <Input type="number" className="h-8 text-sm" disabled={readOnly} value={form.Fine ?? ""} onChange={(e) => set({ Fine: e.target.value as any })} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          {!readOnly && (
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving..." : "Update"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
