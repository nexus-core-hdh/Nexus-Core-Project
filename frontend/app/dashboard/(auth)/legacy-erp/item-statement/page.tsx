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
  FileClock, RefreshCw, Search, XCircle, ArrowDownToLine, ArrowUpFromLine,
  Package, SearchX, ListOrdered, LayoutGrid, Rows3,
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

type ViewMode = "overall" | "detailed";
type ColKey =
  | "date" | "documentReceiptNo" | "transactionType" | "currentAccount"
  | "color" | "lotBatch" | "warehouse" | "sourceWarehouse" | "destinationWarehouse"
  | "itemCode" | "itemName" | "unit" | "quantityIn" | "quantityOut" | "runningBalance" | "remarks";

interface ColumnDef { key: ColKey; label: string; align?: "left" | "right"; defaultWidth: number; minWidth: number }

// Variant is deliberately NOT a column here (nor a filter, nor a Detailed View dimension) — there
// is no real Variant column anywhere on IM_ReceiptItem (confirmed against the live table); the
// only "Variant" fields that exist in this codebase are free-text UI scaffolding on unrelated
// Purchase Order lines, never persisted to this table. Shipping a column that can never hold real
// data — even hidden by default — would misrepresent what this ledger can actually show.
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
const FIRST_COL_BORDER = "border-l border-border";
const HEADER_H = "h-10";

