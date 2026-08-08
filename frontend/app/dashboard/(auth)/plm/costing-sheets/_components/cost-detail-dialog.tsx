"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormRow } from "@/components/forms/form-row";

const fmt2 = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CURRENCIES = ["PKR", "Usdollar", "Euro", "GBP"];
const WASTE_TYPES = ["Cutting", "Process", "Other"];
const LABOR_TYPES = ["In-house", "Subcontract"];

export type ForexRow = { currency: string; rate: number };
export type MaterialLine = { explanation: string; pct: number; wastePct: number; wasteType: string; price: number; laborType: string; laborAmount: number };
export type LaborLine = { explanation: string; pct: number; type: string; price: number };

export type CostDetailValue = {
  forex: ForexRow[];
  materials: MaterialLine[];
  manufacturingType: string;
  manufacturingPrice: number;
  manufacturingWaste: string;
  labor: LaborLine[];
  dyePrintWidthWeight: string;
  dyePrintWastagePct: string;
  dyePrintType: string;
  dyePrintPrice: number;
};

const emptyMaterialLine = (): MaterialLine => ({ explanation: "", pct: 0, wastePct: 0, wasteType: "", price: 0, laborType: "", laborAmount: 0 });
const emptyLaborLine = (): LaborLine => ({ explanation: "", pct: 0, type: "", price: 0 });

export const DEFAULT_COST_DETAIL: CostDetailValue = {
  forex: [{ currency: "PKR", rate: 0 }, { currency: "Usdollar", rate: 0 }, { currency: "", rate: 0 }],
  materials: [
    { explanation: "30/1 organic cotton card", pct: 70, wastePct: 0, wasteType: "", price: 1091, laborType: "", laborAmount: 0 },
    { explanation: "10/1 organic cotton card", pct: 30, wastePct: 0, wasteType: "", price: 993, laborType: "", laborAmount: 0 },
    emptyMaterialLine(), emptyMaterialLine(), emptyMaterialLine(),
  ],
  manufacturingType: "",
  manufacturingPrice: 30,
  manufacturingWaste: "",
  labor: [
    { explanation: "Fabric Bleaching", pct: 0, type: "", price: 0 },
    { explanation: "Heat Set", pct: 0, type: "", price: 0 },
    { explanation: "Fabric Dyeing", pct: 0, type: "", price: 400 },
    { explanation: "AOP", pct: 0, type: "", price: 0 },
    { explanation: "GMT Dyeing", pct: 0, type: "", price: 0 },
  ],
  dyePrintWidthWeight: "",
  dyePrintWastagePct: "",
  dyePrintType: "",
  dyePrintPrice: 0,
};

export const emptyCostDetail = (): CostDetailValue => ({
  forex: [{ currency: "PKR", rate: 0 }, { currency: "Usdollar", rate: 0 }, { currency: "", rate: 0 }],
  materials: Array.from({ length: 5 }, emptyMaterialLine),
  manufacturingType: "",
  manufacturingPrice: 0,
  manufacturingWaste: "",
  labor: [
    { explanation: "Fabric Bleaching", pct: 0, type: "", price: 0 },
    { explanation: "Heat Set", pct: 0, type: "", price: 0 },
    { explanation: "Fabric Dyeing", pct: 0, type: "", price: 0 },
    { explanation: "AOP", pct: 0, type: "", price: 0 },
    { explanation: "GMT Dyeing", pct: 0, type: "", price: 0 },
  ],
  dyePrintWidthWeight: "",
  dyePrintWastagePct: "",
  dyePrintType: "",
  dyePrintPrice: 0,
});

function SectionBar({ title }: { title: string }) {
  return <div className="bg-muted text-center text-xs font-semibold py-1 border-y">{title}</div>;
}

function SummaryLine({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-end gap-3 px-2 py-1 text-xs ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono w-24 text-right">{fmt2(value)}</span>
    </div>
  );
}

