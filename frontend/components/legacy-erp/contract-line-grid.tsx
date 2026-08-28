"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useMasterLookupField } from "@/hooks/use-master-lookup-field";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LookupDialog } from "@/components/legacy-erp/lookup-dialog";
import { AutocompleteTextCell } from "@/components/legacy-erp/autocomplete-text-cell";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import { Search, Plus, Trash2, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract detail grid, shared by both "00-Purchase Contract" and "00-Sale Contract" (same
// underlying SM_ContractItem table — see contract.service.ts). Modeled on
// purchase-order-line-grid.tsx's data flow (Type via InventoryId/ServiceCardId, recalc chain,
// draft-rows-until-header-saved, persist-on-blur/commit) using only columns that actually exist
// on SM_ContractItem — no Color/Manufacturing Order FK exists on this table, so those two
// Purchase Order columns aren't replicated here.
//
// EXCEL-STYLE CELL NAVIGATION — ported from purchase-order-line-grid.tsx's own cursor/editing
// state machine (this grid previously had none: every cell was a plain always-editable
// Input/Select). One active cell grid-wide (`cursor`); Enter/F2/click mounts that cell's real
// editor in place of its plain-text display (staticProps/EDITOR_WRAP, same styling constants as
// PO); Enter/Tab commit-and-advance, Escape cancels via a pre-edit snapshot, arrow keys move the
// active cell like a spreadsheet when nothing is being edited.
//
// COLUMN RESIZE/REORDER/HIDE/MANAGE COLUMNS — now wired via the shared useGridColumns hook
// (hooks/use-grid-columns.ts) and <ManageColumnsModal>, the same shared infra every other
// legacy-erp grid uses. This is a separate concern from the cell-editing engine above: the
// hook only owns column order/visibility/width, never touches `cursor`/`editing`/row data —
// the per-cell render logic below is byte-for-byte the same as before, just iterated over
// `displayColumnDefs` (hook-derived order) instead of the static `COLUMNS` declaration order.
//
// INVENTORY NAME/CODE — Name is now the searchable/autocomplete field (shared AutocompleteTextCell
// + Inventory Card List datasource, same component Purchase Order/Inventory Receipt use); Code
// auto-fills from the selection and stays read-only/non-editable, matching the cross-screen spec.
//
// GROSS QUANTITY — new column (SM_ContractItem.GrossQuantity — a real, pre-existing column on
// this table, just never exposed by contract.service.ts before now). effectiveQuantity =
// GrossQuantity > 0 ? GrossQuantity : Quantity drives Price/Item Amount (see recalc()).
//
// STOCK ON HAND / LAST PURCHASE PRICE — new read-only columns, live values from the same
// inventoryCards.list() call Code/Name already use (derived server-side from real Purchase
// Receipt/Return and PO/Receipt price history — see inventory-card.service.ts). Never persisted.
type TypeKind = "inventory" | "service";
const TYPE_OPTIONS: { value: TypeKind; label: string; itemType: number }[] = [
  { value: "inventory", label: "Inventory", itemType: 1 },
  { value: "service", label: "Service", itemType: 2 },
];
const typeKindFromItemType = (itemType: number | null | undefined): TypeKind => (itemType === 2 ? "service" : "inventory");

type ColKey =
  | "type" | "code" | "name" | "stockOnHand" | "lastPurchasePrice"
  | "quantity" | "grossQuantity" | "unit" | "rate" | "price"
  | "forex" | "vatType" | "vatPct" | "itemAmount"
  | "received" | "deliveryDate" | "specialCode" | "explanation";

interface ColumnDef {
  key: ColKey;
  label: string;
  align: "left" | "right";
  editable: boolean; // false = locked/computed cell — Enter/F2/click only moves the cursor
}

const COLUMNS: ColumnDef[] = [
  { key: "type", label: "Type", align: "left", editable: true },
  { key: "code", label: "Code", align: "left", editable: false },
  { key: "name", label: "Name", align: "left", editable: true },
  { key: "stockOnHand", label: "Stock On Hand", align: "right", editable: false },
  { key: "lastPurchasePrice", label: "Last Purchase Price", align: "right", editable: false },
  { key: "quantity", label: "Quantity", align: "right", editable: true },
  { key: "grossQuantity", label: "Gross Quantity", align: "right", editable: true },
  { key: "unit", label: "Unit", align: "left", editable: true },
  { key: "rate", label: "Rate", align: "right", editable: true },
  { key: "price", label: "Price", align: "right", editable: false },
  { key: "forex", label: "Forex", align: "left", editable: true },
  { key: "vatType", label: "VAT Type", align: "left", editable: true },
  { key: "vatPct", label: "VAT %", align: "right", editable: true },
  { key: "itemAmount", label: "Item Amount", align: "right", editable: false },
  { key: "received", label: "Received", align: "right", editable: true },
  { key: "deliveryDate", label: "Delivery Date", align: "left", editable: true },
  { key: "specialCode", label: "Special Code", align: "left", editable: true },
  { key: "explanation", label: "Explanation", align: "left", editable: true },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

// Type/Code/Name identify the line and always stay first & visible — same rule as every other
// migrated legacy-erp grid's own FIXED_COLS (purchase-order-line-grid.tsx etc).
const FIXED_COLS: ColKey[] = ["type", "code", "name"];

// Column resize/reorder/hide/persist mechanics come from the shared useGridColumns hook
// (hooks/use-grid-columns.ts). storageKey "contractLineGrid" — net-new, this grid never had
// any of this before, so there's no legacy sessionStorage/tablePreferences key to preserve.
// Defaults below are carried over from this grid's previous static per-column `minWidth` CSS
// values; MIN_WIDTHS are a further ~15-20% narrower floor, same convention as every other
// migrated grid's own MIN_WIDTHS.
const DEFAULT_WIDTHS: Record<ColKey, number> = {
  type: 110, code: 150, name: 200, stockOnHand: 130, lastPurchasePrice: 150,
  quantity: 100, grossQuantity: 120, unit: 90, rate: 100, price: 110,
  forex: 100, vatType: 110, vatPct: 80, itemAmount: 120, received: 110,
  deliveryDate: 140, specialCode: 120, explanation: 200,
};
const MIN_WIDTHS: Record<ColKey, number> = {
  type: 90, code: 110, name: 150, stockOnHand: 100, lastPurchasePrice: 110,
  quantity: 80, grossQuantity: 90, unit: 70, rate: 80, price: 90,
  forex: 80, vatType: 90, vatPct: 66, itemAmount: 96, received: 90,
  deliveryDate: 110, specialCode: 90, explanation: 140,
};
const DEL_W = 40;

const ROW_H = "h-11";
const HEADER_H = "h-10";
const CELL_PAD = "px-3";
const CELL_BORDER = "border-r border-b border-border";
const FIRST_COL_BORDER = "border-l border-border";
const EDITOR_CONTROL = "h-full! w-full min-w-0 rounded-none border-0 bg-background px-3 text-[13px] font-medium shadow-none focus-visible:ring-0";
const EDITOR_WRAP = "flex h-11 items-stretch";

interface LineRow {
  clientId: string;
  __rowId: number | null;
  itemType: number;
  typeKind: TypeKind;
  inventoryId: number | null;
  serviceCardId: number | null;
  sourceType: string | null;
  code: string;
  name: string;
  // Live-only, never persisted — derived server-side, see the file header comment.
  stockOnHand: number | null;
  lastPurchasePrice: number | null;
  quantity: string;
  // Gross Quantity — when > 0, drives Price/Item Amount instead of Quantity; see recalc().
  grossQuantity: string;
  unitId: number | null;
  unit: string;
  rate: string;
  price: number | null; // computed: effectiveQuantity x Rate
  forexId: number | null;
  forexCode: string;
  vatIncluded: 0 | 1;
  vatRate: string;
  lineAmount: number | null; // computed: NetItemTotal
  receivedQuantity: string;
  deliveryDate: string;
  specialCode: string;
  explanation: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (): LineRow => ({
  clientId: uid(), __rowId: null, itemType: 1, typeKind: "inventory", inventoryId: null, serviceCardId: null, sourceType: null,
  code: "", name: "", stockOnHand: null, lastPurchasePrice: null,
  quantity: "", grossQuantity: "", unitId: null, unit: "", rate: "", price: null,
  forexId: null, forexCode: "", vatIncluded: 0, vatRate: "", lineAmount: null,
  receivedQuantity: "", deliveryDate: "", specialCode: "", explanation: "",
});

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt2 = (n: number | null) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCell = (v: string) => (v === "" || v == null ? "—" : num(v).toLocaleString(undefined, { maximumFractionDigits: 4 }));

// effectiveQuantity x Rate -> Price -> VAT -> Line Amount, same calc chain as Purchase
// Order/Inventory Receipt. effectiveQuantity = GrossQuantity > 0 ? GrossQuantity : Quantity.
function recalc(row: LineRow): LineRow {
  const effectiveQuantity = num(row.grossQuantity) > 0 ? num(row.grossQuantity) : num(row.quantity);
  const price = effectiveQuantity * num(row.rate);
  const vatAmount = price * (num(row.vatRate) / 100);
  const lineAmount = row.vatIncluded ? price : price + vatAmount;
  return { ...row, price, lineAmount };
}

const isBlankLine = (row: LineRow) => !row.inventoryId && !row.serviceCardId && !row.code.trim();
const INVENTORY_CARDS_LIST_PATH = "/dashboard/legacy-erp/inventory-cards-list";

interface Props {
  contractId: number | null;
  readOnly?: boolean;
  api: ReturnType<typeof legacyErpApi.contracts>;
}

export interface ContractLineGridHandle {
  commitDrafts: (newContractId: number) => Promise<void>;
}

export const ContractLineGrid = forwardRef<ContractLineGridHandle, Props>(function ContractLineGrid(
  { contractId, readOnly = false, api },
  ref,
) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LineRow[]>(() => [emptyLine()]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [serviceLookupClientId, setServiceLookupClientId] = useState<string | null>(null);
  const pendingLookupClientId = useRef<string | null>(null);

  const [unitOptions, setUnitOptions] = useState<any[]>([]);
  const [forexOptions, setForexOptions] = useState<any[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<any[]>([]);

  useEffect(() => {
    legacyErpApi.lookupTable("unit").then((r: any) => setUnitOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.lookupTable("forex").then((r: any) => setForexOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.inventoryCards.list().then((r: any) => setInventoryOptions(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  // Name's smart-search datasource + id->record resolver — same shape as Purchase Order's own
  // inventoryCodeOptions/inventoryById (purchase-order-line-grid.tsx). Every row here is
  // Type=Inventory or Type=Service (no Fixed Asset split, unlike PO), so this isn't filtered by
  // sourceType.
  const inventoryCodeOptions = useMemo(
    () => inventoryOptions.map((o) => ({ id: String(o.id), code: o.inventoryCode, name: o.inventoryName })),
    [inventoryOptions],
  );
  const inventoryById = useMemo(() => new Map(inventoryOptions.map((o) => [String(o.id), o])), [inventoryOptions]);

  const fromApiRow = (r: any): LineRow => ({
    clientId: uid(), __rowId: r.id, itemType: r.itemType ?? 1, typeKind: typeKindFromItemType(r.itemType),
    inventoryId: r.inventoryId ?? null, serviceCardId: r.serviceCardId ?? null, sourceType: null,
    code: "", name: "", stockOnHand: null, lastPurchasePrice: null,
    quantity: r.quantity != null ? String(r.quantity) : "",
    grossQuantity: r.grossQuantity != null ? String(r.grossQuantity) : "",
    unitId: r.unitId ?? null, unit: "",
    rate: r.unitPrice != null ? String(r.unitPrice) : "",
    price: r.itemTotal ?? null,
    forexId: r.forexId ?? null, forexCode: "",
    vatIncluded: r.vatIncluded ? 1 : 0,
    vatRate: r.vatRate != null ? String(r.vatRate) : "",
    lineAmount: r.netItemTotal ?? null,
    receivedQuantity: r.receivedQuantity != null ? String(r.receivedQuantity) : "",
    deliveryDate: r.deliveryDate ? String(r.deliveryDate).slice(0, 10) : "",
    specialCode: r.specialCode ?? "",
    explanation: r.explanation ?? "",
  });

  const hydrateCodesNames = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.length) return list;
    try {
      const all: any = await legacyErpApi.inventoryCards.list();
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((r: any) => [String(r.id), r]));
      return list.map((row) => {
        if (!row.inventoryId) return row;
        const match = byId.get(String(row.inventoryId));
        if (!match) return row;
        return {
          ...row, code: match.inventoryCode, name: match.inventoryName, sourceType: match.sourceType,
          unit: row.unit || match.unit || "",
          stockOnHand: match.stockOnHand ?? null, lastPurchasePrice: match.lastPurchasePrice ?? null,
        };
      });
    } catch {
      return list;
    }
  };

  const hydrateServices = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.serviceCardId != null)) return list;
    try {
      const all: any = await legacyErpApi.lookupTable("service");
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((s: any) => [String(s.id), s]));
      return list.map((row) => {
        if (row.serviceCardId == null) return row;
        const match = byId.get(String(row.serviceCardId));
        return match ? { ...row, code: match.code || row.code, name: match.name || row.name, sourceType: "service" } : row;
      });
    } catch {
      return list;
    }
  };

  const hydrateUnits = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.unitId != null)) return list;
    try {
      const all: any = await legacyErpApi.lookupTable("unit");
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((u: any) => [String(u.id), u]));
      return list.map((row) => (row.unitId == null ? row : { ...row, unit: byId.get(String(row.unitId))?.code || byId.get(String(row.unitId))?.name || row.unit }));
    } catch {
      return list;
    }
  };

  const hydrateForex = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.forexId != null)) return list;
    try {
      const all: any = await legacyErpApi.lookupTable("forex");
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((f: any) => [String(f.id), f]));
      return list.map((row) => (row.forexId == null ? row : { ...row, forexCode: byId.get(String(row.forexId))?.code || byId.get(String(row.forexId))?.name || row.forexCode }));
    } catch {
      return list;
    }
  };

  const load = async (idOverride?: number | null) => {
    const id = idOverride ?? contractId;
    if (!id) { setRows([emptyLine()]); return; }
    setLoading(true);
    try {
      const r: any = await api.listItems(id);
      const list = (Array.isArray(r) ? r : []).map(fromApiRow);
      const withCodesNames = await hydrateCodesNames(list);
      const withServices = await hydrateServices(withCodesNames);
      const withUnits = await hydrateUnits(withServices);
      const withForex = await hydrateForex(withUnits);
      const recalculated = withForex.map(recalc);
      setRows(recalculated.length ? recalculated : [emptyLine()]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load contract lines");
      setRows([emptyLine()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [contractId]);

  const buildDto = useCallback((row: LineRow) => ({
    itemType: row.itemType,
    inventoryId: row.inventoryId,
    serviceCardId: row.serviceCardId,
    quantity: row.quantity === "" ? undefined : num(row.quantity),
    grossQuantity: row.grossQuantity === "" ? undefined : num(row.grossQuantity),
    unitId: row.unitId ?? undefined,
    unitPrice: row.rate === "" ? undefined : num(row.rate),
    forexId: row.forexId ?? undefined,
    vatIncluded: row.vatIncluded,
    vatRate: row.vatRate === "" ? undefined : num(row.vatRate),
    itemTotal: row.price ?? undefined,
    netItemTotal: row.lineAmount ?? undefined,
    receivedQuantity: row.receivedQuantity === "" ? undefined : num(row.receivedQuantity),
    deliveryDate: row.deliveryDate || undefined,
    specialCode: row.specialCode || undefined,
    explanation: row.explanation || undefined,
  }), []);

  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const persistRow = useCallback(async (clientId: string, row: LineRow) => {
    if (!contractId || savingIds.has(clientId)) return;
    if (row.__rowId == null && isBlankLine(row)) return;
    setSavingIds((s) => new Set(s).add(clientId));
    try {
      if (row.__rowId == null) {
        const saved: any = await api.createItem(contractId, buildDto(row));
        setRows((prev) => prev.map((r) => (r.clientId === clientId && r.__rowId == null ? { ...r, __rowId: saved.id } : r)));
      } else {
        await api.updateItem(contractId, row.__rowId, buildDto(row));
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save line");
    } finally {
      setSavingIds((s) => { const next = new Set(s); next.delete(clientId); return next; });
    }
  }, [contractId, savingIds, buildDto, api]);

  const commitDrafts = async (newContractId: number) => {
    const draftRows = rows.filter((r) => !isBlankLine(r) && r.__rowId == null);
    for (const row of draftRows) {
      try {
        await api.createItem(newContractId, buildDto(row));
      } catch (e: any) {
        toast.error(e.message || "Failed to save a line item");
      }
    }
    await load(newContractId);
  };

  useImperativeHandle(ref, () => ({ commitDrafts }), [rows]);

  const addRow = () => setRows((prev) => [...prev, emptyLine()]);

  const removeRow = async (clientId: string) => {
    const row = rows.find((r) => r.clientId === clientId);
    if (!row) return;
    if (row.__rowId != null && contractId) {
      try {
        await api.removeItem(contractId, row.__rowId);
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.clientId !== clientId));
  };

  const updateRow = useCallback((clientId: string, patch: Partial<LineRow>, commit = false) => {
    setRows((prev) => prev.map((r) => {
      if (r.clientId !== clientId) return r;
      const updated = recalc({ ...r, ...patch });
      if (commit) persistRow(clientId, updated);
      return updated;
    }));
  }, [persistRow]);

  const { openFullScreen: openInventoryLookup } = useMasterLookupField(
    "inventory",
    (selection) => {
      const clientId = pendingLookupClientId.current;
      pendingLookupClientId.current = null;
      if (!clientId) return;
      updateRow(clientId, {
        inventoryId: Number(selection.id), sourceType: selection.meta?.sourceType ?? null,
        code: selection.code, name: selection.name,
        stockOnHand: typeof selection.meta?.stockOnHand === "number" ? selection.meta.stockOnHand : null,
        lastPurchasePrice: typeof selection.meta?.lastPurchasePrice === "number" ? selection.meta.lastPurchasePrice : null,
      }, true);
    },
    INVENTORY_CARDS_LIST_PATH,
  );
  const openLookupForRow = useCallback((clientId: string) => {
    pendingLookupClientId.current = clientId;
    openInventoryLookup(undefined);
  }, [openInventoryLookup]);

  const fetchServiceOptions = async (search: string) => {
    const r: any = await legacyErpApi.lookupTable("service", search || undefined);
    return Array.isArray(r) ? r : [];
  };
  const activeServiceRow = rows.find((r) => r.clientId === serviceLookupClientId);

  const handleTypeChange = useCallback((clientId: string, typeKind: TypeKind) => {
    const opt = TYPE_OPTIONS.find((t) => t.value === typeKind) ?? TYPE_OPTIONS[0];
    updateRow(clientId, {
      typeKind, itemType: opt.itemType, inventoryId: null, serviceCardId: null, sourceType: null,
      code: "", name: "", stockOnHand: null, lastPurchasePrice: null,
    }, true);
    setEditing(false);
  }, [updateRow]);

  const { totalRecords, totalQuantity, totalAmount } = useMemo(() => {
    const realRows = rows.filter((r) => !isBlankLine(r));
    return {
      totalRecords: realRows.length,
      totalQuantity: realRows.reduce((s, r) => s + num(r.quantity), 0),
      totalAmount: realRows.reduce((s, r) => s + num(r.lineAmount ?? 0), 0),
    };
  }, [rows]);

  // ---- Column resize/reorder/hide/persist — shared across every grid via useGridColumns ----
  const gridColumnDefs = useMemo(
    () => COLUMNS.map((c) => ({ key: c.key, label: c.label, defaultWidth: DEFAULT_WIDTHS[c.key], minWidth: MIN_WIDTHS[c.key] })),
    [],
  );
  const gridColumns = useGridColumns<ColKey>({
    storageKey: "contractLineGrid",
    columns: gridColumnDefs,
    fixedColumns: FIXED_COLS,
  });
  const displayColumnDefs = useMemo(
    () => gridColumns.displayColumnDefs.map((c) => COLUMN_BY_KEY.get(c.key)!),
    [gridColumns.displayColumnDefs],
  );
  const navOrder = useMemo(() => displayColumnDefs.map((c) => c.key), [displayColumnDefs]);
  const gridRootRef = useRef<HTMLDivElement>(null);
  const colWidths = gridColumns.colWidths;
  const startResize = gridColumns.startResize;
  const autoFitColumn = (key: ColKey) => gridColumns.autoFitColumn(key, gridRootRef.current);
  const totalTableWidth = gridColumns.totalWidth(DEL_W);

  // ---- Excel-style click-to-edit cell model — ported from purchase-order-line-grid.tsx -------
  const [cursor, setCursor] = useState<{ clientId: string; col: ColKey } | null>(null);
  const [editing, setEditing] = useState(false);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cellKey = (clientId: string, col: ColKey) => `${clientId}:${col}`;
  const registerCell = (key: string) => (el: HTMLDivElement | null) => {
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  };
  const isActive = (clientId: string, col: ColKey) => cursor?.clientId === clientId && cursor.col === col;

  useEffect(() => {
    if (!cursor || editing) return;
    cellRefs.current.get(cellKey(cursor.clientId, cursor.col))?.focus();
  }, [cursor, editing]);

  const moveCursor = useCallback((rowDelta: number, colDelta: number) => {
    setCursor((current) => {
      if (!current) return current;
      const rowIdx = rows.findIndex((r) => r.clientId === current.clientId);
      const colIdx = navOrder.indexOf(current.col);
      if (rowIdx === -1 || colIdx === -1) return current;
      const nextRow = rows[Math.min(Math.max(rowIdx + rowDelta, 0), rows.length - 1)];
      const nextCol = navOrder[Math.min(Math.max(colIdx + colDelta, 0), navOrder.length - 1)];
      return { clientId: nextRow.clientId, col: nextCol };
    });
    setEditing(false);
  }, [rows, navOrder]);

  // Snapshot of the row exactly as it was the instant editing began — Escape restores it, same
  // rationale as purchase-order-line-grid.tsx's own preEditSnapshotRef/cancelEdit.
  const preEditSnapshotRef = useRef<LineRow | null>(null);
  const cancelEdit = useCallback((clientId: string) => {
    const snap = preEditSnapshotRef.current;
    preEditSnapshotRef.current = null;
    if (snap && snap.clientId === clientId) {
      setRows((prev) => prev.map((r) => (r.clientId === clientId ? snap : r)));
    }
    setEditing(false);
  }, []);

  const activateCell = useCallback((row: LineRow, col: ColKey) => {
    if (readOnly) return;
    setCursor({ clientId: row.clientId, col });
    const def = COLUMN_BY_KEY.get(col);
    if (!def?.editable) return;
    if (col === "name" && row.typeKind === "service") { setServiceLookupClientId(row.clientId); return; }
    preEditSnapshotRef.current = row;
    setEditing(true);
  }, [readOnly]);

  const handleStaticKeyDown = useCallback((e: React.KeyboardEvent, row: LineRow, col: ColKey) => {
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); moveCursor(-1, 0); break;
      case "ArrowDown": e.preventDefault(); moveCursor(1, 0); break;
      case "ArrowLeft": e.preventDefault(); moveCursor(0, -1); break;
      case "ArrowRight": e.preventDefault(); moveCursor(0, 1); break;
      case "Enter": case "F2": e.preventDefault(); activateCell(row, col); break;
    }
  }, [moveCursor, activateCell]);

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent, row: LineRow) => {
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(row.clientId); return; }
    if (e.key === "Enter") { e.preventDefault(); persistRow(row.clientId, row); setEditing(false); moveCursor(1, 0); return; }
    if (e.key === "Tab") { e.preventDefault(); persistRow(row.clientId, row); setEditing(false); moveCursor(0, e.shiftKey ? -1 : 1); }
  }, [persistRow, moveCursor, cancelEdit]);

  const cellCls = (clientId: string, col: ColKey, extra?: string) =>
    cn(CELL_BORDER, isActive(clientId, col) && "ring-2 ring-inset ring-primary", extra);

  const staticProps = (row: LineRow, col: ColKey, value: React.ReactNode, align: "left" | "right" = "left", muted = false) => ({
    ref: registerCell(cellKey(row.clientId, col)),
    role: "gridcell",
    tabIndex: readOnly ? -1 : 0,
    title: typeof value === "string" ? value : undefined,
    onClick: () => activateCell(row, col),
    onKeyDown: (e: React.KeyboardEvent) => handleStaticKeyDown(e, row, col),
    className: cn(
      CELL_PAD, "flex h-full w-full items-center text-[13px] font-medium leading-none outline-none cursor-default select-none",
      align === "right" ? "justify-end tabular-nums" : "justify-start",
      muted && "font-normal text-muted-foreground",
    ),
    children: <span data-col={col} className="min-w-0 truncate">{value}</span>,
  });

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div ref={gridRootRef} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Lines</span>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={gridColumns.manageColumns.openModal}>
              <ListOrdered className="h-3.5 w-3.5 mr-2" />Manage Columns
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-2" />Add Row
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: 480 }}>
        <Table role="grid" aria-label="Contract detail lines" aria-rowcount={rows.length + 1} className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
          <colgroup>
            {displayColumnDefs.map((col) => <col key={col.key} style={{ width: colWidths[col.key] }} />)}
            {!readOnly && <col style={{ width: DEL_W }} />}
          </colgroup>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              {displayColumnDefs.map((col, i) => {
                const fixed = FIXED_COLS.includes(col.key);
                return (
                  <TableHead
                    key={col.key}
                    role="columnheader"
                    scope="col"
                    onDragOver={gridColumns.getHeaderDragProps(col.key).onDragOver}
                    onDrop={gridColumns.getHeaderDragProps(col.key).onDrop}
                    className={cn(
                      "relative p-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80",
                      CELL_BORDER, i === 0 && FIRST_COL_BORDER,
                      gridColumns.dragOverColumn === col.key && "bg-primary/15",
                    )}
                  >
                    <span
                      title={col.label}
                      draggable={!fixed && !readOnly}
                      onDragStart={gridColumns.getHeaderDragProps(col.key).onDragStart}
                      onDragEnd={gridColumns.getHeaderDragProps(col.key).onDragEnd}
                      data-col={col.key}
                      className={cn(
                        HEADER_H, "flex w-full min-w-0 items-center truncate", CELL_PAD,
                        !fixed && !readOnly && "cursor-grab active:cursor-grabbing",
                      )}
                    >
                      {col.label}
                    </span>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={startResize(col.key)}
                      onDoubleClick={() => autoFitColumn(col.key)}
                      title="Drag to resize · double-click to auto-fit"
                      aria-hidden="true"
                    />
                  </TableHead>
                );
              })}
              {!readOnly && <TableHead className="h-10 w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.clientId} className={cn(ROW_H, "group [&>td]:p-0")}>
                {displayColumnDefs.map((col, i) => {
                  const firstBorder = i === 0 ? FIRST_COL_BORDER : undefined;
                  const r = row;

                  if (col.key === "type") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "type", firstBorder)}>
                        {isActive(r.clientId, "type") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <Select value={r.typeKind} defaultOpen onOpenChange={(open) => !open && setEditing(false)}
                              onValueChange={(v) => handleTypeChange(r.clientId, v as TypeKind)}>
                              <SelectTrigger className={EDITOR_CONTROL}><SelectValue /></SelectTrigger>
                              <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        ) : <div {...staticProps(r, "type", TYPE_OPTIONS.find((t) => t.value === r.typeKind)?.label ?? "Inventory")} />}
                      </TableCell>
                    );
                  }

                  // CODE — read-only, bound to whichever Inventory/Service item Name's
                  // search/select resolved (see the Name cell below). Never typed directly.
                  // editable:false in COLUMNS already makes activateCell() a no-op beyond
                  // moving the cursor here, so this cell has no editing branch.
                  if (col.key === "code") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "code", firstBorder)}>
                        <div {...staticProps(r, "code", r.code || "—", "left", !r.code)} />
                      </TableCell>
                    );
                  }

                  // NAME — smart-search autocomplete (shared AutocompleteTextCell + Inventory
                  // Card List datasource, same as Purchase Order/Inventory Receipt). Selecting a
                  // suggestion resolves inventoryId/sourceType/Code/Name/Stock/Last Purchase
                  // Price together; Type=Service opens the existing Service LookupDialog instead
                  // (Service has no cached client-side list — small, rarely-typed master).
                  if (col.key === "name") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "name", firstBorder)}>
                        {isActive(r.clientId, "name") && editing && r.typeKind !== "service" ? (
                          <div className={cn(EDITOR_WRAP, "gap-0")}>
                            <AutocompleteTextCell
                              autoFocus
                              value={r.name}
                              options={inventoryCodeOptions}
                              disabled={readOnly}
                              showDropdownIcon
                              onChange={(v) => updateRow(r.clientId, { name: v })}
                              onCancel={() => cancelEdit(r.clientId)}
                              onDoubleClick={() => !readOnly && openLookupForRow(r.clientId)}
                              onSelectOption={(o) => {
                                const match = inventoryById.get(o.id);
                                setEditing(false);
                                updateRow(r.clientId, {
                                  inventoryId: Number(o.id), sourceType: match?.sourceType ?? r.sourceType,
                                  code: o.code ?? "", name: o.name ?? "",
                                  stockOnHand: typeof match?.stockOnHand === "number" ? match.stockOnHand : null,
                                  lastPurchasePrice: typeof match?.lastPurchasePrice === "number" ? match.lastPurchasePrice : null,
                                }, true);
                              }}
                              onCommit={(finalValue) => {
                                setEditing(false);
                                updateRow(r.clientId, { name: finalValue }, true);
                              }}
                            />
                            {!readOnly && (
                              <Button
                                type="button" variant="ghost" size="icon" tabIndex={-1}
                                className="h-full w-8 shrink-0 rounded-none border-l border-border"
                                title="Search Inventory"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => openLookupForRow(r.clientId)}
                              >
                                <Search className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ) : <div {...staticProps(r, "name", r.name || "—", "left", !r.name)} />}
                      </TableCell>
                    );
                  }

                  if (col.key === "stockOnHand") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "stockOnHand", firstBorder)}>
                        <div {...staticProps(r, "stockOnHand", r.stockOnHand != null ? r.stockOnHand.toLocaleString() : "—", "right", r.stockOnHand == null)} />
                      </TableCell>
                    );
                  }
                  if (col.key === "lastPurchasePrice") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "lastPurchasePrice", firstBorder)}>
                        <div {...staticProps(r, "lastPurchasePrice", r.lastPurchasePrice != null ? r.lastPurchasePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—", "right", r.lastPurchasePrice == null)} />
                      </TableCell>
                    );
                  }

                  if (col.key === "quantity") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "quantity", firstBorder)}>
                        {isActive(r.clientId, "quantity") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <EditableGridInput autoFocus type="number" align="right" value={r.quantity} disabled={readOnly}
                              onChange={(v) => updateRow(r.clientId, { quantity: v })}
                              onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                              onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                          </div>
                        ) : <div {...staticProps(r, "quantity", fmtCell(r.quantity), "right", r.quantity === "")} />}
                      </TableCell>
                    );
                  }

                  if (col.key === "grossQuantity") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "grossQuantity", firstBorder)}>
                        {isActive(r.clientId, "grossQuantity") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <EditableGridInput autoFocus type="number" align="right" value={r.grossQuantity} disabled={readOnly}
                              onChange={(v) => updateRow(r.clientId, { grossQuantity: v })}
                              onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                              onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                          </div>
                        ) : <div {...staticProps(r, "grossQuantity", fmtCell(r.grossQuantity), "right", r.grossQuantity === "")} />}
                      </TableCell>
                    );
                  }

                  if (col.key === "unit") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "unit", firstBorder)}>
                        {isActive(r.clientId, "unit") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <Select value={r.unitId != null ? String(r.unitId) : ""} defaultOpen
                              onOpenChange={(open) => !open && setEditing(false)}
                              onValueChange={(v) => { const m = unitOptions.find((u) => String(u.id) === v); updateRow(r.clientId, { unitId: Number(v), unit: m?.code || m?.name || "" }, true); setEditing(false); }}>
                              <SelectTrigger className={EDITOR_CONTROL}><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>{unitOptions.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.code || u.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        ) : <div {...staticProps(r, "unit", r.unit || "—", "left", !r.unit)} />}
                      </TableCell>
                    );
                  }

                  if (col.key === "rate") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "rate", firstBorder)}>
                        {isActive(r.clientId, "rate") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <EditableGridInput autoFocus type="number" align="right" value={r.rate} disabled={readOnly}
                              onChange={(v) => updateRow(r.clientId, { rate: v })}
                              onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                              onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                          </div>
                        ) : <div {...staticProps(r, "rate", fmtCell(r.rate), "right", r.rate === "")} />}
                      </TableCell>
                    );
                  }

                  // PRICE — computed (effectiveQuantity x Rate), read-only.
                  if (col.key === "price") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "price", firstBorder)}>
                        <div {...staticProps(r, "price", fmt2(r.price), "right")} />
                      </TableCell>
                    );
                  }

                  if (col.key === "forex") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "forex", firstBorder)}>
                        {isActive(r.clientId, "forex") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <Select value={r.forexId != null ? String(r.forexId) : ""} defaultOpen
                              onOpenChange={(open) => !open && setEditing(false)}
                              onValueChange={(v) => { const m = forexOptions.find((f) => String(f.id) === v); updateRow(r.clientId, { forexId: Number(v), forexCode: m?.code || m?.name || "" }, true); setEditing(false); }}>
                              <SelectTrigger className={EDITOR_CONTROL}><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>{forexOptions.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.code || f.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        ) : <div {...staticProps(r, "forex", r.forexCode || "—", "left", !r.forexCode)} />}
                      </TableCell>
                    );
                  }

                  if (col.key === "vatType") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "vatType", firstBorder)}>
                        {isActive(r.clientId, "vatType") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <Select value={String(r.vatIncluded)} defaultOpen onOpenChange={(open) => !open && setEditing(false)}
                              onValueChange={(v) => { updateRow(r.clientId, { vatIncluded: Number(v) as 0 | 1 }, true); setEditing(false); }}>
                              <SelectTrigger className={EDITOR_CONTROL}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">Exclusive</SelectItem>
                                <SelectItem value="1">Inclusive</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : <div {...staticProps(r, "vatType", r.vatIncluded ? "Inclusive" : "Exclusive")} />}
                      </TableCell>
                    );
                  }

                  if (col.key === "vatPct") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "vatPct", firstBorder)}>
                        {isActive(r.clientId, "vatPct") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <EditableGridInput autoFocus type="number" align="right" value={r.vatRate} disabled={readOnly}
                              onChange={(v) => updateRow(r.clientId, { vatRate: v })}
                              onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                              onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                          </div>
                        ) : <div {...staticProps(r, "vatPct", fmtCell(r.vatRate), "right", r.vatRate === "")} />}
                      </TableCell>
                    );
                  }

                  // ITEM AMOUNT — computed (recalc()), read-only.
                  if (col.key === "itemAmount") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "itemAmount", firstBorder)}>
                        <div {...staticProps(r, "itemAmount", fmt2(r.lineAmount), "right")} />
                      </TableCell>
                    );
                  }

                  if (col.key === "received") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "received", firstBorder)}>
                        {isActive(r.clientId, "received") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <EditableGridInput autoFocus type="number" align="right" value={r.receivedQuantity} disabled={readOnly}
                              onChange={(v) => updateRow(r.clientId, { receivedQuantity: v })}
                              onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                              onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                          </div>
                        ) : <div {...staticProps(r, "received", fmtCell(r.receivedQuantity), "right", r.receivedQuantity === "")} />}
                      </TableCell>
                    );
                  }

                  if (col.key === "deliveryDate") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "deliveryDate", firstBorder)}>
                        {isActive(r.clientId, "deliveryDate") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <EditableGridInput autoFocus type="date" value={r.deliveryDate} disabled={readOnly}
                              onChange={(v) => updateRow(r.clientId, { deliveryDate: v })}
                              onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                              onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                          </div>
                        ) : <div {...staticProps(r, "deliveryDate", r.deliveryDate || "—", "left", !r.deliveryDate)} />}
                      </TableCell>
                    );
                  }

                  if (col.key === "specialCode") {
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, "specialCode", firstBorder)}>
                        {isActive(r.clientId, "specialCode") && editing ? (
                          <div className={EDITOR_WRAP}>
                            <EditableGridInput autoFocus value={r.specialCode} disabled={readOnly}
                              onChange={(v) => updateRow(r.clientId, { specialCode: v })}
                              onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                              onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                          </div>
                        ) : <div {...staticProps(r, "specialCode", r.specialCode || "—", "left", !r.specialCode)} />}
                      </TableCell>
                    );
                  }

                  // explanation (last column)
                  return (
                    <TableCell key={col.key} className={cellCls(r.clientId, "explanation", firstBorder)}>
                      {isActive(r.clientId, "explanation") && editing ? (
                        <div className={EDITOR_WRAP}>
                          <EditableGridInput autoFocus value={r.explanation} disabled={readOnly}
                            onChange={(v) => updateRow(r.clientId, { explanation: v })}
                            onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                            onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                        </div>
                      ) : <div {...staticProps(r, "explanation", r.explanation || "—", "left", !r.explanation)} />}
                    </TableCell>
                  );
                })}
                {!readOnly && (
                  <TableCell className="py-1.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => setPendingDeleteId(row.clientId)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-6 border-t bg-muted/20 px-4 py-2 text-xs">
        <span className="text-muted-foreground">Records: <span className="font-medium text-foreground">{totalRecords}</span></span>
        <span className="text-muted-foreground">Total Qty: <span className="font-medium text-foreground">{fmt2(totalQuantity)}</span></span>
        <span className="text-muted-foreground">Total Amount: <span className="font-medium text-foreground">{fmt2(totalAmount)}</span></span>
      </div>

      {activeServiceRow && (
        <LookupDialog
          open={!!serviceLookupClientId}
          onOpenChange={(open) => !open && setServiceLookupClientId(null)}
          title="Select Service"
          fetchOptions={fetchServiceOptions}
          getLabel={(o: any) => `${o.code} — ${o.name}`}
          getValue={(o: any) => o.id}
          onSelect={(o: any) => {
            updateRow(activeServiceRow.clientId, { serviceCardId: Number(o.id), code: o.code, name: o.name, sourceType: "service" }, true);
            setServiceLookupClientId(null);
          }}
        />
      )}

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete line</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this line?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (pendingDeleteId) removeRow(pendingDeleteId); setPendingDeleteId(null); }}
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns. Type, Code and Name are required and always stay first."
      />
    </div>
  );
});
