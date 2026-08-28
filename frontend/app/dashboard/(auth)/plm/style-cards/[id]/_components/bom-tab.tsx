"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Save, Trash2, ListOrdered, GripVertical, Lock, Search } from "lucide-react";
import { plmApi, legacyErpApi } from "@/lib/nexuscore-api";
import { settingsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  // Market Length/Width/Weight — calculator-only inputs for the automatic Fabric quantity
  // formula (BaseGramQuantity = L * W * Weight / 1550). No backing column on StyleBomLine (see
  // style-extras.service.ts's BOM_LINE_FIELDS whitelist), so — same as the requirement's own
  // "display and save only the final converted Quantity" — these three are never sent to the
  // backend, only the Quantity they produce is.
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
  id: uid(), lineType, fabricCode: "", fabricName: "", explanation: "", placement: "", process: "",
  variant: "", rowColumn: "", swatchCardId: "", willBeCut: false, mainFabric: false, unit: "",
  marketLength: 0, marketWidth: 0, marketWeight: 0,
  quantity: 0, wastePct: 0, dyeWastagePct: 0, otherWastagePct: 0, unitPrice: 0, component: "",
  dia: "", gauge: "", finishWidth: "", finishRoute: "", revision: "",
});

// Automatic Fabric quantity calculation — BaseGramQuantity = (MarketLength * MarketWidth *
// MarketWeight) / 1550; Unit "Gram" keeps BaseGramQuantity, Unit "KG" divides it by 1000. Any
// missing/invalid/<=0 source value returns 0 rather than NaN/Infinity. Rounded to 4 decimal
// places — the same Decimal(14,4) precision StyleBomLine.quantity is already stored at (schema.
// prisma), not a new rounding convention.
const round4 = (n: number) => Math.round(n * 10000) / 10000;
// Only "Gram" and "KG" are defined by the requirement — there is no existing BOM/Unit master
// establishing a default for anything else (this grid's Unit field has always been free text,
// see load()'s own comment), so an unrecognized or blank Unit is treated as a missing/invalid
// source value (Quantity = 0), never silently assumed to be Gram.
function calcFabricQuantity(marketLength: number, marketWidth: number, marketWeight: number, unit: string): number {
  const vals = [marketLength, marketWidth, marketWeight].map(Number);
  if (!vals.every((n) => Number.isFinite(n) && n > 0)) return 0;
  const u = (unit || "").trim().toLowerCase();
  const isGram = u === "gram";
  const isKg = u === "kg";
  if (!isGram && !isKg) return 0;
  const baseGramQuantity = (vals[0] * vals[1] * vals[2]) / 1550;
  return round4(isKg ? baseGramQuantity / 1000 : baseGramQuantity);
}

// ---- Manage Columns + column resizing — same button/styling/placement/icons and the same
// session-vs-permanent persistence mechanism as the Purchase Receipt grid
// (legacy-erp/inventory-receipts/_components/inventory-receipt-line-grid.tsx, itself ported from
// purchase-order-line-grid.tsx): sessionStorage for "Save for This Session", settingsApi's
// tablePreferences (same shallow-merged endpoint, no new backend route) for "Save Permanently".
// Scoped to this grid's own column set/keys — not the roving-cursor cell-editing engine those
// grids also have, which this grid never had and isn't part of this feature.
type ColKey =
  | "fabricCode" | "fabricName" | "explanation" | "placement" | "process" | "variant"
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
const REORDERABLE_DEFAULT: ColKey[] = COLUMNS.filter((c) => !FIXED_COLS.includes(c.key)).map((c) => c.key);

