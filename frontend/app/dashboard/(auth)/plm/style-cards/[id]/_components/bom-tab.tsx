"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Save, Trash2, ListOrdered, Search, Scissors } from "lucide-react";
import { plmApi, legacyErpApi } from "@/lib/nexuscore-api";
import { cn } from "@/lib/utils";
import { GridInput, GridCheckbox, uid, num } from "./grid-input";
import { AutocompleteTextCell, type AutocompleteOption } from "@/components/legacy-erp/autocomplete-text-cell";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { YarnRecipeDialog } from "@/components/legacy-erp/yarn-recipe-dialog";
import { RowContextMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { applyWaste } from "@/lib/legacy-erp/waste-calc";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";

type BomRow = {
  id: string;
  lineType: string;
  // The actual binding to the selected Fabric/Trim Card (IM_Item.RecId, via
  // legacyErpApi.fabricCards/trimInventoryCards) — set/cleared alongside fabricCode/fabricName
  // below, which stay the denormalized display copy. This is what a reload resolves the
  // selection from; fabricCode/fabricName alone were text-only and not a real reference.
  fabricInventoryId: number | null;
  fabricCode: string;
  fabricName: string;
  explanation: string;
  placement: string;
  process: string;
  variant: string;
  // Work Order mode only (MA_RecipeItem.Variant2 — no equivalent column on StyleBomLine, see
  // columnDefsForTab's own comment) — always blank/unused for Style/Sample Card.
  variant2: string;
  rowColumn: string;
  swatchCardId: string;
  willBeCut: boolean;
  mainFabric: boolean;
  // The selected card's own configured Item Unit (IM_ItemUnitItemSize.RecId, resolved via
  // legacyErpApi.lookupItemUnits — the exact per-item Unit source Purchase Order/Purchase Receipt
  // already resolve through). Same convention as fabricInventoryId: `unit` stays the denormalized
  // display code, this is the real FK the backend validates on save.
  unitId: number | null;
  unit: string;
  // Market Length/Width/Weight — calculator-only inputs for the automatic Fabric quantity
  // formula (Area m² = Width * Length / 10,000; Quantity g = Area * Weight/m²). No backing
  // column on StyleBomLine (see style-extras.service.ts's BOM_LINE_FIELDS whitelist), so — same
  // as the requirement's own "display and save only the final converted Quantity" — these three
  // are never sent to the backend, only the Quantity they produce is.
  marketLength: number;
  marketWidth: number;
  marketWeight: number;
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
  id: uid(), lineType, fabricInventoryId: null, fabricCode: "", fabricName: "", explanation: "", placement: "", process: "",
  variant: "", variant2: "", rowColumn: "", swatchCardId: "", willBeCut: false, mainFabric: false, unitId: null, unit: "",
  marketLength: 0, marketWidth: 0, marketWeight: 0,
  quantity: 0, wastePct: 0, dyeWastagePct: 0, otherWastagePct: 0, unitPrice: 0, component: "",
  dia: "", gauge: "", finishWidth: "", finishRoute: "", revision: "",
});

// Automatic Fabric quantity calculation — Area (m²) = MarketWidth * MarketLength / 10,000, then
// PhysicalGrams = Area * MarketWeight (Weight/m²). Equivalently PhysicalGrams =
// (MarketWidth * MarketLength * MarketWeight) / 10,000 — no other constant. Any missing/invalid/
// <=0 source value returns 0 rather than NaN/Infinity. Rounded to 4 decimal places — the same
// Decimal(14,4) precision StyleBomLine.quantity is already stored at (schema.prisma), not a new
// rounding convention.
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// Re-expresses a quantity from one of an item's configured Units into another, using the exact
// ratio unit-conversion.util.ts documents and applies server-side for Purchase Order/Purchase
// Receipt (BaseQuantity = qty * (UnitDivisor/UnitFactor), then EnteredQuantity = BaseQuantity *
// (UnitFactor/UnitDivisor) for the target unit) — replicated client-side only because it must run
// live against an unsaved grid row, not a persisted one those server-side helpers operate on.
// Same field names, same formula, same per-item IM_ItemUnitItemSize data, not a second
// conversion system.
function convertQuantityBetweenUnits(qty: number, fromUnit: { unitFactor?: any; unitDivisor?: any } | null, toUnit: { unitFactor?: any; unitDivisor?: any } | null): number {
  if (!fromUnit || !toUnit) return qty;
  const baseQty = qty * ((Number(fromUnit.unitDivisor) || 1) / (Number(fromUnit.unitFactor) || 1));
  return baseQty * ((Number(toUnit.unitFactor) || 1) / (Number(toUnit.unitDivisor) || 1));
}

// The Marker formula's native output is a physical mass in real grams — this identifies which of
// the item's OWN configured Units represents "1 real gram" (or derives it from a configured KG
// unit, since 1 KG is always, universally, 1000 g) so that physical-grams figure can be run
// through convertQuantityBetweenUnits like any other item-configured Unit, instead of a second,
// separate conversion path. Matches purely by the unit's own Code/Name text (same case-insensitive
// convention the rest of this grid's lookups already use) — not a guess, since these are the
// literal unit labels the item's own Unit Set configuration already carries.
function findGramEquivalentUnit(units: any[]): { unitFactor: number; unitDivisor: number } | null {
  const byName = (re: RegExp) => units.find((u) => re.test((u.code || u.name || "").trim()));
  const gram = byName(/^(gr|grm|gram|gms?)$/i);
  if (gram) return { unitFactor: Number(gram.unitFactor) || 1, unitDivisor: Number(gram.unitDivisor) || 1 };
  const kg = byName(/^(kgs?|kilograms?)$/i);
  if (kg) return { unitFactor: (Number(kg.unitFactor) || 1) * 1000, unitDivisor: Number(kg.unitDivisor) || 1 };
  return null;
}

// Converts the Marker formula's physical-grams result into whichever Unit is currently selected
// for the row, using ONLY that item's own configured Units (`units`, from
// legacyErpApi.lookupItemUnits — the same source Purchase Order's Unit cell already uses) — never
// a hardcoded Gram/KG-only conversion. `unitCode` must match one of `units`' own Code/Name
// (case-insensitive); no match (blank Unit, or an item with neither a Gram- nor KG-equivalent
// Unit configured to anchor the physical grams figure against) returns 0 rather than a fabricated
// value.
function calcFabricQuantity(marketLength: number, marketWidth: number, marketWeight: number, unitCode: string, units: any[]): number {
  const vals = [marketLength, marketWidth, marketWeight].map(Number);
  if (!vals.every((n) => Number.isFinite(n) && n > 0)) return 0;
  const physicalGrams = (vals[0] * vals[1] * vals[2]) / 10000;
  const gramUnit = findGramEquivalentUnit(units);
  if (!gramUnit) return 0;
  const code = (unitCode || "").trim().toLowerCase();
  if (!code) return 0;
  const targetUnit = units.find((u) => (u.code || u.name || "").trim().toLowerCase() === code);
  if (!targetUnit) return 0;
  return round4(convertQuantityBetweenUnits(physicalGrams, gramUnit, targetUnit));
}

