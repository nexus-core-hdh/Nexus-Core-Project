"use client";

import { Badge } from "@/components/ui/badge";
import { legacyErpApi } from "@/lib/nexuscore-api";
import type { WorklistTableColumn } from "@/components/legacy-erp/worklist-table";
import { EntityListLookupDialog } from "@/components/legacy-erp/entity-list-lookup-dialog";

// Work Order columns — the one definition both the Work Orders List screen
// (work-orders-list/page.tsx) and the Work Orders List lookup popup render, so the two can never
// drift. Every value is a real MA_WorkOrder field returned by legacyErpApi.workOrders.list()
// (work-order.service.ts's list(): non-deleted rows, server-side search on Work Order No, paging,
// sorting). `filterable` — shared header-filter implementation (hooks/use-column-filters.ts),
// picked per-column by actual data shape: identifying/enum columns get the default checkbox
// "select" filter, the real date/numeric columns get a range filter instead.
export const workOrderListColumns: WorklistTableColumn<any>[] = [
  {
    key: "workOrderNo", label: "Order No", sortable: true,
    render: (row: any) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.workOrderNo}</span>,
    filterable: true, filterValue: (row) => row.workOrderNo,
  },
  {
    key: "workOrderDate", label: "Date", sortable: true,
    render: (row: any) => (row.workOrderDate ? new Date(row.workOrderDate).toLocaleDateString() : "—"),
    filterable: true, filterType: "date", filterValue: (row) => row.workOrderDate,
  },
  { key: "uD_Brands", label: "Brand", render: (row: any) => row.uD_Brands || <span className="text-muted-foreground">—</span>, filterable: true, filterValue: (row) => row.uD_Brands },
  { key: "quantity", label: "Quantity", render: (row: any) => (row.quantity != null ? Number(row.quantity).toLocaleString() : "—"), filterable: true, filterType: "number", filterValue: (row) => row.quantity },
  {
    key: "isClosed", label: "Status",
    render: (row: any) => (
      <Badge variant={row.isClosed ? "secondary" : "default"} className={row.isClosed ? "text-[11px] font-normal" : "text-[11px] font-normal bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-500"}>
        {row.isClosed ? "Closed" : "Open"}
      </Badge>
    ),
    filterable: true, filterValue: (row) => (row.isClosed ? "Closed" : "Open"),
  },
];

// The Work Orders List lookup popup — the shared EntityListLookupDialog over the same
// workOrders.list() API and columns as the Work Orders List screen. Returns the picked
// MA_WorkOrder row ({ id, workOrderNo, ... }); each caller maps it onto its own field exactly as
// before (e.g. the receipt line resolves the Work Order's live line into WorkOrderReceiptItemId).
export function WorkOrdersLookupDialog({
  open, onOpenChange, onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (workOrder: any) => void;
}) {
  return (
    <EntityListLookupDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Work Orders List"
      description="Search by Order No, filter by column, then double-click, press Enter or click Select."
      columns={workOrderListColumns}
      load={(search, req) => legacyErpApi.workOrders.list(search, req)}
      defaultSortBy="workOrderNo"
      defaultSortDir="desc"
      searchPlaceholder="Search by Order No..."
      getRowKey={(row: any) => row.id}
      storageKey="workOrdersLookup"
      onSelect={onSelect}
    />
  );
}
