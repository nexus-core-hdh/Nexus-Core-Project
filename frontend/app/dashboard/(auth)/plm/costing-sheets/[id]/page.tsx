"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { ArrowLeft, Save, Search, ImageOff, Plus, Trash2, Upload, Calculator, Table2 } from "lucide-react";
import { CostDetailDialog, CostDetailValue, emptyCostDetail } from "../_components/cost-detail-dialog";
import { ProfitBreakdownDialog } from "../_components/profit-breakdown-dialog";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { AutocompleteTextCell, type AutocompleteOption } from "@/components/legacy-erp/autocomplete-text-cell";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { FormRow as FieldRow } from "@/components/forms/form-row";
import { normalizeNonNegative } from "@/lib/numeric-guards";

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

const blankHeader = () => ({
  costingNo: "", costingDate: "", styleCode: "", styleName: "", accountCode: "", accountName: "",
  category: "", brand: "", pkrRate: 1, foreignCurrency: "Usdollar", foreignRate: 0,
  quotedPriceForex: "Usdollar", quotedPrice: 0, orderQuantity: 0, shippingTerms: "FOB", paymentTerms: "",
});

const blankPct = () => ({ overhead: 0, waste: 0, gSupplies: 0, excessProduction: 0, profit: 0, financialCost: 0, commission: 0, commission3: 0 });

const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));

const CATEGORIES = ["Boy", "Girl", "Men", "Women", "Kids", "Infant"];
const CURRENCIES = ["PKR", "Usdollar", "Euro", "GBP"];
const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DDP", "FCA"];

// ---------- small presentational helpers ----------
// FieldRow renders through the shared FormRow (components/forms/form-row.tsx) —
// same label-left layout this file already used, now centralized so every
// dense data-entry screen shares one implementation instead of its own copy.

// The three section grids (and their dark header bars) render through CostingGrid /
// SheetCellInput (../_components/costing-grid.tsx), on the shared EditableGridInput.

