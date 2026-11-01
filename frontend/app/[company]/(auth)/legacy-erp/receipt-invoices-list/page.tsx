"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/lib/app-navigation";
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
import { useServerPaging } from "@/hooks/legacy-erp/use-server-paging";
import { ListPager } from "@/components/legacy-erp/list-pager";
import type { PageRequest } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { getReceiptTypeConfig } from "@/lib/legacy-erp/receipt-types";
import { Search, RefreshCw, Plus, Eye, Pencil, Trash2, ReceiptText, SearchX, Truck } from "lucide-react";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";
import { useRowSelection } from "@/hooks/use-row-selection";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { formatCell, humanizeColumn, worklistFieldLabel } from "@/lib/legacy-erp/humanize";

// Invoices list — one list screen for all 18 invoice types (?receiptType=, the receipt type the
// invoices are for; the Legacy ERP → Invoices menu opens it). Same layout and list conventions as the
// Inventory Receipts list (inventory-receipts-list/page.tsx): server paging / sorting / search over
// the legacy IM_Invoice header (invoice.service.ts list — this type and the user's company only),
// header filters, row ⋮ / right-click menu. Rows open the invoice screen (receipt-invoices/page.tsx)
// on the saved invoice; Create New opens it blank for this type.
//
// Customize Worklist — the shared Legacy ERP worklists (useWorklist + WorklistBar + WorklistDesignModal,
// as on Packing Lists): named column sets saved per user in UserSettings.tablePreferences, one set per
// invoice type. list() rows carry every IM_Invoice column the "invoice" field source offers
// (worklist-fields.service.ts), so a custom worklist is a client-side projection of the loaded rows —
// the same company / type-scoped data as Standard; ids show their names, and the columns the server can
// sort by stay sortable.
const FORM_PATH = "/legacy-erp/receipt-invoices";
/** Worklist field (raw IM_Invoice column) → the list row value shown, and the server sort key if any. */
const WORKLIST_DISPLAY: Record<string, { value?: (row: any) => unknown; sortBy?: string }> = {
  ReceiptNo: { sortBy: "receiptNo" },
  ReceiptDate: { sortBy: "receiptDate", value: (row) => (row.receiptDate ? new Date(row.receiptDate).toLocaleDateString() : null) },
  DocumentNo: { sortBy: "documentNo" },
  CurrentAccountId: { sortBy: "currentAccountName", value: (row) => [row.currentAccountCode, row.currentAccountName].filter(Boolean).join(" ") || null },
  InWarehouseId: { value: (row) => [row.warehouseCode, row.warehouseName].filter(Boolean).join(" ") || null },
  InventoryReceiptId: { sortBy: "inventoryReceiptNo", value: (row) => row.inventoryReceiptNo ?? null },
  IsApproved: { sortBy: "isApproved", value: (row) => (Number(row.isApproved) ? "Approved" : "Unapproved") },
  IsEximReceipt: { value: (row) => (Number(row.isEximReceipt) ? "Yes" : "No") },
  ApprovedAt: { value: (row) => (row.approvedAt ? new Date(row.approvedAt).toLocaleString() : null) },
  SubTotal: { value: (row) => money(row.subTotal) },
  VatAmount: { value: (row) => money(row.vatAmount) },
  GrandTotal: { sortBy: "grandTotal", value: (row) => money(row.grandTotal) },
};
const rawField = (fieldKey: string) => fieldKey.slice(fieldKey.indexOf(":") + 1);
/** Invoice wording for the automatic labels of these IM_Invoice columns (a label the user typed is kept). */
const INVOICE_FIELD_LABELS: Record<string, string> = {
  ReceiptNo: "Invoice No", ReceiptDate: "Invoice Date", InWarehouseId: "Warehouse", InventoryReceiptId: "Receipt No", IsApproved: "Status",
};
const worklistValue = (row: any, fieldKey: string) => {
  const raw = rawField(fieldKey);
  const d = WORKLIST_DISPLAY[raw];
  return d?.value ? d.value(row) : row[raw.charAt(0).toLowerCase() + raw.slice(1)];
};

