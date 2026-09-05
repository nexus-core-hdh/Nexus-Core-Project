"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Plus, Trash2, Search, Scissors } from "lucide-react";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { cn } from "@/lib/utils";
import { AutocompleteTextCell, type AutocompleteOption } from "@/components/legacy-erp/autocomplete-text-cell";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";

const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v: any) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const round4 = (n: number) => Math.round(n * 10000) / 10000;
// Same tolerance style-cards/[id]/_components/bom-tab.tsx and the backend's own
// fabric-yarn-recipe.service.ts use for "is this total actually 100%" — absorbs floating-point/
// display rounding noise, not a relaxed business rule.
const PCT_TOLERANCE = 0.01;

type YarnRecipeRow = {
  id: string;
  yarnInventoryId: number | null;
  yarnCode: string;
  yarnName: string;
  explanation: string;
  variant1: string;
  variant2: string;
  process: string;
  knittedInVariants: string;
  percentage: number;
  wastePct: number;
  dyeWastagePct: number;
};

const blankRow = (): YarnRecipeRow => ({
  id: uid(), yarnInventoryId: null, yarnCode: "", yarnName: "",
  explanation: "", variant1: "", variant2: "", process: "", knittedInVariants: "",
  percentage: 0, wastePct: 0, dyeWastagePct: 0,
});

interface YarnRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fabricInventoryId: number;
  fabricCode: string;
  fabricName: string;
  // The specific BOM row's own Calculated Quantity — Quantity (Market Length x Market Width x
  // Market Weight, converted into the row's selected Unit) after Fabric-level Dye/Print(Waste)/
  // Other Waste %, via bom-tab.tsx's own applyWaste — reused as-is, purely to preview each Yarn
  // row's own share of it (Calculated Quantity x %). This dialog introduces no quantity
  // calculation of its own, and does not apply each Yarn row's own Waste %/Dye Wastage % here —
  // that belongs to a separate future Yarn Requirement/Consumption screen.
  fabricQuantity: number;
  fabricUnit: string;
}