function SummaryRow({ label, pct, onPctChange, pkr, usd, bold = false, extra }: { label: string; pct?: number; onPctChange?: (v: number) => void; pkr: number; usd: number; bold?: boolean; extra?: React.ReactNode }) {
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
            value={pct}
            onChange={(e) => onPctChange?.(normalizeNonNegative(e.target.value))}
            className="h-6 w-full bg-transparent text-xs text-right font-mono px-1 outline-none rounded focus:bg-accent/50"
          />
        ) : null}
      </td>
      <td className="py-1 px-2 text-right font-mono">{fmt4(pkr)}</td>
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
  const [pct, setPct] = useState(blankPct());
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

  const applySheet = (s: any) => {
    setSheetId(s.id);
    setHeader({
      costingNo: s.costingNo || "",
      costingDate: s.costingDate ? String(s.costingDate).slice(0, 10) : "",
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
  const materialLabor = rawTotal + laborTotal;
  const overheadAmt = materialLabor * (pct.overhead / 100);
  const costingSubtotal = materialLabor + overheadAmt + otherTotal;
  const wasteAmt = costingSubtotal * (pct.waste / 100);
  const gSuppliesAmt = costingSubtotal * (pct.gSupplies / 100);
  const excessProdAmt = costingSubtotal * (pct.excessProduction / 100);
  const wasteTotal = wasteAmt + gSuppliesAmt + excessProdAmt;
  const profitAmt = (costingSubtotal + wasteTotal) * (pct.profit / 100);
  const financialCostAmt = (costingSubtotal + wasteTotal + profitAmt) * (pct.financialCost / 100);
  const commissionAmt = (costingSubtotal + wasteTotal + profitAmt) * (pct.commission / 100);
  const commission3Amt = (costingSubtotal + wasteTotal + profitAmt) * (pct.commission3 / 100);
  const commissionTotal = commissionAmt + commission3Amt;
  const calculatedPrice = costingSubtotal + wasteTotal + profitAmt + financialCostAmt + commissionTotal;
  const netPrice = calculatedPrice;
  const marginPct = header.quotedPrice > 0 ? ((header.quotedPrice - netPrice) / header.quotedPrice) * 100 : 0;

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
  const addLabor = () => setLaborRows((r) => [...r, { id: uid(), groupCode: "", groupName: "", explanation: "", quantity: 1, wastePct: 0, forex: "", unitPrice: 0 }]);
  const addOther = () => setOtherRows((r) => [...r, { id: uid(), groupCode: "", groupName: "", explanation: "", quantity: 1, forex: "", unitPrice: 0 }]);

  const save = async () => {
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
        overheadPct: pct.overhead, wastePct: pct.waste, gSuppliesPct: pct.gSupplies,
        excessProductionPct: pct.excessProduction, profitPct: pct.profit, financialCostPct: pct.financialCost,
        commissionPct: pct.commission, commission3Pct: pct.commission3,
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
        router.replace(`/dashboard/plm/costing-sheets/${targetId}`);
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
  const groupTotals = useMemo(() => {
    const map = new Map<string, { code: string; name: string; amount: number }>();
    const bump = (code: string, name: string, amount: number) => {
      const key = code || "—";
      const existing = map.get(key);
      if (existing) existing.amount += amount;
      else map.set(key, { code: key, name: name || "—", amount });
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

  type RawKey = "groupCode" | "groupName" | "inventoryCode" | "inventoryName" | "quantity" | "wastePct" | "unitPrice" | "forex" | "unit" | "explanation" | "forexPrice" | "itemAmount" | "forexItemAmount";
  const rawColumns: CostingColumn<RawRow, RawKey>[] = [
    textCol("groupCode", "Group Code", 100, "groupCode", updateRaw),
    textCol("groupName", "Group Name", 130, "groupName", updateRaw),
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
              popoverClassName="min-w-[460px] max-h-72"
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
    textCol("forex", "Forex", 80, "forex", updateRaw),
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
    amountCol("forexPrice", "Forex Price", 105, (r) => rawAmount(r) / usdRate, rawTotal / usdRate),
    amountCol("itemAmount", "Item Amount", 110, rawAmount, rawTotal),
    amountCol("forexItemAmount", "Forex Item Amount", 130, (r) => rawAmount(r) / usdRate, rawTotal / usdRate),
  ];

  type LaborKey = "groupCode" | "groupName" | "explanation" | "quantity" | "wastePct" | "forex" | "forexPrice" | "unitPrice" | "itemAmount" | "forexItemAmount";
  const laborColumns: CostingColumn<LaborRow, LaborKey>[] = [
    textCol("groupCode", "Group Code", 100, "groupCode", updateLabor),
    textCol("groupName", "Group Name", 130, "groupName", updateLabor),
    textCol("explanation", "Explanation", 220, "explanation", updateLabor),
    numberCol("quantity", "Quantity", 90, "quantity", updateLabor, "quantity"),
    numberCol("wastePct", "Waste %", 80, "wastePct", updateLabor),
    textCol("forex", "Forex", 80, "forex", updateLabor),
    amountCol("forexPrice", "Forex Price", 105, (r) => laborAmount(r) / usdRate),
    numberCol("unitPrice", "Unit Price", 100, "unitPrice", updateLabor, "unit-price"),
    amountCol("itemAmount", "Item Amount", 110, laborAmount, laborTotal),
    amountCol("forexItemAmount", "Forex Item Amount", 130, (r) => laborAmount(r) / usdRate, laborTotal / usdRate),
  ];

  type OtherKey = "groupCode" | "groupName" | "explanation" | "quantity" | "forex" | "forexRates" | "unitPrice" | "forexItemAmount" | "itemAmount";
  const otherColumns: CostingColumn<OtherRow, OtherKey>[] = [
    textCol("groupCode", "Group Code", 100, "groupCode", updateOther),
    textCol("groupName", "Group Name", 130, "groupName", updateOther),
    textCol("explanation", "Explanation", 220, "explanation", updateOther),
    numberCol("quantity", "Quantity", 90, "quantity", updateOther, "quantity"),
    textCol("forex", "Forex", 80, "forex", updateOther),
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
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Costing</h1>
          <p className="text-xs text-muted-foreground font-mono">{header.costingNo || "New costing sheet"}</p>
        </div>
        <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
      </div>

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
          {/* header form + summary panel */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-8 rounded-md border p-3">
              <FieldRow label="Costing No">
                <Input value={header.costingNo} onChange={(e) => setHeader((h) => ({ ...h, costingNo: e.target.value }))} className="h-7 w-48 text-xs" />
              </FieldRow>
              <FieldRow label="Costing Date">
                <Input type="date" value={header.costingDate} onChange={(e) => setHeader((h) => ({ ...h, costingDate: e.target.value }))} className="h-7 w-48 text-xs" />
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
                <Select value={header.foreignCurrency} onValueChange={(v) => setHeader((h) => ({ ...h, foreignCurrency: v }))}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.filter((c) => c !== "PKR").map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={0} value={header.foreignRate} onChange={(e) => setHeader((h) => ({ ...h, foreignRate: normalizeNonNegative(e.target.value) }))} className="h-7 w-28 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Quoted Price Forex">
                <Select value={header.quotedPriceForex} onValueChange={(v) => setHeader((h) => ({ ...h, quotedPriceForex: v }))}>
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
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
                      <td className="py-1 px-2 text-right">USDollar</td>
                    </tr>
                  </thead>
                  <tbody>
                    <SummaryRow label="Material + Labor" pkr={materialLabor} usd={materialLabor / usdRate} />
                    <SummaryRow label="Overhead %" pct={pct.overhead} onPctChange={(v) => setPct((p) => ({ ...p, overhead: v }))} pkr={overheadAmt} usd={overheadAmt / usdRate} />
                    <SummaryRow label="Others" pkr={otherTotal} usd={otherTotal / usdRate} />
                    <SummaryRow label="Costing Subtotal" pkr={costingSubtotal} usd={costingSubtotal / usdRate} bold />
                    <SummaryRow label="Waste %" pct={pct.waste} onPctChange={(v) => setPct((p) => ({ ...p, waste: v }))} pkr={wasteAmt} usd={wasteAmt / usdRate} />
                    <SummaryRow label="G.Supplies %" pct={pct.gSupplies} onPctChange={(v) => setPct((p) => ({ ...p, gSupplies: v }))} pkr={gSuppliesAmt} usd={gSuppliesAmt / usdRate} />
                    <SummaryRow label="Excess Production %" pct={pct.excessProduction} onPctChange={(v) => setPct((p) => ({ ...p, excessProduction: v }))} pkr={excessProdAmt} usd={excessProdAmt / usdRate} />
                    <SummaryRow label="Waste Total" pkr={wasteTotal} usd={wasteTotal / usdRate} />
                    <SummaryRow
                      label="Profit %"
                      pct={pct.profit}
                      onPctChange={(v) => setPct((p) => ({ ...p, profit: v }))}
                      pkr={profitAmt}
                      usd={profitAmt / usdRate}
                      extra={
                        <button type="button" title="Costing Profit Breakdowns" onClick={() => setProfitBreakdownOpen(true)} className="text-muted-foreground hover:text-foreground">
                          <Table2 className="h-3 w-3" />
                        </button>
                      }
                    />
                    <SummaryRow label="Financial Cost" pct={pct.financialCost} onPctChange={(v) => setPct((p) => ({ ...p, financialCost: v }))} pkr={financialCostAmt} usd={financialCostAmt / usdRate} />
                    <SummaryRow label="Commission %" pct={pct.commission} onPctChange={(v) => setPct((p) => ({ ...p, commission: v }))} pkr={commissionAmt} usd={commissionAmt / usdRate} />
                    <SummaryRow label="Commission-3 %" pct={pct.commission3} onPctChange={(v) => setPct((p) => ({ ...p, commission3: v }))} pkr={commission3Amt} usd={commission3Amt / usdRate} />
                    <SummaryRow label="Commission Total" pkr={commissionTotal} usd={commissionTotal / usdRate} />
                    <SummaryRow label="Calculated Price" pkr={calculatedPrice} usd={calculatedPrice / usdRate} bold />
                    <SummaryRow label="Net Price" pkr={netPrice} usd={netPrice / usdRate} bold />
                    <SummaryRow label="Quoted Price" pkr={header.quotedPrice} usd={header.quotedPrice / usdRate} />
                    <SummaryRow label="Margin %" pct={Number(marginPct.toFixed(2))} pkr={0} usd={0} />
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* lower tabs: grids */}
          <Tabs defaultValue="lines">
            <TabsList>
              <TabsTrigger value="lines">General</TabsTrigger>
              <TabsTrigger value="groupTotals">Group Based Totals</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              <TabsTrigger value="gallery">Picture Gallery</TabsTrigger>
            </TabsList>

            <TabsContent value="lines" className="space-y-4 pt-3">
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
            </TabsContent>

            <TabsContent value="groupTotals" className="pt-3">
              <div className="rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Group Code</TableHead><TableHead>Group Name</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Share %</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {groupTotals.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No cost lines yet</TableCell></TableRow>
                    ) : groupTotals.map((g) => (
                      <TableRow key={g.code}>
                        <TableCell className="font-mono text-xs">{g.code}</TableCell>
                        <TableCell>{g.name}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(g.amount)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2((g.amount / grandLineTotal) * 100)}%</TableCell>
                      </TableRow>
                    ))}
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
          setPct((p) => ({ ...p, profit: profitPct }));
          toast.success(`Profit % ${profitPct} transferred`);
        }}
      />
    </div>
  );
}
