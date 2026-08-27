"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { plmApi, legacyErpApi } from "@/lib/nexuscore-api";
import { GridInput, GridCheckbox, uid, num } from "./grid-input";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";

type BomRow = {
  id: string;
  lineType: string;
  fabricCode: string;
  fabricName: string;
  explanation: string;
  placement: string;
  process: string;
  variant: string;
  rowColumn: string;
  swatchCardId: string;
  willBeCut: boolean;
  mainFabric: boolean;
  unit: string;
  quantity: number;
  wastePct: number;
  dyeWastagePct: number;
  otherWastagePct: number;
  unitPrice: number;
  component: string;
  dia: string;
  gauge: string;
  finishWidth: string;
  finishRoute: string;
  revision: string;
};

const LINE_TYPES = [
  { value: "fabric", label: "Fabric" },
  { value: "trim", label: "Trim" },
  { value: "ornament", label: "Ornament" },
  { value: "process", label: "Process" },
];

const blankRow = (lineType: string): BomRow => ({
  id: uid(), lineType, fabricCode: "", fabricName: "", explanation: "", placement: "", process: "",
  variant: "", rowColumn: "", swatchCardId: "", willBeCut: false, mainFabric: false, unit: "",
  quantity: 0, wastePct: 0, dyeWastagePct: 0, otherWastagePct: 0, unitPrice: 0, component: "",
  dia: "", gauge: "", finishWidth: "", finishRoute: "", revision: "",
});

