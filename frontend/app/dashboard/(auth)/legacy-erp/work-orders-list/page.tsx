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
import { Search, RefreshCw, Plus, Eye, Pencil, Trash2, ClipboardList, SearchX, ChevronRight, MousePointerClick, XCircle } from "lucide-react";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";
import { workOrderListColumns } from "@/components/legacy-erp/work-orders-lookup";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useServerPaging } from "@/hooks/legacy-erp/use-server-paging";
import { ListPager } from "@/components/legacy-erp/list-pager";
import type { PageRequest } from "@/lib/nexuscore-api";

// List screen for the new Work Order transaction screen — same List+Detail convention every
// other Legacy ERP module already uses (fabric-cards-list.tsx, purchase-orders-list.tsx, ...),
// reusing WorklistTable (the shared grid component) directly with a static column set rather than
// the full customizable-worklist backend layer (worklist-fields.service.ts), which has no entry
// registered for this brand-new screen yet — deferred, see final report.
type SortKey = "workOrderNo" | "workOrderDate";

const WORK_ORDERS_LIST_PATH = "/dashboard/legacy-erp/work-orders-list";

export default function WorkOrderListPage() {
  const router = useRouter();
  // Lookup mode (mode=lookup&requestId=&returnTab=) — the full-screen Work Order lookup that
  // MasterAutocompleteField's F2/search icon opens for masterKey "manufacturing-order" (Cutting
  // Card, Fabric/Yarn Requirements, Order Manufacturing Entry). Returns the picked Work Order the
  // same way inventory-cards-list / yarn-cards-list do, as { id, code, name } = its WorkOrderNo,
  // matching that master key's own lookupTable("manufacturing-order") options.
  const params = useWorkspaceSearchParams();
  const mode = params.get("mode") === "lookup" ? "lookup" : "manage";
  const requestId = params.get("requestId") || undefined;
  const returnTab = params.get("returnTab") ? decodeURIComponent(params.get("returnTab")!) : undefined;
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);
  const closeSelf = () => {
    closeTab(tabCtx?.tabKey ?? WORK_ORDERS_LIST_PATH);
    if (returnTab) {
      activateTab(returnTab.split("?")[0]);
      router.replace(returnTab, { scroll: false });
    } else {
      router.back();
    }
  };
  const returnAndClose = (row: any) => {
    if (mode !== "lookup" || !requestId) return;
    resolveLookup(requestId, { id: row.id, code: row.workOrderNo, name: row.workOrderNo });
    closeSelf();
  };

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);
  // Server-side paging + sorting: the API searches/sorts every work order, then returns one page.
  const paging = useServerPaging({ defaultSortBy: "workOrderNo", defaultSortDir: "desc" });

  const load = async (term?: string, req: PageRequest = paging.request) => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.workOrders.list(term, req);
      setRows(paging.take(r));
    } catch (e: any) {
      toast.error(e.message || "Failed to load work orders");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);
  paging.reloadRef.current = () => load(search.trim() || undefined);

  const doSearch = () => load(search.trim() || undefined, paging.firstPage());
  const refresh = () => { setSearch(""); load(undefined, paging.firstPage()); };

  // Customize Worklist — the shared worklist mechanism (useWorklist + WorklistBar +
  // WorklistDesignModal), same wiring as Inventory Card List: this screen's list() rows already
  // carry every MA_WorkOrder header column the "work-order" field source offers
  // (worklist-fields.service.ts), so a custom worklist is a client-side projection/reorder of the
  // loaded rows — no resolve() round-trip, no refetch on switch/save. Worklist field keys are the
  // raw PascalCase column names ("work-order:WorkOrderNo"); list() rows use their camelCase form.
  const wl = useWorklist({ storageKey: "workOrdersListWorklists" });
  const activeColumns = wl.activeWorklist ? wl.columnsFor([]) : null;
  const rowKeyOf = (fieldKey: string) => {
    const raw = fieldKey.slice(fieldKey.indexOf(":") + 1);
    return raw.charAt(0).toLowerCase() + raw.slice(1);
  };
  // Standard = the shared Work Order columns (also used by the Work Orders List lookup popup,
  // components/legacy-erp/work-orders-lookup.tsx).
  const columns: WorklistTableColumn<any>[] = useMemo(
    () => (activeColumns
      ? activeColumns.map((c) => ({ key: c, label: wl.columnLabel(c), render: (row: any) => formatCell(row[rowKeyOf(c)]) }))
      : workOrderListColumns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeColumns],
  );

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

  // Rows arrive already sorted by the server (sorting a single page client-side would misorder
  // the list as a whole).
  const sortedRows = rows;

  // Project-wide grid selection standard (hooks/use-row-selection.ts) — plain/ctrl/shift-click +
  // right-click preserve/collapse highlighting. Existing per-row `getRowActions`/`wrapRow`/
  // `renderRowActions` below are untouched: they keep operating on the single right-clicked/
  // double-clicked row exactly as before, since this screen has no bulk action yet to feed a
  // multi-row selection into.
  const { selectedIds, selectRow, handleRowContextMenu } = useRowSelection(sortedRows);

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
              <p className="text-xs text-muted-foreground">
                {mode === "lookup" ? "Double-click or click Select to choose a work order" : "Manufacturing work orders"}
              </p>
              {!loading && (
                <Badge variant="secondary" className="h-5 text-[11px] font-normal">
                  {paging.total.toLocaleString()} {paging.total === 1 ? "record" : "records"}
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
        {mode !== "lookup" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateOrOpenTab(router, "/dashboard/legacy-erp/fabric-planning")}>
              <ClipboardList className="h-3.5 w-3.5 mr-2" />Fabric Planning
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateOrOpenTab(router, "/dashboard/legacy-erp/trim-planning")}>
              <ClipboardList className="h-3.5 w-3.5 mr-2" />Trim Planning
            </Button>
            <Button size="sm" onClick={createNew}>
              <Plus className="h-3.5 w-3.5 mr-2" />Create New
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <WorklistTable
          columns={columns}
          rows={sortedRows}
          storageKey="workOrdersList"
          getRowKey={(row) => row.id}
          loading={loading}
          sortKey={paging.sortBy}
          sortDir={paging.sortDir}
          onSort={(key) => paging.toggleSort(key)}
          onRowDoubleClick={(row) => (mode === "lookup" ? returnAndClose(row) : view(row.id))}
          selectedIds={selectedIds}
          onRowClick={selectRow}
          onRowContextMenu={handleRowContextMenu}
          renderRowActions={(row) => (
            mode === "lookup" ? (
              <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); returnAndClose(row); }}>
                <MousePointerClick className="h-3.5 w-3.5 mr-1.5" />Select
              </Button>
            ) : (
              <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
            )
          )}
          wrapRow={(row, el) => (mode === "lookup" ? el : <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>)}
          emptyState={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{searched ? <SearchX /> : <ClipboardList />}</EmptyMedia>
                <EmptyTitle>{searched ? "Record not found" : "No work orders yet"}</EmptyTitle>
                <EmptyDescription>
                  {searched ? "You can create a new Work Order." : 'Click "Create New" to add your first Work Order.'}
                </EmptyDescription>
              </EmptyHeader>
              {mode !== "lookup" && (
                <EmptyContent>
                  <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Create New</Button>
                </EmptyContent>
              )}
            </Empty>
          }
        />
        <ListPager paging={paging} loading={loading} />
      </div>

      <WorklistBar
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        onActiveWorklistChange={wl.setActiveWorklistId}
        onDesignOpen={() => wl.setDesignOpen(true)}
      />

      <WorklistDesignModal
        open={wl.designOpen}
        onOpenChange={wl.setDesignOpen}
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        activeTableSource="work-order"
        primaryScope="work-order-list"
        gridLabel="the Work Orders List grid"
        onSave={async (next: Worklist[]) => { await wl.saveWorklists(next); }}
      />

      {mode === "lookup" && (
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="outline" size="sm" onClick={closeSelf}><XCircle className="h-3.5 w-3.5 mr-2" />Close</Button>
        </div>
      )}

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
