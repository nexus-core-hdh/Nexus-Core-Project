"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck, Eye, Pencil, Ban, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { FilterBar, FilterField, ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { CUSTOMERS, BRANCHES, customerName, branchName } from "@/lib/finance-erp/mock/master-data";
import { getSalesOrders, deleteSalesOrder, computeTotals, type SalesOrder, type SalesOrderStatus } from "@/lib/finance-erp/receivable/sales-orders";

const ALL = "__all__";
const STATUSES: SalesOrderStatus[] = ["Draft", "Pending Approval", "Approved", "Rejected", "Cancelled", "Closed"];
const BASE_HREF = "/dashboard/finance-erp/receivable/sales-orders";

export default function SalesOrdersListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(ALL);
  const [customerId, setCustomerId] = useState<string>(ALL);
  const [branchId, setBranchId] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cancelTarget, setCancelTarget] = useState<SalesOrder | null>(null);

  const load = () => {
    setLoading(true);
    getSalesOrders().then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (status === ALL || r.status === status) &&
    (customerId === ALL || r.customerId === customerId) &&
    (branchId === ALL || r.branchId === branchId) &&
    (!dateFrom || r.date >= dateFrom) &&
    (!dateTo || r.date <= dateTo)
  ), [rows, status, customerId, branchId, dateFrom, dateTo]);

  const resetFilters = () => { setStatus(ALL); setCustomerId(ALL); setBranchId(ALL); setDateFrom(""); setDateTo(""); };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    await deleteSalesOrder(cancelTarget.id);
    toast.success(`${cancelTarget.soNumber} cancelled`);
    load();
  };

  const columns: ColumnDef<SalesOrder>[] = [
    { accessorKey: "soNumber", header: "SO Number", meta: { label: "SO Number" }, cell: ({ row }) => (
      <button className="font-mono text-xs font-medium text-primary hover:underline" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}>{row.original.soNumber}</button>
    ) },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "customer", header: "Customer", accessorFn: (r) => customerName(r.customerId) },
    { id: "branch", header: "Branch", accessorFn: (r) => branchName(r.branchId) },
    { accessorKey: "deliveryDate", header: "Delivery Date", cell: ({ row }) => formatDate(row.original.deliveryDate) },
    { id: "total", header: "Grand Total", cell: ({ row }) => formatAmount(computeTotals(row.original.items).grandTotal) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", enableHiding: false, size: 130,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Cancel" disabled={row.original.status === "Cancelled"} onClick={() => setCancelTarget(row.original)}><Ban className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Receivable" }, { label: "Sales Order" }]} />
      <ModuleHeader
        icon={ClipboardCheck}
        size="lg"
        title="Sales Order"
        subtitle="Customer sales orders — create, approve and track fulfillment"
        actions={<>
          <ExportPrintBar />
          <Button size="sm" onClick={() => navigateOrOpenTab(router, BASE_HREF)}><Plus className="h-3.5 w-3.5 mr-1.5" />New Sales Order</Button>
        </>}
      />

      <FilterBar onApply={() => {}} onReset={resetFilters}>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Customer">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Customers</SelectItem>{CUSTOMERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Branch">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Branches</SelectItem>{BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Date Range">
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
          </div>
        </FilterField>
      </FilterBar>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardCheck /></EmptyMedia>
            <EmptyTitle>No sales orders yet</EmptyTitle>
            <EmptyDescription>Create your first sales order to get started.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable columns={columns} data={filtered} storageKey="financeSalesOrdersGrid" searchColumn="soNumber" searchPlaceholder="Search SO number..." />
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Cancel Sales Order"
        description={`Cancel sales order ${cancelTarget?.soNumber}? This cannot be undone.`}
        confirmLabel="Cancel Order"
        onConfirm={handleCancel}
      />
    </div>
  );
}