export function CostDetailFormBody({
  value,
  setValue,
  onTotalChange,
}: {
  value: CostDetailValue;
  setValue: React.Dispatch<React.SetStateAction<CostDetailValue>>;
  onTotalChange?: (total: number) => void;
}) {
  const rawMaterialTotal = useMemo(
    () => value.materials.reduce((s, m) => s + m.price * (m.pct / 100) * (1 + m.wastePct / 100) + (m.laborAmount || 0), 0),
    [value.materials]
  );
  const manufacturingAmount = value.manufacturingPrice * (1 + (parseFloat(value.manufacturingWaste) || 0) / 100);
  const subtotal1 = rawMaterialTotal + manufacturingAmount;

  const laborTotal = useMemo(
    () => value.labor.reduce((s, l) => s + l.price * (1 + l.pct / 100), 0),
    [value.labor]
  );
  const subtotal2 = subtotal1 + laborTotal;

  const dyePrintAmount = value.dyePrintPrice * (1 + (parseFloat(value.dyePrintWastagePct) || 0) / 100);
  const totalCost = subtotal2 + dyePrintAmount;

  useEffect(() => { onTotalChange?.(totalCost); }, [totalCost]);

  const updateMaterial = (i: number, patch: Partial<MaterialLine>) =>
    setValue((v) => ({ ...v, materials: v.materials.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) }));
  const updateLabor = (i: number, patch: Partial<LaborLine>) =>
    setValue((v) => ({ ...v, labor: v.labor.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const updateForex = (i: number, patch: Partial<ForexRow>) =>
    setValue((v) => ({ ...v, forex: v.forex.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }));

  return (
    <>
      <SectionBar title="Forex Info" />
          <div className="flex items-center gap-2 p-2">
            {value.forex.map((f, i) => (
              <div key={i} className="flex items-center gap-1 flex-1">
                <Select value={f.currency || undefined} onValueChange={(v) => updateForex(i, { currency: v })}>
                  <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" value={f.rate} onChange={(e) => updateForex(i, { rate: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-right font-mono" />
              </div>
            ))}
          </div>

          <SectionBar title="Raw Material Costs" />
          <div className="p-2 space-y-1">
            <div className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground font-medium">
              <span className="flex-1 min-w-0">Explanation</span>
              <span className="w-16 text-right">%</span>
              <span className="w-16 text-right">Waste.%</span>
              <span className="w-20">&nbsp;</span>
              <span className="w-24 text-right">Price</span>
              <span className="w-20">Labor</span>
              <span className="w-20 text-right">&nbsp;</span>
              <span className="w-20 text-right">Amount</span>
            </div>
            {value.materials.map((m, i) => {
              const amount = m.price * (m.pct / 100) * (1 + m.wastePct / 100) + (m.laborAmount || 0);
              return (
                <div key={i} className="flex items-center gap-1">
                  <Input value={m.explanation} onChange={(e) => updateMaterial(i, { explanation: e.target.value })} className="h-7 text-xs flex-1 min-w-0" />
                  <Input type="number" value={m.pct || ""} onChange={(e) => updateMaterial(i, { pct: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-right font-mono w-16" />
                  <Input type="number" value={m.wastePct || ""} onChange={(e) => updateMaterial(i, { wastePct: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-right font-mono w-16" />
                  <Select value={m.wasteType || undefined} onValueChange={(v) => updateMaterial(i, { wasteType: v })}>
                    <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{WASTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" value={m.price || ""} onChange={(e) => updateMaterial(i, { price: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-right font-mono w-24" />
                  <Select value={m.laborType || undefined} onValueChange={(v) => updateMaterial(i, { laborType: v })}>
                    <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{LABOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" value={m.laborAmount || ""} onChange={(e) => updateMaterial(i, { laborAmount: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-right font-mono w-20" />
                  <span className="w-20 text-right font-mono text-xs pr-1">{fmt2(amount)}</span>
                </div>
              );
            })}
          </div>

          <div className="border-t">
            <SummaryLine label="Raw Material Costs" value={rawMaterialTotal} bold />
            <FormRow label="Manufacturing Price" className="px-2">
              <Select value={value.manufacturingType || undefined} onValueChange={(v) => setValue((s) => ({ ...s, manufacturingType: v }))}>
                <SelectTrigger className="h-7 text-xs w-24"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{WASTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={value.manufacturingPrice || ""} onChange={(e) => setValue((s) => ({ ...s, manufacturingPrice: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs text-right font-mono w-28" />
            </FormRow>
            <FormRow label="Manufacturing Waste" className="px-2">
              <Input value={value.manufacturingWaste} onChange={(e) => setValue((s) => ({ ...s, manufacturingWaste: e.target.value }))} className="h-7 text-xs flex-1" />
            </FormRow>
            <SummaryLine label="Subtotal" value={subtotal1} bold />
          </div>

          <SectionBar title="Labor Costs" />
          <div className="p-2 space-y-1">
            <div className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground font-medium">
              <span className="flex-1">Explanation</span>
              <span className="w-16 text-right">%</span>
              <span className="w-20">&nbsp;</span>
              <span className="w-24 text-right">Price</span>
              <span className="w-20 text-right">Amount</span>
            </div>
            {value.labor.map((l, i) => {
              const amount = l.price * (1 + l.pct / 100);
              return (
                <div key={i} className="flex items-center gap-1">
                  <Input value={l.explanation} onChange={(e) => updateLabor(i, { explanation: e.target.value })} className="h-7 text-xs flex-1" />
                  <Input type="number" value={l.pct || ""} onChange={(e) => updateLabor(i, { pct: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-right font-mono w-16" />
                  <Select value={l.type || undefined} onValueChange={(v) => updateLabor(i, { type: v })}>
                    <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{LABOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" value={l.price || ""} onChange={(e) => updateLabor(i, { price: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-right font-mono w-24" />
                  <span className="w-20 text-right font-mono text-xs pr-1">{fmt2(amount)}</span>
                </div>
              );
            })}
          </div>

          <div className="border-t">
            <SummaryLine label="Subtotal" value={subtotal2} bold />
            <FormRow label="Dye - Print Width / Weight" labelWidth="w-44" className="px-2">
              <Input value={value.dyePrintWidthWeight} onChange={(e) => setValue((s) => ({ ...s, dyePrintWidthWeight: e.target.value }))} className="h-7 text-xs flex-1" />
            </FormRow>
            <FormRow label="Dye - Print Wastage %" labelWidth="w-44" className="px-2">
              <Input value={value.dyePrintWastagePct} onChange={(e) => setValue((s) => ({ ...s, dyePrintWastagePct: e.target.value }))} className="h-7 text-xs flex-1" />
            </FormRow>
            <FormRow label="Dye - Print Price" labelWidth="w-44" className="px-2">
              <Select value={value.dyePrintType || undefined} onValueChange={(v) => setValue((s) => ({ ...s, dyePrintType: v }))}>
                <SelectTrigger className="h-7 text-xs w-24"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{WASTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={value.dyePrintPrice || ""} onChange={(e) => setValue((s) => ({ ...s, dyePrintPrice: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs text-right font-mono w-28" />
            </FormRow>
            <SummaryLine label="Total Cost" value={totalCost} bold />
          </div>
    </>
  );
}

export function CostDetailDialog({
  open,
  onOpenChange,
  initialValue,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: CostDetailValue;
  onSave: (totalCost: number, value: CostDetailValue) => void;
}) {
  const [value, setValue] = useState<CostDetailValue>(initialValue || DEFAULT_COST_DETAIL);
  const [total, setTotal] = useState(0);

  const handleOpenChange = (o: boolean) => {
    if (o) setValue(initialValue || DEFAULT_COST_DETAIL);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-2 border-b">
          <DialogTitle className="text-sm">Cost Detail Entry</DialogTitle>
        </DialogHeader>

        <div className="max-h-[80vh] overflow-y-auto">
          <CostDetailFormBody value={value} setValue={setValue} onTotalChange={setTotal} />
        </div>

        <DialogFooter className="flex-row justify-between items-center px-4 py-2 border-t sm:justify-between">
          <Button size="sm" onClick={() => { onSave(total, value); onOpenChange(false); }}>Save</Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
