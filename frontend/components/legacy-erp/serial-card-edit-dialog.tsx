"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { legacyErpApi, type SerialCardUpdateItem } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Save, Tag } from "lucide-react";

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
  warehouseQuantity?: number;
  hasTransaction?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "view" | "update";
  card: SerialCardRow | null;
  onSaved?: () => void;
}

const num = (v: any) => (v === "" || v == null ? null : Number(v));
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

export function SerialCardEditDialog({ open, onOpenChange, mode, card, onSaved }: Props) {
  const [form, setForm] = useState<Partial<SerialCardRow>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && card) setForm(card);
  }, [open, card]);

  const set = (patch: Partial<SerialCardRow>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!card) return;
    setSaving(true);
    try {
      const item: SerialCardUpdateItem = {
        id: card.RecId,
        explanation: form.Explanation ?? null,
        partyNo: form.PartyNo ?? null,
        qualityTypeId: form.QualityTypeId ?? null,
        resourceId: form.ResourceId ?? null,
        employeeId: form.EmployeeId ?? null,
        producerSerialCode: form.ProducerSerialCode ?? null,
        manufacturingDate: form.ManufacturingDate ?? null,
        quantity: num(form.Quantity),
        width: num(form.Width),
        weight: num(form.Weight),
        rawWidth: num(form.RawWidth),
        rawWeight: num(form.RawWeight),
        rawLength: num(form.RawLength),
        productLength: num(form.ProductLength),
        weightM2: num(form.WeightM2),
        pus: num(form.Pus),
        fine: num(form.Fine),
        pieceCount: num(form.PieceCount),
      };
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
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 lg:grid-cols-3">
            <Field label="Inventory Code" value={card.inventoryCode} />
            <Field label="Inventory Name" value={card.inventoryName} />
            <Field label="Variant" value={card.variantCode || card.variantName} />
            <Field label="Color" value={card.colorCode || card.colorName} />
            <Field label="Unit" value={card.unitCode} />
            <Field label="Order No" value={card.workOrderNo} />
            <Field label="Receipt No" value={card.receiptNo} />
            <Field label="Warehouse Quantity" value={card.warehouseQuantity != null ? card.warehouseQuantity.toLocaleString() : null} />
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
