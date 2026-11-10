"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useParams, useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CostingGrid, SheetCellInput, type CostingColumn } from "../_components/costing-grid";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import type { DecimalFieldKey } from "@/lib/legacy-erp/decimal-parameters";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Save, Search, ImageOff, Plus, Trash2, Upload, Calculator, Table2, RotateCcw, Lock } from "lucide-react";
import { CostDetailDialog, CostDetailValue, emptyCostDetail } from "../_components/cost-detail-dialog";
import { ProfitBreakdownDialog } from "../_components/profit-breakdown-dialog";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { AutocompleteTextCell, type AutocompleteOption } from "@/components/legacy-erp/autocomplete-text-cell";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { FormRow as FieldRow } from "@/components/forms/form-row";
import { RowActionsMenu } from "@/components/legacy-erp/row-actions";
import { useCostingSheetActions } from "@/components/plm/costing-sheet-actions";
import { normalizeNonNegative } from "@/lib/numeric-guards";

import { DatePicker } from "@/components/ui/date-picker";
// ---------- formatting helpers ----------
const fmt2 = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- row types ----------
// inventoryId = the selected Inventory item (IM_Item.RecId) — the source of truth; inventoryCode/
// inventoryName are its display values (set together on selection, re-filled by the server).
// unitId = the selected one of that item's configured Units (legacyErpApi.lookupItemUnits, as in
// the Style Card BOM); `unit` stays the saved Unit text, the server resolves unitId from it.
type RawRow = { id: string; groupCode: string; groupName: string; inventoryId: number | null; inventoryCode: string; inventoryName: string; quantity: number; wastePct: number; unitPrice: number; forex: string; unitId: number | null; unit: string; explanation: string };
type LaborRow = { id: string; groupCode: string; groupName: string; explanation: string; quantity: number; wastePct: number; forex: string; unitPrice: number };
type OtherRow = { id: string; groupCode: string; groupName: string; explanation: string; quantity: number; forex: string; unitPrice: number };

// Today's date (YYYY-MM-DD) in the user's local time zone — not toISOString(), which is the UTC
// date and would give yesterday in the early-morning hours east of UTC.
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// A new sheet's Costing Date starts as today (still editable).
const blankHeader = () => ({
  costingNo: "", costingDate: todayLocal(), styleCode: "", styleName: "", accountCode: "", accountName: "",
  category: "", brand: "", pkrRate: 1, foreignCurrency: "Usdollar", foreignRate: 0,
  quotedPriceForex: "Usdollar", quotedPrice: 0, orderQuantity: 0, shippingTerms: "FOB", paymentTerms: "",
});

const blankPct = () => ({ overhead: 0, waste: 0, gSupplies: 0, excessProduction: 0, profit: 0, financialCost: 0, commission: 0, commission3: 0 });

const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));

const CATEGORIES = ["Boy", "Girl", "Men", "Women", "Kids", "Infant"];
const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DDP", "FCA"];

// ---------- small presentational helpers ----------
// FieldRow renders through the shared FormRow (components/forms/form-row.tsx) —
// same label-left layout this file already used, now centralized so every
// dense data-entry screen shares one implementation instead of its own copy.

// The three section grids (and their dark header bars) render through CostingGrid /
// SheetCellInput (../_components/costing-grid.tsx), on the shared EditableGridInput.

// Calculation-panel amounts the user may override (saved as CostingSheet.manualAmounts, PKR; same
// keys as the backend's MANUAL_AMOUNT_KEYS). Every key but "others" also has a % (blankPct).
const MANUAL_KEYS = ["overhead", "others", "waste", "gSupplies", "excessProduction", "profit", "financialCost", "commission", "commission3"] as const;
type ManualKey = (typeof MANUAL_KEYS)[number];
type PctKey = Exclude<ManualKey, "others">;
type ManualAmounts = Partial<Record<ManualKey, number>>;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const MAX_PCT = 9999.9999; // the % columns are Decimal(8, 4)
const readManualAmounts = (v: any): ManualAmounts => {
  const out: ManualAmounts = {};
  if (v && typeof v === "object") for (const k of MANUAL_KEYS) if (v[k] !== null && v[k] !== undefined && Number.isFinite(Number(v[k]))) out[k] = Number(v[k]);
  return out;
};

