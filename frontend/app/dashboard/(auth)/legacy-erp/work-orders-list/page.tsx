"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { Search, RefreshCw, Plus, Eye, Pencil, Trash2, ClipboardList, SearchX, ChevronRight } from "lucide-react";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";

// List screen for the new Work Order transaction screen — same List+Detail convention every
// other Legacy ERP module already uses (fabric-cards-list.tsx, purchase-orders-list.tsx, ...),
// reusing WorklistTable (the shared grid component) directly with a static column set rather than
// the full customizable-worklist backend layer (worklist-fields.service.ts), which has no entry
// registered for this brand-new screen yet — deferred, see final report.
type SortKey = "workOrderNo" | "workOrderDate";

export default function WorkOrderListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("workOrderNo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async (term?: string) => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.workOrders.list(term);
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load work orders");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = () => load(search.trim() || undefined);
  const refresh = () => { setSearch(""); load(); };

  const columns: WorklistTableColumn<any>[] = [
    {
      key: "workOrderNo", label: "Order No", sortable: true,
      render: (row: any) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.workOrderNo}</span>,
    },
    {
      key: "workOrderDate", label: "Date", sortable: true,
      render: (row: any) => (row.workOrderDate ? new Date(row.workOrderDate).toLocaleDateString() : "—"),
    },
    { key: "uD_Brands", label: "Brand", render: (row: any) => row.uD_Brands || <span className="text-muted-foreground">—</span> },
    { key: "quantity", label: "Quantity", render: (row: any) => (row.quantity != null ? Number(row.quantity).toLocaleString() : "—") },
    {
      key: "isClosed", label: "Status",
      render: (row: any) => (
        <Badge variant={row.isClosed ? "secondary" : "default"} className={row.isClosed ? "text-[11px] font-normal" : "text-[11px] font-normal bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-500"}>
          {row.isClosed ? "Closed" : "Open"}
        </Badge>
      ),
    },
  ];

  const getRowActions = (row: any): RowAction[] => [
    { key: "view", label: "View", icon: Eye, onSelect: () => view(row.id) },
    { key: "update", label: "Update", icon: Pencil, onSelect: () => update(row.id) },
    { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget({ id: row.id, code: row.workOrderNo }), destructive: true, separatorBefore: true },
  ];

  const view = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/work-orders?id=${id}&mode=view`);
  const update = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/work-orders?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/legacy-erp/work-orders?mode=create`);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await legacyErpApi.workOrders.remove(deleteTarget.id);
      toast.success("Work order deleted");
      setDeleteTarget(null);
      load(search.trim() || undefined);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleSort = (key: string) => {
    const k = key as SortKey;
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Work Orders</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Work Orders</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Manufacturing work orders</p>
              {!loading && (
                <Badge variant="secondary" className="h-5 text-[11px] font-normal">
                  {rows.length} {rows.length === 1 ? "record" : "records"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-72 shrink-0">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by Order No..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" onClick={createNew}>
          <Plus className="h-3.5 w-3.5 mr-2" />Create New
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <WorklistTable
          columns={columns}
          rows={sortedRows}
          storageKey="workOrdersList"
          getRowKey={(row) => row.id}
          loading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          onRowDoubleClick={(row) => view(row.id)}
          renderRowActions={(row) => (
            <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
          wrapRow={(row, el) => <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>}
          emptyState={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{searched ? <SearchX /> : <ClipboardList />}</EmptyMedia>
                <EmptyTitle>{searched ? "Record not found" : "No work orders yet"}</EmptyTitle>
                <EmptyDescription>
                  {searched ? "You can create a new Work Order." : 'Click "Create New" to add your first Work Order.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Create New</Button>
              </EmptyContent>
            </Empty>
          }
        />
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Work Order</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this record?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
