"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import type { ItemStatementFilters } from "@/lib/nexuscore-api";
import { cn } from "@/lib/utils";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { RECEIPT_TYPES } from "@/lib/legacy-erp/receipt-types";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import {
  FileClock, RefreshCw, Filter, RotateCcw, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Package, SearchX, ListOrdered, Download, Printer,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from "lucide-react";

// Item Statement / Stock Control Ledger — reachable from Trim/Fabric/Yarn/Inventory Card List's
// "View Statement" row action (itemId pre-selected, exactly as before), or standalone with no
// itemId as a general ledger (filterable by Item Code/Item Name). Read-only: reuses the exact
// same IM_Item / IM_Receipt / IM_ReceiptItem rows and the exact same Stock on Hand formula
// (InventoryCardService.getStockOnHand) every card screen already shows for its "Overall Current
// Stock" header — that figure never changes with any filter/view below. Only this screen's own
// chronological replay (running balance / opening / closing / totals / Detailed View) is filtered
// and dimensioned — see item-statement.service.ts for the full accounting.

const ALL_TYPES = "all";
const ALL_OPTION = "__all__";
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type ViewMode = "overall" | "detailed";
type ColKey =
  | "date" | "documentReceiptNo" | "transactionType" | "currentAccount"
  | "color" | "lotBatch" | "warehouse" | "sourceWarehouse" | "destinationWarehouse"
  | "itemCode" | "itemName" | "unit" | "quantityIn" | "quantityOut" | "runningBalance" | "remarks";

interface ColumnDef { key: ColKey; label: string; align?: "left" | "right"; defaultWidth: number; minWidth: number }

// Variant is deliberately NOT a real filter/column here — there is no Variant column anywhere on
// IM_ReceiptItem (confirmed against the live table); the only "Variant" fields in this codebase
// are free-text UI scaffolding on unrelated Purchase Order lines, never persisted to this table.
// It's rendered below purely as an inert, disabled placeholder to match the reference layout's
// field slot — it never contributes to appliedFilters/the API call.
const COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date", defaultWidth: 100, minWidth: 80 },
  { key: "documentReceiptNo", label: "Document/Receipt No", defaultWidth: 150, minWidth: 100 },
  { key: "transactionType", label: "Transaction Type", defaultWidth: 200, minWidth: 130 },
  { key: "itemCode", label: "Item Code", defaultWidth: 120, minWidth: 90 },
  { key: "itemName", label: "Item Name", defaultWidth: 200, minWidth: 120 },
  { key: "currentAccount", label: "Current Account", defaultWidth: 170, minWidth: 100 },
  { key: "color", label: "Color", defaultWidth: 110, minWidth: 80 },
  { key: "lotBatch", label: "Lot/Batch", defaultWidth: 110, minWidth: 80 },
  { key: "warehouse", label: "Warehouse", defaultWidth: 130, minWidth: 90 },
  { key: "sourceWarehouse", label: "Source Warehouse", defaultWidth: 150, minWidth: 100 },
  { key: "destinationWarehouse", label: "Destination Warehouse", defaultWidth: 160, minWidth: 100 },
  { key: "unit", label: "Unit", defaultWidth: 80, minWidth: 60 },
  { key: "quantityIn", label: "Quantity In", align: "right", defaultWidth: 110, minWidth: 80 },
  { key: "quantityOut", label: "Quantity Out", align: "right", defaultWidth: 110, minWidth: 80 },
  { key: "runningBalance", label: "Running Balance", align: "right", defaultWidth: 130, minWidth: 90 },
  { key: "remarks", label: "Reference/Remarks", defaultWidth: 200, minWidth: 100 },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));
