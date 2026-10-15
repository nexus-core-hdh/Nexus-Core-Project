"use client";

// Serial Cards — the dedicated, permanent ERP screen for real, persisted IM_SerialCard records
// (see nexuscore-backend/src/modules/legacy-erp/serial-card.service.ts's own top comment: the
// same table/service this project's "Generate Serial Cards" flow already produces into).
//
// This page REUSES the exact data mapping and CRUD APIs that already existed as
// components/legacy-erp/serial-cards-list-dialog.tsx (now retired — its role is fully replaced
// by this real, permanent screen, per this feature's own instruction that opening Serial Cards
// from a receipt or from Produce should use this SAME screen "where practical") and
// components/legacy-erp/serial-card-edit-dialog.tsx (still actively reused here for View/Update).
// Produce/Update/Delete persistence logic in serial-card.service.ts is completely untouched.
//
// Generic OR pre-scoped via query param — same real precedent as item-statement/page.tsx
// (`?id=`/`?source=`/`?sourceLabel=`): `?receiptItemId=` scopes the grid to one receipt line's
// own cards (the state right after Produce, or reopening from that line's own context menu);
// omitted, this is a normal browsable list with server-side filters/pagination
// (legacyErpApi.serialCards.listAll — never the whole table loaded client-side).
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { ReportGrid, type ReportColumn } from "../fabric-yarn-requirements/_components/report-grid";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { SerialCardEditDialog, serialCardToUpdateItem, type SerialCardRow } from "@/components/legacy-erp/serial-card-edit-dialog";
import { printSerialCardLabels } from "@/components/legacy-erp/serial-card-labels";
import { serialNoFromQr, serialNoFromQrText } from "@/lib/legacy-erp/qr";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { GenerateSerialCardsDialog } from "@/components/legacy-erp/generate-serial-cards-dialog";
import type { RowAction } from "@/components/legacy-erp/row-actions";
import type { ColumnFilterState } from "@/hooks/use-column-filters";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import {
  Layers, RefreshCw, Search, RotateCcw, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, Plus,
  Download, Equal, Copy, Printer, X, ScanLine,
} from "lucide-react";

const PAGE_SIZE = 100;
const PATH = "/dashboard/legacy-erp/serial-cards";

// Fields "Copy Column" can fill across the selection — exactly the ones the Update form edits.
type CopyField = { key: keyof SerialCardRow; label: string; display?: (r: SerialCardRow) => unknown };
const COPY_FIELDS: CopyField[] = [
  { key: "Explanation", label: "Explanation" },
  { key: "PartyNo", label: "Party No" },
  { key: "ProducerSerialCode", label: "Manufacturer Serial" },
  { key: "QualityTypeId", label: "Quality Type", display: (r) => r.qualityTypeName },
  { key: "ResourceId", label: "Resource", display: (r) => r.resourceCode },
  { key: "EmployeeId", label: "Employee", display: (r) => r.employeeName },
  { key: "ManufacturingDate", label: "Product Date", display: (r) => (r.ManufacturingDate ? new Date(r.ManufacturingDate).toLocaleDateString() : null) },
  { key: "Quantity", label: "Quantity" },
  { key: "PieceCount", label: "Piece Count" },
  { key: "Width", label: "Width" },
  { key: "Weight", label: "Grams" },
  { key: "WeightM2", label: "M2" },
  { key: "RawWidth", label: "Raw Width" },
  { key: "RawWeight", label: "Raw Grams" },
  { key: "RawLength", label: "Raw Length" },
  { key: "ProductLength", label: "Product Length" },
  { key: "Pus", label: "Pus" },
  { key: "Fine", label: "Fine" },
];
const copyDisplay = (f: CopyField, r: SerialCardRow) => {
  const v = f.display ? f.display(r) : r[f.key];
  return v == null || v === "" ? "(empty)" : String(v);
};

const emptyFilters = {
  serialNo: "", inventoryQuery: "", receiptNo: "", workOrderNo: "", variantQuery: "",
  dateFrom: "", dateTo: "", status: "all" as "all" | "has" | "none",
};