function StatTile({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        <Icon className="h-3 w-3" />{label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
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

  useEffect(() => {
    plmApi.colors.list().then((r: any) => setColorOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.warehouses.list().then((r: any) => setWarehouseOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.accounts.list().then((r: any) => setAccountOptions(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const load = async (filters: ItemStatementFilters, currentView: ViewMode) => {
    setLoading(true);
    try {
      if (currentView === "overall") {
        const r = await legacyErpApi.itemStatement.get(itemId, filters);
        setData(r);
      } else {
        const r = await legacyErpApi.itemStatement.getDetailed(itemId, filters, { color: dimColor, lot: dimLot, warehouse: dimWarehouse });
        setDetailedRows(Array.isArray(r) ? r : []);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load item statement");
      setData(null);
      setDetailedRows([]);
    } finally {
      setLoading(false);
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

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={breadcrumbTrail} />

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <FileClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
              {itemId != null ? "Item Statement" : "Stock Control / Inventory Ledger"}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data?.item ? `${data.item.inventoryCode} — ${data.item.inventoryName}` : itemId != null ? "Complete transaction history for a single inventory item" : "Transaction history across items — filter by Item Code or Item Name"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5">
            <Button variant={view === "overall" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setView("overall")}>
              <Rows3 className="h-3.5 w-3.5 mr-2" />Overall
            </Button>
            <Button variant={view === "detailed" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setView("detailed")}>
              <LayoutGrid className="h-3.5 w-3.5 mr-2" />Detailed
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => load(appliedFilters, view)} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5 mr-2" />Refresh
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile icon={Package} label="Code" value={loading ? <Skeleton className="h-4 w-20" /> : (
                <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs">{data?.item?.inventoryCode}</span>
              )} />
              <StatTile icon={Package} label="Name" value={loading ? <Skeleton className="h-4 w-32" /> : data?.item?.inventoryName} />
              <StatTile icon={Package} label="Unit" value={loading ? <Skeleton className="h-4 w-12" /> : (data?.item?.unit || "—")} />
              <StatTile icon={Package} label="Overall Current Stock" value={loading ? <Skeleton className="h-4 w-16" /> : (
                // Always InventoryCardService.getStockOnHand() — the module's one stock engine,
                // company-wide, unaffected by any filter/dimension/view on this page.
                <span className="font-semibold">{data?.currentStockOnHand} {data?.item?.unit}</span>
              )} />
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/10 p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">From Date</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">To Date</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Transaction Type</label>
              <Select value={receiptType} onValueChange={setReceiptType}>
                <SelectTrigger className="h-9 w-56 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TYPES}>All Types</SelectItem>
                  {RECEIPT_TYPES.map((t) => <SelectItem key={t.receiptType} value={String(t.receiptType)}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Document/Receipt No.</label>
              <Input
                value={documentOrReceiptNo}
                onChange={(e) => setDocumentOrReceiptNo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="Search document/receipt no..."
                className="h-9 w-44 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Color</label>
              <Select value={colorCardId} onValueChange={setColorCardId}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>All Colors</SelectItem>
                  {colorOptions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.code || c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Lot/Batch</label>
              <Input
                value={lotBatch}
                onChange={(e) => setLotBatch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="Party/Lot no..."
                className="h-9 w-32 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Warehouse</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>All Warehouses</SelectItem>
                  {warehouseOptions.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.warehouseCode}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Current Account</label>
              <Select value={currentAccountId} onValueChange={setCurrentAccountId}>
                <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>All Accounts</SelectItem>
                  {accountOptions.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {itemId == null && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Item Code</label>
                  <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyFilters()} placeholder="Item code..." className="h-9 w-32 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Item Name</label>
                  <Input value={itemName} onChange={(e) => setItemName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyFilters()} placeholder="Item name..." className="h-9 w-40 text-sm" />
                </div>
              </>
            )}
            <Button size="sm" onClick={applyFilters} className="h-9"><Search className="h-3.5 w-3.5 mr-2" />Apply</Button>
            {hasActiveFilters && (
              <Button size="sm" variant="outline" onClick={resetFilters} className="h-9"><XCircle className="h-3.5 w-3.5 mr-2" />Reset</Button>
            )}
          </div>

          {view === "detailed" && (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/10 p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Group Balances By</span>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={dimColor} onCheckedChange={(v) => setDimColor(v === true)} />Color</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={dimLot} onCheckedChange={(v) => setDimLot(v === true)} />Lot/Batch</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={dimWarehouse} onCheckedChange={(v) => setDimWarehouse(v === true)} />Warehouse</label>
            </div>
          )}

          {view === "overall" ? (
            <div className="overflow-hidden rounded-xl border shadow-sm">
              <div ref={gridRootRef} className="flex items-center justify-end gap-2 border-b px-3 py-2">
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
                    <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                      {gridColumns.displayColumnDefs.map((c, i) => {
                        const dragProps = gridColumns.getHeaderDragProps(c.key);
                        const def = COLUMN_BY_KEY.get(c.key)!;
                        return (
                          <TableHead
                            key={c.key}
                            className={cn("relative p-0", CELL_BORDER, i === 0 && FIRST_COL_BORDER, gridColumns.dragOverColumn === c.key && "bg-primary/15")}
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
                                HEADER_H, "flex w-full min-w-0 items-center truncate px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 cursor-grab active:cursor-grabbing",
                                def.align === "right" && "justify-end",
                              )}
                            >
                              {def.label}
                            </div>
                            <div
                              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
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
                    ) : transactions.map((row: any, i: number) => {
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

              {!loading && data?.totals && (
                <div className="flex flex-wrap items-center justify-end gap-6 border-t bg-muted/20 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Opening Balance: <span className="font-semibold text-foreground">{data.totals.openingBalance} {data?.item?.unit}</span></span>
                  <span className="text-muted-foreground">Total Stock In: <span className="font-semibold text-foreground">{data.totals.totalIn} {data?.item?.unit}</span></span>
                  <span className="text-muted-foreground">Total Stock Out: <span className="font-semibold text-foreground">{data.totals.totalOut} {data?.item?.unit}</span></span>
                  <span className="text-muted-foreground">Closing Balance: <span className="font-semibold text-foreground">{data.totals.closingBalance} {data?.item?.unit}</span></span>
                  {itemId != null && !hasActiveFilters && (
                    <>
                      <span className="text-muted-foreground">Difference from Overall Current Stock: <span className="font-semibold text-foreground">{data.stockDifference} {data?.item?.unit}</span></span>
                      <Badge variant={data.stockReconciled ? "default" : "destructive"} className="text-[11px] font-normal">
                        {data.stockReconciled ? "Reconciled" : "Differs"}
                      </Badge>
                    </>
                  )}
                </div>
              )}

              <ManageColumnsModal
                state={gridColumns.manageColumns}
                fixedColumns={[]}
                columns={COLUMNS}
                description="Show, hide and reorder columns."
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border shadow-sm">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                      <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Item Code</TableHead>
                      <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Item Name</TableHead>
                      {dimColor && <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Color</TableHead>}
                      {dimLot && <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Lot/Batch</TableHead>}
                      {dimWarehouse && <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Warehouse</TableHead>}
                      <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Opening Balance</TableHead>
                      <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Stock In</TableHead>
                      <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Stock Out</TableHead>
                      <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Closing Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={8} className="py-3"><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                      ))
                    ) : detailedRows.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="py-12">
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon"><FileClock /></EmptyMedia>
                              <EmptyTitle>No balances found</EmptyTitle>
                              <EmptyDescription>Try widening the date range or clearing filters.</EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        </TableCell>
                      </TableRow>
                    ) : detailedRows.map((row: any, i: number) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="py-3"><span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs">{row.itemCode}</span></TableCell>
                        <TableCell className="py-3 text-sm">{row.itemName}</TableCell>
                        {dimColor && <TableCell className="py-3 text-sm">{row.colorCode || row.colorName || "—"}</TableCell>}
                        {dimLot && <TableCell className="py-3 text-sm">{row.lotBatch || "—"}</TableCell>}
                        {dimWarehouse && <TableCell className="py-3 text-sm">{row.warehouseCode || "—"}</TableCell>}
                        <TableCell className="py-3 text-right text-sm">{row.opening}</TableCell>
                        <TableCell className="py-3 text-right text-sm text-emerald-600 dark:text-emerald-400">{row.in || "—"}</TableCell>
                        <TableCell className="py-3 text-right text-sm text-rose-600 dark:text-rose-400">{row.out || "—"}</TableCell>
                        <TableCell className="py-3 text-right text-sm font-medium">{row.closing}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