export function BomTab({ styleCardId, card, onReloadCard }: { styleCardId: string; card: any; onReloadCard: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<BomRow[]>([]);
  const [swatches, setSwatches] = useState<any[]>([]);
  const [processCards, setProcessCards] = useState<any[]>([]);
  const [header, setHeader] = useState({
    bomRouteCode: card.bomRouteCode || "",
    bomEmbroideryRoute: card.bomEmbroideryRoute || "",
    bomCmtPrice: card.bomCmtPrice ?? 0,
    bomRunningQuantity: card.bomRunningQuantity ?? 0,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [lines, sw, pc] = await Promise.all([
        plmApi.styleBom.get(styleCardId),
        plmApi.swatchCards.list().catch(() => ({ data: [] })),
        plmApi.processCards.list().catch(() => ({ data: [] })),
      ]);
      setRows((Array.isArray(lines) ? lines : []).map((l: any) => ({
        id: l.id, lineType: l.lineType, fabricCode: l.fabricCode || "", fabricName: l.fabricName || "",
        explanation: l.explanation || "", placement: l.placement || "", process: l.process || "",
        variant: l.variant || "", rowColumn: l.rowColumn || "", swatchCardId: l.swatchCardId || "",
        willBeCut: !!l.willBeCut, mainFabric: !!l.mainFabric, unit: l.unit || "", quantity: num(l.quantity),
        wastePct: num(l.wastePct), dyeWastagePct: num(l.dyeWastagePct), otherWastagePct: num(l.otherWastagePct),
        unitPrice: num(l.unitPrice), component: l.component || "", dia: l.dia || "", gauge: l.gauge || "",
        finishWidth: l.finishWidth || "", finishRoute: l.finishRoute || "", revision: l.revision || "",
      })));
      setSwatches(Array.isArray(sw) ? sw : (sw as any)?.data || []);
      setProcessCards(Array.isArray(pc) ? pc : (pc as any)?.data || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load BOM");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [styleCardId]);
  useEffect(() => {
    setHeader({
      bomRouteCode: card.bomRouteCode || "",
      bomEmbroideryRoute: card.bomEmbroideryRoute || "",
      bomCmtPrice: card.bomCmtPrice ?? 0,
      bomRunningQuantity: card.bomRunningQuantity ?? 0,
    });
  }, [card]);

  const update = (id: string, patch: Partial<BomRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = (lineType: string) => setRows((rs) => [...rs, blankRow(lineType)]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        plmApi.styleCards.update(styleCardId, header),
        plmApi.styleBom.upsertLines(styleCardId, rows),
      ]);
      toast.success("BOM saved");
      onReloadCard();
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save BOM");
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const g: Record<string, BomRow[]> = { fabric: [], trim: [], ornament: [], process: [] };
    rows.forEach((r) => { (g[r.lineType] ||= []).push(r); });
    return g;
  }, [rows]);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading BOM...</p>;

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Route Code</Label>
          <Input className="h-8 text-sm" value={header.bomRouteCode} onChange={(e) => setHeader((h) => ({ ...h, bomRouteCode: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Embroidery Route</Label>
          <Input className="h-8 text-sm" value={header.bomEmbroideryRoute} onChange={(e) => setHeader((h) => ({ ...h, bomEmbroideryRoute: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">CMT Price</Label>
          <Input type="number" className="h-8 text-sm font-mono" value={header.bomCmtPrice} onChange={(e) => setHeader((h) => ({ ...h, bomCmtPrice: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Running Quantity</Label>
          <Input type="number" className="h-8 text-sm font-mono" value={header.bomRunningQuantity} onChange={(e) => setHeader((h) => ({ ...h, bomRunningQuantity: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>

      <Tabs defaultValue="fabric">
        <div className="flex items-center justify-between">
          <TabsList>{LINE_TYPES.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label} ({grouped[t.value]?.length ?? 0})</TabsTrigger>)}</TabsList>
          <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
        </div>

        {LINE_TYPES.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-3">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8 [&>th]:whitespace-nowrap">
                    <TableHead>Fabric Code</TableHead>
                    <TableHead className="min-w-[160px]">Fabric Name</TableHead>
                    <TableHead className="min-w-[160px]">Explanation</TableHead>
                    <TableHead>Placement</TableHead>
                    <TableHead>Process</TableHead>
                    <TableHead>Variant-1</TableHead>
                    <TableHead>Row/Column</TableHead>
                    <TableHead className="min-w-[160px]">Choose Color</TableHead>
                    <TableHead className="text-center">Will be Cut</TableHead>
                    <TableHead className="text-center">Main Fabric</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Waste %</TableHead>
                    <TableHead className="text-right">Dye Wastage %</TableHead>
                    <TableHead className="text-right">Other Wastage %</TableHead>
                    <TableHead className="text-right">Total Waste %</TableHead>
                    <TableHead className="text-right">Calculated Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead>Dia</TableHead>
                    <TableHead>Gauge</TableHead>
                    <TableHead>Finish Width</TableHead>
                    <TableHead>Finish Route</TableHead>
                    <TableHead>Revision</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(grouped[t.value] || []).map((r) => {
                    const totalWaste = r.wastePct + r.dyeWastagePct + r.otherWastagePct;
                    const calculatedQty = r.quantity * (1 + totalWaste / 100);
                    return (
                      <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                        <TableCell>
                          {r.lineType === "fabric" || r.lineType === "trim" ? (
                            <span className="px-2 text-xs text-muted-foreground font-mono">{r.fabricCode || "—"}</span>
                          ) : (
                            <GridInput value={r.fabricCode} onChange={(v) => update(r.id, { fabricCode: v })} />
                          )}
                        </TableCell>
                        <TableCell>
                          {r.lineType === "fabric" || r.lineType === "trim" ? (
                            <MasterAutocompleteField compact label={r.lineType === "fabric" ? "Fabric" : "Trim"}
                              masterKey={r.lineType} displayValue={r.fabricName}
                              fetchOptions={(t) => (r.lineType === "fabric" ? legacyErpApi.fabricCards.list(t) : legacyErpApi.trimInventoryCards.list(t))
                                .then((rows: any[]) => (Array.isArray(rows) ? rows : []).map((row: any) => ({ id: row.id, code: row.inventoryCode, name: row.inventoryName })))}
                              lookupPath={r.lineType === "fabric" ? "/dashboard/legacy-erp/fabric-cards" : "/dashboard/legacy-erp/trim-inventory-cards"}
                              onSelect={(o) => update(r.id, { fabricCode: String(o.code ?? ""), fabricName: o.name })}
                              onClear={() => update(r.id, { fabricCode: "", fabricName: "" })}
                              onFreeTextCommit={(text) => update(r.id, { fabricName: text })}
                            />
                          ) : (
                            <GridInput value={r.fabricName} onChange={(v) => update(r.id, { fabricName: v })} />
                          )}
                        </TableCell>
                        <TableCell><GridInput value={r.explanation} onChange={(v) => update(r.id, { explanation: v })} /></TableCell>
                        <TableCell><GridInput value={r.placement} onChange={(v) => update(r.id, { placement: v })} /></TableCell>
                        <TableCell className="p-1">
                          <select value={r.process} onChange={(e) => update(r.id, { process: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
                            <option value="">—</option>
                            {processCards.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                          </select>
                        </TableCell>
                        <TableCell><GridInput value={r.variant} onChange={(v) => update(r.id, { variant: v })} /></TableCell>
                        <TableCell><GridInput value={r.rowColumn} onChange={(v) => update(r.id, { rowColumn: v })} /></TableCell>
                        <TableCell className="p-1">
                          <select value={r.swatchCardId} onChange={(e) => update(r.id, { swatchCardId: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
                            <option value="">—</option>
                            {swatches.map((s) => <option key={s.id} value={s.id}>{s.colorName}{s.pantoneCode ? ` (${s.pantoneCode})` : ""}</option>)}
                          </select>
                        </TableCell>
                        <TableCell><GridCheckbox checked={r.willBeCut} onChange={(v) => update(r.id, { willBeCut: v })} /></TableCell>
                        <TableCell><GridCheckbox checked={r.mainFabric} onChange={(v) => update(r.id, { mainFabric: v })} /></TableCell>
                        <TableCell><GridInput value={r.unit} onChange={(v) => update(r.id, { unit: v })} /></TableCell>
                        <TableCell><GridInput type="number" align="right" value={r.quantity} onChange={(v) => update(r.id, { quantity: parseFloat(v) || 0 })} /></TableCell>
                        <TableCell><GridInput type="number" align="right" value={r.wastePct} onChange={(v) => update(r.id, { wastePct: parseFloat(v) || 0 })} /></TableCell>
                        <TableCell><GridInput type="number" align="right" value={r.dyeWastagePct} onChange={(v) => update(r.id, { dyeWastagePct: parseFloat(v) || 0 })} /></TableCell>
                        <TableCell><GridInput type="number" align="right" value={r.otherWastagePct} onChange={(v) => update(r.id, { otherWastagePct: parseFloat(v) || 0 })} /></TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{totalWaste.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{calculatedQty.toFixed(2)}</TableCell>
                        <TableCell><GridInput type="number" align="right" value={r.unitPrice} onChange={(v) => update(r.id, { unitPrice: parseFloat(v) || 0 })} /></TableCell>
                        <TableCell><GridInput value={r.component} onChange={(v) => update(r.id, { component: v })} /></TableCell>
                        <TableCell><GridInput value={r.dia} onChange={(v) => update(r.id, { dia: v })} /></TableCell>
                        <TableCell><GridInput value={r.gauge} onChange={(v) => update(r.id, { gauge: v })} /></TableCell>
                        <TableCell><GridInput value={r.finishWidth} onChange={(v) => update(r.id, { finishWidth: v })} /></TableCell>
                        <TableCell><GridInput value={r.finishRoute} onChange={(v) => update(r.id, { finishRoute: v })} /></TableCell>
                        <TableCell><GridInput value={r.revision} onChange={(v) => update(r.id, { revision: v })} /></TableCell>
                        <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(r.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={() => addRow(t.value)}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
