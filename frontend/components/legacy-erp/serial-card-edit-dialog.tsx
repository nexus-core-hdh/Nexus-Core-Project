"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { legacyErpApi, type SerialCardUpdateItem } from "@/lib/nexuscore-api";
import { serialCardToUpdateItem } from "@/lib/legacy-erp/serial-card-update";
import { SerialCardDetailView } from "./serial-card-detail-view";
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
  /** The ERP link earlier labels encoded (<ERP>/s/<Serial No>). Current labels encode the card's
   *  data as text instead (lib/legacy-erp/serial-card-qr-text.ts). */
  qrPayload?: string | null;
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
          <SerialCardDetailView
            card={card} detail={detail} detailError={detailError}
            actions={
              <Button size="sm" variant="outline" className="h-7" onClick={printLabel} disabled={!detail}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />Print Label
              </Button>
            }
          />

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