export default function SerialCardsPage() {
  const params = useWorkspaceSearchParams();
  // Both optional — a scoped open (from Produce / "View Serial Cards") supplies both; a plain
  // sidebar open supplies neither. receiptId alone (no receiptItemId) is not a real scope this
  // screen recognizes, matching serial-card.service.ts's own receiptItemId-keyed filter.
  const receiptItemId = params.get("receiptItemId") ? Number(params.get("receiptItemId")) : null;
  const receiptId = params.get("receiptId") ? Number(params.get("receiptId")) : null;

  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [rows, setRows] = useState<SerialCardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<{ card: SerialCardRow; mode: "view" | "update" } | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<SerialCardRow[] | null>(null);
  const [produceOpen, setProduceOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyField, setCopyField] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [scanning, setScanning] = useState(false);
  // A label QR holds many lines of text; a keyboard-wedge scanner types each line + Enter. The
  // first line ("SERIAL CARD: …") opens the card; the rest of that burst is ignored.
  const qrTextBurstAt = useRef(0);
  // Party No column filter — applied to the server query (every page), not just the loaded rows.
  // A ref so load() (also called from Find / paging / reloads) always sends the current selection.
  const partyNosRef = useRef<string[]>([]);
  const [partyNoOptions, setPartyNoOptions] = useState<string[]>([]);

  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);

  const { selectedIds, selectRow, handleRowContextMenu, toggleRow, selectAll, clearSelection, allSelected, someSelected } =
    useRowSelection(rows, { getId: (r) => r.RecId });

  const load = async (f: typeof emptyFilters, nextSkip = 0) => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.serialCards.listAll({
        receiptItemId: receiptItemId ?? undefined,
        serialNo: f.serialNo || undefined,
        inventoryQuery: f.inventoryQuery || undefined,
        receiptNo: f.receiptNo || undefined,
        workOrderNo: f.workOrderNo || undefined,
        variantQuery: f.variantQuery || undefined,
        dateFrom: f.dateFrom || undefined,
        dateTo: f.dateTo || undefined,
        status: f.status !== "all" ? f.status : undefined,
        partyNo: partyNosRef.current.length ? partyNosRef.current : undefined,
        skip: nextSkip, take: PAGE_SIZE,
      });
      const list = Array.isArray(r?.rows) ? r.rows : [];
      setRows(list.map((row: any) => ({ ...row, id: row.RecId })));
      setTotal(r?.total ?? 0);
      setPartyNoOptions(Array.isArray(r?.partyNoOptions) ? r.partyNoOptions : []);
      setSkip(r?.skip ?? 0);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Serial Cards");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(emptyFilters, 0);
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptItemId]);

  const find = () => { setAppliedFilters(filters); void load(filters, 0); };
  const clear = () => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); void load(emptyFilters, 0); clearSelection(); };

  // Selected cards in grid (list) order — only cards on the loaded page can be acted on.
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.RecId)), [rows, selectedIds]);
  const single = selectedRows.length === 1 ? selectedRows[0] : null;

  // Delete — the existing per-card remove(), once per selected card; failures are reported, not hidden.
  const confirmDelete = async () => {
    if (!deleteTargets?.length) return;
    setBusy(true);
    const failed: string[] = [];
    let deleted = 0;
    for (const card of deleteTargets) {
      try {
        await legacyErpApi.serialCards.remove(card.RecId);
        deleted++;
      } catch (e: any) {
        failed.push(`${card.SerialCode}: ${e.message || "failed"}`);
      }
    }
    setBusy(false);
    setDeleteTargets(null);
    if (deleted) toast.success(deleteTargets.length === 1 ? `Serial Card ${deleteTargets[0].SerialCode} deleted.` : `${deleted} serial card${deleted === 1 ? "" : "s"} deleted.`);
    if (failed.length) toast.error(`Could not delete ${failed.length}: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "…" : ""}`);
    clearSelection();
    await load(appliedFilters, skip);
  };

  const confirmAssign = async () => {
    setBusy(true);
    try {
      const updated: any = await legacyErpApi.serialCards.assignQuantity(selectedRows.map((r) => r.RecId));
      const count = Array.isArray(updated) ? updated.length : selectedRows.length;
      toast.success(`Quantity assigned to ${count} serial card${count === 1 ? "" : "s"}.`);
      setAssignOpen(false);
      await load(appliedFilters, skip);
    } catch (e: any) {
      toast.error(e.message || "Failed to assign quantity");
    } finally {
      setBusy(false);
    }
  };

  // Copy Column — the chosen field's value from the first selected card onto the others, through
  // the existing Update (full rows, so no other field changes; the receipt-line quantity cap applies).
  const copySource = selectedRows[0] ?? null;
  const copyDef = COPY_FIELDS.find((f) => f.key === copyField) ?? null;
  const confirmCopy = async () => {
    if (!copySource || !copyDef) return;
    setBusy(true);
    try {
      const value = copySource[copyDef.key];
      const items = selectedRows.slice(1).map((r) => serialCardToUpdateItem({ ...r, [copyDef.key]: value }));
      await legacyErpApi.serialCards.updateFlat(items);
      toast.success(`${copyDef.label} copied to ${items.length} serial card${items.length === 1 ? "" : "s"}.`);
      setCopyOpen(false);
      await load(appliedFilters, skip);
    } catch (e: any) {
      toast.error(e.message || "Failed to copy column");
    } finally {
      setBusy(false);
    }
  };

  // QR labels — payloads come from the server (card + linked production data + Yarn Recipe).
  const printLabels = async () => {
    const ids = selectedRows.map((r) => r.RecId);
    try {
      const opened = await printSerialCardLabels(() => legacyErpApi.serialCards.labels(ids) as Promise<any>);
      if (!opened) toast.error("The label window was blocked — allow pop-ups for this site and try again.");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate labels");
    }
  };

  const closeScreen = () => closeTab(tabCtx?.tabKey ?? PATH);

  // Scan: a label QR (its text, or an earlier label's link / JSON) or a typed Serial No — a
  // scanner types it and sends Enter.
  const scan = async () => {
    const isQrText = serialNoFromQrText(scanCode.trim()) != null;
    if (!isQrText && Date.now() - qrTextBurstAt.current < 1500) {
      qrTextBurstAt.current = Date.now();
      setScanCode("");
      return;
    }
    if (isQrText) qrTextBurstAt.current = Date.now();
    const code = serialNoFromQr(scanCode) ?? scanCode.trim();
    if (!code || scanning) return;
    setScanning(true);
    try {
      const found: any = await legacyErpApi.serialCards.byCode(code);
      setEditTarget({ card: { ...found, id: found.RecId }, mode: "view" });
      setScanCode("");
    } catch (e: any) {
      toast.error(e.message || `No serial card with Serial No ${code}`);
    } finally {
      setScanning(false);
    }
  };

  const getRowActions = (row: SerialCardRow): RowAction[] => [
    { key: "view", label: "View / Detail", icon: Eye, onSelect: () => setEditTarget({ card: row, mode: "view" }) },
    { key: "update", label: "Update", icon: Pencil, onSelect: () => setEditTarget({ card: row, mode: "update" }) },
    { key: "delete", label: "Delete", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setDeleteTargets([row]) },
  ];

  const columns: ReportColumn<SerialCardRow>[] = useMemo(() => [
    { key: "serialNo", label: "Serial No", defaultWidth: 110, render: (r) => <span className="font-mono">{r.SerialCode}</span>, filterable: true, filterValue: (r) => r.SerialCode },
    { key: "inventoryCode", label: "Inventory Code", defaultWidth: 130, render: (r) => r.inventoryCode || "—", filterable: true, filterValue: (r) => r.inventoryCode },
    { key: "inventoryName", label: "Inventory Name", defaultWidth: 260, render: (r) => r.inventoryName || "—" },
    { key: "variant", label: "Variant-1", defaultWidth: 130, render: (r) => r.variantCode || r.variantName || "—" },
    { key: "color", label: "Color", defaultWidth: 130, render: (r) => r.colorCode || r.colorName || "—" },
    { key: "unit", label: "Unit", defaultWidth: 70, render: (r) => r.unitCode || "—" },
    { key: "orderNo", label: "Order No", defaultWidth: 110, render: (r) => r.workOrderNo || "—", filterable: true, filterValue: (r) => r.workOrderNo },
    { key: "styleNo", label: "Style No", defaultWidth: 110, render: (r) => r.styleNumber || "—", filterable: true, filterValue: (r) => r.styleNumber },
    { key: "receiptNo", label: "Receipt No", defaultWidth: 100, render: (r) => r.receiptNo || "—" },
    {
      key: "partyNo", label: "Party No", defaultWidth: 90, render: (r) => r.PartyNo || "—",
      // Trimmed, blank -> null: blank Party Nos are never an option (same as every column filter).
      filterable: true, filterValue: (r) => r.PartyNo?.trim() || null, filterOptions: partyNoOptions,
    },
    { key: "qualityType", label: "Quality Type", defaultWidth: 110, render: (r) => r.qualityTypeName || "—" },
    { key: "resource", label: "Resource", defaultWidth: 100, render: (r) => r.resourceCode || "—" },
    { key: "employee", label: "Employee", defaultWidth: 130, render: (r) => r.employeeName || "—" },
    { key: "producerSerial", label: "Manufacturer Serial", defaultWidth: 140, render: (r) => r.ProducerSerialCode || "—" },
    { key: "productDate", label: "Product Date", defaultWidth: 100, render: (r) => (r.ManufacturingDate ? new Date(r.ManufacturingDate).toLocaleDateString() : "—") },
    { key: "quantity", label: "Quantity", defaultWidth: 90, align: "right", render: (r) => (r.Quantity != null ? Number(r.Quantity).toLocaleString() : "—"), filterable: true, filterType: "number", filterValue: (r) => r.Quantity },
    { key: "width", label: "Width", defaultWidth: 80, align: "right", render: (r) => (r.Width != null ? Number(r.Width).toLocaleString() : "—") },
    { key: "grams", label: "Grams", defaultWidth: 80, align: "right", render: (r) => (r.Weight != null ? Number(r.Weight).toLocaleString() : "—") },
    { key: "rawWidth", label: "Raw Width", defaultWidth: 90, align: "right", render: (r) => (r.RawWidth != null ? Number(r.RawWidth).toLocaleString() : "—") },
    { key: "rawGrams", label: "Raw Grams", defaultWidth: 90, align: "right", render: (r) => (r.RawWeight != null ? Number(r.RawWeight).toLocaleString() : "—") },
    { key: "rawLength", label: "Raw Length", defaultWidth: 90, align: "right", render: (r) => (r.RawLength != null ? Number(r.RawLength).toLocaleString() : "—") },
    { key: "productLength", label: "Product Length", defaultWidth: 110, align: "right", render: (r) => (r.ProductLength != null ? Number(r.ProductLength).toLocaleString() : "—") },
    { key: "m2", label: "M2", defaultWidth: 80, align: "right", render: (r) => (r.WeightM2 != null ? Number(r.WeightM2).toLocaleString() : "—") },
    { key: "pus", label: "Pus", defaultWidth: 70, align: "right", render: (r) => (r.Pus != null ? Number(r.Pus).toLocaleString() : "—") },
    { key: "fine", label: "Fine", defaultWidth: 70, align: "right", render: (r) => (r.Fine != null ? Number(r.Fine).toLocaleString() : "—") },
    { key: "pieceCount", label: "Piece Count", defaultWidth: 90, align: "right", render: (r) => (r.PieceCount != null ? Number(r.PieceCount).toLocaleString() : "—") },
    { key: "warehouseQuantity", label: "Warehouse Quantity", defaultWidth: 140, align: "right", render: (r) => Number(r.warehouseQuantity ?? 0).toLocaleString() },
    {
      key: "status", label: "Status", defaultWidth: 130,
      render: (r) => (
        <span className={r.hasTransaction ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
          {r.hasTransaction ? "Has Transaction" : "Has No Transactions"}
        </span>
      ),
      filterable: true, filterValue: (r) => (r.hasTransaction ? "Has Transaction" : "Has No Transactions"),
    },
  ], [partyNoOptions]);

  // The grid reports its column filters; the Party No one is mirrored into the query (from the
  // first page). Other column filters stay client-side, as before.
  const onColumnFiltersChange = (f: Record<string, ColumnFilterState>) => {
    const next = [...(f.partyNo?.values ?? [])].sort();
    if (next.join("\u0000") === partyNosRef.current.join("\u0000")) return;
    partyNosRef.current = next;
    void load(appliedFilters, 0);
  };

  const pageFrom = total === 0 ? 0 : skip + 1;
  const pageTo = Math.min(skip + PAGE_SIZE, total);
  const selectedCount = selectedIds.size;
  const n = selectedRows.length;
  // Bottom action bar; `reason` is why an action is disabled for the current selection (null = enabled).
  const actions: { key: string; label: string; icon: typeof Eye; onClick: () => void; reason: string | null; destructive?: boolean }[] = [
    { key: "load", label: "Load", icon: Download, onClick: find, reason: loading ? "Loading…" : null },
    { key: "clear", label: "Clear", icon: RotateCcw, onClick: clear, reason: loading ? "Loading…" : null },
    { key: "assign", label: "Assign to Qty", icon: Equal, onClick: () => setAssignOpen(true), reason: n ? null : "Select the serial cards to share the receipt line's quantity" },
    { key: "update", label: "Update", icon: Pencil, onClick: () => single && setEditTarget({ card: single, mode: "update" }), reason: single ? null : "Select exactly one serial card" },
    { key: "delete", label: "Delete", icon: Trash2, onClick: () => setDeleteTargets(selectedRows), reason: n ? null : "Select the serial cards to delete", destructive: true },
    { key: "copy", label: "Copy Column", icon: Copy, onClick: () => { setCopyField(""); setCopyOpen(true); }, reason: n >= 2 ? null : "Select two or more serial cards — the first one's value is copied to the rest" },
    { key: "label", label: "Label", icon: Printer, onClick: printLabels, reason: n ? null : "Select the serial cards to print QR labels for" },
    { key: "detail", label: "Detail", icon: Eye, onClick: () => single && setEditTarget({ card: single, mode: "view" }), reason: single ? null : "Select exactly one serial card" },
  ];
  const deleteWithTxn = deleteTargets?.filter((r) => r.hasTransaction).length ?? 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <span>›</span>
        <span className="font-medium text-foreground">Serial Cards</span>
      </div>

      <ModuleHeader
        icon={Layers}
        title="Serial Cards"
        subtitle={receiptItemId != null ? "Serial cards generated for this receipt line" : "Every generated serial card / roll, browsable and filterable"}
        badges={!loading && <Badge variant="secondary" className="h-5 text-[11px] font-normal">{total} record{total === 1 ? "" : "s"}</Badge>}
        actions={
          <>
            <div className="relative">
              <ScanLine className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-56 pl-7 text-sm"
                placeholder={scanning ? "Looking up…" : "Scan QR / Serial No"}
                aria-label="Scan a Serial Card QR or enter Serial No"
                value={scanCode}
                disabled={scanning}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void scan(); } }}
              />
            </div>
            {receiptItemId != null && receiptId != null && (
              <Button size="sm" variant="outline" onClick={() => setProduceOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-2" />Generate Serial Card
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => load(appliedFilters, skip)} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Serial No</label>
          <Input className="h-8 text-sm" value={filters.serialNo} onChange={(e) => setFilters((p) => ({ ...p, serialNo: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Inventory</label>
          <Input className="h-8 text-sm" value={filters.inventoryQuery} onChange={(e) => setFilters((p) => ({ ...p, inventoryQuery: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Receipt No</label>
          <Input className="h-8 text-sm" value={filters.receiptNo} onChange={(e) => setFilters((p) => ({ ...p, receiptNo: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Work Order</label>
          <Input className="h-8 text-sm" value={filters.workOrderNo} onChange={(e) => setFilters((p) => ({ ...p, workOrderNo: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Variant / Color</label>
          <Input className="h-8 text-sm" value={filters.variantQuery} onChange={(e) => setFilters((p) => ({ ...p, variantQuery: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Product Date From</label>
          <Input type="date" className="h-8 text-sm" value={filters.dateFrom} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Product Date To</label>
          <Input type="date" className="h-8 text-sm" value={filters.dateTo} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={filters.status} onValueChange={(v) => setFilters((p) => ({ ...p, status: v as typeof p.status }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="none">Has No Transactions</SelectItem>
              <SelectItem value="has">Has Transaction</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-8">
          <Button size="sm" onClick={find} disabled={loading}><Search className="h-3.5 w-3.5 mr-1.5" />{loading ? "Loading..." : "Find"}</Button>
          <Button size="sm" variant="outline" onClick={clear} disabled={loading}><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Clear</Button>
          {selectedCount > 0 && <Badge variant="secondary" className="ml-auto h-6 text-[11px] font-normal">{selectedCount} selected</Badge>}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Serial Cards
          <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">— click a row to select, ctrl/shift-click to multi-select, right-click for View/Update/Delete</span>
        </p>
        <ReportGrid
          storageKey="serialCardsGrid"
          columns={columns}
          rows={rows}
          loading={loading}
          emptyLabel={receiptItemId != null ? "No serial cards for this receipt line yet." : "No serial cards found — try different filters."}
          selectedIds={selectedIds}
          onRowClick={selectRow}
          onRowContextMenu={handleRowContextMenu}
          getRowActions={getRowActions}
          onRowDoubleClick={(r) => setEditTarget({ card: r, mode: "view" })}
          selectable
          onToggleRow={toggleRow}
          onToggleAll={() => (allSelected ? clearSelection() : selectAll())}
          allSelected={allSelected}
          someSelected={someSelected}
          onColumnFiltersChange={onColumnFiltersChange}
          fixedColumns={["serialNo", "inventoryCode"]}
          maxHeight="60vh"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 p-2">
        {actions.map((a) => (
          <span key={a.key} title={a.reason ?? undefined}>
            <Button
              size="sm" variant="outline"
              className={`h-8 ${a.destructive ? "text-destructive hover:text-destructive" : ""}`}
              disabled={!!a.reason || busy}
              onClick={a.onClick}
            >
              <a.icon className="h-3.5 w-3.5 mr-1.5" />{a.label}
            </Button>
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{n > 0 ? `${n} selected` : "No cards selected"}</span>
        <Button size="sm" variant="outline" className="h-8" onClick={closeScreen}>
          <X className="h-3.5 w-3.5 mr-1.5" />Close
        </Button>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total > 0 ? `Showing ${pageFrom}–${pageTo} of ${total}` : "Count = 0"}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7" disabled={loading || skip === 0} onClick={() => load(appliedFilters, Math.max(0, skip - PAGE_SIZE))}>
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />Previous
          </Button>
          <Button variant="outline" size="sm" className="h-7" disabled={loading || skip + PAGE_SIZE >= total} onClick={() => load(appliedFilters, skip + PAGE_SIZE)}>
            Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>

      <SerialCardEditDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        mode={editTarget?.mode ?? "view"}
        card={editTarget?.card ?? null}
        onSaved={() => load(appliedFilters, skip)}
      />

      {receiptItemId != null && receiptId != null && (
        <GenerateSerialCardsDialog
          open={produceOpen}
          onOpenChange={setProduceOpen}
          receiptId={receiptId}
          itemId={receiptItemId}
          onProduced={() => { setProduceOpen(false); void load(appliedFilters, 0); }}
        />
      )}

      <AlertDialog open={!!deleteTargets} onOpenChange={(o) => !o && !busy && setDeleteTargets(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Serial Card{(deleteTargets?.length ?? 0) > 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {deleteTargets?.length === 1
                    ? <>Delete {deleteTargets[0].SerialCode}?</>
                    : <>Delete {deleteTargets?.length} serial cards ({deleteTargets?.slice(0, 5).map((r) => r.SerialCode).join(", ")}{(deleteTargets?.length ?? 0) > 5 ? ", …" : ""})?</>}
                  {" "}This does not affect Stock On Hand or the source receipt.
                </p>
                {deleteWithTxn > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    {deleteWithTxn === deleteTargets?.length ? (deleteWithTxn === 1 ? "This card has" : "All of these cards have") : `${deleteWithTxn} of these cards have`} transactions after the receipt.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={busy} onClick={(e) => { e.preventDefault(); void confirmDelete(); }}>
              {busy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={assignOpen} onOpenChange={(o) => !busy && setAssignOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign to Qty</AlertDialogTitle>
            <AlertDialogDescription>
              Split each receipt line&apos;s unassigned quantity (line quantity minus the other cards on that line)
              equally across the {n} selected serial card{n === 1 ? "" : "s"} of that line. Only Quantity changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void confirmAssign(); }}>
              {busy ? "Assigning..." : "Assign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={copyOpen} onOpenChange={(o) => !busy && setCopyOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Copies a field from <span className="font-mono text-foreground">{copySource?.SerialCode}</span> (the first selected card)
              to the other {Math.max(0, n - 1)} selected card{n - 1 === 1 ? "" : "s"}.
            </p>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Column</label>
              <Select value={copyField} onValueChange={setCopyField}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select a column" /></SelectTrigger>
                <SelectContent>
                  {COPY_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {copyDef && copySource && (
              <p>Value: <span className="font-medium">{copyDisplay(copyDef, copySource)}</span></p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setCopyOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={busy || !copyDef || n < 2} onClick={confirmCopy}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />{busy ? "Copying..." : "Copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