const money = (v: unknown) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusOf = (row: any) => (Number(row.isApproved) ? "Approved" : "Unapproved");

export default function ReceiptInvoiceListPage() {
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const receiptType = Number(searchParams.get("receiptType")) || 2;
  const cfg = getReceiptTypeConfig(receiptType);
  const title = `${cfg.label} Invoices`;
  const client = useMemo(() => legacyErpApi.invoices(receiptType), [receiptType]);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);
  const paging = useServerPaging({ defaultSortBy: "receiptNo", defaultSortDir: "desc" });
  // One saved worklist set per invoice type (each Invoices menu entry is its own screen).
  const wl = useWorklist({ storageKey: `receiptInvoicesListWorklists_${receiptType}` });
  const activeColumns = wl.activeWorklist ? wl.columnsFor([]) : null;

  const load = async (term?: string, req: PageRequest = paging.request) => {
    setLoading(true);
    try {
      setRows(paging.take(await client.list(term, req)));
    } catch (e: any) {
      toast.error(e.message || `Failed to load ${title.toLowerCase()}`);
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

  const standardColumns: WorklistTableColumn<any>[] = [
    {
      key: "receiptNo", label: "Invoice No", sortable: true,
      render: (row: any) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.receiptNo}</span>,
      filterable: true, filterValue: (row) => row.receiptNo,
    },
    {
      key: "inventoryReceiptNo", label: "Receipt No", sortable: true,
      render: (row: any) => row.inventoryReceiptNo ? <span className="font-mono text-xs">{row.inventoryReceiptNo}</span> : <span className="text-muted-foreground">—</span>,
      filterable: true, filterValue: (row) => row.inventoryReceiptNo,
    },
    {
      key: "receiptDate", label: "Invoice Date", sortable: true,
      render: (row: any) => (row.receiptDate ? new Date(row.receiptDate).toLocaleDateString() : "—"),
      filterable: true, filterType: "date", filterValue: (row) => row.receiptDate,
    },
    {
      key: "currentAccountName", label: "Current Account", sortable: true,
      render: (row: any) => row.currentAccountName
        ? <span>{row.currentAccountCode ? <span className="mr-1.5 font-mono text-xs text-muted-foreground">{row.currentAccountCode}</span> : null}{row.currentAccountName}</span>
        : <span className="text-muted-foreground">—</span>,
      filterable: true, filterValue: (row) => row.currentAccountName,
    },
    {
      key: "documentNo", label: "Document", sortable: true,
      render: (row: any) => row.documentNo || <span className="text-muted-foreground">—</span>,
      filterable: true, filterValue: (row) => row.documentNo,
    },
    {
      key: "isApproved", label: "Status", sortable: true,
      render: (row: any) => <Badge variant={Number(row.isApproved) ? "default" : "secondary"} className="h-5 text-[11px] font-normal">{statusOf(row)}</Badge>,
      filterable: true, filterValue: statusOf,
    },
    {
      key: "grandTotal", label: "Grand Total", align: "right", sortable: true,
      render: (row: any) => <span className="tabular-nums">{money(row.grandTotal)}</span>,
      filterable: true, filterType: "number", filterValue: (row) => Number(row.grandTotal ?? 0),
    },
  ];

  const worklistColumns: WorklistTableColumn<any>[] | null = activeColumns && activeColumns.map((c) => {
    const sortBy = WORKLIST_DISPLAY[rawField(c)]?.sortBy;
    return {
      key: c, sortable: !!sortBy,
      label: (() => {
        const label = wl.columnLabel(c);
        const raw = rawField(c);
        return INVOICE_FIELD_LABELS[raw] && (label === humanizeColumn(raw) || label === worklistFieldLabel(raw)) ? INVOICE_FIELD_LABELS[raw] : label;
      })(),
      align: ["SubTotal", "VatAmount", "GrandTotal"].includes(rawField(c)) ? "right" : undefined,
      render: (row: any) => formatCell(worklistValue(row, c)),
      filterable: true, filterValue: (row: any) => { const v = worklistValue(row, c); return v === null || v === undefined ? null : String(v); },
    } as WorklistTableColumn<any>;
  });
  const columns = worklistColumns ?? standardColumns;
  // Header sort: a worklist column sorts by its server key (the table shows that column as sorted).
  const sortColumnOf = (serverKey?: string) => (serverKey && worklistColumns ? worklistColumns.find((c) => WORKLIST_DISPLAY[rawField(c.key)]?.sortBy === serverKey)?.key : serverKey);
  const onSort = (columnKey: string) => paging.toggleSort(worklistColumns ? WORKLIST_DISPLAY[rawField(columnKey)]?.sortBy ?? columnKey : columnKey);

  const open = (id: number) => navigateOrOpenTab(router, `${FORM_PATH}?receiptType=${receiptType}&id=${id}`);
  const createNew = () => navigateOrOpenTab(router, `${FORM_PATH}?receiptType=${receiptType}`);
  const receiptPath = (receiptId: number) => `/legacy-erp/inventory-receipts?id=${receiptId}&mode=view${receiptType !== 2 ? `&receiptType=${receiptType}` : ""}`;

  // An approved invoice is locked (backend-enforced): Edit / Delete need Unapprove on the invoice first.
  const getRowActions = (row: any): RowAction[] => {
    const locked = !!Number(row.isApproved);
    return [
      { key: "view", label: "View", icon: Eye, onSelect: () => open(row.id) },
      { key: "update", label: "Edit", icon: Pencil, onSelect: () => open(row.id), disabled: locked, title: locked ? "Approved — unapprove it on the invoice first" : undefined },
      {
        key: "open-receipt", label: "Open Inventory Receipt", icon: Truck, separatorBefore: true,
        disabled: !row.inventoryReceiptId, onSelect: () => { if (row.inventoryReceiptId) navigateOrOpenTab(router, receiptPath(Number(row.inventoryReceiptId))); },
      },
      {
        key: "delete", label: "Delete", icon: Trash2, destructive: true, separatorBefore: true,
        disabled: locked, title: locked ? "Approved — unapprove it on the invoice first" : undefined,
        onSelect: () => setDeleteTarget({ id: row.id, code: row.receiptNo }),
      },
    ];
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await client.delete(deleteTarget.id);
      toast.success(`Invoice ${deleteTarget.code} deleted`);
      setDeleteTarget(null);
      load(search.trim() || undefined);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const { selectedIds, selectRow, handleRowContextMenu } = useRowSelection(rows);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <ModuleHeader
        icon={ReceiptText}
        title={title}
        subtitle={title}
        badges={
          !loading && (
            <Badge variant="secondary" className="h-5 text-[11px] font-normal">
              {paging.total.toLocaleString()} {paging.total === 1 ? "record" : "records"}
            </Badge>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-72 shrink-0">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by Invoice No, Receipt No, Account or Document..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh" aria-label="Refresh">
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
          rows={rows}
          storageKey="receiptInvoicesList"
          getRowKey={(row) => row.id}
          loading={loading}
          sortKey={sortColumnOf(paging.sortBy)}
          sortDir={paging.sortDir}
          onSort={onSort}
          onRowDoubleClick={(row) => open(row.id)}
          selectedIds={selectedIds}
          onRowClick={selectRow}
          onRowContextMenu={handleRowContextMenu}
          renderRowActions={(row) => (
            <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
          wrapRow={(row, el) => <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>}
          emptyState={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{searched ? <SearchX /> : <ReceiptText />}</EmptyMedia>
                <EmptyTitle>{searched ? "Record not found" : `No ${title.toLowerCase()} yet`}</EmptyTitle>
                <EmptyDescription>
                  {searched ? `You can create a new ${cfg.label} Invoice.` : `Click "Create New" to add your first ${cfg.label} Invoice, or use Create Invoice on a receipt.`}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Create New</Button>
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
        activeTableSource="invoice"
        primaryScope="receipt-invoice-list"
        gridLabel={`the ${title} grid`}
        onSave={async (next) => { await wl.saveWorklists(next); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {cfg.label} Invoice</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete invoice {deleteTarget?.code}? Its Inventory Receipt is kept.</AlertDialogDescription>
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