// Distributes the Fabric row's own Calculated Quantity (`calculatedQuantity` — Quantity x (1 +
// Fabric's own total Dye/Print(Waste)/Other Waste %, via applyWaste above) — the "appropriate
// existing fabric calculation" the Yarn Ratio is applied to, NOT the raw pre-waste Quantity)
// across the selected Fabric Card's dedicated Yarn Recipe (FabricYarnRecipeLine rows, via
// legacyErpApi.fabricCards.getYarnRecipe — see yarn-recipe-dialog.tsx) — the authoritative source
// once a card has any recipe rows saved. Yarn N = Calculated Quantity x PercentageN%, using each
// line's own percentage field (already validated server-side to total 100% across active rows).
// Deliberately does NOT apply each Yarn row's own Waste %/Dye Wastage % here — those fields are
// captured/persisted (yarn-recipe-dialog.tsx) but stay unused by any calculation for now; Yarn
// Waste belongs to a separate future Yarn Requirement/Consumption screen (Yarn Base Requirement ->
// Yarn Waste -> Final Yarn Requirement), not this Fabric BOM's own Calculated Quantity or this
// Yarn breakdown.
function yarnBreakdownFromRecipe(calculatedQuantity: number, lines: any[]): { label: string; pct: number; qty: number }[] | null {
  if (!lines || !lines.length) return null;
  const rows = lines
    .map((l) => {
      const pct = Number(l.percentage);
      if (!Number.isFinite(pct) || pct <= 0) return null;
      const label = l.yarnCode || l.yarnName || "Yarn";
      return { label, pct, qty: round4(calculatedQuantity * (pct / 100)) };
    })
    .filter((r): r is { label: string; pct: number; qty: number } => r !== null);
  return rows.length ? rows : null;
}

// Legacy fallback — distributes the Fabric row's own Calculated Quantity (same basis as
// yarnBreakdownFromRecipe above) across the Fabric Card's own flat Yarn Ratio 1-4 columns
// (uD_FyarnRatio1/uD_FYarnRatio2/uD_FYarnRatio3/uD_YarnRatio4 — the actual pre-existing IM_Item
// columns fabric-card.service.ts's HEADER_COLUMNS exposes, alongside the existing Yarn Count 1-4
// identifying which Yarn Card each ratio belongs to). Used only when the card has no dedicated
// Yarn Recipe rows (yarnBreakdownFromRecipe above returns null) — the 4-slot legacy fields stay
// exactly as they are, untouched, superseded rather than migrated; they carry no per-yarn waste
// field. Skips any of the 4 slots that's blank/non-numeric/<=0 (an item may use only 1-2 yarns).
// `card` is the full raw row already cached in fabricCardCacheRef — returns null when the card
// carries no ratios at all.
function yarnConsumptionBreakdown(calculatedQuantity: number, card: any): { label: string; pct: number; qty: number }[] | null {
  if (!card) return null;
  const slots: [string, any][] = [
    ["Yarn 1", card.uD_FyarnRatio1],
    ["Yarn 2", card.uD_FYarnRatio2],
    ["Yarn 3", card.uD_FYarnRatio3],
    ["Yarn 4", card.uD_YarnRatio4],
  ];
  const rows = slots
    .map(([label, raw]) => {
      const pct = parseFloat(raw);
      if (!Number.isFinite(pct) || pct <= 0) return null;
      return { label, pct, qty: round4(calculatedQuantity * (pct / 100)) };
    })
    .filter((r): r is { label: string; pct: number; qty: number } => r !== null);
  return rows.length ? rows : null;
}

// ---- Manage Columns + column resizing — now driven by the shared useGridColumns hook
// (hooks/use-grid-columns.ts), same button/styling/placement/icons as every other migrated
// grid. Scoped to this grid's own column set/keys — not the roving-cursor cell-editing engine
// other legacy-erp grids also have, which this grid never had and isn't part of this feature.
type ColKey =
  | "fabricCode" | "fabricName" | "explanation" | "placement" | "process" | "variant" | "variant2"
  | "rowColumn" | "swatchCardId" | "willBeCut" | "mainFabric" | "unit"
  | "marketLength" | "marketWidth" | "marketWeight" | "quantity"
  | "wastePct" | "dyeWastagePct" | "otherWastagePct" | "totalWaste" | "calculatedQty"
  | "unitPrice" | "component" | "dia" | "gauge" | "finishWidth" | "finishRoute" | "revision";

type ColumnDef = { key: ColKey; label: string; align?: "left" | "right" | "center" };