// Typable PKR amount of the calculation panel. Shows the formatted value at rest and the plain
// number while focused; commits on blur/Enter only when the number actually changed (so tabbing
// through never turns an automatic value into a manual one); Escape discards the edit.
function SummaryAmountInput({ value, onCommit, manual, onReset }: { value: number; onCommit: (v: number) => void; manual?: boolean; onReset?: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const plain = String(round4(value));
  return (
    <span className="flex items-center justify-end gap-0.5">
      {manual && onReset && (
        <button type="button" title="Manual value — return to automatic calculation" onClick={onReset} className="shrink-0 text-amber-600 hover:text-foreground">
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      <input
        inputMode="decimal"
        value={draft ?? fmt4(value)}
        title={manual ? "Manual value (click ↺ to return to automatic)" : "Automatic — type to enter a manual value"}
        onFocus={(e) => { cancelled.current = false; setDraft(plain); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => { const v = e.target.value.replace(/,/g, ""); if (/^\d*\.?\d*$/.test(v)) setDraft(v); }}
        onBlur={() => {
          if (!cancelled.current && draft !== null && draft !== plain) {
            const n = parseFloat(draft);
            const next = round4(Number.isFinite(n) && n > 0 ? n : 0);
            if (next !== round4(value)) onCommit(next);
          }
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); }
        }}
        className={cn(
          "h-6 w-full min-w-0 rounded bg-transparent px-1 text-right font-mono text-xs outline-none ring-1 ring-transparent hover:ring-border focus:bg-accent/50",
          manual && "bg-amber-100 font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
        )}
      />
    </span>
  );
}

function SummaryRow({ label, pct, onPctChange, pkr, usd, bold = false, extra, onAmountChange, manual, onReset }: { label: string; pct?: number; onPctChange?: (v: number) => void; pkr: number; usd: number; bold?: boolean; extra?: React.ReactNode; onAmountChange?: (v: number) => void; manual?: boolean; onReset?: () => void }) {
  return (
    <tr className={cn("border-b text-xs", bold && "font-semibold bg-muted/40")}>
      <td className="py-1 px-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">{label}{extra}</span>
      </td>
      <td className="py-1 px-1 w-16">
        {pct !== undefined ? (
          <input
            type="number"
            min={0}
            max={MAX_PCT}
            value={pct}
            readOnly={!onPctChange}
            title={manual ? "Effective % of the manual amount — typing a % returns the amount to automatic" : undefined}
            onChange={(e) => onPctChange?.(Math.min(normalizeNonNegative(e.target.value), MAX_PCT))}
            className={cn("h-6 w-full bg-transparent text-xs text-right font-mono px-1 outline-none rounded focus:bg-accent/50", manual && "text-muted-foreground italic")}
          />
        ) : null}
      </td>
      <td className="py-1 px-2 text-right font-mono">
        {onAmountChange ? <SummaryAmountInput value={pkr} onCommit={onAmountChange} manual={manual} onReset={onReset} /> : fmt4(pkr)}
      </td>
      <td className="py-1 px-2 text-right font-mono">{fmt4(pkr)}</td>
      <td className="py-1 px-2 text-right font-mono">{fmt4(usd)}</td>
    </tr>
  );
}

export default function CostingSheetDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const isNew = id === "new";

  const [sheetId, setSheetId] = useState<string | null>(isNew ? null : id);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [header, setHeader] = useState(blankHeader());
  useWorkspaceRecordLabel(sheetId ? header.costingNo || undefined : undefined);
  const [pct, setPct] = useState(blankPct());
  // Manually overridden panel amounts (PKR) — see MANUAL_KEYS; a missing key = automatic.
  const [manual, setManual] = useState<ManualAmounts>({});
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [laborRows, setLaborRows] = useState<LaborRow[]>([]);
  const [otherRows, setOtherRows] = useState<OtherRow[]>([]);
  // Decimal Parameters (Settings -> Screen Parameters -> Decimal) — round-on-blur for
  // Quantity/Unit Price cells below, via the shared decimalKey mechanism.
  const { round, ensureLoaded: ensureDecimalParamsLoaded } = useDecimalParameters();
  useEffect(() => { ensureDecimalParamsLoaded(); }, [ensureDecimalParamsLoaded]);
  const [costDetails, setCostDetails] = useState<Record<string, CostDetailValue>>({});
  const [costDetailRowId, setCostDetailRowId] = useState<string | null>(null);
  const [profitBreakdownOpen, setProfitBreakdownOpen] = useState(false);
  // Lock (server-side state, see components/plm/costing-sheet-actions.tsx): while locked the form
  // is read-only and Save is refused (the server refuses every change too).
  const [lock, setLock] = useState<{ isLocked: boolean; lockedAt: string | null; lockedBy: { name: string } | null }>({ isLocked: false, lockedAt: null, lockedBy: null });
  // Unsaved changes: the editable state as last loaded/saved vs now (set after each load renders).
  const [loadedTick, setLoadedTick] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  const applySheet = (s: any) => {
    setSheetId(s.id);
    setHeader({
      costingNo: s.costingNo || "",
      // A saved date is kept as-is; a sheet saved without one shows today (written on its next Save).
      costingDate: s.costingDate ? String(s.costingDate).slice(0, 10) : todayLocal(),
      styleCode: s.styleCode || "",
      styleName: s.styleName || "",
      accountCode: s.accountCode || "",
      accountName: s.accountName || "",
      category: s.category || "",
      brand: s.brand || "",
      pkrRate: num(s.pkrRate) || 1,
      foreignCurrency: s.foreignCurrency || "Usdollar",
      foreignRate: num(s.foreignRate),
      quotedPriceForex: s.quotedPriceForex || "Usdollar",
      quotedPrice: num(s.quotedPrice),
      orderQuantity: num(s.orderQuantity),
      shippingTerms: s.shippingTerms || "FOB",
      paymentTerms: s.paymentTerms || "",
    });
    setPct({
      overhead: num(s.overheadPct), waste: num(s.wastePct), gSupplies: num(s.gSuppliesPct),
      excessProduction: num(s.excessProductionPct), profit: num(s.profitPct),
      financialCost: num(s.financialCostPct), commission: num(s.commissionPct), commission3: num(s.commission3Pct),
    });
    setManual(readManualAmounts(s.manualAmounts));
    const raw = (s.rawMaterialLines || []).map((l: any) => ({
      id: l.id, groupCode: l.groupCode || "", groupName: l.groupName || "", inventoryId: l.inventoryId ?? null, inventoryCode: l.inventoryCode || "",
      inventoryName: l.inventoryName || "", quantity: num(l.quantity), wastePct: num(l.wastePct),
      unitPrice: num(l.unitPrice), forex: l.forex || "", unitId: l.unitId ?? null, unit: l.unit || "", explanation: l.explanation || "",
    }));
    setRawRows(raw);
    // Populate the Unit dropdown of every reloaded row that already has an Inventory item.
    raw.forEach((r: RawRow) => { if (r.inventoryId != null) ensureItemUnits(r.inventoryId); });
    setLaborRows((s.laborLines || []).map((l: any) => ({
      id: l.id, groupCode: l.groupCode || "", groupName: l.groupName || "", explanation: l.explanation || "",
      quantity: num(l.quantity), wastePct: num(l.wastePct), forex: l.forex || "", unitPrice: num(l.unitPrice),
    })));
    setOtherRows((s.otherLines || []).map((l: any) => ({
      id: l.id, groupCode: l.groupCode || "", groupName: l.groupName || "", explanation: l.explanation || "",
      quantity: num(l.quantity), forex: l.forex || "", unitPrice: num(l.unitPrice),
    })));
    const details: Record<string, CostDetailValue> = {};
    (s.rawMaterialLines || []).forEach((l: any) => { if (l.costDetail) details[l.id] = l.costDetail; });
    setCostDetails(details);
    setLock({ isLocked: !!s.isLocked, lockedAt: s.lockedAt ?? null, lockedBy: s.lockedBy ?? null });
    setLoadedTick((t) => t + 1);
  };

  const load = async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const s = await plmApi.costingSheets.get(id);
      applySheet(s);
    } catch (e: any) {
      toast.error(e.message || "Failed to load costing sheet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const usdRate = header.foreignRate || 1;

  const rawTotal = useMemo(() => rawRows.reduce((s, r) => s + r.quantity * r.unitPrice * (1 + r.wastePct / 100), 0), [rawRows]);
  const laborTotal = useMemo(() => laborRows.reduce((s, r) => s + r.quantity * r.unitPrice * (1 + r.wastePct / 100), 0), [laborRows]);
  const otherTotal = useMemo(() => otherRows.reduce((s, r) => s + r.quantity * r.unitPrice, 0), [otherRows]);
  const grandLineTotal = rawTotal + laborTotal + otherTotal || 1;

  // ---------- summary panel calculation cascade ----------
  // Same formulas as before (and as the backend's computeTotals); a manually overridden amount
  // simply replaces its automatic value, and everything after it is still derived.
  const amt = (k: ManualKey, auto: number) => manual[k] ?? auto;
  const materialLabor = rawTotal + laborTotal;
  const overheadAmt = amt("overhead", materialLabor * (pct.overhead / 100));
  const othersAmt = amt("others", otherTotal); // the Others grid's total unless overridden
  const costingSubtotal = materialLabor + overheadAmt + othersAmt;
  const wasteAmt = amt("waste", costingSubtotal * (pct.waste / 100));
  const gSuppliesAmt = amt("gSupplies", costingSubtotal * (pct.gSupplies / 100));
  const excessProdAmt = amt("excessProduction", costingSubtotal * (pct.excessProduction / 100));
  const wasteTotal = wasteAmt + gSuppliesAmt + excessProdAmt;
  const profitBase = costingSubtotal + wasteTotal;
  const profitAmt = amt("profit", profitBase * (pct.profit / 100));
  const priceBase = profitBase + profitAmt;
  const financialCostAmt = amt("financialCost", priceBase * (pct.financialCost / 100));
  const commissionAmt = amt("commission", priceBase * (pct.commission / 100));
  const commission3Amt = amt("commission3", priceBase * (pct.commission3 / 100));
  const commissionTotal = commissionAmt + commission3Amt;
  const calculatedPrice = costingSubtotal + wasteTotal + profitAmt + financialCostAmt + commissionTotal;
  const netPrice = calculatedPrice;
  const marginPct = header.quotedPrice > 0 ? ((header.quotedPrice - netPrice) / header.quotedPrice) * 100 : 0;

  // The % each amount is of its formula base. For a manual amount that's its effective % (shown
  // in the % cell, and saved to the % column so reports filtering on Profit % etc. stay right);
  // with a zero base there is no meaningful %, so the entered % is kept.
  const pctBase: Record<PctKey, number> = {
    overhead: materialLabor, waste: costingSubtotal, gSupplies: costingSubtotal, excessProduction: costingSubtotal,
    profit: profitBase, financialCost: priceBase, commission: priceBase, commission3: priceBase,
  };
  const effectivePct = (k: PctKey) => {
    const m = manual[k];
    if (m === undefined || !(pctBase[k] > 0)) return pct[k];
    return Math.min(round4((m / pctBase[k]) * 100), MAX_PCT);
  };
  const setManualAmount = (k: ManualKey, v: number) => setManual((m) => ({ ...m, [k]: round4(Math.max(0, v)) }));
  // Back to automatic. A % row keeps the % its manual amount currently represents, so the amount
  // doesn't jump — from now on it follows that % as the base changes. Others goes back to the
  // Others grid's total.
  const resetManual = (k: ManualKey) => {
    if (k !== "others") { const p = effectivePct(k); setPct((prev) => ({ ...prev, [k]: p })); }
    setManual(({ [k]: _, ...rest }) => rest);
  };
  // Typing a % means "calculate from this %": it also ends that row's manual amount.
  const changePct = (k: PctKey, v: number) => {
    setPct((p) => ({ ...p, [k]: v }));
    setManual(({ [k]: _, ...rest }) => rest);
  };
  const pctRow = (k: PctKey, amount: number) => ({
    pct: effectivePct(k), onPctChange: (v: number) => changePct(k, v),
    pkr: amount, usd: amount / usdRate,
    onAmountChange: (v: number) => setManualAmount(k, v), manual: manual[k] !== undefined, onReset: () => resetManual(k),
  });

  const updateRaw = (rid: string, patch: Partial<RawRow>) => setRawRows((rows) => rows.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const updateLabor = (rid: string, patch: Partial<LaborRow>) => setLaborRows((rows) => rows.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const updateOther = (rid: string, patch: Partial<OtherRow>) => setOtherRows((rows) => rows.map((r) => (r.id === rid ? { ...r, ...patch } : r)));

  const addRaw = () => setRawRows((r) => [...r, { id: uid(), groupCode: "", groupName: "", inventoryId: null, inventoryCode: "", inventoryName: "", quantity: 1, wastePct: 0, unitPrice: 0, forex: "", unitId: null, unit: "", explanation: "" }]);

  // ---------- Raw Material Unit (per Inventory item) ----------
  // Same mechanism as the Style Card BOM (bom-tab.tsx ensureItemUnits): legacyErpApi.lookupItemUnits
  // is the item's own configured Units (IM_ItemUnitItemSize, Main Unit first), cached per item in
  // state so the Unit dropdown re-renders once they resolve, with a ref cache alongside it so an
  // item whose Units are loading/loaded is never fetched twice.
  const [itemUnitsByItem, setItemUnitsByItem] = useState<Record<string, any[]>>({});
  const itemUnitsCacheRef = useRef<Record<string, any[] | Promise<any[]>>>({});
  const ensureItemUnits = async (inventoryId: number): Promise<any[]> => {
    const key = String(inventoryId);
    const cached = itemUnitsCacheRef.current[key];
    if (cached) return cached;
    const promise = legacyErpApi.lookupItemUnits(inventoryId).then((u: any) => (Array.isArray(u) ? u : [])).catch(() => []);
    itemUnitsCacheRef.current[key] = promise;
    const units = await promise;
    itemUnitsCacheRef.current[key] = units;
    setItemUnitsByItem((prev) => ({ ...prev, [key]: units }));
    return units;
  };
  const mainUnitOf = (units: any[]) => (units.length ? units.find((u) => u.isMainUnit) || units[0] : null);

  // ---------- Raw Material Inventory lookup ----------
  // Inventory Code is picked from the Inventory master (legacyErpApi.inventoryCards.list — the
  // Inventory Card list's own search over code/name, non-deleted items) via the shared
  // AutocompleteTextCell (type or click to search) and CardLookupDialog (search icon). Picking an
  // item sets inventoryId + Code + Name together and clears the Unit, which is then resolved from
  // that item's own configured Units (above); typed text alone never binds anything.
  const [inventoryOptions, setInventoryOptions] = useState<AutocompleteOption[]>([]);
  const [inventoryQuery, setInventoryQuery] = useState<Record<string, string>>({});
  const [inventoryLookupRowId, setInventoryLookupRowId] = useState<string | null>(null);
  const inventorySearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inventorySearchSeq = useRef(0);
  const fetchInventory = async (term?: string): Promise<CardLookupRow[]> => {
    const res: any = await legacyErpApi.inventoryCards.list(term ? { search: term } : undefined);
    return Array.isArray(res) ? res : res?.data ?? [];
  };
  const searchInventory = (term: string) => {
    clearTimeout(inventorySearchTimer.current);
    inventorySearchTimer.current = setTimeout(async () => {
      const seq = ++inventorySearchSeq.current;
      try {
        const rows = await fetchInventory(term.trim() || undefined);
        if (seq === inventorySearchSeq.current) setInventoryOptions(rows.map((x) => ({ id: String(x.id), code: x.inventoryCode, name: x.inventoryName })));
      } catch { /* keep the previous list */ }
    }, 200);
  };
  useEffect(() => { searchInventory(""); }, []);
  const clearInventoryQuery = (rowId: string) => setInventoryQuery(({ [rowId]: _, ...rest }) => rest);
  const selectInventory = (rowId: string, item: { id: string | number; code?: string | null; name?: string | null }) => {
    const inventoryId = Number(item.id);
    const prevUnitCode = rawRows.find((r) => r.id === rowId)?.unit || null;
    // Unit is cleared the moment the item changes, so the previous item's Unit is never kept
    // attached to the new one — then resolved from the new item's own configured Units.
    updateRaw(rowId, { inventoryId, inventoryCode: item.code ?? "", inventoryName: item.name ?? "", unitId: null, unit: "" });
    clearInventoryQuery(rowId);
    searchInventory("");
    ensureItemUnits(inventoryId).then((units) => {
      if (!units.length) return;
      // Style Card BOM's item-change rule: keep the previous Unit if the new item also has a Unit
      // of that same code, otherwise the new item's Main Unit. Applied only while the row still
      // holds this item (it may have been changed again before the Units resolved).
      const matched = prevUnitCode ? units.find((u: any) => (u.code || u.name || "").toLowerCase() === prevUnitCode.toLowerCase()) : undefined;
      const target = matched || mainUnitOf(units);
      setRawRows((rows) => rows.map((r) => (r.id === rowId && r.inventoryId === inventoryId ? { ...r, unitId: Number(target.id), unit: target.code || target.name || "" } : r)));
    });
  };
  // Leaving the field without picking: cleared text clears the selection; text that is exactly one
  // listed code binds it; anything else is discarded and the row keeps its current selection.
  const commitInventoryText = (row: RawRow, text: string) => {
    const typed = text.trim();
    clearInventoryQuery(row.id);
    searchInventory("");
    if (typed === row.inventoryCode) return;
    if (!typed) { updateRaw(row.id, { inventoryId: null, inventoryCode: "", inventoryName: "", unitId: null, unit: "" }); return; }
    const exact = inventoryOptions.filter((o) => (o.code ?? "").toLowerCase() === typed.toLowerCase());
    if (exact.length === 1) selectInventory(row.id, exact[0]);
    else toast.error("Select an inventory item from the list");
  };

  // ---------- Forex (currency) lookup ----------
  // Line Forex is the currency's code as text (the data model's `forex` column), picked from the
  // legacy ERP currency master MD_Forex (legacyErpApi.lookupTable("forex") — active currencies
  // only), the same master Purchase Order / Inventory Receipt lines use. It is a label only: the
  // Forex Price / Forex Item Amount columns still convert with the header's Forex rate.
  const [forexOptions, setForexOptions] = useState<AutocompleteOption[]>([]);
  const [forexLoaded, setForexLoaded] = useState(false);
  // In-progress typed text per cell, keyed "<section>:<rowId>" (the row keeps its saved value).
  const [forexQuery, setForexQuery] = useState<Record<string, string>>({});
  useEffect(() => {
    legacyErpApi.lookupTable("forex")
      .then((r: any) => setForexOptions((Array.isArray(r) ? r : []).map((f: any) => ({ id: String(f.id), code: f.code, name: f.name }))))
      .catch(() => toast.error("Failed to load currencies"))
      .finally(() => setForexLoaded(true));
  }, []);
  // Header currency dropdowns (Forex Type, Quoted Price Forex): the same MD_Forex currencies, by
  // code, in the master's order. A sheet's saved value that isn't (or no longer is) in the master
  // stays listed, so opening an older sheet never blanks or changes it.
  const headerCurrencyCodes = (current: string) => {
    const codes = forexOptions.map((o) => o.code || o.name || "").filter(Boolean);
    return current && !codes.includes(current) ? [current, ...codes] : codes;
  };
  const clearForexQuery = (key: string) => setForexQuery(({ [key]: _, ...rest }) => rest);
  // Leaving the cell without picking: cleared text clears the currency; text matching one master
  // currency's code or name binds its code; the row's current value is kept as-is (even one not
  // in the master, so saved values are never silently changed); anything else is rejected.
  const commitForexText = (key: string, current: string, text: string, apply: (code: string) => void) => {
    const typed = text.trim();
    clearForexQuery(key);
    if (typed === current) return;
    if (!typed) { apply(""); return; }
    const lower = typed.toLowerCase();
    const match = forexOptions.find((o) => (o.code ?? "").toLowerCase() === lower) || forexOptions.find((o) => (o.name ?? "").toLowerCase() === lower);
    if (match) apply(match.code || match.name || "");
    else toast.error(forexOptions.length ? "Select a currency from the list" : "No active currencies are configured in the Forex master");
  };

  // ---------- Group lookup ----------
  // Group Code / Group Name on every section's lines are one pick from the legacy inventory group
  // master IM_Group (legacyErpApi.lookupTable("group") — active groups only; the same master
  // IM_Item.GroupId and MA_InitialCost.InventoryGroupId point to, managed on Group Code Master).
  // IM_Group has no per-section category, so Raw Material, Labor and Others share one list.
  // Picking either cell writes both from the same record, so code and name can't drift apart; the
  // lines still store the text pair (groupCode/groupName) as before.
  const [groupOptions, setGroupOptions] = useState<AutocompleteOption[]>([]);
  const [groupLoaded, setGroupLoaded] = useState(false);
  // In-progress typed text per cell, keyed "<section>:<field>:<rowId>".
  const [groupQuery, setGroupQuery] = useState<Record<string, string>>({});
  useEffect(() => {
    legacyErpApi.lookupTable("group")
      .then((r: any) => setGroupOptions((Array.isArray(r) ? r : []).map((g: any) => ({ id: String(g.id), code: g.code, name: g.name }))))
      .catch(() => toast.error("Failed to load groups"))
      .finally(() => setGroupLoaded(true));
  }, []);
  const clearGroupQuery = (key: string) => setGroupQuery(({ [key]: _, ...rest }) => rest);
  const groupPatch = (o: AutocompleteOption | null) => ({ groupCode: o?.code ?? "", groupName: o?.name ?? "" });
  // Leaving a group cell without picking: cleared text clears both cells; text matching a group's
  // code or name (this cell's own field first) binds that group; the cell's current value is kept
  // as-is (a saved pair not in the master is never silently changed); anything else is rejected.
  const commitGroupText = (key: string, field: "code" | "name", current: string, text: string, apply: (patch: { groupCode: string; groupName: string }) => void) => {
    const typed = text.trim();
    clearGroupQuery(key);
    if (typed === current) return;
    if (!typed) { apply(groupPatch(null)); return; }
    const lower = typed.toLowerCase();
    const other = field === "code" ? "name" : "code";
    const match = groupOptions.find((o) => (o[field] ?? "").toLowerCase() === lower) || groupOptions.find((o) => (o[other] ?? "").toLowerCase() === lower);
    if (match) apply(groupPatch(match));
    else toast.error(groupOptions.length ? "Select a group from the list" : "No active groups are configured in Group Code Master");
  };

  const addLabor = () => setLaborRows((r) => [...r, { id: uid(), groupCode: "", groupName: "", explanation: "", quantity: 1, wastePct: 0, forex: "", unitPrice: 0 }]);
  const addOther = () => setOtherRows((r) => [...r, { id: uid(), groupCode: "", groupName: "", explanation: "", quantity: 1, forex: "", unitPrice: 0 }]);

  const editableState = JSON.stringify({ header, pct, manual, rawRows, laborRows, otherRows, costDetails });
  // Snapshot taken once the freshly loaded/saved state has rendered (and once for a new sheet).
  useEffect(() => { setSavedSnapshot(editableState); }, [loadedTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = savedSnapshot !== null && editableState !== savedSnapshot;

  const reloadSheet = async () => {
    if (!sheetId) return;
    try { applySheet(await plmApi.costingSheets.get(sheetId)); } catch (e: any) { toast.error(e.message || "Failed to reload costing sheet"); }
  };
  // Lock / Unlock with unsaved changes is prevented by the menu (Lock is disabled while dirty);
  // after either, the sheet is reloaded so the lock state shown is the server's.
  const { actionsFor, dialog: lockDialog } = useCostingSheetActions(router, () => { void reloadSheet(); });

  const save = async () => {
    if (lock.isLocked) return toast.error("This costing sheet is locked. Unlock it before making changes.");
    if (!header.costingNo) return toast.error("Costing No is required");
    setSaving(true);
    try {
      const headerPayload = {
        costingNo: header.costingNo,
        costingDate: header.costingDate || undefined,
        styleCode: header.styleCode, styleName: header.styleName,
        accountCode: header.accountCode, accountName: header.accountName,
        category: header.category, brand: header.brand,
        pkrRate: header.pkrRate, foreignCurrency: header.foreignCurrency, foreignRate: header.foreignRate,
        quotedPriceForex: header.quotedPriceForex, quotedPrice: header.quotedPrice, orderQuantity: header.orderQuantity,
        shippingTerms: header.shippingTerms, paymentTerms: header.paymentTerms,
        // Effective % (= the entered % unless the amount is manual, see effectivePct).
        overheadPct: effectivePct("overhead"), wastePct: effectivePct("waste"), gSuppliesPct: effectivePct("gSupplies"),
        excessProductionPct: effectivePct("excessProduction"), profitPct: effectivePct("profit"), financialCostPct: effectivePct("financialCost"),
        commissionPct: effectivePct("commission"), commission3Pct: effectivePct("commission3"),
        manualAmounts: manual,
      };

      let targetId = sheetId;
      if (!targetId) {
        const created: any = await plmApi.costingSheets.create(headerPayload);
        targetId = created.id;
      } else {
        await plmApi.costingSheets.update(targetId, headerPayload);
      }

      // Decimal Parameters rounding happens HERE (not just via each cell's own SheetCellInput
      // decimalKey, which is visual round-on-blur only) — this is the one place these rows are
      // actually sent to the API. Same rationale as bom-tab.tsx's own save().
      await Promise.all([
        plmApi.costingSheets.upsertRawMaterialLines(
          targetId!,
          rawRows.map((r) => ({ ...r, quantity: round(r.quantity, "quantity"), unitPrice: round(r.unitPrice, "unit-price"), costDetail: costDetails[r.id] })),
        ),
        plmApi.costingSheets.upsertLaborLines(
          targetId!,
          laborRows.map((r) => ({ ...r, quantity: round(r.quantity, "quantity"), unitPrice: round(r.unitPrice, "unit-price") })),
        ),
        plmApi.costingSheets.upsertOtherLines(
          targetId!,
          otherRows.map((r) => ({ ...r, quantity: round(r.quantity, "quantity"), unitPrice: round(r.unitPrice, "unit-price") })),
        ),
      ]);

      toast.success(sheetId ? "Costing sheet saved" : "Costing sheet created");
      if (!sheetId) {
        router.replace(`/plm/costing-sheets/${targetId}`);
      } else {
        const refreshed = await plmApi.costingSheets.get(targetId!);
        applySheet(refreshed);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save costing sheet");
    } finally {
      setSaving(false);
    }
  };

  // ---------- group based totals ----------
  // One row per group code across all three sections (case-insensitive, so "K" and "k" don't split),
  // amounts from the same per-line formulas as the grids; lines without a group are one
  // "(No group)" row. Share % = amount / (Raw + Labor + Others total), as the grid headers show.
  const groupTotals = useMemo(() => {
    const map = new Map<string, { key: string; code: string; name: string; amount: number }>();
    const bump = (code: string, name: string, amount: number) => {
      const c = code.trim();
      const key = c ? c.toLowerCase() : "";
      const existing = map.get(key);
      if (existing) { existing.amount += amount; if (!existing.name && name) existing.name = name; }
      else map.set(key, { key, code: c || "—", name: c ? name.trim() : "(No group)", amount });
    };
    rawRows.forEach((r) => bump(r.groupCode, r.groupName, r.quantity * r.unitPrice * (1 + r.wastePct / 100)));
    laborRows.forEach((r) => bump(r.groupCode, r.groupName, r.quantity * r.unitPrice * (1 + r.wastePct / 100)));
    otherRows.forEach((r) => bump(r.groupCode, r.groupName, r.quantity * r.unitPrice));
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [rawRows, laborRows, otherRows]);

  // ---------- section grid columns (CostingGrid) ----------
  // Display definitions only: each cell renders/edits the row's own field and the amount cells
  // use the same formulas as before, so column order/visibility never affects data or totals.
  // Forex is the currency name (a text field in the data model), not a number.
  const rawAmount = (r: RawRow) => r.quantity * r.unitPrice * (1 + r.wastePct / 100);
  const laborAmount = (r: LaborRow) => r.quantity * r.unitPrice * (1 + r.wastePct / 100);
  const otherAmount = (r: OtherRow) => r.quantity * r.unitPrice;
  const textCol = <R extends { id: string }, K extends string>(key: K, label: string, width: number, field: keyof R & string, update: (id: string, patch: any) => void): CostingColumn<R, K> => ({
    key, label, defaultWidth: width, minWidth: 60, nav: "text",
    render: (r) => <SheetCellInput value={(r as any)[field] ?? ""} onChange={(v) => update(r.id, { [field]: v })} />,
  });
  const numberCol = <R extends { id: string }, K extends string>(key: K, label: string, width: number, field: keyof R & string, update: (id: string, patch: any) => void, decimalKey?: DecimalFieldKey): CostingColumn<R, K> => ({
    key, label, defaultWidth: width, minWidth: 60, align: "right", nav: "number",
    render: (r) => <SheetCellInput kind="number" nonNegative decimalKey={decimalKey} value={(r as any)[field]} onChange={(v) => update(r.id, { [field]: parseFloat(v) || 0 })} />,
  });
  const amountCol = <R extends { id: string }, K extends string>(key: K, label: string, width: number, value: (r: R) => number, footer?: number): CostingColumn<R, K> => ({
    key, label, defaultWidth: width, minWidth: 70, align: "right",
    render: (r) => fmt4(value(r)),
    footer: footer === undefined ? undefined : fmt4(footer),
  });
  // Searchable currency picker (see the Forex lookup above) — same AutocompleteTextCell as
  // Inventory Code, so the list is portaled and never clipped by the grid.
  const forexCol = <R extends { id: string; forex: string }, K extends string>(section: string, key: K, update: (id: string, patch: any) => void): CostingColumn<R, K> => ({
    key, label: "Forex", defaultWidth: 80, minWidth: 60, nav: "lookup",
    render: (r) => {
      const qKey = `${section}:${r.id}`;
      return (
        <AutocompleteTextCell
          value={forexQuery[qKey] ?? r.forex}
          options={forexOptions}
          maxResults={forexOptions.length}
          placeholder={forexLoaded && !forexOptions.length ? "None" : "Select"}
          startOpen={false}
          openOnFocus
          showDropdownIcon
          popoverClassName="min-w-[240px] max-h-[min(13rem,max(8rem,var(--radix-popover-content-available-height)))]"
          onChange={(v) => setForexQuery((q) => ({ ...q, [qKey]: v }))}
          onCommit={(text) => commitForexText(qKey, r.forex, text, (code) => update(r.id, { forex: code }))}
          onCancel={() => clearForexQuery(qKey)}
          onSelectOption={(o) => { clearForexQuery(qKey); update(r.id, { forex: o.code || o.name || "" }); }}
        />
      );
    },
  });
  // Editable Forex Price = the line's unit price in the header's foreign currency (legacy
  // MA_InitialCostItem: UnitPrice = ForexUnitPrice × ForexRate). Not stored separately — it shows
  // Unit Price ÷ header Forex rate, and typing it sets Unit Price = Forex Price × rate, so Item
  // Amount, totals and the summary recalculate through the existing Unit Price formulas. Without a
  // header Forex rate there is nothing to convert with, so the cell stays read-only until one is set.
  const forexPriceCol = <R extends { id: string; unitPrice: number }, K extends string>(key: K, update: (id: string, patch: any) => void): CostingColumn<R, K> => ({
    key, label: "Forex Price", defaultWidth: 105, minWidth: 70, align: "right",
    nav: header.foreignRate > 0 ? "number" : undefined,
    render: (r) => header.foreignRate > 0 ? (
      <SheetCellInput
        kind="number"
        nonNegative
        value={Number((r.unitPrice / header.foreignRate).toFixed(4))}
        onChange={(v) => update(r.id, { unitPrice: (parseFloat(v) || 0) * header.foreignRate })}
      />
    ) : (
      <span className="block cursor-not-allowed" title="Enter the Forex rate in the header to edit Forex Price" onClick={() => toast.info("Enter the Forex rate in the header to edit Forex Price")}>
        {fmt4(r.unitPrice / usdRate)}
      </span>
    ),
  });
  // Group Code + Group Name pickers (see the Group lookup above): both search code and name, list
  // "Code - Name", and a pick from either writes the pair together.
  const groupCol = <R extends { id: string; groupCode: string; groupName: string }, K extends string>(section: string, field: "code" | "name", key: K, update: (id: string, patch: any) => void): CostingColumn<R, K> => ({
    key, label: field === "code" ? "Group Code" : "Group Name", defaultWidth: field === "code" ? 100 : 130, minWidth: 60, nav: "lookup",
    render: (r) => {
      const qKey = `${section}:${field}:${r.id}`;
      const current = field === "code" ? r.groupCode : r.groupName;
      return (
        <AutocompleteTextCell
          value={groupQuery[qKey] ?? current}
          options={groupOptions}
          maxResults={groupOptions.length}
          placeholder={groupLoaded && !groupOptions.length ? "None" : "Select"}
          startOpen={false}
          openOnFocus
          showDropdownIcon
          popoverClassName="min-w-[280px] max-h-[min(13rem,max(8rem,var(--radix-popover-content-available-height)))]"
          onChange={(v) => setGroupQuery((q) => ({ ...q, [qKey]: v }))}
          onCommit={(text) => commitGroupText(qKey, field, current, text, (patch) => update(r.id, patch))}
          onCancel={() => clearGroupQuery(qKey)}
          onSelectOption={(o) => { clearGroupQuery(qKey); update(r.id, groupPatch(o)); }}
        />
      );
    },
  });

  type RawKey = "groupCode" | "groupName" | "inventoryCode" | "inventoryName" | "quantity" | "wastePct" | "unitPrice" | "forex" | "unit" | "explanation" | "forexPrice" | "itemAmount" | "forexItemAmount";
  const rawColumns: CostingColumn<RawRow, RawKey>[] = [
    groupCol<RawRow, RawKey>("raw", "code", "groupCode", updateRaw),
    groupCol<RawRow, RawKey>("raw", "name", "groupName", updateRaw),
    {
      key: "inventoryCode", label: "Inventory Code", defaultWidth: 200, minWidth: 150, nav: "lookup",
      render: (r) => (
        <div className="flex h-full w-full items-stretch">
          <div className="min-w-0 flex-1">
            <AutocompleteTextCell
              value={inventoryQuery[r.id] ?? r.inventoryCode}
              options={inventoryOptions}
              placeholder="Search code or name"
              startOpen={false}
              openOnFocus
              showDropdownIcon
              // Compact list (~6 rows, scrolls internally) that also shrinks to the viewport space
              // left on its side. The 8rem floor makes a cramped spot below the field overflow,
              // so Radix flips the list above instead of squeezing it.
              popoverClassName="min-w-[400px] max-h-[min(13rem,max(8rem,var(--radix-popover-content-available-height)))]"
              onChange={(v) => { setInventoryQuery((q) => ({ ...q, [r.id]: v })); searchInventory(v); }}
              onCommit={(finalValue) => commitInventoryText(r, finalValue)}
              onCancel={() => { clearInventoryQuery(r.id); searchInventory(""); }}
              onSelectOption={(o) => selectInventory(r.id, o)}
            />
          </div>
          <button
            type="button"
            title="Browse Inventory"
            onClick={() => setInventoryLookupRowId(r.id)}
            className="flex w-7 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
    // Read-only: always the selected Inventory item's own name.
    {
      key: "inventoryName", label: "Inventory Name", defaultWidth: 240, minWidth: 100,
      render: (r) => <span className="block truncate" title={r.inventoryName}>{r.inventoryName || <span className="text-muted-foreground">—</span>}</span>,
    },
    numberCol("quantity", "Quantity", 90, "quantity", updateRaw, "quantity"),
    numberCol("wastePct", "Waste %", 80, "wastePct", updateRaw),
    numberCol("unitPrice", "Unit Price", 100, "unitPrice", updateRaw, "unit-price"),
    forexCol<RawRow, RawKey>("raw", "forex", updateRaw),
    // Once an Inventory item is selected, Unit is a dropdown of exactly that item's own configured
    // Units (never a global unit list) — the same Select the Style Card BOM's Unit cell uses. Only a
    // line without an Inventory item (typed before the binding existed) keeps its own Unit text.
    {
      ...textCol<RawRow, RawKey>("unit", "Unit", 70, "unit", updateRaw),
      nav: (r) => (r.inventoryId != null ? "select" : "text"),
      render: (r) => {
        if (r.inventoryId == null) return <SheetCellInput value={r.unit ?? ""} onChange={(v) => updateRaw(r.id, { unit: v })} />;
        const units = itemUnitsByItem[String(r.inventoryId)] || [];
        return (
          <Select
            value={r.unitId != null ? String(r.unitId) : ""}
            onValueChange={(v) => {
              const target = units.find((u: any) => String(u.id) === v);
              if (target) updateRaw(r.id, { unitId: Number(target.id), unit: target.code || target.name || "" });
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
      },
    },
    textCol("explanation", "Explanation", 160, "explanation", updateRaw),
    forexPriceCol<RawRow, RawKey>("forexPrice", updateRaw),
    amountCol("itemAmount", "Item Amount", 110, rawAmount, rawTotal),
    amountCol("forexItemAmount", "Forex Item Amount", 130, (r) => rawAmount(r) / usdRate, rawTotal / usdRate),
  ];

  type LaborKey = "groupCode" | "groupName" | "explanation" | "quantity" | "wastePct" | "forex" | "forexPrice" | "unitPrice" | "itemAmount" | "forexItemAmount";
  const laborColumns: CostingColumn<LaborRow, LaborKey>[] = [
    groupCol<LaborRow, LaborKey>("labor", "code", "groupCode", updateLabor),
    groupCol<LaborRow, LaborKey>("labor", "name", "groupName", updateLabor),
    textCol("explanation", "Explanation", 220, "explanation", updateLabor),
    numberCol("quantity", "Quantity", 90, "quantity", updateLabor, "quantity"),
    numberCol("wastePct", "Waste %", 80, "wastePct", updateLabor),
    forexCol<LaborRow, LaborKey>("labor", "forex", updateLabor),
    forexPriceCol<LaborRow, LaborKey>("forexPrice", updateLabor),
    numberCol("unitPrice", "Unit Price", 100, "unitPrice", updateLabor, "unit-price"),
    amountCol("itemAmount", "Item Amount", 110, laborAmount, laborTotal),
    amountCol("forexItemAmount", "Forex Item Amount", 130, (r) => laborAmount(r) / usdRate, laborTotal / usdRate),
  ];

  type OtherKey = "groupCode" | "groupName" | "explanation" | "quantity" | "forex" | "forexRates" | "unitPrice" | "forexItemAmount" | "itemAmount";
  const otherColumns: CostingColumn<OtherRow, OtherKey>[] = [
    groupCol<OtherRow, OtherKey>("other", "code", "groupCode", updateOther),
    groupCol<OtherRow, OtherKey>("other", "name", "groupName", updateOther),
    textCol("explanation", "Explanation", 220, "explanation", updateOther),
    numberCol("quantity", "Quantity", 90, "quantity", updateOther, "quantity"),
    forexCol<OtherRow, OtherKey>("other", "forex", updateOther),
    amountCol("forexRates", "Forex Rates", 105, () => usdRate),
    numberCol("unitPrice", "Unit Price", 100, "unitPrice", updateOther, "unit-price"),
    amountCol("forexItemAmount", "Forex Item Amount", 130, (r) => otherAmount(r) / usdRate, otherTotal / usdRate),
    amountCol("itemAmount", "Item Amount", 110, otherAmount, otherTotal),
  ];
  const deleteButton = (onClick: () => void) => (
    <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete row" onClick={onClick}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Costing</h1>
          <p className="text-xs text-muted-foreground font-mono">
            {header.costingNo || "New costing sheet"}{dirty && !lock.isLocked && <span className="ml-2 font-sans text-amber-600">• Unsaved changes</span>}
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={saving || lock.isLocked} title={lock.isLocked ? "The sheet is locked" : undefined}>
          <Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}
        </Button>
        {/* Edit / Save / Lock / Unlock / Print — the same actions as the list's right-click. */}
        <RowActionsMenu
          actions={actionsFor({ id: sheetId, costingNo: header.costingNo, isLocked: lock.isLocked }, { dirty, saving, onSave: () => { void save(); } })}
        />
      </div>

      {lock.isLocked && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Locked{lock.lockedBy?.name ? ` by ${lock.lockedBy.name}` : ""}{lock.lockedAt ? ` on ${new Date(lock.lockedAt).toLocaleString()}` : ""} — read-only.
            A user with permission to unlock costing sheets can unlock it from the ⋮ menu.
          </span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="customFields">Customized Fields</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-3 pt-3">
          {/* header form + summary panel (read-only while locked) */}
          <fieldset disabled={lock.isLocked} className="m-0 min-w-0 border-0 p-0">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-8 rounded-md border p-3">
              <FieldRow label="Costing No">
                <Input value={header.costingNo} onChange={(e) => setHeader((h) => ({ ...h, costingNo: e.target.value }))} className="h-7 w-48 text-xs" />
              </FieldRow>
              <FieldRow label="Costing Date">
                <DatePicker value={header.costingDate} onChange={(e) => setHeader((h) => ({ ...h, costingDate: e.target.value }))} className="h-7 w-48 text-xs" />
              </FieldRow>
              <FieldRow label="Style">
                <Input value={header.styleCode} onChange={(e) => setHeader((h) => ({ ...h, styleCode: e.target.value }))} className="h-7 w-40 text-xs" placeholder="Style code" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><Search className="h-3.5 w-3.5" /></Button>
                <span className="text-xs text-muted-foreground truncate">{header.styleName}</span>
              </FieldRow>
              <FieldRow label="Current Account">
                <Input value={header.accountCode} onChange={(e) => setHeader((h) => ({ ...h, accountCode: e.target.value }))} className="h-7 w-40 text-xs" placeholder="Account code" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><Search className="h-3.5 w-3.5" /></Button>
                <span className="text-xs text-muted-foreground truncate">{header.accountName}</span>
              </FieldRow>
              <FieldRow label="Category">
                <Select value={header.category} onValueChange={(v) => setHeader((h) => ({ ...h, category: v }))}>
                  <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Brand">
                <Input value={header.brand} onChange={(e) => setHeader((h) => ({ ...h, brand: e.target.value }))} className="h-7 w-48 text-xs" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><Search className="h-3.5 w-3.5" /></Button>
              </FieldRow>
              <FieldRow label="Forex Type - Rate">
                <Select value="PKR" disabled>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="PKR">PKR</SelectItem></SelectContent>
                </Select>
                <Input type="number" value={header.pkrRate} disabled className="h-7 w-28 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Forex Type - Rate">
                {/* Foreign currency: every active MD_Forex currency except the PKR base above. */}
                <Select value={header.foreignCurrency} onValueChange={(v) => setHeader((h) => ({ ...h, foreignCurrency: v }))}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">{headerCurrencyCodes(header.foreignCurrency).filter((c) => c !== "PKR").map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={0} value={header.foreignRate} onChange={(e) => setHeader((h) => ({ ...h, foreignRate: normalizeNonNegative(e.target.value) }))} className="h-7 w-28 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Quoted Price Forex">
                <Select value={header.quotedPriceForex} onValueChange={(v) => setHeader((h) => ({ ...h, quotedPriceForex: v }))}>
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">{headerCurrencyCodes(header.quotedPriceForex).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Quoted Price">
                <Input type="number" min={0} value={header.quotedPrice} onChange={(e) => setHeader((h) => ({ ...h, quotedPrice: normalizeNonNegative(e.target.value) }))} className="h-7 w-32 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Order Quantity">
                <Input type="number" min={0} value={header.orderQuantity} onChange={(e) => setHeader((h) => ({ ...h, orderQuantity: normalizeNonNegative(e.target.value) }))} className="h-7 w-32 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Shipping Terms">
                <Select value={header.shippingTerms} onValueChange={(v) => setHeader((h) => ({ ...h, shippingTerms: v }))}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{INCOTERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Payment Terms">
                <Input value={header.paymentTerms} onChange={(e) => setHeader((h) => ({ ...h, paymentTerms: e.target.value }))} className="h-7 w-32 text-xs" placeholder="e.g. LC_90" />
              </FieldRow>
            </div>

            <div className="col-span-12 lg:col-span-4 space-y-2">
              <div className="flex justify-end">
                <div className="h-32 w-28 rounded-md border flex flex-col items-center justify-center text-muted-foreground gap-1 bg-muted/20">
                  <ImageOff className="h-6 w-6" />
                  <span className="text-[10px]">No Image</span>
                </div>
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/60 text-[11px] font-medium">
                      <td className="py-1 px-2"></td>
                      <td className="py-1 px-1 w-16"></td>
                      <td className="py-1 px-2 text-right">PKR</td>
                      <td className="py-1 px-2 text-right">PKR</td>
                      <td className="py-1 px-2 text-right">{header.foreignCurrency || "Forex"}</td>
                    </tr>
                  </thead>
                  <tbody>
                    <SummaryRow label="Material + Labor" pkr={materialLabor} usd={materialLabor / usdRate} />
                    {/* PKR amounts of the % rows (and Others / Quoted Price) are typable: a typed
                        amount is manual (amber, ↺ returns it to automatic) — see pctRow. */}
                    <SummaryRow label="Overhead %" {...pctRow("overhead", overheadAmt)} />
                    <SummaryRow
                      label="Others" pkr={othersAmt} usd={othersAmt / usdRate}
                      onAmountChange={(v) => setManualAmount("others", v)} manual={manual.others !== undefined} onReset={() => resetManual("others")}
                    />
                    <SummaryRow label="Costing Subtotal" pkr={costingSubtotal} usd={costingSubtotal / usdRate} bold />
                    <SummaryRow label="Waste %" {...pctRow("waste", wasteAmt)} />
                    <SummaryRow label="G.Supplies %" {...pctRow("gSupplies", gSuppliesAmt)} />
                    <SummaryRow label="Excess Production %" {...pctRow("excessProduction", excessProdAmt)} />
                    <SummaryRow label="Waste Total" pkr={wasteTotal} usd={wasteTotal / usdRate} />
                    <SummaryRow
                      label="Profit %"
                      {...pctRow("profit", profitAmt)}
                      extra={
                        <button type="button" title="Costing Profit Breakdowns" onClick={() => setProfitBreakdownOpen(true)} className="text-muted-foreground hover:text-foreground">
                          <Table2 className="h-3 w-3" />
                        </button>
                      }
                    />
                    <SummaryRow label="Financial Cost" {...pctRow("financialCost", financialCostAmt)} />
                    <SummaryRow label="Commission %" {...pctRow("commission", commissionAmt)} />
                    <SummaryRow label="Commission-3 %" {...pctRow("commission3", commission3Amt)} />
                    <SummaryRow label="Commission Total" pkr={commissionTotal} usd={commissionTotal / usdRate} />
                    <SummaryRow label="Calculated Price" pkr={calculatedPrice} usd={calculatedPrice / usdRate} bold />
                    <SummaryRow label="Net Price" pkr={netPrice} usd={netPrice / usdRate} bold />
                    {/* Quoted Price is an input already (header field); typing here edits that same value. */}
                    <SummaryRow
                      label="Quoted Price" pkr={header.quotedPrice} usd={header.quotedPrice / usdRate}
                      onAmountChange={(v) => setHeader((h) => ({ ...h, quotedPrice: v }))}
                    />
                    <SummaryRow label="Margin %" pct={Number(marginPct.toFixed(2))} pkr={0} usd={0} />
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </fieldset>

          {/* lower tabs: grids */}
          <Tabs defaultValue="lines">
            <TabsList>
              <TabsTrigger value="lines">General</TabsTrigger>
              <TabsTrigger value="groupTotals">Group Based Totals</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              <TabsTrigger value="gallery">Picture Gallery</TabsTrigger>
            </TabsList>

            <TabsContent value="lines" className="pt-3">
              <fieldset disabled={lock.isLocked} className="m-0 min-w-0 space-y-4 border-0 p-0">
              <CostingGrid
                title="Raw Material Costs"
                totalText={`${fmt2(rawTotal)} - ${fmt2((rawTotal / grandLineTotal) * 100)}%`}
                storageKey="costingRawMaterialGrid"
                columns={rawColumns}
                rows={rawRows}
                onAddRow={addRaw}
                actionsWidth={64}
                renderActions={(r) => (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Cost Detail Entry" onClick={() => setCostDetailRowId(r.id)}><Calculator className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                    {deleteButton(() => setRawRows((rows) => rows.filter((x) => x.id !== r.id)))}
                  </>
                )}
              />

              <CostingGrid
                title="Labor Costs"
                totalText={`${fmt2(laborTotal)} - ${fmt2((laborTotal / grandLineTotal) * 100)}%`}
                storageKey="costingLaborGrid"
                columns={laborColumns}
                rows={laborRows}
                onAddRow={addLabor}
                renderActions={(r) => deleteButton(() => setLaborRows((rows) => rows.filter((x) => x.id !== r.id)))}
              />

              <CostingGrid
                title="Others"
                totalText={`${fmt2(otherTotal)} - ${fmt2((otherTotal / grandLineTotal) * 100)}%`}
                storageKey="costingOtherGrid"
                columns={otherColumns}
                rows={otherRows}
                onAddRow={addOther}
                renderActions={(r) => deleteButton(() => setOtherRows((rows) => rows.filter((x) => x.id !== r.id)))}
              />
              </fieldset>
            </TabsContent>

            <TabsContent value="groupTotals" className="pt-3">
              <div className="rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Group Code</TableHead><TableHead>Group Name</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Share %</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {groupTotals.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No cost lines yet</TableCell></TableRow>
                    ) : groupTotals.map((g) => (
                      <TableRow key={g.key}>
                        <TableCell className="font-mono text-xs">{g.code}</TableCell>
                        <TableCell className={cn(!g.key && "text-muted-foreground")}>{g.name || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(g.amount)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2((g.amount / grandLineTotal) * 100)}%</TableCell>
                      </TableRow>
                    ))}
                    {groupTotals.length > 0 && (
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(rawTotal + laborTotal + otherTotal)}</TableCell>
                        {/* grandLineTotal falls back to 1 when every line is zero, so all shares (and this) read 0.00%. */}
                        <TableCell className="text-right font-mono">{fmt2(((rawTotal + laborTotal + otherTotal) / grandLineTotal) * 100)}%</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="attachments" className="pt-3">
              <div className="rounded-md border p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Upload className="h-6 w-6" />
                <p className="text-sm">No attachments yet</p>
                <Button variant="outline" size="sm">Upload File</Button>
              </div>
            </TabsContent>

            <TabsContent value="gallery" className="pt-3">
              <div className="rounded-md border p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageOff className="h-6 w-6" />
                <p className="text-sm">No pictures yet</p>
                <Button variant="outline" size="sm">Add Picture</Button>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="customFields" className="pt-3">
          <div className="rounded-md border p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-sm">No customized fields configured</p>
            <Button variant="outline" size="sm">Add Field</Button>
          </div>
        </TabsContent>
      </Tabs>
      )}

      {/* Raw Material Inventory Code — full searchable Inventory list (search icon on the cell). */}
      <CardLookupDialog<CardLookupRow>
        open={!!inventoryLookupRowId}
        onOpenChange={(open) => !open && setInventoryLookupRowId(null)}
        title="Select Inventory"
        // A bit larger than the default lookup (512px wide) so more inventory rows fit. Below sm it
        // fills the viewport minus 1rem side margins; max-h-[85vh] keeps it on-screen vertically
        // (the list scrolls inside).
        contentClassName="max-w-[calc(100%-2rem)] sm:max-w-[580px] h-[560px]"
        fetchOptions={fetchInventory}
        onSelect={(row) => {
          if (inventoryLookupRowId) selectInventory(inventoryLookupRowId, { id: row.id, code: row.inventoryCode, name: row.inventoryName });
          setInventoryLookupRowId(null);
        }}
      />

      <CostDetailDialog
        open={!!costDetailRowId}
        onOpenChange={(o) => !o && setCostDetailRowId(null)}
        initialValue={costDetailRowId ? costDetails[costDetailRowId] || emptyCostDetail() : undefined}
        onSave={(totalCost, detail) => {
          if (!costDetailRowId) return;
          setCostDetails((d) => ({ ...d, [costDetailRowId]: detail }));
          updateRaw(costDetailRowId, { unitPrice: totalCost });
          toast.success("Cost detail saved");
        }}
      />

      <ProfitBreakdownDialog
        open={profitBreakdownOpen}
        onOpenChange={setProfitBreakdownOpen}
        netPrice={netPrice}
        usdRate={usdRate}
        onTransfer={(profitPct) => {
          changePct("profit", profitPct); // also ends a manual Profit amount, so the transferred % applies
          toast.success(`Profit % ${profitPct} transferred`);
        }}
      />
      {lockDialog}
    </div>
  );
}
