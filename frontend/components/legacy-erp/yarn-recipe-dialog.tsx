"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Plus, Trash2, Search, Scissors, Copy, Check, ChevronsUpDown, Pencil, Info } from "lucide-react";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { cn } from "@/lib/utils";
import { AutocompleteTextCell, type AutocompleteOption } from "@/components/legacy-erp/autocomplete-text-cell";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { normalizeNonNegative } from "@/lib/numeric-guards";

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
  // Opens the dialog already pointed at a specific bucket — used by the Yarn Recipe list screen
  // (legacy-erp/yarn-recipes) when a row's own view/edit action is clicked, so it lands on THAT
  // recipe instead of always Common. Omitted entirely by the BOM-tab caller (bom-tab.tsx), which
  // always wants the pre-existing "opens fresh at Common" behavior.
  initialRecipeType?: "common" | "color";
  initialColorId?: string | null;
}

type ColorOption = { id: string; code: string; name: string; color?: string | null };

// Fabric Card Yarn Recipe — a dedicated multi-row composition editor for a Fabric Card, opened
// from its BOM row (see bom-tab.tsx's Fabric Name cell). Persisted against the Fabric Card itself
// (FabricYarnRecipeLine.fabricInventoryId) so it's shared across every BOM row/Style Card that
// reuses the same Fabric Card, not duplicated per BOM line. Yarn selection reuses the exact same
// two lookup mechanisms bom-tab.tsx's own Fabric/Trim Name cell already established: an inline
// AutocompleteTextCell for type-to-search, and CardLookupDialog (the same generic grid-lookup
// dialog, pointed at legacyErpApi.yarnCards.list) for browsing the full Yarn Card list.
//
// Recipe Type — Common/Overall (the default, applies to every color of this fabric unless
// overridden) vs Color-Specific (an OPTIONAL per-color override, linked to a real ColorCard — the
// same "Choose Color" master every other color picker in this app already uses, never a new color
// system). Backed by FabricYarnRecipeLine's own colorCardId column: NULL rows are Common, rows
// with a real colorCardId belong to that one color. Each bucket is loaded/saved independently
// (exact match, no fallback here) — the Color-Specific-then-Common PRIORITY actual Yarn
// Requirement calculation uses lives entirely in the backend
// (FabricYarnRecipeService.resolveEffectiveRecipe), this dialog only ever edits ONE bucket at a
// time, whichever Recipe Type/Color is currently selected.
export function YarnRecipeDialog({ open, onOpenChange, fabricInventoryId, fabricCode, fabricName, fabricQuantity, fabricUnit, initialRecipeType, initialColorId }: YarnRecipeDialogProps) {
  // Defaults to Common/Overall every time the dialog opens — matches this dialog's own
  // pre-existing behavior exactly (it only ever edited the Fabric's one recipe before this
  // feature), so a user who never touches Recipe Type sees no change at all. A caller that passes
  // initialRecipeType/initialColorId (the Yarn Recipe list screen, opening one specific row) lands
  // on that bucket instead — see the reset-on-open effect below.
  const [recipeType, setRecipeType] = useState<"common" | "color">("common");
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [availableColors, setAvailableColors] = useState<ColorOption[]>([]);
  const [colorComboOpen, setColorComboOpen] = useState(false);

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
  // Row "Edit" affordance — jumps focus into that row's Explanation field so the pencil icon (kept
  // for visual/behavioral parity with the reference design) does something real rather than sitting
  // there as a no-op; every field is already directly inline-editable, so there is no separate
  // edit-mode to enter.
  const rowEditRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Reset to Common/Overall (or the caller's requested initial bucket) + reload the color list
  // fresh every time the dialog is (re)opened — never carries stale Recipe Type/Color selection
  // over from a previous open of a different (or the same) Fabric's recipe.
  useEffect(() => {
    if (!open) return;
    setRecipeType(initialRecipeType ?? "common");
    setSelectedColorId(initialRecipeType === "color" ? (initialColorId ?? null) : null);
    legacyErpApi.fabricCards.listYarnRecipeColors(fabricInventoryId).then((list: any) => {
      setAvailableColors(Array.isArray(list) ? list : []);
    }).catch(() => setAvailableColors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fabricInventoryId]);

  const rowsFromApi = (list: any[]): YarnRecipeRow[] =>
    list.length
      ? list.map((l: any) => ({
          id: l.id, yarnInventoryId: l.yarnInventoryId ?? null, yarnCode: l.yarnCode || "", yarnName: l.yarnName || "",
          explanation: l.explanation || "", variant1: l.variant1 || "", variant2: l.variant2 || "", process: l.process || "",
          knittedInVariants: l.knittedInVariants || "", percentage: num(l.percentage), wastePct: num(l.wastePct), dyeWastagePct: num(l.dyeWastagePct),
        }))
      : [blankRow(), blankRow()];

  // Yarn Card options loaded once per dialog open (independent of Recipe Type/Color — the same
  // full Yarn Card list applies to every bucket).
  useEffect(() => {
    if (!open) return;
    legacyErpApi.yarnCards.list().then((yarns: any) => {
      const yarnList = Array.isArray(yarns) ? yarns : [];
      yarnList.forEach((y: any) => { yarnCacheRef.current[String(y.id)] = y; });
      setYarnOptions(yarnList.map((y: any) => ({ id: String(y.id), code: y.inventoryCode, name: y.inventoryName })));
    }).catch(() => {});
  }, [open]);

  // Loads whichever bucket is currently selected — Common/Overall (recipeType "common") or one
  // specific color's own override (recipeType "color", only once a color has actually been
  // chosen). Re-fires on every Recipe Type/Color change so switching between buckets always shows
  // that bucket's own real saved data, never a stale copy from whichever bucket was open before.
  useEffect(() => {
    if (!open) return;
    if (recipeType === "color" && !selectedColorId) {
      // Nothing to load yet — the empty-state prompt below covers this; keep whatever rows were
      // last shown rather than flashing blank-then-loaded.
      return;
    }
    setLoading(true);
    legacyErpApi.fabricCards.getYarnRecipe(fabricInventoryId, recipeType === "color" ? selectedColorId : null)
      .then((recipe: any) => setRows(rowsFromApi(Array.isArray(recipe) ? recipe : [])))
      .catch(() => setRows([blankRow(), blankRow()]))
      .finally(() => setLoading(false));
  }, [open, fabricInventoryId, recipeType, selectedColorId]);

  // Copies the Common/Overall recipe's CURRENT saved rows as a starting point for the selected
  // color's own override — an independent, freshly-id'd copy (uid() per row), never a live
  // reference: editing/saving the color-specific bucket afterward can never modify Common's own
  // rows, and vice versa (satisfies "must NOT create a live reference").
  const copyFromCommon = async () => {
    try {
      const common: any = await legacyErpApi.fabricCards.getYarnRecipe(fabricInventoryId, null);
      const list = Array.isArray(common) ? common : [];
      if (!list.length) { toast.error("Common / Overall recipe has no rows to copy yet"); return; }
      setRows(list.map((l: any) => ({
        id: uid(), yarnInventoryId: l.yarnInventoryId ?? null, yarnCode: l.yarnCode || "", yarnName: l.yarnName || "",
        explanation: l.explanation || "", variant1: l.variant1 || "", variant2: l.variant2 || "", process: l.process || "",
        knittedInVariants: l.knittedInVariants || "", percentage: num(l.percentage), wastePct: num(l.wastePct), dyeWastagePct: num(l.dyeWastagePct),
      })));
      toast.success("Copied from Common / Overall recipe");
    } catch (e: any) {
      toast.error(e.message || "Failed to copy Common / Overall recipe");
    }
  };

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
    if (recipeType === "color" && !selectedColorId) {
      toast.error("Select a color before saving a Color-Specific recipe");
      return;
    }
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
      const saved = await legacyErpApi.fabricCards.upsertYarnRecipe(fabricInventoryId, roundedRows, recipeType === "color" ? selectedColorId : null);
      toast.success(`${recipeType === "color" ? "Color-Specific" : "Common / Overall"} Yarn Recipe saved`);
      setRows(rowsFromApi(Array.isArray(saved) ? saved : []));
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
        {/* Locally resizable — native CSS `resize` (bottom-right drag handle), scoped to this one
            DialogContent instance via inline style, NOT the shared ui/dialog.tsx primitive. `resize`
            requires overflow != visible on the element itself; the inner sections keep their own
            overflow-auto (fabric/table areas) so resizing the outer box never fights their scroll. */}
        <DialogContent
          className="flex flex-col gap-0 overflow-hidden p-0 resize"
          // minHeight is not arbitrary — measured live (Playwright) against this dialog's own
          // fixed-height chrome (header + fabric info + Recipe Type/Color/Context row, including
          // its own worst-case WRAPPED height + Yarn Composition bar + Total row + the conditional
          // Copy-from-Common row + footer), which comes to ~523px in Color Override mode. Below
          // this floor the table's own flex-1 area was being squeezed to 0 — literally no rows
          // visible, footer still fine — which is the exact bug being fixed here. 660 leaves the
          // table area a guaranteed ~140px (its own min-h below) even at the smallest size the user
          // can resize down to.
          style={{ width: 1120, height: "82vh", minWidth: 640, minHeight: 660, maxWidth: "95vw", maxHeight: "95vh" }}
        >
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-2.5 text-lg"><Scissors className="h-5 w-5 text-primary" />Yarn Recipe Detail</DialogTitle>
          </DialogHeader>

          {/* Fabric information — only fields already passed into this dialog (fabricCode/
              fabricName); no fabric type/spec/base-unit data is invented since this component was
              never given any. */}
          <div className="shrink-0 px-6 pt-4">
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-mono font-semibold text-foreground">{fabricCode}</span>
              <span className="text-muted-foreground"> — </span>
              <span className="text-foreground">{fabricName}</span>
            </div>
          </div>

          {/* flex-wrap (not a viewport-breakpoint grid) so this row reacts to the DIALOG's own
              width — which changes independently of the viewport once the dialog is resizable —
              rather than a `sm:` media-query column split that stays 3-wide even when the user has
              dragged the dialog itself narrow, which is what previously forced the context box's
              long text into a near-zero-width column and made it render as a squeezed vertical
              strip. min-w-0 on every item lets its own text wrap normally instead of forcing the
              row wider than the dialog. */}
          <div className="shrink-0 flex flex-wrap items-start gap-4 px-6 py-4">
            <div className="min-w-[160px] flex-1 basis-[200px]">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Recipe Type</label>
              <Select value={recipeType} onValueChange={(v) => setRecipeType(v as "common" | "color")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="common">Common (All Colors)</SelectItem>
                  <SelectItem value="color">Color Override</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recipeType === "color" && (
              <div className="min-w-[180px] flex-1 basis-[220px]">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Color / Variant</label>
                {availableColors.length ? (
                  <Popover open={colorComboOpen} onOpenChange={setColorComboOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        aria-expanded={colorComboOpen}
                        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm hover:bg-accent"
                      >
                        <span className={cn("flex min-w-0 items-center gap-2 truncate", selectedColorId ? "text-foreground" : "text-muted-foreground")}>
                          {selectedColorId && (() => {
                            const c = availableColors.find((x) => x.id === selectedColorId);
                            return c?.color ? <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: c.color }} /> : null;
                          })()}
                          {selectedColorId
                            ? (() => { const c = availableColors.find((x) => x.id === selectedColorId); return c ? (c.code || c.name) : "Selected color"; })()
                            : "Select Color"}
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    {/* Select-only combobox — CommandInput only ever FILTERS availableColors
                        (this fabric's own BOM-scoped color list, loaded via
                        legacyErpApi.fabricCards.listYarnRecipeColors, unchanged); there is no
                        path from typed text to a selected value other than picking a rendered
                        CommandItem, so an unmatched/arbitrary search term simply shows "No
                        matching colors" and cannot become the selection. */}
                    <PopoverContent className="w-64 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search color..." className="text-xs" />
                        <CommandList>
                          <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No matching colors.</CommandEmpty>
                          <CommandGroup>
                            {availableColors.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.code || c.name}
                                onSelect={() => { setSelectedColorId(c.id); setColorComboOpen(false); }}
                                className="text-xs"
                              >
                                <Check className={cn("h-3.5 w-3.5", selectedColorId === c.id ? "opacity-100" : "opacity-0")} />
                                {c.color && <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: c.color }} />}
                                {c.code || c.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex h-9 w-full cursor-not-allowed items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3 text-left text-sm text-muted-foreground"
                  >
                    No colors available
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  </button>
                )}
              </div>
            )}

            <div
              className={cn(
                "flex min-w-[220px] flex-1 basis-[260px] items-start gap-2 rounded-lg px-3.5 py-2.5 text-xs",
                recipeType === "common" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" : "bg-pink-500/10 text-pink-700 dark:text-pink-400"
              )}
            >
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {recipeType === "common" ? (
                <span className="min-w-0">This recipe will be used for all colors of this fabric. Create a color override only if the yarn composition is different for a particular color.</span>
              ) : !availableColors.length ? (
                <span className="min-w-0">No colors are configured against this Fabric&apos;s BOM.</span>
              ) : (
                <span className="min-w-0">This recipe is only used for the selected color. If not defined, the system will use the Common (All Colors) recipe.</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-y border-border bg-muted/30 px-6 py-3">
            <span className="text-sm font-semibold text-foreground">Yarn Composition</span>
            <Button size="sm" onClick={addRow} disabled={recipeType === "color" && !selectedColorId}>
              <Plus className="h-4 w-4 mr-1" />Add Yarn
            </Button>
          </div>

          {/* flex-1 lets this area grow to fill whatever room the fixed-height sections above/
              below leave; min-h-[140px] (not min-h-0) gives it a real floor — roughly the header
              row plus 2 data rows — so it can never be squeezed away to nothing the way it
              previously could when the (now taller-floored) dialog was resized down. Still shrinks
              below its CONTENT's natural height once there are more rows than fit, which is what
              lets overflow-auto actually scroll instead of just growing the dialog. */}
          <div className="min-h-[140px] flex-1 overflow-auto">
            {recipeType === "color" && !selectedColorId ? (
              <p className="p-6 text-sm text-muted-foreground">Select a color above to view or set its custom Yarn Recipe.</p>
            ) : loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading...</p>
            ) : (
              <Table className="table-fixed" style={{ minWidth: 1340 }}>
                <TableHeader className="sticky top-0 z-10 bg-muted/40">
                  <TableRow className="[&>th]:border-r [&>th]:text-xs [&>th]:font-semibold [&>th]:h-10 [&>th]:whitespace-nowrap">
                    <TableHead style={{ width: 44 }} className="text-center">#</TableHead>
                    <TableHead style={{ width: 100 }}>Inventory Code</TableHead>
                    <TableHead style={{ width: 200 }}>Inventory Name</TableHead>
                    <TableHead style={{ width: 140 }}>Explanation</TableHead>
                    <TableHead style={{ width: 90 }}>Variant-1</TableHead>
                    <TableHead style={{ width: 110 }}>Variant-2</TableHead>
                    <TableHead style={{ width: 110 }}>Process</TableHead>
                    <TableHead style={{ width: 110 }}>Knitted in Variants</TableHead>
                    <TableHead style={{ width: 80 }} className="text-right">%</TableHead>
                    <TableHead style={{ width: 80 }} className="text-right">Waste %</TableHead>
                    <TableHead style={{ width: 95 }} className="text-right">Dye Wastage %</TableHead>
                    <TableHead style={{ width: 110 }} className="text-right">Yarn Quantity</TableHead>
                    <TableHead style={{ width: 70 }} className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => {
                    // fabricQuantity is the Fabric's own Calculated Quantity (Quantity after
                    // Fabric-level Dye/Print/Other Waste — bom-tab.tsx computes it via the same
                    // applyWaste before passing it in). This row's own Waste %/Dye Wastage % is
                    // captured/persisted but deliberately NOT applied here — Yarn Waste belongs to
                    // a separate future Yarn Requirement/Consumption screen (Yarn Base Requirement
                    // -> Yarn Waste -> Final Yarn Requirement), not this preview.
                    const yarnQty = round4(fabricQuantity * ((Number(r.percentage) || 0) / 100));
                    return (
                      <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                        <TableCell className="text-center text-xs font-medium text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="px-3 text-sm font-mono text-muted-foreground">{r.yarnCode || "—"}</TableCell>
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
                              className="flex w-9 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <Search className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="p-0">
                          <input
                            ref={(el) => { rowEditRefs.current[r.id] = el; }}
                            className="h-10 w-full bg-transparent px-3 text-sm outline-none"
                            value={r.explanation}
                            onChange={(e) => update(r.id, { explanation: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="p-0"><input className="h-10 w-full bg-transparent px-3 text-sm outline-none" value={r.variant1} onChange={(e) => update(r.id, { variant1: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input className="h-10 w-full bg-transparent px-3 text-sm outline-none" value={r.variant2} onChange={(e) => update(r.id, { variant2: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input className="h-10 w-full bg-transparent px-3 text-sm outline-none" value={r.process} onChange={(e) => update(r.id, { process: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input className="h-10 w-full bg-transparent px-3 text-sm outline-none" value={r.knittedInVariants} onChange={(e) => update(r.id, { knittedInVariants: e.target.value })} /></TableCell>
                        <TableCell className="p-0"><input type="number" min={0} className="h-10 w-full bg-transparent px-3 text-right text-sm font-mono outline-none" value={r.percentage} onChange={(e) => update(r.id, { percentage: normalizeNonNegative(e.target.value) })} /></TableCell>
                        <TableCell className="p-0"><input type="number" min={0} className="h-10 w-full bg-transparent px-3 text-right text-sm font-mono outline-none" value={r.wastePct} onChange={(e) => update(r.id, { wastePct: normalizeNonNegative(e.target.value) })} /></TableCell>
                        <TableCell className="p-0"><input type="number" min={0} className="h-10 w-full bg-transparent px-3 text-right text-sm font-mono outline-none" value={r.dyeWastagePct} onChange={(e) => update(r.id, { dyeWastagePct: normalizeNonNegative(e.target.value) })} /></TableCell>
                        <TableCell className="px-3 text-right font-mono text-sm text-muted-foreground">{r.percentage > 0 ? `${yarnQty} ${fabricUnit || ""}`.trim() : "—"}</TableCell>
                        <TableCell className="p-0">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit row" onClick={() => rowEditRefs.current[r.id]?.focus()}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete row" onClick={() => removeRow(r.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-400">
              <Info className="h-4 w-4 shrink-0" />
              Total percentage must be 100%
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold",
                activeRows.length === 0
                  ? "bg-muted text-muted-foreground"
                  : totalValid
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-destructive/10 text-destructive"
              )}
            >
              {activeRows.length > 0 && (totalValid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />)}
              Total: {totalPct}%
            </div>
          </div>

          {recipeType === "color" && selectedColorId && (
            <div className="shrink-0 border-t border-border px-6 py-3">
              <Button variant="outline" size="sm" onClick={copyFromCommon}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />Copy from Common Recipe
              </Button>
            </div>
          )}

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || loading || (recipeType === "color" && !selectedColorId)}>{saving ? "Saving..." : "Save"}</Button>
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