const COLUMNS: ColumnDef[] = [
  { key: "fabricCode", label: "Fabric Code" },
  { key: "fabricName", label: "Fabric Name" },
  { key: "explanation", label: "Explanation" },
  { key: "placement", label: "Placement" },
  { key: "process", label: "Process" },
  { key: "variant", label: "Variant-1" },
  // Yarn Recipe (yarn-recipe-dialog.tsx) has both Variant-1 and Variant-2; StyleBomLine (Style/
  // Sample Card's own persistence) has no variant2 column at all, but MA_RecipeItem (Work Order's)
  // genuinely does — hidden outside Work Order mode by columnDefsForTab below rather than shown
  // as a dead, never-persisted field on the other two callers.
  { key: "variant2", label: "Variant-2" },
  { key: "rowColumn", label: "Row/Column" },
  { key: "swatchCardId", label: "Choose Color" },
  { key: "willBeCut", label: "Will be Cut", align: "center" },
  { key: "mainFabric", label: "Main Fabric", align: "center" },
  { key: "unit", label: "Unit" },
  { key: "marketLength", label: "Market Length", align: "right" },
  { key: "marketWidth", label: "Market Width", align: "right" },
  { key: "marketWeight", label: "Market Weight", align: "right" },
  { key: "quantity", label: "Quantity", align: "right" },
  { key: "wastePct", label: "Waste %", align: "right" },
  { key: "dyeWastagePct", label: "Dye Wastage %", align: "right" },
  { key: "otherWastagePct", label: "Other Wastage %", align: "right" },
  { key: "totalWaste", label: "Total Waste %", align: "right" },
  { key: "calculatedQty", label: "Calculated Qty", align: "right" },
  { key: "unitPrice", label: "Unit Price", align: "right" },
  { key: "component", label: "Component" },
  { key: "dia", label: "Dia" },
  { key: "gauge", label: "Gauge" },
  { key: "finishWidth", label: "Finish Width" },
  { key: "finishRoute", label: "Finish Route" },
  { key: "revision", label: "Revision" },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

// Fabric Code/Name identify the line and always stay first & visible — same rule as the
// Purchase Receipt grid's own FIXED_COLS.
const FIXED_COLS: ColKey[] = ["fabricCode", "fabricName"];

// Fabric-only physical-property columns: Will be Cut/Main Fabric are fabric concepts, Market
// Length/Width/Weight feed the fabric-only auto-quantity formula (calcFabricQuantity), and
// Dia/Gauge/Finish Width/Finish Route are fabric physical properties (populated from the
// selected Fabric Card's own uD_FabDia/uD_FabGuage/uD_FinWidth — Trim Cards carry none of these,
// confirmed empty in the legacy DB). None of this applies to a Trim line, so the Trim tab hides
// them entirely instead of showing dead "—" cells for an editable text field.
const TRIM_HIDDEN_COLS: ColKey[] = [
  "willBeCut", "mainFabric", "marketLength", "marketWidth", "marketWeight",
  "dia", "gauge", "finishWidth", "finishRoute",
];

// The shared column set/order/widths (Manage Columns) stays one global user preference across
// tabs — only the Trim tab's rendered subset + the Code/Name header labels change per active
// tab, so switching Fabric <-> Trim swaps grid column definitions without a second column config
// or a duplicated grid component.
function columnDefsForTab(lineType: string, columnDefs: ColumnDef[], isWorkOrderMode: boolean): ColumnDef[] {
  let defs = columnDefs;
  if (!isWorkOrderMode) defs = defs.filter((c) => c.key !== "variant2");
  if (lineType !== "trim") return defs;
  return defs
    .filter((c) => !TRIM_HIDDEN_COLS.includes(c.key))
    .map((c) =>
      c.key === "fabricCode" ? { ...c, label: "Trim Code" } :
      c.key === "fabricName" ? { ...c, label: "Trim Name" } : c
    );
}

// Column resize/reorder/hide/persist mechanics now live in the shared useGridColumns hook.
// storageKey "bomLineGrid" reproduces the exact tablePreferences keys already saved for
// existing users (bomLineGridColumnOrder / bomLineGridHiddenColumns) so no layout is orphaned.

const DEFAULT_WIDTHS: Record<ColKey, number> = {
  fabricCode: 130, fabricName: 200, explanation: 200, placement: 130, process: 130, variant: 110, variant2: 110,
  rowColumn: 110, swatchCardId: 200, willBeCut: 100, mainFabric: 100, unit: 90,
  marketLength: 110, marketWidth: 110, marketWeight: 120, quantity: 100,
  wastePct: 90, dyeWastagePct: 110, otherWastagePct: 110, totalWaste: 110, calculatedQty: 110,
  unitPrice: 100, component: 130, dia: 90, gauge: 90, finishWidth: 120, finishRoute: 120, revision: 110,
};
const MIN_WIDTHS: Record<ColKey, number> = {
  fabricCode: 100, fabricName: 140, explanation: 130, placement: 90, process: 90, variant: 80, variant2: 80,
  rowColumn: 80, swatchCardId: 140, willBeCut: 80, mainFabric: 80, unit: 70,
  marketLength: 80, marketWidth: 80, marketWeight: 90, quantity: 80,
  wastePct: 70, dyeWastagePct: 80, otherWastagePct: 80, totalWaste: 80, calculatedQty: 80,
  unitPrice: 80, component: 90, dia: 70, gauge: 70, finishWidth: 90, finishRoute: 90, revision: 80,
};
const DEL_W = 40;

// Extra per-column TableCell classes — the same overrides the original hardcoded markup used
// (select cells get "p-1", the two read-only computed columns get right-aligned mono text).
const cellClassFor = (key: ColKey): string | undefined => {
  if (key === "process" || key === "swatchCardId") return "p-1";
  if (key === "totalWaste" || key === "calculatedQty") return "text-right font-mono text-xs px-2";
  return undefined;
};

const BOM_LINE_TYPE_VALUES = LINE_TYPES.map((t) => t.value) as ("fabric" | "trim" | "ornament" | "process")[];

// Work Order mode reuses this SAME component/grid/columns/calculations wholesale (per the task's
// own "do not create a simplified/custom BOM implementation" rule) — only the persistence layer
// differs, since Work Order's BOM lives on MA_Recipe/MA_RecipeItem (legacyErpApi.workOrders.*),
// not StyleBomLine. MA_RecipeItem's real columns don't carry a few things StyleBomLine does:
//  - fabricCode/fabricName/unit are denormalized text on StyleBomLine; MA_RecipeItem only stores
//    the InventoryId/UnitId FKs, so Work Order mode resolves the display text live from the same
//    fabricCardCacheRef/itemUnitsByCard caches this component already builds for every mode.
//  - "Process" has no free-text column on MA_RecipeItem (ProcessId is a numeric legacy FK with no
//    matching lookup master anywhere in this codebase — confirmed by inspection) — repurposes the
//    generic UD_Remarks text column instead of inventing one, same "reuse the closest existing
//    generic column" convention this session already used for AdditionalQuantity/Barcode
//    elsewhere. Documented here, not silently dropped.
//  - "Row/Column" has no matching column at all on MA_RecipeItem — genuinely unsupported for Work
//    Order; the field stays editable in the grid (same UI) but is not sent on save.
//  - Waste %/Dye Wastage %/Other Wastage % are three separate StyleBomLine columns; MA_RecipeItem
//    has only one `Wastage` column. Work Order mode persists the COMBINED total (via the same
//    applyWaste() utility every mode already uses) into that one column, so Calculated
//    Qty/Total Waste % survive a reload exactly — only the 3-way breakdown itself doesn't.
//  - Market Length/Width/Weight are calculator-only (never persisted) in StyleCard mode
//    (StyleBomLine has no columns for them) but DO have real homes on MA_RecipeItem
//    (MarkerWidth/MarkerLength/M2Weight), so Work Order mode persists them — a case where Work
//    Order's own schema supports MORE than StyleCard's, not less.
interface WorkOrderBomAdapter {
  workOrderId: number;
  /** Rendered in the toolbar next to Manage Columns/Save — Work Order's own "Transfer from Style
   *  Card" / "Transfer Customer Trims" buttons, kept screen-specific rather than folded into this
   *  shared component's own logic. */
  toolbarExtra?: React.ReactNode;
}

export function BomTab({ styleCardId, card, onReloadCard, workOrder }: {
  styleCardId?: string; card?: any; onReloadCard?: () => void;
  /** Presence switches persistence from StyleBomLine to MA_Recipe/MA_RecipeItem — see the block
   *  comment above this function for the exact field-mapping gaps. */
  workOrder?: WorkOrderBomAdapter;
}) {
  const isWorkOrderMode = workOrder != null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<BomRow[]>([]);
  // Decimal Parameters (Settings -> Screen Parameters -> Decimal) — round-on-blur for
  // Quantity/Unit Price cells below, via the shared decimalKey mechanism.
  const { round, ensureLoaded: ensureDecimalParamsLoaded } = useDecimalParameters();
  useEffect(() => { ensureDecimalParamsLoaded(); }, [ensureDecimalParamsLoaded]);
  const [swatches, setSwatches] = useState<any[]>([]);
  const [processCards, setProcessCards] = useState<any[]>([]);
  // Fabric/Trim Card options for the grid's own search cell — AutocompleteTextCell (not
  // MasterAutocompleteField: that one's absolutely-positioned dropdown gets silently clipped by
  // this table's own overflow-x-auto scroll container; AutocompleteTextCell portals its
  // suggestion list via Radix Popover specifically to avoid that, the same component every other
  // in-grid search cell in this app already uses, e.g. inventory-receipt-line-grid.tsx's Name
  // cell) takes a static options array, so the full Fabric/Trim Card lists are loaded once here
  // instead of per-keystroke.
  const [fabricOptions, setFabricOptions] = useState<AutocompleteOption[]>([]);
  const [trimOptions, setTrimOptions] = useState<AutocompleteOption[]>([]);
  // Full-row cache, keyed by id, for both lists — onSelectOption only ever hands back
  // {id,code,name}; this lets it also pull the selected card's own Width/Weight/Dia/Gauge/
  // Finish Width into the BOM row.
  const fabricCardCacheRef = useRef<Record<string, any>>({});
  // Per-card configured-Unit list — legacyErpApi.lookupItemUnits(cardId) is the exact same
  // per-item Unit source purchase-order-line-grid.tsx's own Unit cell already resolves through
  // (IM_ItemUnitItemSize joined to MD_UnitSetItem, ordered Main Unit first server-side), reused
  // here instead of a second Item->Unit lookup. State (not just a ref cache) so the Unit
  // dropdown re-renders with the full list once a card's units resolve; a ref cache alongside it
  // avoids a duplicate fetch for a card whose units are already loading/loaded.
  const [itemUnitsByCard, setItemUnitsByCard] = useState<Record<string, any[]>>({});
  const itemUnitsCacheRef = useRef<Record<string, any[] | Promise<any[]>>>({});
  const ensureItemUnits = async (cardId: number): Promise<any[]> => {
    const key = String(cardId);
    const cached = itemUnitsCacheRef.current[key];
    if (cached) return cached;
    const promise = legacyErpApi.lookupItemUnits(cardId).catch(() => []);
    itemUnitsCacheRef.current[key] = promise;
    const units = await promise;
    itemUnitsCacheRef.current[key] = units;
    setItemUnitsByCard((prev) => ({ ...prev, [key]: units }));
    return units;
  };
  const mainUnitOf = (units: any[]) => (units.length ? units.find((u) => u.isMainUnit) || units[0] : null);
  // Per-card dedicated Yarn Recipe (FabricYarnRecipeLine rows, via
  // legacyErpApi.fabricCards.getYarnRecipe — see yarn-recipe-dialog.tsx) — fetched lazily, the
  // same on-demand + cached pattern as ensureItemUnits above, purely to power the Quantity cell's
  // own Yarn breakdown tooltip below with the authoritative recipe when one exists.
  const [yarnRecipeByCard, setYarnRecipeByCard] = useState<Record<string, any[]>>({});
  const yarnRecipeCacheRef = useRef<Record<string, any[] | Promise<any[]>>>({});
  const ensureYarnRecipe = async (cardId: number): Promise<any[]> => {
    const key = String(cardId);
    const cached = yarnRecipeCacheRef.current[key];
    if (cached) return cached;
    const promise = legacyErpApi.fabricCards.getYarnRecipe(cardId).catch(() => []);
    yarnRecipeCacheRef.current[key] = promise;
    const lines = await promise;
    yarnRecipeCacheRef.current[key] = lines;
    setYarnRecipeByCard((prev) => ({ ...prev, [key]: lines }));
    return lines;
  };
  // Which row's Search icon opened the full Fabric/Trim Card grid lookup (CardLookupDialog),
  // and which card type it should search — null when the dialog is closed.
  const [lookupTarget, setLookupTarget] = useState<{ rowId: string; lineType: "fabric" | "trim" } | null>(null);
  // Which Fabric row's Yarn Recipe Detail dialog is open — null when closed.
  const [yarnRecipeRowId, setYarnRecipeRowId] = useState<string | null>(null);
  // Route Code/Embroidery Route/CMT Price/Running Quantity are StyleCard's own bomXxx fields
  // (plmApi.styleCards.update) — genuinely Style-Card-specific, not something MA_Recipe has an
  // equivalent header concept for. Work Order already has its own Route Code (Style Info, from
  // the selected Style) and CMT Price (Detail tab, MA_WorkOrder.CmtPrice) elsewhere, so this
  // strip is simply hidden in Work Order mode rather than duplicated or forced onto a schema
  // that doesn't support it.
  const [header, setHeader] = useState({
    bomRouteCode: card?.bomRouteCode || "",
    bomEmbroideryRoute: card?.bomEmbroideryRoute || "",
    bomCmtPrice: card?.bomCmtPrice ?? 0,
    bomRunningQuantity: card?.bomRunningQuantity ?? 0,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [lines, sw, pc, fab, trim] = await Promise.all([
        isWorkOrderMode
          ? Promise.all(BOM_LINE_TYPE_VALUES.map((lt) => legacyErpApi.workOrders.listBom(workOrder!.workOrderId, lt).catch(() => [])))
              .then((byType) => byType.flatMap((rowsOfType: any[], i) => (rowsOfType || []).map((l: any) => ({ ...l, lineType: BOM_LINE_TYPE_VALUES[i] }))))
          : plmApi.styleBom.get(styleCardId!),
        plmApi.swatchCards.list().catch(() => ({ data: [] })),
        plmApi.processCards.list().catch(() => ({ data: [] })),
        legacyErpApi.fabricCards.list().catch(() => []),
        legacyErpApi.trimInventoryCards.list().catch(() => []),
      ]);
      const fabList = Array.isArray(fab) ? fab : [];
      const trimList = Array.isArray(trim) ? trim : [];
      fabList.forEach((row: any) => { fabricCardCacheRef.current[String(row.id)] = row; });
      trimList.forEach((row: any) => { fabricCardCacheRef.current[String(row.id)] = row; });
      const loadedRows = (Array.isArray(lines) ? lines : []).map((l: any) => {
        if (!isWorkOrderMode) {
          return {
            id: l.id, lineType: l.lineType, fabricInventoryId: l.fabricInventoryId ?? null, fabricCode: l.fabricCode || "", fabricName: l.fabricName || "",
            explanation: l.explanation || "", placement: l.placement || "", process: l.process || "",
            variant: l.variant || "", variant2: "", rowColumn: l.rowColumn || "", swatchCardId: l.swatchCardId || "",
            willBeCut: !!l.willBeCut, mainFabric: !!l.mainFabric, unitId: l.unitId ?? null, unit: l.unit || "",
            marketLength: num(l.marketLength), marketWidth: num(l.marketWidth), marketWeight: num(l.marketWeight),
            quantity: num(l.quantity),
            wastePct: num(l.wastePct), dyeWastagePct: num(l.dyeWastagePct), otherWastagePct: num(l.otherWastagePct),
            unitPrice: num(l.unitPrice), component: l.component || "", dia: l.dia || "", gauge: l.gauge || "",
            finishWidth: l.finishWidth || "", finishRoute: l.finishRoute || "", revision: l.revision || "",
          };
        }
        // Work Order / MA_RecipeItem — fabricCode/fabricName/unit have no denormalized column
        // here, resolved live from the just-populated fabricCardCacheRef (unit text is patched
        // in separately below, once ensureItemUnits resolves for this card).
        const src = l.inventoryId != null ? fabricCardCacheRef.current[String(l.inventoryId)] : null;
        return {
          id: l.id, lineType: l.lineType, fabricInventoryId: l.inventoryId ?? null,
          fabricCode: src?.inventoryCode || "", fabricName: src?.inventoryName || "",
          explanation: l.explanation || "", placement: l.uD_Placement || "", process: l.uD_Remarks || "",
          variant: l.variant1 || "", variant2: l.variant2 || "", rowColumn: "", swatchCardId: l.swatchCardId != null ? String(l.swatchCardId) : "",
          willBeCut: !!l.isCutting, mainFabric: !!l.isMaster, unitId: l.unitId ?? null, unit: "",
          marketLength: num(l.markerLength), marketWidth: num(l.markerWidth), marketWeight: num(l.m2Weight),
          quantity: num(l.quantity),
          wastePct: num(l.wastage), dyeWastagePct: 0, otherWastagePct: 0,
          unitPrice: num(l.price), component: l.uD_Component || "", dia: l.uD_Dia || "", gauge: l.uD_Guage || "",
          finishWidth: l.uD_FinishWidth || "", finishRoute: l.uD_FinishRoute || "", revision: l.uD_Revision || "",
        };
      });
      setRows(loadedRows);
      setSwatches(Array.isArray(sw) ? sw : (sw as any)?.data || []);
      setProcessCards(Array.isArray(pc) ? pc : (pc as any)?.data || []);
      setFabricOptions(fabList.map((row: any) => ({ id: String(row.id), code: row.inventoryCode, name: row.inventoryName })));
      setTrimOptions(trimList.map((row: any) => ({ id: String(row.id), code: row.inventoryCode, name: row.inventoryName })));
      // Populate the Unit dropdown for every already-saved row that already has a selected card —
      // otherwise a reloaded row would show its persisted Unit as text but offer no other
      // configured Units to switch between until the user re-picks the same card.
      const cardIds = new Set(loadedRows.map((r) => r.fabricInventoryId).filter((id): id is number => id != null));
      cardIds.forEach((id) => { ensureItemUnits(id); });
    } catch (e: any) {
      toast.error(e.message || "Failed to load BOM");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [styleCardId, workOrder?.workOrderId]);
  // Work Order mode only — MA_RecipeItem has no denormalized Unit text column, so a reloaded
  // row's own `unit` starts blank; once ensureItemUnits resolves that row's card's configured
  // Units (see load()'s own bulk ensureItemUnits(id) calls), patch the display text in from the
  // matching unitId. StyleCard mode never runs this (unit is already real, persisted text there).
  useEffect(() => {
    if (!isWorkOrderMode) return;
    setRows((rs) => rs.map((r) => {
      if (r.unit || r.unitId == null || r.fabricInventoryId == null) return r;
      const units = itemUnitsByCard[String(r.fabricInventoryId)];
      const match = units?.find((u: any) => Number(u.id) === r.unitId);
      return match ? { ...r, unit: match.code || match.name || "" } : r;
    }));
  }, [isWorkOrderMode, itemUnitsByCard]);
  useEffect(() => {
    setHeader({
      bomRouteCode: card?.bomRouteCode || "",
      bomEmbroideryRoute: card?.bomEmbroideryRoute || "",
      bomCmtPrice: card?.bomCmtPrice ?? 0,
      bomRunningQuantity: card?.bomRunningQuantity ?? 0,
    });
  }, [card]);

  // Recalculates Quantity for Fabric-type rows on every change that can affect it (Fabric
  // selection, Market Length/Width/Weight, Unit) since every one of those routes through this
  // same update() — no separate effect/hook needed. Always recomputed fresh from the physical
  // dimensions and re-expressed in whichever Unit is currently selected (calcFabricQuantity,
  // using this row's own item-configured Units) rather than converting whatever number Quantity
  // last held — "do not keep the previous unit's numeric quantity" on a Unit change. Trim/
  // Ornament/Process rows are untouched: their Quantity stays the plain manually-entered (or,
  // for Trim with a selected card, ratio-converted — see the Unit cell below) value it always was.
  // `guard` is optional — only the async Unit-resolution callback below needs it, to skip
  // applying a slower/stale resolution if the row's card selection has since changed again.
  const update = (id: string, patch: Partial<BomRow>, guard?: (row: BomRow) => boolean) => setRows((rs) => rs.map((r) => {
    if (r.id !== id || (guard && !guard(r))) return r;
    const next = { ...r, ...patch };
    if (next.lineType === "fabric") {
      // Reads the ref cache, not the itemUnitsByCard state — a card selection's own async
      // continuation (applyCardSelection's ensureItemUnits().then(...)) calls update() in the
      // same microtask ensureItemUnits populates this cache in, before React has necessarily
      // re-rendered with a fresh itemUnitsByCard closure. The ref is written synchronously the
      // instant units resolve, so it's never one render behind like the state closure could be.
      const cached = next.fabricInventoryId != null ? itemUnitsCacheRef.current[String(next.fabricInventoryId)] : undefined;
      const units = Array.isArray(cached) ? cached : [];
      next.quantity = calcFabricQuantity(next.marketLength, next.marketWidth, next.marketWeight, next.unit, units);
    }
    return next;
  }));
  const addRow = (lineType: string) => setRows((rs) => [...rs, blankRow(lineType)]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  // Shared by BOTH selection paths — the inline AutocompleteTextCell (type-to-search) and the
  // Search-icon CardLookupDialog (full grid) below — so a Fabric/Trim Card picked either way
  // goes through the exact same mapping, not two copies of it. `fabricCardCacheRef` must already
  // hold the full raw card row under `cardId` (the bulk load in `load()` does this for every
  // card up front; the dialog's own onSelect merges its picked row in before calling this).
  const applyCardSelection = (rowId: string, lineType: string, cardId: number, code: string, name: string) => {
    const prevRow = rows.find((r) => r.id === rowId);
    const prevUnitCode = prevRow?.unit || null;
    const prevQuantity = prevRow?.quantity ?? 0;
    const patch: Partial<BomRow> = {
      fabricInventoryId: cardId, fabricCode: code, fabricName: name,
      // Cleared up front (not just overwritten below) so a newly selected card never keeps the
      // previously selected card's Unit even for the instant before the async resolution below
      // resolves — "do not retain a stale Unit" applies to a card CHANGE, not just a clear.
      unitId: null, unit: "",
    };
    // Fabric Card's own Width/Weight/Dia/Gauge/Finish Width — the same fields the BOM grid's own
    // Market Width/Market Weight/Dia/Gauge/Finish Width columns already exist for — carried onto
    // the row so a selected card's data doesn't have to be retyped. Trim Cards carry none of
    // these (legacy-db columns, confirmed empty), so this only ever fires anything for "fabric".
    if (lineType === "fabric") {
      const src = fabricCardCacheRef.current[String(cardId)];
      if (src) {
        if (src.fWidth != null) patch.marketWidth = Number(src.fWidth) || 0;
        if (src.fWeight != null) patch.marketWeight = Number(src.fWeight) || 0;
        if (src.uD_FabDia != null) patch.dia = String(src.uD_FabDia);
        if (src.uD_FabGuage != null) patch.gauge = String(src.uD_FabGuage);
        if (src.uD_FinWidth != null) patch.finishWidth = String(src.uD_FinWidth);
      }
    }
    update(rowId, patch);
    // Item -> configured Units (same legacyErpApi.lookupItemUnits source/ordering, Main Unit
    // first, Purchase Order's own Unit cell already uses) — async, guarded on cardId still
    // matching the row's current selection so a fast card-change/clear in between can't have a
    // slower, earlier resolution overwrite the newer one.
    ensureItemUnits(cardId).then((units) => {
      if (!units.length) return;
      // Card CHANGE rule: keep the row's previous Unit if the new card also has a unit of that
      // same real-world code (e.g. both items configure "KG") — same unit. Otherwise fall back to
      // the new card's own Main/Base Unit.
      const matched = prevUnitCode
        ? units.find((u: any) => (u.code || u.name || "").toLowerCase() === prevUnitCode.toLowerCase())
        : null;
      const target = matched || mainUnitOf(units);
      if (!target) return;
      const unitPatch: Partial<BomRow> = { unitId: Number(target.id), unit: target.code || target.name || "" };
      // Fabric: Quantity is derived (calcFabricQuantity, via update()'s own recompute below) from
      // Market Length/Width/Weight re-expressed in this newly resolved Unit — never set here
      // directly. Trim (no physical formula): preserve the previous numeric Quantity only when
      // the Unit itself was preserved (same real unit); otherwise reset to 0 rather than guess a
      // cross-item conversion with no defined basis (the two cards' UnitFactor/UnitDivisor are
      // each relative to their OWN item, not to each other).
      if (lineType !== "fabric") unitPatch.quantity = matched ? prevQuantity : 0;
      update(rowId, unitPatch, (row) => row.fabricInventoryId === cardId);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // Decimal Parameters rounding happens HERE (not just via each cell's own GridInput
      // decimalKey, which is visual round-on-blur only) — this is the one place `rows` is
      // actually sent to the API, so rounding right here guarantees the persisted value is
      // correct regardless of how each cell got its current value (typed, calculated, or
      // loaded). Same rationale as purchase-order-line-grid.tsx's own buildDto.
      const roundedRows = rows.map((r) => ({ ...r, quantity: round(r.quantity, "quantity"), unitPrice: round(r.unitPrice, "unit-price") }));
      if (isWorkOrderMode) {
        for (const lt of BOM_LINE_TYPE_VALUES) {
          const linesOfType = roundedRows.filter((r) => r.lineType === lt).map((r) => ({
            inventoryId: r.fabricInventoryId ?? undefined, explanation: r.explanation || undefined,
            variant1: r.variant || undefined, variant2: r.variant2 || undefined, isCutting: r.willBeCut ? 1 : 0, isMaster: r.mainFabric ? 1 : 0,
            unitId: r.unitId ?? undefined, quantity: r.quantity, price: r.unitPrice,
            swatchCardId: r.swatchCardId ? Number(r.swatchCardId) : undefined,
            // Same combined-total mapping transferBomFromStyleCard uses — see RECIPE_ITEM_COLUMNS'
            // own comment on why only one Wastage column exists here.
            wastage: (r.wastePct || 0) + (r.dyeWastagePct || 0) + (r.otherWastagePct || 0),
            uD_Component: r.component || undefined, uD_Dia: r.dia || undefined, uD_Guage: r.gauge || undefined,
            uD_FinishWidth: r.finishWidth || undefined, uD_FinishRoute: r.finishRoute || undefined,
            uD_Revision: r.revision || undefined, uD_Placement: r.placement || undefined, uD_Remarks: r.process || undefined,
            markerWidth: r.marketWidth || undefined, markerLength: r.marketLength || undefined, m2Weight: r.marketWeight || undefined,
          }));
          await legacyErpApi.workOrders.upsertBom(workOrder!.workOrderId, lt, linesOfType);
        }
      } else {
        await Promise.all([
          plmApi.styleCards.update(styleCardId!, header),
          plmApi.styleBom.upsertLines(styleCardId!, roundedRows),
        ]);
      }
      toast.success("BOM saved");
      onReloadCard?.();
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

  // ---- Column resize/reorder/hide/persist — shared across every grid via useGridColumns ----
  const gridColumnDefs = useMemo(
    () => COLUMNS.map((c) => ({ key: c.key, label: c.label, defaultWidth: DEFAULT_WIDTHS[c.key], minWidth: MIN_WIDTHS[c.key] })),
    [],
  );
  // Screen-specific storageKey (user- and screen-specific preferences, per the task's own
  // requirement) — Work Order gets its own saved column layout/order/widths, separate from
  // Style/Sample Card's "bomLineGrid", even though the column SET/definitions are identical.
  // Same useGridColumns hook/tablePreferences infrastructure either way — not a second
  // column-manager implementation.
  const gridColumns = useGridColumns<ColKey>({
    storageKey: isWorkOrderMode ? "workOrderBomGrid" : "bomLineGrid",
    columns: gridColumnDefs,
    fixedColumns: FIXED_COLS,
  });
  const displayColumnDefs = useMemo(
    () => gridColumns.displayColumnDefs.map((c) => COLUMN_BY_KEY.get(c.key)!),
    [gridColumns.displayColumnDefs],
  );
  const colWidths = gridColumns.colWidths;
  const startResize = gridColumns.startResize;
  const resetColumnWidth = gridColumns.resetWidth;
  const totalTableWidth = gridColumns.totalWidth(DEL_W);

  // ---- Cell content per column key — identical field bindings/editors to the original
  // hardcoded markup, just looked up by key so Manage Columns can show/hide/reorder them.
  const renderCell = (r: BomRow, key: ColKey) => {
    switch (key) {
      case "fabricCode":
        return r.lineType === "fabric" || r.lineType === "trim"
          ? <span className="px-2 text-xs text-muted-foreground font-mono">{r.fabricCode || "—"}</span>
          : <GridInput value={r.fabricCode} onChange={(v) => update(r.id, { fabricCode: v })} />;
      case "fabricName":
        return r.lineType === "fabric" || r.lineType === "trim" ? (
          <div className="flex h-full w-full items-stretch">
            <div className="min-w-0 flex-1">
              <AutocompleteTextCell
                value={r.fabricName}
                options={r.lineType === "fabric" ? fabricOptions : trimOptions}
                placeholder="Type to Search"
                // This grid has no separate click-to-edit/static mode (every cell is always
                // live), unlike the click-to-activate grids AutocompleteTextCell was built for —
                // startOpen defaults to true there (correct for "just activated"), which here
                // would leave the suggestion list permanently open on every row. false + the
                // field's own onFocus-like typing still opens it via onChange below.
                startOpen={false}
                onChange={(v) => update(r.id, { fabricName: v })}
                onCancel={() => {}}
                onCommit={(finalValue) =>
                  // Clearing the card also resets Unit and Quantity — once there's no selected
                  // Item, there's no Unit to hold onto and no basis for whatever Quantity number
                  // was last expressed in it.
                  update(r.id, finalValue.trim() ? { fabricName: finalValue } : { fabricName: "", fabricInventoryId: null, fabricCode: "", unitId: null, unit: "", quantity: 0 })
                }
                onSelectOption={(o) => applyCardSelection(r.id, r.lineType, Number(o.id), String(o.code ?? ""), o.name || "")}
              />
            </div>
            {/* Opens the full Fabric/Trim Card grid lookup (CardLookupDialog) — a proper
                searchable, multi-column, multi-row table, for browsing/selecting a card instead
                of only typing to filter above. Feeds the exact same applyCardSelection. */}
            <button
              type="button"
              title={`Browse ${r.lineType === "fabric" ? "Fabric" : "Trim"} Cards`}
              onClick={() => setLookupTarget({ rowId: r.id, lineType: r.lineType as "fabric" | "trim" })}
              className="flex w-7 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            {/* Yarn Recipe Detail — Fabric rows only, once a Fabric Card is actually selected
                (the recipe is a property of the Fabric Card itself, persisted against its own
                fabricInventoryId, not this BOM row — reused across every row/Style Card that
                selects the same card). */}
            {r.lineType === "fabric" && r.fabricInventoryId != null && (
              <button
                type="button"
                title="Yarn Recipe Detail"
                onClick={() => setYarnRecipeRowId(r.id)}
                className="flex w-7 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Scissors className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : <GridInput value={r.fabricName} onChange={(v) => update(r.id, { fabricName: v })} />;
      case "explanation":
        return <GridInput value={r.explanation} onChange={(v) => update(r.id, { explanation: v })} />;
      case "placement":
        return <GridInput value={r.placement} onChange={(v) => update(r.id, { placement: v })} />;
      case "process":
        return (
          <select value={r.process} onChange={(e) => update(r.id, { process: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
            <option value="">—</option>
            {processCards.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        );
      case "variant":
        return <GridInput value={r.variant} onChange={(v) => update(r.id, { variant: v })} />;
      case "variant2":
        return <GridInput value={r.variant2} onChange={(v) => update(r.id, { variant2: v })} />;
      case "rowColumn":
        return <GridInput value={r.rowColumn} onChange={(v) => update(r.id, { rowColumn: v })} />;
      case "swatchCardId":
        return (
          <select value={r.swatchCardId} onChange={(e) => update(r.id, { swatchCardId: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
            <option value="">—</option>
            {swatches.map((s) => <option key={s.id} value={s.id}>{s.colorName}{s.pantoneCode ? ` (${s.pantoneCode})` : ""}</option>)}
          </select>
        );
      case "willBeCut":
        return <GridCheckbox checked={r.willBeCut} onChange={(v) => update(r.id, { willBeCut: v })} />;
      case "mainFabric":
        return <GridCheckbox checked={r.mainFabric} onChange={(v) => update(r.id, { mainFabric: v })} />;
      case "unit": {
        // Once a Fabric/Trim Card is selected, Unit becomes a real click-to-open dropdown scoped
        // to exactly that card's own configured Units (never the flat global unit list) — the
        // exact same Select/SelectTrigger/SelectContent/SelectItem control Purchase Order's own
        // Unit cell already uses for the same per-item-configured-Units case
        // (purchase-order-line-grid.tsx's own "unit" column), not AutocompleteTextCell — that
        // component only ever opens its suggestion list on typing/ArrowDown (see
        // autocomplete-text-cell.tsx: `onChange={(v) => { onChange(v); setOpen(true); }}`, no
        // onFocus/onClick handler at all), which is correct for the Fabric/Trim Name search box
        // but reads as "the dropdown doesn't open" for a short, fixed-choice field a user expects
        // to just click. A row with no card selected yet (or Ornament/Process, with no associated
        // Item at all) keeps the plain free-text field it always had.
        if (r.fabricInventoryId == null) {
          // Manually editing away from the card-resolved Unit text clears unitId too — otherwise
          // a free-typed value would save alongside a now-mismatched FK from whichever card it
          // was last auto-resolved from (same "no stale Unit" rule the card selection/clear
          // paths above already follow).
          return <GridInput value={r.unit} onChange={(v) => update(r.id, v === r.unit ? { unit: v } : { unit: v, unitId: null })} />;
        }
        const units = itemUnitsByCard[String(r.fabricInventoryId)] || [];
        return (
          <Select
            value={r.unitId != null ? String(r.unitId) : ""}
            onValueChange={(v) => {
              const target = units.find((u: any) => String(u.id) === v);
              if (!target) return;
              const unitPatch: Partial<BomRow> = { unitId: Number(target.id), unit: target.code || target.name || "" };
              // Fabric: Quantity is derived (calcFabricQuantity, via update()'s own recompute)
              // fresh from Market Length/Width/Weight re-expressed in the newly picked Unit —
              // never set here directly, and never a multiply/divide of the old number.
              // Trim/other (no physical formula backing Quantity): re-express the row's current
              // Quantity from whichever Unit it's currently in into the newly picked one, via the
              // exact same per-item ratio unit-conversion.util.ts already documents
              // (convertQuantityBetweenUnits) — the existing Waste/Price calculation pipeline
              // downstream of Quantity is untouched either way.
              if (r.lineType !== "fabric") {
                const fromUnit = units.find((u: any) => String(u.id) === String(r.unitId)) ?? null;
                unitPatch.quantity = convertQuantityBetweenUnits(r.quantity, fromUnit, target);
              }
              update(r.id, unitPatch);
            }}
          >
            <SelectTrigger className="h-7 w-full border-0 bg-transparent px-2 text-xs shadow-none focus:ring-0">
              <SelectValue placeholder="Select Unit" />
            </SelectTrigger>
            <SelectContent>
              {units.map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.code || u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      case "marketLength":
        return r.lineType === "fabric"
          ? <GridInput type="number" align="right" value={r.marketLength} onChange={(v) => update(r.id, { marketLength: parseFloat(v) || 0 })} />
          : <span className="block px-2 text-right text-xs text-muted-foreground">—</span>;
      case "marketWidth":
        return r.lineType === "fabric"
          ? <GridInput type="number" align="right" value={r.marketWidth} onChange={(v) => update(r.id, { marketWidth: parseFloat(v) || 0 })} />
          : <span className="block px-2 text-right text-xs text-muted-foreground">—</span>;
      case "marketWeight":
        return r.lineType === "fabric"
          ? <GridInput type="number" align="right" value={r.marketWeight} onChange={(v) => update(r.id, { marketWeight: parseFloat(v) || 0 })} />
          : <span className="block px-2 text-right text-xs text-muted-foreground">—</span>;
      case "quantity": {
        // Fabric rows: Quantity is derived (Market Length/Width/Weight, re-expressed in the
        // selected Unit) — shown read-only, same convention as the Calculated Qty column just to
        // its right. Trim/Ornament/Process rows are unaffected: still a plain manually-entered
        // (or, for Trim with a selected card, ratio-converted on Unit change) value.
        if (r.lineType !== "fabric") {
          return <GridInput type="number" align="right" value={r.quantity} decimalKey="quantity" onChange={(v) => update(r.id, { quantity: parseFloat(v) || 0 })} />;
        }
        const card = r.fabricInventoryId != null ? fabricCardCacheRef.current[String(r.fabricInventoryId)] : null;
        // Dedicated Yarn Recipe (yarn-recipe-dialog.tsx) is authoritative once it has rows;
        // legacy 4-slot Yarn Ratio fields are only ever the fallback for a card with no recipe
        // saved yet. Kicked off here (fire-and-forget, cached) rather than bulk-prefetched for
        // every row on load — most rows never open this tooltip.
        if (r.fabricInventoryId != null && !(String(r.fabricInventoryId) in yarnRecipeByCard)) {
          ensureYarnRecipe(r.fabricInventoryId);
        }
        const recipeLines = r.fabricInventoryId != null ? yarnRecipeByCard[String(r.fabricInventoryId)] : undefined;
        // Yarn is distributed from the Fabric's own Calculated Quantity (Quantity x (1 + total
        // Waste/Dye Wastage/Other Wastage %) — the same non-compound sum-then-multiply-once
        // calculation the Calculated Qty column shows), never the raw pre-waste Quantity itself.
        // Yarn row waste is NOT applied here — see yarnBreakdownFromRecipe's own comment; that
        // belongs to a separate future Yarn Requirement/Consumption screen, not this Fabric BOM.
        const { totalWastePct, finalQty: calculatedQuantity } = applyWaste(r.quantity, r.wastePct, r.dyeWastagePct, r.otherWastagePct);
        const yarnRows = (recipeLines && yarnBreakdownFromRecipe(calculatedQuantity, recipeLines)) || yarnConsumptionBreakdown(calculatedQuantity, card);
        const title = [
          "Auto-calculated: Area (m²) = Market Width × Market Length / 10,000, then Quantity (g) = Area × Weight/m², converted into the selected Unit using the Fabric Card's configured Item Units.",
          totalWastePct > 0 && `\nTotal Fabric Waste: ${totalWastePct}% (Waste + Dye Wastage + Other Wastage, applied once to Quantity — never compounded) -> Calculated Quantity ${calculatedQuantity} ${r.unit || ""}`.trim(),
          yarnRows && `\nYarn Requirement (${recipeLines?.length ? "Fabric Card's Yarn Recipe" : "Fabric Card's configured Yarn Ratios"}), from Calculated Quantity above (Yarn Waste not applied — future Yarn Requirement screen):\n${yarnRows.map((y) => `${y.label}: ${y.pct}% -> ${y.qty} ${r.unit || ""}`.trim()).join("\n")}`,
        ].filter(Boolean).join("");
        return <span className="block px-2 text-right font-mono text-xs text-muted-foreground" title={title}>{r.quantity.toFixed(2)}</span>;
      }
      case "wastePct":
        return <GridInput type="number" align="right" value={r.wastePct} onChange={(v) => update(r.id, { wastePct: parseFloat(v) || 0 })} />;
      case "dyeWastagePct":
        return <GridInput type="number" align="right" value={r.dyeWastagePct} onChange={(v) => update(r.id, { dyeWastagePct: parseFloat(v) || 0 })} />;
      case "otherWastagePct":
        return <GridInput type="number" align="right" value={r.otherWastagePct} onChange={(v) => update(r.id, { otherWastagePct: parseFloat(v) || 0 })} />;
      case "totalWaste":
        return <>{applyWaste(r.quantity, r.wastePct, r.dyeWastagePct, r.otherWastagePct).totalWastePct.toFixed(2)}</>;
      case "calculatedQty":
        return <>{applyWaste(r.quantity, r.wastePct, r.dyeWastagePct, r.otherWastagePct).finalQty.toFixed(2)}</>;
      case "unitPrice":
        return <GridInput type="number" align="right" value={r.unitPrice} decimalKey="unit-price" onChange={(v) => update(r.id, { unitPrice: parseFloat(v) || 0 })} />;
      case "component":
        return <GridInput value={r.component} onChange={(v) => update(r.id, { component: v })} />;
      case "dia":
        return <GridInput value={r.dia} onChange={(v) => update(r.id, { dia: v })} />;
      case "gauge":
        return <GridInput value={r.gauge} onChange={(v) => update(r.id, { gauge: v })} />;
      case "finishWidth":
        return <GridInput value={r.finishWidth} onChange={(v) => update(r.id, { finishWidth: v })} />;
      case "finishRoute":
        return <GridInput value={r.finishRoute} onChange={(v) => update(r.id, { finishRoute: v })} />;
      case "revision":
        return <GridInput value={r.revision} onChange={(v) => update(r.id, { revision: v })} />;
      default:
        return null;
    }
  };

  // Right-click row actions — reuses the same RowContextMenu/RowAction[] component every other
  // Legacy ERP list screen already uses (e.g. fabric-cards-list.tsx's own getRowActions), instead
  // of a bespoke context menu just for this grid. Currently the only action: Yarn Recipe Detail,
  // for a Fabric row that has an actual card selected (fabricInventoryId set) — the exact same
  // setYarnRecipeRowId(r.id) the Scissors icon button in the Fabric Name cell already calls, so
  // both entry points open the identical dialog with identical data. Other row types/states get
  // an empty action list, so right-clicking them is a no-op, same as before this change.
  const getRowActions = (r: BomRow): RowAction[] => {
    if (r.lineType !== "fabric" || r.fabricInventoryId == null) return [];
    return [
      { key: "yarn-recipe", label: "Yarn Recipe Detail", icon: Scissors, onSelect: () => setYarnRecipeRowId(r.id) },
    ];
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading BOM...</p>;

  return (
    <div className="space-y-3">
      {!isWorkOrderMode && (
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
      )}

      <Tabs defaultValue="fabric">
        <div className="flex items-center justify-between">
          <TabsList>{LINE_TYPES.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label} ({grouped[t.value]?.length ?? 0})</TabsTrigger>)}</TabsList>
          <div className="flex items-center gap-2">
            {workOrder?.toolbarExtra}
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={gridColumns.manageColumns.openModal}>
              <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
            </Button>
            <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>

        {LINE_TYPES.map((t) => {
          const tabColumnDefs = columnDefsForTab(t.value, displayColumnDefs, isWorkOrderMode);
          return (
          <TabsContent key={t.value} value={t.value} className="pt-3">
            <div className="rounded-md border overflow-x-auto">
              <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
                <colgroup>
                  {tabColumnDefs.map((col) => <col key={col.key} style={{ width: colWidths[col.key] }} />)}
                  <col style={{ width: DEL_W }} />
                </colgroup>
                <TableHeader>
                  <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8 [&>th]:whitespace-nowrap">
                    {tabColumnDefs.map((col) => {
                      const fixed = FIXED_COLS.includes(col.key);
                      return (
                        <TableHead
                          key={col.key}
                          className={cn("relative p-0", gridColumns.dragOverColumn === col.key && "bg-primary/15")}
                          onDragOver={gridColumns.getHeaderDragProps(col.key).onDragOver}
                          onDrop={gridColumns.getHeaderDragProps(col.key).onDrop}
                        >
                          <span
                            title={col.label}
                            draggable={!fixed}
                            onDragStart={gridColumns.getHeaderDragProps(col.key).onDragStart}
                            onDragEnd={gridColumns.getHeaderDragProps(col.key).onDragEnd}
                            className={cn(
                              "flex h-8 w-full min-w-0 items-center truncate px-2",
                              col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start",
                              !fixed && "cursor-grab active:cursor-grabbing",
                            )}
                          >
                            {col.label}
                          </span>
                          <div
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                            onMouseDown={startResize(col.key)}
                            onDoubleClick={() => resetColumnWidth(col.key)}
                            title="Drag to resize · double-click to reset width"
                            aria-hidden="true"
                          />
                        </TableHead>
                      );
                    })}
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(grouped[t.value] || []).map((r) => {
                    const rowActions = getRowActions(r);
                    const row = (
                      <TableRow className="[&>td]:border-r [&>td]:p-0">
                        {tabColumnDefs.map((col) => (
                          <TableCell key={col.key} className={cellClassFor(col.key)}>
                            {renderCell(r, col.key)}
                          </TableCell>
                        ))}
                        <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(r.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
                      </TableRow>
                    );
                    return rowActions.length ? (
                      <RowContextMenu key={r.id} actions={rowActions}>{row}</RowContextMenu>
                    ) : (
                      <Fragment key={r.id}>{row}</Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={() => addRow(t.value)}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
          </TabsContent>
          );
        })}
      </Tabs>

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns. Fabric Code and Fabric Name are required and always stay first."
      />

      {lookupTarget && (
        <CardLookupDialog<CardLookupRow>
          open={!!lookupTarget}
          onOpenChange={(open) => !open && setLookupTarget(null)}
          title={lookupTarget.lineType === "fabric" ? "Select Fabric Card" : "Select Trim Card"}
          fetchOptions={lookupTarget.lineType === "fabric" ? legacyErpApi.fabricCards.list : legacyErpApi.trimInventoryCards.list}
          onSelect={(row: any) => {
            // Cache the full raw row (Width/Weight/Dia/Gauge/Finish Width, etc.) — the dialog's
            // own search may return a card that isn't among the ones `load()` bulk-fetched up
            // front, so applyCardSelection's physical-field lookup below needs it here too.
            fabricCardCacheRef.current[String(row.id)] = row;
            applyCardSelection(lookupTarget.rowId, lookupTarget.lineType, Number(row.id), row.inventoryCode || "", row.inventoryName || "");
          }}
        />
      )}

      {yarnRecipeRowId && (() => {
        const row = rows.find((r) => r.id === yarnRecipeRowId);
        if (!row || row.fabricInventoryId == null) return null;
        return (
          <YarnRecipeDialog
            open={!!yarnRecipeRowId}
            onOpenChange={(open) => {
              if (!open) {
                // Invalidate this card's cached recipe so the Quantity cell's tooltip re-fetches
                // and reflects whatever was just saved (or left unsaved), instead of showing
                // stale data from before the dialog opened.
                delete yarnRecipeCacheRef.current[String(row.fabricInventoryId)];
                setYarnRecipeByCard((prev) => {
                  const next = { ...prev };
                  delete next[String(row.fabricInventoryId)];
                  return next;
                });
                setYarnRecipeRowId(null);
              }
            }}
            fabricInventoryId={row.fabricInventoryId}
            fabricCode={row.fabricCode}
            fabricName={row.fabricName}
            // The Fabric's own Calculated Quantity (Quantity x (1 + Waste/Dye Wastage/Other
            // Wastage %), same non-compound calc as the "calculatedQty" column) — Yarn Recipe
            // rows distribute from this, never the raw pre-waste Quantity.
            fabricQuantity={applyWaste(row.quantity, row.wastePct, row.dyeWastagePct, row.otherWastagePct).finalQty}
            fabricUnit={row.unit}
          />
        );
      })()}
    </div>
  );
}
