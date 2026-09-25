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
import { useEffect, useMemo, useState } from "react";
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
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { ReportGrid, type ReportColumn } from "../fabric-yarn-requirements/_components/report-grid";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { SerialCardEditDialog, type SerialCardRow } from "@/components/legacy-erp/serial-card-edit-dialog";
import { GenerateSerialCardsDialog } from "@/components/legacy-erp/generate-serial-cards-dialog";
import type { RowAction } from "@/components/legacy-erp/row-actions";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Layers, RefreshCw, Search, RotateCcw, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, Plus } from "lucide-react";

const PAGE_SIZE = 100;

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
  const [deleteTarget, setDeleteTarget] = useState<SerialCardRow | null>(null);
  const [produceOpen, setProduceOpen] = useState(false);

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
        skip: nextSkip, take: PAGE_SIZE,
      });
      const list = Array.isArray(r?.rows) ? r.rows : [];
      setRows(list.map((row: any) => ({ ...row, id: row.RecId })));
      setTotal(r?.total ?? 0);
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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await legacyErpApi.serialCards.remove(deleteTarget.RecId);
      toast.success(`Serial Card ${deleteTarget.SerialCode} deleted.`);
      setDeleteTarget(null);
      await load(appliedFilters, skip);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete serial card");
    }
  };

  const getRowActions = (row: SerialCardRow): RowAction[] => [
    { key: "view", label: "View / Detail", icon: Eye, onSelect: () => setEditTarget({ card: row, mode: "view" }) },
    { key: "update", label: "Update", icon: Pencil, onSelect: () => setEditTarget({ card: row, mode: "update" }) },
    { key: "delete", label: "Delete", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setDeleteTarget(row) },
  ];

  const columns: ReportColumn<SerialCardRow>[] = useMemo(() => [
    { key: "serialNo", label: "Serial No", defaultWidth: 110, render: (r) => <span className="font-mono">{r.SerialCode}</span>, filterable: true, filterValue: (r) => r.SerialCode },
    { key: "inventoryCode", label: "Inventory Code", defaultWidth: 130, render: (r) => r.inventoryCode || "—", filterable: true, filterValue: (r) => r.inventoryCode },
    { key: "inventoryName", label: "Inventory Name", defaultWidth: 260, render: (r) => r.inventoryName || "—" },
    { key: "variant", label: "Variant-1", defaultWidth: 130, render: (r) => r.variantCode || r.variantName || "—" },
    { key: "color", label: "Color", defaultWidth: 130, render: (r) => r.colorCode || r.colorName || "—" },
    { key: "unit", label: "Unit", defaultWidth: 70, render: (r) => r.unitCode || "—" },
    { key: "orderNo", label: "Order No", defaultWidth: 110, render: (r) => r.workOrderNo || "—", filterable: true, filterValue: (r) => r.workOrderNo },
    { key: "receiptNo", label: "Receipt No", defaultWidth: 100, render: (r) => r.receiptNo || "—" },
    { key: "partyNo", label: "Party No", defaultWidth: 90, render: (r) => r.PartyNo || "—" },
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
  ], []);

  const pageFrom = total === 0 ? 0 : skip + 1;
  const pageTo = Math.min(skip + PAGE_SIZE, total);
  const selectedCount = selectedIds.size;

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
          fixedColumns={["serialNo", "inventoryCode"]}
          maxHeight="60vh"
        />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Serial Card</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deleteTarget?.SerialCode}? This does not affect Stock On Hand or the source receipt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
