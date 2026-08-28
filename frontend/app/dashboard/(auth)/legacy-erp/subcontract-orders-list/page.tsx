"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi, approvalConfigApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import {
  Search, RefreshCw, Plus, Eye, Pencil, Trash2, Factory, SearchX,
  ChevronRight,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";

// Subcontract Order list — same architecture as purchase-orders-list/page.tsx (Order Screen
// Replication's second entry), reusing the exact same components/patterns. Customize Worklist
// reuses the EXISTING "purchase-order" field source (identical HEADER_COLUMNS, same table) via a
// new "subcontract-order-list" scope in worklist-fields.service.ts's ALLOWED_SOURCES_BY_PRIMARY —
// not a new WorklistSource. Import Related Receipt / Pending Orders / approval live on the detail
// screen only, matching Purchase Order's own list-vs-detail split.
const client = legacyErpApi.orders(3);
type SortKey = "receiptNo" | "documentNo" | "receiptDate";
type ApprovalFilter = "all" | "approved" | "unapproved" | "rejected";
// General Settings -> Approval Configuration screenKey for this screen — must match
// purchase-order.service.ts's own screenKeyFor(3) exactly.
const APPROVAL_SCREEN_KEY = "/dashboard/legacy-erp/subcontract-orders-list";

function ApprovalStatusBadge({ status }: { status?: string }) {
  if (status === "approved") return <Badge className="h-5 text-[11px] font-normal">Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="h-5 text-[11px] font-normal">Rejected</Badge>;
  return <Badge variant="secondary" className="h-5 text-[11px] font-normal">Unapproved</Badge>;
}

export default function SubcontractOrderListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("receiptNo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const wl = useWorklist({ storageKey: "subcontractOrdersListWorklists" });

  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  useEffect(() => {
    approvalConfigApi.list()
      .then((r: any) => {
        const found = Array.isArray(r) ? r.find((c: any) => c.screenKey === APPROVAL_SCREEN_KEY) : null;
        setApprovalRequired(!!found?.approvalRequired);
      })
      .catch(() => {});
  }, []);

  const load = async (term?: string, worklistOverride?: Worklist | null, statusOverride?: ApprovalFilter) => {
    setLoading(true);
    try {
      const worklist = worklistOverride !== undefined ? worklistOverride : wl.activeWorklist;
      const status = statusOverride ?? approvalFilter;
      const r: any = worklist
        ? await legacyErpApi.worklistFields.resolve("subcontract-order-list", worklist.fields.map((f) => ({ source: f.source, key: f.key })), term)
        : await client.list(term, status === "all" ? undefined : status);
      const list = Array.isArray(r) ? r : [];
      setRows(worklist ? wl.normalizeRows(list) : list);
    } catch (e: any) {
      toast.error(e.message || "Failed to load subcontract orders");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = () => load(search.trim() || undefined);
  const refresh = () => { setSearch(""); load(); };
  const onApprovalFilterChange = (value: ApprovalFilter) => {
    setApprovalFilter(value);
    load(search.trim() || undefined, undefined, value);
  };

  const onWorklistChange = (id: string) => {
    const worklist = id === STANDARD_WORKLIST_ID ? null : wl.worklists.find((w) => w.id === id) ?? null;
    wl.setActiveWorklistId(id);
    load(search.trim() || undefined, worklist);
  };

  const handleSaveWorklists = async (next: Worklist[]) => {
    const { activeWorklist } = await wl.saveWorklists(next);
    load(search.trim() || undefined, activeWorklist);
  };

  const activeColumns = wl.activeWorklist ? wl.columnsFor([]) : null;

  // Unified column model for WorklistTable — see purchase-orders-list/page.tsx's own comment
  // for the full rationale. Only the Standard columns are ever `sortable: true`.
  const columns: WorklistTableColumn<any>[] = useMemo(() => {
    if (activeColumns) {
      return activeColumns.map((c) => ({
        key: c,
        label: wl.columnLabel(c),
        render: (row: any) => formatCell(row[c]),
      }));
    }
    const cols: WorklistTableColumn<any>[] = [
      {
        key: "receiptNo", label: "Receipt No", sortable: true,
        render: (row: any) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.receiptNo}</span>,
      },
      {
        key: "receiptDate", label: "Order Date", sortable: true,
        render: (row: any) => (row.receiptDate ? new Date(row.receiptDate).toLocaleDateString() : "—"),
      },
      {
        key: "documentNo", label: "Document No", sortable: true,
        render: (row: any) => row.documentNo || <span className="text-muted-foreground">—</span>,
      },
      {
        key: "grandTotal", label: "Grand Total",
        render: (row: any) => (row.grandTotal != null ? Number(row.grandTotal).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"),
      },
    ];
    if (approvalRequired) {
      cols.push({ key: "approvalStatus", label: "Approval Status", render: (row: any) => <ApprovalStatusBadge status={row.approvalStatus} /> });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeColumns, approvalRequired]);

  const getRowActions = (row: any): RowAction[] => [
    { key: "view", label: "View", icon: Eye, onSelect: () => view(row.id) },
    { key: "update", label: "Update", icon: Pencil, onSelect: () => update(row.id) },
    { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget({ id: row.id, code: row.receiptNo }), destructive: true, separatorBefore: true },
  ];

  const view = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/subcontract-orders?id=${id}&mode=view`);
  const update = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/subcontract-orders?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/legacy-erp/subcontract-orders?mode=create`);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await client.delete(deleteTarget.id);
      toast.success("Subcontract order deleted");
      setDeleteTarget(null);
      load(search.trim() || undefined);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
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
        <span className="font-medium text-foreground">Subcontract Orders</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Factory className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Subcontract Orders</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Subcontract order receipts</p>
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
              placeholder="Search by Receipt No or Document No..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {approvalRequired && (
            <Select value={approvalFilter} onValueChange={(v) => onApprovalFilterChange(v as ApprovalFilter)}>
              <SelectTrigger size="sm" className="h-9 w-40">
                <SelectValue placeholder="Approval Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="unapproved">Unapproved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <Button size="sm" onClick={createNew}>
          <Plus className="h-3.5 w-3.5 mr-2" />Create New
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <WorklistTable
          columns={columns}
          rows={sortedRows}
          storageKey="subcontractOrdersList"
          getRowKey={(row) => row.id}
          loading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => toggleSort(key as SortKey)}
          onRowDoubleClick={(row) => view(row.id)}
          renderRowActions={(row) => (
            <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
          wrapRow={(row, el) => <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>}
          emptyState={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{searched ? <SearchX /> : <Factory />}</EmptyMedia>
                <EmptyTitle>{searched ? "Record not found" : "No subcontract orders yet"}</EmptyTitle>
                <EmptyDescription>
                  {searched ? "You can create a new Subcontract Order." : 'Click "Create New" to add your first Subcontract Order.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Create New</Button>
              </EmptyContent>
            </Empty>
          }
        />
      </div>

      <WorklistBar
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        onActiveWorklistChange={onWorklistChange}
        onDesignOpen={() => wl.setDesignOpen(true)}
      />

      <WorklistDesignModal
        open={wl.designOpen}
        onOpenChange={wl.setDesignOpen}
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        activeTableSource="purchase-order"
        primaryScope="subcontract-order-list"
        gridLabel="the Subcontract Orders grid"
        onSave={handleSaveWorklists}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subcontract Order</AlertDialogTitle>
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