// Fabric Card Yarn Recipe — a dedicated multi-row composition editor for a Fabric Card, opened
// from its BOM row (see bom-tab.tsx's Fabric Name cell). Persisted against the Fabric Card itself
// (FabricYarnRecipeLine.fabricInventoryId) so it's shared across every BOM row/Style Card that
// reuses the same Fabric Card, not duplicated per BOM line. Yarn selection reuses the exact same
// two lookup mechanisms bom-tab.tsx's own Fabric/Trim Name cell already established: an inline
// AutocompleteTextCell for type-to-search, and CardLookupDialog (the same generic grid-lookup
// dialog, pointed at legacyErpApi.yarnCards.list) for browsing the full Yarn Card list.
export function YarnRecipeDialog({ open, onOpenChange, fabricInventoryId, fabricCode, fabricName, fabricQuantity, fabricUnit }: YarnRecipeDialogProps) {
  const [rows, setRows] = useState<YarnRecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Global Decimal Parameters — same "round only at the point of sending to the API" convention
  // bom-tab.tsx's own save() already uses (decimalKey "recipe-percent" — the exact "Recipe %"
  // field DECIMAL_FIELD_DEFS already defines), applied uniformly to every caller of this shared
  // dialog (Style Card, Sample Card, Work Order all reuse it as-is).
  const { round, ensureLoaded: ensureDecimalParamsLoaded } = useDecimalParameters();
  useEffect(() => { ensureDecimalParamsLoaded(); }, [ensureDecimalParamsLoaded]);
  const [yarnOptions, setYarnOptions] = useState<AutocompleteOption[]>([]);
  const yarnCacheRef = useRef<Record<string, any>>({});
  const [lookupRowId, setLookupRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      legacyErpApi.fabricCards.getYarnRecipe(fabricInventoryId).catch(() => []),
      legacyErpApi.yarnCards.list().catch(() => []),
    ]).then(([recipe, yarns]: [any, any]) => {
      const recipeList = Array.isArray(recipe) ? recipe : [];
      setRows(
        recipeList.length
          ? recipeList.map((l: any) => ({
              id: l.id, yarnInventoryId: l.yarnInventoryId ?? null, yarnCode: l.yarnCode || "", yarnName: l.yarnName || "",
              explanation: l.explanation || "", variant1: l.variant1 || "", variant2: l.variant2 || "", process: l.process || "",
              knittedInVariants: l.knittedInVariants || "", percentage: num(l.percentage), wastePct: num(l.wastePct), dyeWastagePct: num(l.dyeWastagePct),
            }))
          : [blankRow(), blankRow()]
      );
      const yarnList = Array.isArray(yarns) ? yarns : [];
      yarnList.forEach((y: any) => { yarnCacheRef.current[String(y.id)] = y; });
      setYarnOptions(yarnList.map((y: any) => ({ id: String(y.id), code: y.inventoryCode, name: y.inventoryName })));
    }).finally(() => setLoading(false));
  }, [open, fabricInventoryId]);

  const update = (id: string, patch: Partial<YarnRecipeRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const selectYarn = (rowId: string, yarnId: number, code: string, name: string) =>
    update(rowId, { yarnInventoryId: yarnId, yarnCode: code, yarnName: name });

  // Same "row not blank" rule the backend enforces (fabric-yarn-recipe.service.ts's own
  // isBlankLine) — a freshly-added, still-empty row doesn't count toward the total or block Save.
  const activeRows = useMemo(() => rows.filter((r) => r.yarnInventoryId != null || r.percentage > 0), [rows]);
  const totalPct = useMemo(() => round4(activeRows.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0)), [activeRows]);
  const totalValid = activeRows.length === 0 || Math.abs(totalPct - 100) <= PCT_TOLERANCE;

  const save = async () => {
    if (!totalValid) {
      toast.error(`Total Yarn % must equal 100% (currently ${totalPct}%)`);
      return;
    }
    setSaving(true);
    try {
      const roundedRows = rows.map((r) => ({
        ...r,
        percentage: round(r.percentage, "recipe-percent"),
        wastePct: round(r.wastePct, "recipe-percent"),
        dyeWastagePct: round(r.dyeWastagePct, "recipe-percent"),
      }));
      const saved = await legacyErpApi.fabricCards.upsertYarnRecipe(fabricInventoryId, roundedRows);
      toast.success("Yarn Recipe saved");
      const list = Array.isArray(saved) ? saved : [];
      setRows(
        list.length
          ? list.map((l: any) => ({
              id: l.id, yarnInventoryId: l.yarnInventoryId ?? null, yarnCode: l.yarnCode || "", yarnName: l.yarnName || "",
              explanation: l.explanation || "", variant1: l.variant1 || "", variant2: l.variant2 || "", process: l.process || "",
              knittedInVariants: l.knittedInVariants || "", percentage: num(l.percentage), wastePct: num(l.wastePct), dyeWastagePct: num(l.dyeWastagePct),
            }))
          : [blankRow(), blankRow()]
      );
    } catch (e: any) {
      // Backend validation (Fabric/Yarn existence, % >= 0, total == 100%) is authoritative — this
      // is the one place its message actually reaches the user; the client-side totalValid check
      // above is supplementary (catches the common case before a round-trip, per the requirement).
      toast.error(e.message || "Failed to save Yarn Recipe");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] max-w-6xl flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2"><Scissors className="h-4 w-4" />Yarn Recipe Detail</DialogTitle>
            <DialogDescription>
              Fabric: <span className="font-mono text-foreground">{fabricCode}</span> — <span className="text-foreground">{fabricName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
            <div
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium",
                activeRows.length === 0 ? "text-muted-foreground" : totalValid ? "text-emerald-600" : "text-destructive"
              )}
            >
              {activeRows.length > 0 && (totalValid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />)}
              Total: {totalPct}%{activeRows.length > 0 && !totalValid && " — Must equal 100%"}
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Yarn
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading...</p>
            ) : (
              <Table className="table-fixed" style={{ minWidth: 1400 }}>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8 [&>th]:whitespace-nowrap">
                    <TableHead style={{ width: 110 }}>Inventory Code</TableHead>
                    <TableHead style={{ width: 220 }}>Inventory Name</TableHead>
                    <TableHead style={{ width: 160 }}>Explanation</TableHead>
                    <TableHead style={{ width: 110 }}>Variant-1</TableHead>
                    <TableHead style={{ width: 110 }}>Variant-2</TableHead>
                    <TableHead style={{ width: 130 }}>Process</TableHead>
                    <TableHead style={{ width: 130 }}>Knitted in Variants</TableHead>
                    <TableHead style={{ width: 90 }} className="text-right">%</TableHead>
                    <TableHead style={{ width: 90 }} className="text-right">Waste %</TableHead>
                    <TableHead style={{ width: 110 }} className="text-right">Dye Wastage %</TableHead>
                    <TableHead style={{ width: 120 }} className="text-right">Yarn Quantity</TableHead>
                    <TableHead style={{ width: 40 }} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    // fabricQuantity is the Fabric's own Calculated Quantity (Quantity after
                    // Fabric-level Dye/Print/Other Waste — bom-tab.tsx computes it via the same
                    // applyWaste before passing it in). This row's own Waste %/Dye Wastage % is
                    // captured/persisted but deliberately NOT applied here — Yarn Waste belongs to
                    // a separate future Yarn Requirement/Consumption screen (Yarn Base Requirement
                    // -> Yarn Waste -> Final Yarn Requirement), not this preview.
                    const yarnQty = round4(fabricQuantity * ((Number(r.percentage) || 0) / 100));
                    return (
                      <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                        <TableCell className="px-2 text-xs font-mono text-muted-foreground">{r.yarnCode || "—"}</TableCell>
                        <TableCell className="p-0">
                          <div className="flex h-full w-full items-stretch">
                            <div className="min-w-0 flex-1">
                              <AutocompleteTextCell
                                value={r.yarnName}
                                options={yarnOptions}
                                placeholder="Type to Search"
                                startOpen={false}
                                onChange={(v) => update(r.id, { yarnName: v })}
                                onCancel={() => {}}
                                onCommit={(finalValue) =>
                                  update(r.id, finalValue.trim() ? { yarnName: finalValue } : { yarnName: "", yarnInventoryId: null, yarnCode: "" })
                                }
                                onSelectOption={(o) => selectYarn(r.id, Number(o.id), String(o.code ?? ""), o.name || "")}
                              />
                            </div>
                            <button
                              type="button"
                              title="Browse Yarn Cards"
                              onClick={() => setLookupRowId(r.id)}
                              className="flex w-7 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <Search className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="p-0"><input className="h-7 w-full bg-transparent px-2 text-xs outline-none" value={r.explanation} onChange={(e) => update(r.id, { explanation: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input className="h-7 w-full bg-transparent px-2 text-xs outline-none" value={r.variant1} onChange={(e) => update(r.id, { variant1: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input className="h-7 w-full bg-transparent px-2 text-xs outline-none" value={r.variant2} onChange={(e) => update(r.id, { variant2: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input className="h-7 w-full bg-transparent px-2 text-xs outline-none" value={r.process} onChange={(e) => update(r.id, { process: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input className="h-7 w-full bg-transparent px-2 text-xs outline-none" value={r.knittedInVariants} onChange={(e) => update(r.id, { knittedInVariants: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input type="number" className="h-7 w-full bg-transparent px-2 text-right text-xs font-mono outline-none" value={r.percentage} onChange={(e) => update(r.id, { percentage: parseFloat(e.target.value) || 0 })} /></TableCell>
                        <TableCell className="p-0"><input type="number" className="h-7 w-full bg-transparent px-2 text-right text-xs font-mono outline-none" value={r.wastePct} onChange={(e) => update(r.id, { wastePct: parseFloat(e.target.value) || 0 })} /></TableCell>
                        <TableCell className="p-0"><input type="number" className="h-7 w-full bg-transparent px-2 text-right text-xs font-mono outline-none" value={r.dyeWastagePct} onChange={(e) => update(r.id, { dyeWastagePct: parseFloat(e.target.value) || 0 })} /></TableCell>
                        <TableCell className="px-2 text-right font-mono text-xs text-muted-foreground">{r.percentage > 0 ? `${yarnQty} ${fabricUnit || ""}`.trim() : "—"}</TableCell>
                        <TableCell className="p-0 text-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(r.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lookupRowId && (
        <CardLookupDialog<CardLookupRow>
          open={!!lookupRowId}
          onOpenChange={(open) => !open && setLookupRowId(null)}
          title="Select Yarn Card"
          fetchOptions={legacyErpApi.yarnCards.list}
          onSelect={(row: any) => {
            yarnCacheRef.current[String(row.id)] = row;
            selectYarn(lookupRowId, Number(row.id), row.inventoryCode || "", row.inventoryName || "");
          }}
        />
      )}
    </>
  );
}
