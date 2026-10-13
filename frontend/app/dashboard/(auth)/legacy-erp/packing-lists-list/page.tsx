"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useServerPaging } from "@/hooks/legacy-erp/use-server-paging";
import { ListPager } from "@/components/legacy-erp/list-pager";
import type { PageRequest } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { Search, RefreshCw, Plus, Eye, Pencil, Trash2, Package, SearchX, ChevronRight } from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { worklistCellValue } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";
import { useRowSelection } from "@/hooks/use-row-selection";

// Packing List listing — IM_PackagingList (legacy-erp/packing-lists, packing-list.service.ts). Same
// listing shape as the other legacy lists (trim-cards-list/page.tsx); Add/View/Edit open the
// Packing List form (../packing-lists/page.tsx) as its own workspace record tab.
const FORM_PATH = "/dashboard/legacy-erp/packing-lists";

const formatDate = (v: unknown) => (v ? String(v).slice(0, 10) : "");

export default function PackingListListPage() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; packagingNo: string } | null>(null);
  const paging = useServerPaging({ defaultSortBy: "packagingNo", defaultSortDir: "desc" });

  // Customize Worklist — list() rows already carry every IM_PackagingList header column the
  // "packing-list" field source offers (worklist-fields.service.ts), so a custom worklist is a
  // client-side projection of the loaded rows, exactly like Work Orders List. Field keys are the raw
  // PascalCase column names ("packing-list:PackagingNo"); rows use their camelCase form.
  const wl = useWorklist({ storageKey: "packingListsListWorklists" });
  const activeColumns = wl.activeWorklist ? wl.columnsFor([]) : null;
  const rowKeyOf = (fieldKey: string) => {
    const raw = fieldKey.slice(fieldKey.indexOf(":") + 1);
    return raw.charAt(0).toLowerCase() + raw.slice(1);
  };

  const load = async (term?: string, req: PageRequest = paging.request) => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.packingLists.list(term, req);
      setRows(paging.take(r));
    } catch (e: any) {
      toast.error(e.message || "Failed to load Packing Lists");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  paging.reloadRef.current = () => load(search.trim() || undefined);

  const doSearch = () => load(search.trim() || undefined, paging.firstPage());
  const refresh = () => { setSearch(""); load(undefined, paging.firstPage()); };

  const columns: WorklistTableColumn<any>[] = useMemo(() => {
    if (activeColumns) {
      return activeColumns.map((c) => ({ key: c, label: wl.columnLabel(c), render: (row: any) => formatCell(worklistCellValue(row, rowKeyOf(c))) }));
    }
    const dash = <span className="text-muted-foreground">—</span>;
    return [
      { key: "packagingNo", label: "Packing No", sortable: true, render: (row: any) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.packagingNo}</span> },
      { key: "packagingDate", label: "Packing Date", sortable: true, render: (row: any) => formatDate(row.packagingDate) || dash },
      { key: "workOrderNo", label: "Order No", sortable: true, render: (row: any) => <span className="font-mono text-xs">{row.workOrderNo || "—"}</span> },
      { key: "customerName", label: "Customer", sortable: true, render: (row: any) => <span className="font-medium">{row.customerName || dash}</span> },
      { key: "customerOrderNo", label: "Customer Order No", render: (row: any) => row.customerOrderNo || dash },
      { key: "factoryName", label: "Factory", render: (row: any) => row.factoryName || dash },
      { key: "shipmentDate", label: "Shipment Date", sortable: true, render: (row: any) => formatDate(row.shipmentDate) || dash },
      { key: "shipmentReceiptNo", label: "Shipment", render: (row: any) => row.shipmentReceiptNo ? <span className="font-mono text-xs">{row.shipmentReceiptNo}</span> : dash },
      {
        key: "status", label: "Status",
        render: (row: any) => (
          <Badge variant={row.isApproved ? "default" : "secondary"} className="text-[11px] font-normal">
            {row.isApproved ? "Approved" : "Unapproved"}
          </Badge>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeColumns]);

  const view = (id: number) => navigateOrOpenTab(router, `${FORM_PATH}?id=${id}&mode=view`);
  const update = (id: number) => navigateOrOpenTab(router, `${FORM_PATH}?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `${FORM_PATH}?mode=create`);

  const getRowActions = (row: any): RowAction[] => [
    { key: "view", label: "View", icon: Eye, onSelect: () => view(row.id) },
    { key: "update", label: "Update", icon: Pencil, onSelect: () => update(row.id) },
    { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget({ id: row.id, packagingNo: row.packagingNo }), destructive: true, separatorBefore: true, disabled: !!row.isApproved },
  ];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await legacyErpApi.packingLists.delete(deleteTarget.id);
      toast.success(`Packing List ${deleteTarget.packagingNo} deleted`);
      setDeleteTarget(null);
      load(search.trim() || undefined);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const { selectedIds, selectRow, handleRowContextMenu } = useRowSelection(rows);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Packing List</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Packing List</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Box-by-box packing of Work Orders, per Order size</p>
              {!loading && (
                <Badge variant="secondary" className="h-5 text-[11px] font-normal">
                  {paging.total.toLocaleString()} {paging.total === 1 ? "record" : "records"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-72 shrink-0">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by packing no, order no, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <Button size="sm" onClick={createNew}>
            <Plus className="h-3.5 w-3.5 mr-2" />Add Packing List
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <WorklistTable
          columns={columns}
          rows={rows}
          storageKey="packingListsList"
          getRowKey={(row) => row.id}
          loading={loading}
          sortKey={paging.sortBy}
          sortDir={paging.sortDir}
          onSort={(key) => paging.toggleSort(key)}
          selectedIds={selectedIds}
          onRowClick={selectRow}
          onRowContextMenu={handleRowContextMenu}
          onRowDoubleClick={(row) => view(row.id)}
          renderRowActions={(row) => (
            <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
          wrapRow={(row, el) => <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>}
          emptyState={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{searched ? <SearchX /> : <Package />}</EmptyMedia>
                <EmptyTitle>{searched ? "No Packing List found" : "No Packing Lists yet"}</EmptyTitle>
                <EmptyDescription>
                  {searched ? "Try another number, Work Order or customer." : 'Click "Add Packing List" to pack your first Work Order.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Add Packing List</Button>
              </EmptyContent>
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
        activeTableSource="packing-list"
        primaryScope="packing-list-list"
        gridLabel="the Packing List grid"
        onSave={async (next) => { await wl.saveWorklists(next); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Packing List</AlertDialogTitle>
            <AlertDialogDescription>Delete Packing List {deleteTarget?.packagingNo}? Its lines are removed with it.</AlertDialogDescription>
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