const CELL_BORDER = "border-r border-b border-border";
const HEADER_CELL_BORDER = "border-r border-b border-primary-foreground/20";
const FIRST_COL_BORDER = "border-l border-border";
const HEADER_H = "h-10";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, unit, colorClass }: { label: string; value: React.ReactNode; unit?: string; colorClass: string }) {
  return (
    <div className="rounded-lg border bg-muted/10 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</div>
      <div className={cn("mt-1.5 text-2xl font-bold", colorClass)}>
        {value} <span className="text-sm font-medium text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export default function ItemStatementPage() {
  const params = useWorkspaceSearchParams();
  const itemId = Number(params.get("id")) || null;
  const sourcePath = params.get("source") ? decodeURIComponent(params.get("source")!) : undefined;
  const sourceLabel = params.get("sourceLabel") ? decodeURIComponent(params.get("sourceLabel")!) : undefined;

  const [view, setView] = useState<ViewMode>("overall");
  const [data, setData] = useState<any>(null);
  const [detailedRows, setDetailedRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receiptType, setReceiptType] = useState<string>(ALL_TYPES);
  const [documentOrReceiptNo, setDocumentOrReceiptNo] = useState("");
  const [colorCardId, setColorCardId] = useState<string>(ALL_OPTION);
  const [lotBatch, setLotBatch] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>(ALL_OPTION);
  const [currentAccountId, setCurrentAccountId] = useState<string>(ALL_OPTION);
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ItemStatementFilters>({});

  // Detailed View's own dimension toggles — which of Color/Lot/Warehouse to group by, in
  // addition to Item (always implicit). Independent of the filters above: a filter narrows WHICH
  // rows are included; a dimension decides whether that attribute becomes its own balance row.
  const [dimColor, setDimColor] = useState(false);
  const [dimLot, setDimLot] = useState(false);
  const [dimWarehouse, setDimWarehouse] = useState(true);

  const [colorOptions, setColorOptions] = useState<any[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<any[]>([]);
  const [accountOptions, setAccountOptions] = useState<any[]>([]);

  // Client-side pagination over the already-fetched transaction list — purely a display concern,
  // no new API calls, no change to what's fetched or how totals/running balances are computed.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    plmApi.colors.list().then((r: any) => setColorOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.warehouses.list().then((r: any) => setWarehouseOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.accounts.list().then((r: any) => setAccountOptions(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const load = async (filters: ItemStatementFilters, currentView: ViewMode) => {
    setLoading(true);
    try {
      const r = await legacyErpApi.itemStatement.get(itemId, filters);
      setData(r);
      if (currentView === "detailed") {
        const rd = await legacyErpApi.itemStatement.getDetailed(itemId, filters, { color: dimColor, lot: dimLot, warehouse: dimWarehouse });
        setDetailedRows(Array.isArray(rd) ? rd : []);
      } else {
        setDetailedRows([]);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load item statement");
      setData(null);
      setDetailedRows([]);
    } finally {
      setLoading(false);
      setPage(1);
    }
  };

  useEffect(() => { load(appliedFilters, view); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [itemId, view, dimColor, dimLot, dimWarehouse]);

  const applyFilters = () => {
    const filters: ItemStatementFilters = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      receiptType: receiptType !== ALL_TYPES ? Number(receiptType) : undefined,
      documentOrReceiptNo: documentOrReceiptNo.trim() || undefined,
      colorCardId: colorCardId !== ALL_OPTION ? colorCardId : undefined,
      lotBatch: lotBatch.trim() || undefined,
      warehouseId: warehouseId !== ALL_OPTION ? Number(warehouseId) : undefined,
      currentAccountId: currentAccountId !== ALL_OPTION ? Number(currentAccountId) : undefined,
      itemCode: itemId == null ? (itemCode.trim() || undefined) : undefined,
      itemName: itemId == null ? (itemName.trim() || undefined) : undefined,
    };
    setAppliedFilters(filters);
    load(filters, view);
  };

  const resetFilters = () => {
    setDateFrom(""); setDateTo(""); setReceiptType(ALL_TYPES); setDocumentOrReceiptNo("");
    setColorCardId(ALL_OPTION); setLotBatch(""); setWarehouseId(ALL_OPTION); setCurrentAccountId(ALL_OPTION);
    setItemCode(""); setItemName("");
    setAppliedFilters({});
    load({}, view);
  };

  const hasActiveFilters = Object.values(appliedFilters).some((v) => v !== undefined);

  const breadcrumbTrail = useMemo(() => {
    const trail: { label: string; href?: string }[] = [{ label: "Legacy ERP" }];
    if (sourcePath && sourceLabel) trail.push({ label: sourceLabel, href: sourcePath });
    trail.push({ label: itemId != null ? "Item Statement" : "Stock Control / Inventory Ledger" });
    return trail;
  }, [sourcePath, sourceLabel, itemId]);

  const transactions = data?.transactions ?? [];
  const totalEntries = transactions.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const pagedTransactions = useMemo(
    () => transactions.slice((page - 1) * pageSize, page * pageSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, page, pageSize],
  );

  const exportCsv = () => {
    if (!transactions.length) return;
    const keys = gridColumns.displayColumnDefs.map((c) => c.key);
    const header = keys.map((k) => COLUMN_BY_KEY.get(k)!.label);
    const cellText = (row: any, key: ColKey): string => {
      switch (key) {
        case "date": return row.date ? format(new Date(row.date), "dd MMM yyyy") : "";
        case "documentReceiptNo": return row.documentNo || row.receiptNo || "";
        case "currentAccount": return row.currentAccountCode ? `${row.currentAccountCode} - ${row.currentAccountName || ""}` : "";
        case "color": return row.colorCode || row.colorName || "";
        case "quantityIn": return row.quantityIn != null ? String(row.quantityIn) : "";
        case "quantityOut": return row.quantityOut != null ? String(row.quantityOut) : "";
        case "runningBalance": return row.runningBalance != null ? String(row.runningBalance) : "";
        default: return row[key] != null ? String(row[key]) : "";
      }
    };
    const rows = transactions.map((row: any) => keys.map((k) => cellText(row, k)));
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `item-statement-${data?.item?.inventoryCode || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Column resize/reorder/hide/persist — shared across every grid via useGridColumns. One
  // storageKey for the whole screen (not per-item): the column LAYOUT preference is about how the
  // user likes to view any item's ledger, not about a specific item's data.
  const defaultHidden = useMemo<ColKey[]>(() => {
    const hidden: ColKey[] = ["currentAccount", "color", "lotBatch", "warehouse", "sourceWarehouse", "destinationWarehouse", "remarks"];
    if (itemId != null) hidden.push("itemCode", "itemName"); // redundant with the header tiles above
    return hidden;
  }, [itemId]);
  const gridColumns = useGridColumns<ColKey>({
    storageKey: "itemStatementGrid",
    columns: COLUMNS,
    defaultHidden,
  });
  const gridRootRef = useRef<HTMLDivElement>(null);
  const totalTableWidth = gridColumns.totalWidth();

  const dimCount = [dimColor, dimLot, dimWarehouse].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={breadcrumbTrail} />

      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <FileClock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight">
              {itemId != null ? "Item Statement" : "Stock Control / Inventory Ledger"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {itemId != null ? "Detailed inventory transaction history and stock position" : "Transaction history across items — filter by Item Code or Item Name"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load(appliedFilters, view)} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5 mr-2" />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} title="Export visible transactions to CSV">
            <Download className="h-3.5 w-3.5 mr-2" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} title="Print">
            <Printer className="h-3.5 w-3.5 mr-2" />Print
          </Button>
        </div>
      </div>

      {error ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
            <EmptyTitle>Unable to load statement</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {itemId != null && (
            <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/10 px-5 py-4 sm:grid-cols-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Item Code</div>
                <div className="mt-1 text-base font-semibold">{loading ? <Skeleton className="h-5 w-20" /> : (data?.item?.inventoryCode || "—")}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Item Name</div>
                <div className="mt-1 text-base font-semibold">{loading ? <Skeleton className="h-5 w-32" /> : (data?.item?.inventoryName || "—")}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Unit</div>
                <div className="mt-1 text-base font-semibold">{loading ? <Skeleton className="h-5 w-12" /> : (data?.item?.unit || "—")}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Overall Current Stock</div>
                <div className="mt-1 text-xl font-bold text-primary">
                  {/* Always InventoryCardService.getStockOnHand() — the module's one stock engine,
                     company-wide, unaffected by any filter/dimension/view on this page. */}
                  {loading ? <Skeleton className="h-5 w-16" /> : <>{data?.currentStockOnHand} {data?.item?.unit}</>}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-muted/10 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FilterField label="From Date">
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
              </FilterField>
              <FilterField label="To Date">
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
              </FilterField>
              <FilterField label="Transaction Type">
                <Select value={receiptType} onValueChange={setReceiptType}>
                  <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TYPES}>All Types</SelectItem>
                    {RECEIPT_TYPES.map((t) => <SelectItem key={t.receiptType} value={String(t.receiptType)}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Receipt No.">
                <Input
                  value={documentOrReceiptNo}
                  onChange={(e) => setDocumentOrReceiptNo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                  placeholder="Search receipt no..."
                  className="h-9 text-sm"
                />
              </FilterField>

              <FilterField label="Color">
                <Select value={colorCardId} onValueChange={setColorCardId}>
                  <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPTION}>All Colors</SelectItem>
                    {colorOptions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.code || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Lot / Batch">
                <Input
                  value={lotBatch}
                  onChange={(e) => setLotBatch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                  placeholder="Party/Lot no..."
                  className="h-9 text-sm"
                />
              </FilterField>
              <FilterField label="Variant">
                {/* No real Variant column exists on IM_ReceiptItem — this stays a disabled
                   placeholder purely for layout parity with the reference; it never feeds
                   appliedFilters. */}
                <Select value={ALL_OPTION} disabled>
                  <SelectTrigger className="h-9 w-full text-sm" disabled><SelectValue placeholder="All Variants" /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL_OPTION}>All Variants</SelectItem></SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Warehouse">
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPTION}>All Warehouses</SelectItem>
                    {warehouseOptions.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.warehouseCode}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Current Account">
                <Select value={currentAccountId} onValueChange={setCurrentAccountId}>
                  <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPTION}>All Accounts</SelectItem>
                    {accountOptions.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
              {itemId == null && (
                <>
                  <FilterField label="Item Code">
                    <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyFilters()} placeholder="Item code..." className="h-9 text-sm" />
                  </FilterField>
                  <FilterField label="Item Name">
                    <Input value={itemName} onChange={(e) => setItemName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyFilters()} placeholder="Item name..." className="h-9 text-sm" />
                  </FilterField>
                </>
              )}
              <div className="flex items-end gap-2">
                <Button size="sm" onClick={applyFilters} className="h-9 flex-1"><Filter className="h-3.5 w-3.5 mr-2" />Apply Filter</Button>
                <Button size="sm" variant="outline" onClick={resetFilters} className="h-9 flex-1"><RotateCcw className="h-3.5 w-3.5 mr-2" />Clear</Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="mb-3 text-sm font-semibold">View Mode</div>
            <div className="inline-flex items-center rounded-lg border p-1">
              <Button variant={view === "overall" ? "default" : "ghost"} size="sm" className="h-8 px-4" onClick={() => setView("overall")}>Overall View</Button>
              <Button variant={view === "detailed" ? "default" : "ghost"} size="sm" className="h-8 px-4" onClick={() => setView("detailed")}>Detailed View</Button>
            </div>
          </div>

          {view === "detailed" && (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/10 p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Group Balances By</span>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={dimColor} onCheckedChange={(v) => setDimColor(v === true)} />Color</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={dimLot} onCheckedChange={(v) => setDimLot(v === true)} />Lot/Batch</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={dimWarehouse} onCheckedChange={(v) => setDimWarehouse(v === true)} />Warehouse</label>
            </div>
          )}

          <div className={cn("grid grid-cols-1 gap-4", view === "detailed" && "lg:grid-cols-3")}>
            <div className={cn("rounded-lg border p-4", view === "detailed" && "lg:col-span-2")}>
              <div className="mb-3 text-sm font-semibold">
                Stock Summary <span className="font-normal text-muted-foreground">(As per Selected Filters)</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryCard label="Total Stock In" value={loading ? <Skeleton className="h-7 w-16" /> : (data?.totals?.totalIn ?? 0)} unit={data?.item?.unit} colorClass="text-emerald-600 dark:text-emerald-400" />
                <SummaryCard label="Total Stock Out" value={loading ? <Skeleton className="h-7 w-16" /> : (data?.totals?.totalOut ?? 0)} unit={data?.item?.unit} colorClass="text-rose-600 dark:text-rose-400" />
                <SummaryCard label="Closing Balance" value={loading ? <Skeleton className="h-7 w-16" /> : (data?.totals?.closingBalance ?? 0)} unit={data?.item?.unit} colorClass="text-primary" />
              </div>
              {!loading && data?.totals && (
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
                  <span>Opening Balance: <span className="font-medium text-foreground">{data.totals.openingBalance} {data?.item?.unit}</span></span>
                  {itemId != null && !hasActiveFilters && (
                    <>
                      <span>Difference from Overall Current Stock: <span className="font-medium text-foreground">{data.stockDifference} {data?.item?.unit}</span></span>
                      <Badge variant={data.stockReconciled ? "default" : "destructive"} className="text-[11px] font-normal">
                        {data.stockReconciled ? "Reconciled" : "Differs"}
                      </Badge>
                    </>
                  )}
                </div>
              )}
            </div>

            {view === "detailed" && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 text-sm font-semibold">
                  Stock by {[dimColor && "Color", dimLot && "Lot", dimWarehouse && "Warehouse"].filter(Boolean).join(" / ") || "Item"}{" "}
                  <span className="font-normal text-muted-foreground">(Current Balance)</span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {dimColor && <TableHead className="h-8 text-[11px]">Color</TableHead>}
                        {dimLot && <TableHead className="h-8 text-[11px]">Lot / Batch</TableHead>}
                        {dimWarehouse && <TableHead className="h-8 text-[11px]">Warehouse</TableHead>}
                        <TableHead className="h-8 text-right text-[11px]">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}><TableCell colSpan={dimCount + 1} className="py-2"><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                        ))
                      ) : detailedRows.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={dimCount + 1} className="py-6 text-center text-sm text-muted-foreground">No balances found</TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {detailedRows.map((row: any, i: number) => (
                            <TableRow key={i} className="hover:bg-muted/30">
                              {dimColor && <TableCell className="py-2 text-sm">{row.colorCode || row.colorName || "—"}</TableCell>}
                              {dimLot && <TableCell className="py-2 text-sm">{row.lotBatch || "—"}</TableCell>}
                              {dimWarehouse && <TableCell className="py-2 text-sm">{row.warehouseCode || "—"}</TableCell>}
                              <TableCell className="py-2 text-right text-sm font-medium">{row.closing}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="hover:bg-transparent font-semibold">
                            <TableCell colSpan={dimCount} className="py-2 text-sm">Total</TableCell>
                            <TableCell className="py-2 text-right text-sm text-primary">
                              {detailedRows.reduce((s: number, r: any) => s + (Number(r.closing) || 0), 0)}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border shadow-sm">
            <div ref={gridRootRef} className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-semibold">Transaction Details</div>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={gridColumns.manageColumns.openModal}>
                <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
                <colgroup>
                  {gridColumns.displayColumnDefs.map((c) => <col key={c.key} style={{ width: gridColumns.getWidth(c.key) }} />)}
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b bg-primary hover:bg-primary">
                    {gridColumns.displayColumnDefs.map((c, i) => {
                      const dragProps = gridColumns.getHeaderDragProps(c.key);
                      const def = COLUMN_BY_KEY.get(c.key)!;
                      return (
                        <TableHead
                          key={c.key}
                          className={cn("relative p-0", HEADER_CELL_BORDER, i === 0 && FIRST_COL_BORDER, gridColumns.dragOverColumn === c.key && "bg-primary-foreground/10")}
                          onDragOver={dragProps.onDragOver}
                          onDrop={dragProps.onDrop}
                        >
                          <div
                            draggable
                            onDragStart={dragProps.onDragStart}
                            onDragEnd={dragProps.onDragEnd}
                            data-col={c.key}
                            title={def.label}
                            className={cn(
                              HEADER_H, "flex w-full min-w-0 items-center truncate px-2 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/90 cursor-grab active:cursor-grabbing",
                              def.align === "right" && "justify-end",
                            )}
                          >
                            {def.label}
                          </div>
                          <div
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary-foreground/30"
                            onMouseDown={gridColumns.startResize(c.key)}
                            onDoubleClick={() => gridColumns.autoFitColumn(c.key, gridRootRef.current)}
                            title="Drag to resize · double-click to auto-fit"
                            aria-hidden="true"
                          />
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{gridColumns.displayColumnDefs.map((c) => <TableCell key={c.key} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : transactions.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={gridColumns.displayColumnDefs.length} className="py-12">
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon"><FileClock /></EmptyMedia>
                            <EmptyTitle>No transactions found</EmptyTitle>
                            <EmptyDescription>
                              {hasActiveFilters ? "Try widening the date range or clearing filters." : "No recorded receipts yet."}
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : pagedTransactions.map((row: any, i: number) => {
                    const cells: Record<ColKey, React.ReactNode> = {
                      date: row.date ? format(new Date(row.date), "dd MMM yyyy") : "—",
                      documentReceiptNo: (
                        <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.documentNo || row.receiptNo}</span>
                      ),
                      transactionType: (
                        <div className="flex items-center gap-1.5">
                          {row.transactionType}
                          {row.movementCategory === "UNKNOWN" && (
                            <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal text-muted-foreground">
                              <span title="No stock direction is confirmed for this receipt type.">Direction Unknown</span>
                            </Badge>
                          )}
                        </div>
                      ),
                      currentAccount: row.currentAccountCode ? `${row.currentAccountCode} — ${row.currentAccountName || ""}` : "—",
                      color: row.colorCode || row.colorName || "—",
                      lotBatch: row.lotBatch || "—",
                      warehouse: row.warehouseCode || "—",
                      sourceWarehouse: row.sourceWarehouseCode || "—",
                      destinationWarehouse: row.destinationWarehouseCode || "—",
                      itemCode: <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs">{row.itemCode}</span>,
                      itemName: row.itemName || "—",
                      unit: row.unit || "—",
                      quantityIn: row.quantityIn ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ArrowDownToLine className="h-3 w-3" />{row.quantityIn}</span> : <span className="text-muted-foreground">—</span>,
                      quantityOut: row.quantityOut ? <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"><ArrowUpFromLine className="h-3 w-3" />{row.quantityOut}</span> : <span className="text-muted-foreground">—</span>,
                      runningBalance: <span className="font-medium">{row.runningBalance}</span>,
                      remarks: row.remarks || "—",
                    };
                    return (
                      <TableRow key={i} className="hover:bg-muted/30">
                        {gridColumns.displayColumnDefs.map((c) => (
                          <TableCell key={c.key} className={cn("py-3 text-sm truncate", COLUMN_BY_KEY.get(c.key)!.align === "right" && "text-right")}>
                            {cells[c.key]}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {!loading && transactions.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalEntries)} of {totalEntries} entries
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">{page}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <ManageColumnsModal
              state={gridColumns.manageColumns}
              fixedColumns={[]}
              columns={COLUMNS}
              description="Show, hide and reorder columns."
            />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/10 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
              <span className="font-semibold text-foreground">Legends:</span>
              <span className="inline-flex items-center gap-1.5"><ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />Stock In (Increase)</span>
              <span className="inline-flex items-center gap-1.5"><ArrowUpFromLine className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />Stock Out (Decrease)</span>
              <span className="inline-flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5 text-primary" />Transfer (Between Warehouses)</span>
            </div>
            <div className="rounded-md bg-primary/5 px-3 py-1.5 text-muted-foreground">
              <span className="font-semibold text-foreground">Note:</span> Overall Current Stock is the total of all colors, lots, variants and warehouses.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