// BOM-scoped keys so this never collides with Purchase Order/Purchase Receipt's own saved values
// in the same sessionStorage / UserSettings.tablePreferences blob.
const SESSION_COLUMN_ORDER_KEY = "bom-line-grid-column-order";
const PERMANENT_COLUMN_ORDER_SETTINGS_KEY = "bomLineGridColumnOrder";
const SESSION_HIDDEN_COLUMNS_KEY = "bom-line-grid-hidden-columns";
const PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY = "bomLineGridHiddenColumns";
const sanitizeColumnOrder = (saved: unknown): ColKey[] => {
  if (!Array.isArray(saved)) return REORDERABLE_DEFAULT;
  const validSaved = saved.filter((k): k is ColKey => REORDERABLE_DEFAULT.includes(k as ColKey));
  const missing = REORDERABLE_DEFAULT.filter((k) => !validSaved.includes(k));
  return [...validSaved, ...missing];
};
const sanitizeHiddenColumns = (saved: unknown): ColKey[] =>
  Array.isArray(saved) ? saved.filter((k): k is ColKey => REORDERABLE_DEFAULT.includes(k as ColKey)) : [];

const DEFAULT_WIDTHS: Record<ColKey, number> = {
  fabricCode: 130, fabricName: 200, explanation: 200, placement: 130, process: 130, variant: 110,
  rowColumn: 110, swatchCardId: 200, willBeCut: 100, mainFabric: 100, unit: 90,
  marketLength: 110, marketWidth: 110, marketWeight: 120, quantity: 100,
  wastePct: 90, dyeWastagePct: 110, otherWastagePct: 110, totalWaste: 110, calculatedQty: 110,
  unitPrice: 100, component: 130, dia: 90, gauge: 90, finishWidth: 120, finishRoute: 120, revision: 110,
};
const MIN_WIDTHS: Record<ColKey, number> = {
  fabricCode: 100, fabricName: 140, explanation: 130, placement: 90, process: 90, variant: 80,
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
        willBeCut: !!l.willBeCut, mainFabric: !!l.mainFabric, unit: l.unit || "",
        marketLength: num(l.marketLength), marketWidth: num(l.marketWidth), marketWeight: num(l.marketWeight),
        quantity: num(l.quantity),
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

  // Recalculates Quantity for Fabric-type rows on every change that can affect it (Fabric
  // selection, Market Length/Width/Height, Unit) since every one of those routes through this
  // same update() — no separate effect/hook needed. Trim/Ornament/Process rows are untouched:
  // their Quantity stays the plain manually-entered value it always was.
  const update = (id: string, patch: Partial<BomRow>) => setRows((rs) => rs.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    if (next.lineType === "fabric") {
      next.quantity = calcFabricQuantity(next.marketLength, next.marketWidth, next.marketWeight, next.unit);
    }
    return next;
  }));
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

  // ---- Manage Columns state (order + visibility) ------------------------------------------
  const [columnOrder, setColumnOrder] = useState<ColKey[]>(REORDERABLE_DEFAULT);
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColKey>>(new Set());
  const displayColumnDefs = useMemo(
    () => [...FIXED_COLS, ...columnOrder.filter((k) => !hiddenColumns.has(k))].map((k) => COLUMN_BY_KEY.get(k)!),
    [columnOrder, hiddenColumns],
  );

  // Inline header drag-to-reorder — writes into the same columnOrder state the modal reads/
  // writes, not a parallel ordering mechanism.
  const dragColRef = useRef<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);
  const handleDragStartCol = (key: ColKey) => (e: React.DragEvent) => { dragColRef.current = key; e.dataTransfer.effectAllowed = "move"; };
  const handleDragOverCol = (key: ColKey) => (e: React.DragEvent) => {
    if (!dragColRef.current || dragColRef.current === key || FIXED_COLS.includes(key)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== key) setDragOverCol(key);
  };
  const handleDropCol = (key: ColKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = dragColRef.current;
    dragColRef.current = null;
    setDragOverCol(null);
    if (!dragged || dragged === key || FIXED_COLS.includes(key)) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(key), 0, dragged);
      return next;
    });
  };
  const handleDragEndCol = () => { dragColRef.current = null; setDragOverCol(null); };

  // Restore persisted column order + visibility on mount — session override wins, otherwise the
  // permanently saved UserSettings.tablePreferences value, otherwise the built-in default
  // (nothing hidden, catalog order).
  useEffect(() => {
    let sessionOrderFound = false;
    try {
      const sessionRaw = sessionStorage.getItem(SESSION_COLUMN_ORDER_KEY);
      if (sessionRaw) { setColumnOrder(sanitizeColumnOrder(JSON.parse(sessionRaw))); sessionOrderFound = true; }
    } catch {}
    try {
      const sessionHiddenRaw = sessionStorage.getItem(SESSION_HIDDEN_COLUMNS_KEY);
      if (sessionHiddenRaw) setHiddenColumns(new Set(sanitizeHiddenColumns(JSON.parse(sessionHiddenRaw))));
    } catch {}
    if (sessionOrderFound) return;
    settingsApi.getCurrentSettings()
      .then((s: any) => {
        const savedOrder = s?.tablePreferences?.[PERMANENT_COLUMN_ORDER_SETTINGS_KEY];
        if (Array.isArray(savedOrder) && savedOrder.length) setColumnOrder(sanitizeColumnOrder(savedOrder));
        const savedHidden = s?.tablePreferences?.[PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY];
        if (Array.isArray(savedHidden)) setHiddenColumns(new Set(sanitizeHiddenColumns(savedHidden)));
      })
      .catch(() => {});
  }, []);

  // ---- Column Manager modal (order + visibility, session/permanent persistence) -----------
  const [reorderOpen, setReorderOpen] = useState(false);
  const [modalOrder, setModalOrder] = useState<ColKey[]>(columnOrder);
  const [modalHidden, setModalHidden] = useState<Set<ColKey>>(hiddenColumns);
  const [columnSearch, setColumnSearch] = useState("");
  const [savingColumnPrefs, setSavingColumnPrefs] = useState(false);
  const modalDragRef = useRef<ColKey | null>(null);
  const [modalDragOver, setModalDragOver] = useState<ColKey | null>(null);

  const openReorderModal = () => {
    setModalOrder(columnOrder);
    setModalHidden(new Set(hiddenColumns));
    setColumnSearch("");
    setReorderOpen(true);
  };
  const handleModalDragStart = (key: ColKey) => (e: React.DragEvent) => { modalDragRef.current = key; e.dataTransfer.effectAllowed = "move"; };
  const handleModalDragOver = (key: ColKey) => (e: React.DragEvent) => {
    if (!modalDragRef.current || modalDragRef.current === key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (modalDragOver !== key) setModalDragOver(key);
  };
  const handleModalDrop = (key: ColKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = modalDragRef.current;
    modalDragRef.current = null;
    setModalDragOver(null);
    if (!dragged || dragged === key) return;
    setModalOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(key), 0, dragged);
      return next;
    });
  };
  const handleModalDragEnd = () => { modalDragRef.current = null; setModalDragOver(null); };
  const toggleModalHidden = (key: ColKey, visible: boolean) => {
    setModalHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(key); else next.add(key);
      return next;
    });
  };
  const resetModalToDefault = () => { setModalOrder(REORDERABLE_DEFAULT); setModalHidden(new Set()); };

  const applySessionColumnPrefs = (order: ColKey[], hidden: Set<ColKey>) => {
    setColumnOrder(order);
    setHiddenColumns(hidden);
    try {
      sessionStorage.setItem(SESSION_COLUMN_ORDER_KEY, JSON.stringify(order));
      sessionStorage.setItem(SESSION_HIDDEN_COLUMNS_KEY, JSON.stringify(Array.from(hidden)));
    } catch {}
  };
  const saveForSession = () => { applySessionColumnPrefs(modalOrder, modalHidden); setReorderOpen(false); };
  const savePermanently = async () => {
    setSavingColumnPrefs(true);
    try {
      applySessionColumnPrefs(modalOrder, modalHidden);
      await settingsApi.updateCurrentSettings({
        tablePreferences: {
          [PERMANENT_COLUMN_ORDER_SETTINGS_KEY]: modalOrder,
          [PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY]: Array.from(modalHidden),
        },
      });
      toast.success("Column preferences saved");
      setReorderOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save column preferences");
    } finally {
      setSavingColumnPrefs(false);
    }
  };
  const modalOrderFiltered = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    if (!q) return modalOrder;
    return modalOrder.filter((k) => COLUMN_BY_KEY.get(k)!.label.toLowerCase().includes(q));
  }, [modalOrder, columnSearch]);

  // ---- Resizable columns (drag handle on each header + double-click to reset to default) --
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);
  const startResize = (key: ColKey) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[key];
    const onMove = (ev: MouseEvent) => {
      setColWidths((prev) => ({ ...prev, [key]: Math.max(MIN_WIDTHS[key], startWidth + (ev.clientX - startX)) }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const resetColumnWidth = (key: ColKey) => setColWidths((prev) => ({ ...prev, [key]: DEFAULT_WIDTHS[key] }));
  const totalTableWidth = displayColumnDefs.reduce((sum, c) => sum + colWidths[c.key], 0) + DEL_W;

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
          <MasterAutocompleteField compact label={r.lineType === "fabric" ? "Fabric" : "Trim"}
            masterKey={r.lineType} displayValue={r.fabricName}
            fetchOptions={(t) => (r.lineType === "fabric" ? legacyErpApi.fabricCards.list(t) : legacyErpApi.trimInventoryCards.list(t))
              .then((rows: any[]) => (Array.isArray(rows) ? rows : []).map((row: any) => ({ id: row.id, code: row.inventoryCode, name: row.inventoryName })))}
            lookupPath={r.lineType === "fabric" ? "/dashboard/legacy-erp/fabric-cards" : "/dashboard/legacy-erp/trim-inventory-cards"}
            onSelect={(o) => update(r.id, { fabricCode: String(o.code ?? ""), fabricName: o.name })}
            onClear={() => update(r.id, { fabricCode: "", fabricName: "" })}
            onFreeTextCommit={(text) => update(r.id, { fabricName: text })}
          />
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
      case "unit":
        return <GridInput value={r.unit} onChange={(v) => update(r.id, { unit: v })} />;
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
      case "quantity":
        // Fabric rows: Quantity is derived (Market Length/Width/Weight/Unit) — shown read-only,
        // same convention as the Calculated Qty column just to its right. Trim/Ornament/Process
        // rows are unaffected: still a plain manually-entered value.
        return r.lineType === "fabric"
          ? <span className="block px-2 text-right font-mono text-xs text-muted-foreground" title="Auto-calculated: (Market Length × Market Width × Market Weight) / 1550, converted for Unit (Gram or KG — 0 if Unit is blank or not one of these)">{r.quantity.toFixed(2)}</span>
          : <GridInput type="number" align="right" value={r.quantity} onChange={(v) => update(r.id, { quantity: parseFloat(v) || 0 })} />;
      case "wastePct":
        return <GridInput type="number" align="right" value={r.wastePct} onChange={(v) => update(r.id, { wastePct: parseFloat(v) || 0 })} />;
      case "dyeWastagePct":
        return <GridInput type="number" align="right" value={r.dyeWastagePct} onChange={(v) => update(r.id, { dyeWastagePct: parseFloat(v) || 0 })} />;
      case "otherWastagePct":
        return <GridInput type="number" align="right" value={r.otherWastagePct} onChange={(v) => update(r.id, { otherWastagePct: parseFloat(v) || 0 })} />;
      case "totalWaste":
        return <>{(r.wastePct + r.dyeWastagePct + r.otherWastagePct).toFixed(2)}</>;
      case "calculatedQty": {
        const totalWaste = r.wastePct + r.dyeWastagePct + r.otherWastagePct;
        return <>{(r.quantity * (1 + totalWaste / 100)).toFixed(2)}</>;
      }
      case "unitPrice":
        return <GridInput type="number" align="right" value={r.unitPrice} onChange={(v) => update(r.id, { unitPrice: parseFloat(v) || 0 })} />;
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={openReorderModal}>
              <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
            </Button>
            <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>

        {LINE_TYPES.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-3">
            <div className="rounded-md border overflow-x-auto">
              <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
                <colgroup>
                  {displayColumnDefs.map((col) => <col key={col.key} style={{ width: colWidths[col.key] }} />)}
                  <col style={{ width: DEL_W }} />
                </colgroup>
                <TableHeader>
                  <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8 [&>th]:whitespace-nowrap">
                    {displayColumnDefs.map((col) => {
                      const fixed = FIXED_COLS.includes(col.key);
                      return (
                        <TableHead
                          key={col.key}
                          className={cn("relative p-0", dragOverCol === col.key && "bg-primary/15")}
                          onDragOver={!fixed ? handleDragOverCol(col.key) : undefined}
                          onDrop={!fixed ? handleDropCol(col.key) : undefined}
                        >
                          <span
                            title={col.label}
                            draggable={!fixed}
                            onDragStart={!fixed ? handleDragStartCol(col.key) : undefined}
                            onDragEnd={!fixed ? handleDragEndCol : undefined}
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
                  {(grouped[t.value] || []).map((r) => (
                    <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                      {displayColumnDefs.map((col) => (
                        <TableCell key={col.key} className={cellClassFor(col.key)}>
                          {renderCell(r, col.key)}
                        </TableCell>
                      ))}
                      <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(r.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={() => addRow(t.value)}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
          </TabsContent>
        ))}
      </Tabs>

      {/* Column Manager — same structure/copy/footer actions as the Purchase Receipt grid's own
          modal, scoped to this grid's own column catalog. */}
      <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle>Column Manager</DialogTitle>
            <DialogDescription>Show, hide and reorder columns. Fabric Code and Fabric Name are required and always stay first.</DialogDescription>
          </DialogHeader>

          <div className="shrink-0 border-b border-border px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                placeholder="Search columns..."
                aria-label="Search columns"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
          </div>

          <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
            {FIXED_COLS.map((key) => {
              const col = COLUMN_BY_KEY.get(key)!;
              return (
                <div key={key} className="flex items-center gap-3 rounded-md border border-transparent bg-muted/40 px-3 py-2.5">
                  <Checkbox checked disabled aria-label={`${col.label} is a required column and cannot be hidden`} />
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 text-[13px] font-medium">{col.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Required
                  </span>
                </div>
              );
            })}

            {modalOrderFiltered.length === 0 && columnSearch.trim() !== "" && (
              <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">No columns match &ldquo;{columnSearch}&rdquo;</p>
            )}

            {modalOrderFiltered.map((key) => {
              const col = COLUMN_BY_KEY.get(key)!;
              const visible = !modalHidden.has(key);
              return (
                <div
                  key={key}
                  onDragOver={handleModalDragOver(key)}
                  onDrop={handleModalDrop(key)}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors",
                    modalDragOver === key ? "border-primary bg-primary/10" : "border-border bg-card",
                    !visible && "opacity-60",
                  )}
                >
                  <Checkbox
                    checked={visible}
                    onCheckedChange={(checked) => toggleModalHidden(key, checked === true)}
                    aria-label={`Show ${col.label} column`}
                  />
                  <span
                    draggable
                    onDragStart={handleModalDragStart(key)}
                    onDragEnd={handleModalDragEnd}
                    className="flex shrink-0 cursor-grab items-center active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-[13px] font-medium">{col.label}</span>
                </div>
              );
            })}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-5 py-3 sm:justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReorderOpen(false)}>Cancel</Button>
              <Button variant="ghost" size="sm" onClick={resetModalToDefault}>Reset Default</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={saveForSession}>Save for This Session</Button>
              <Button size="sm" onClick={savePermanently} disabled={savingColumnPrefs}>
                {savingColumnPrefs ? "Saving..." : "Save Permanently"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
