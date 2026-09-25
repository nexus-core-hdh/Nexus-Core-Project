"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, Eye, Pencil, Plus, AlertTriangle } from "lucide-react";

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
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { CUSTOMERS, customerName } from "@/lib/finance-erp/mock/master-data";
import { getSalesInvoices, computeTotals, isOverdue, type SalesInvoice, type SalesInvoiceStatus } from "@/lib/finance-erp/receivable/sales-invoices";

const ALL = "__all__";
const STATUSES: SalesInvoiceStatus[] = ["Unpaid", "Partially Paid", "Paid", "Cancelled"];
const BASE_HREF = "/dashboard/finance-erp/receivable/sales-invoices";

export default function SalesInvoicesListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(ALL);
  const [customerId, setCustomerId] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { getSalesInvoices().then(setRows).finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (status === ALL || r.status === status) &&
    (customerId === ALL || r.customerId === customerId) &&
    (!dateFrom || r.date >= dateFrom) &&
    (!dateTo || r.date <= dateTo)
  ), [rows, status, customerId, dateFrom, dateTo]);

  const columns: ColumnDef<SalesInvoice>[] = [
    { accessorKey: "invoiceNumber", header: "Invoice #", cell: ({ row }) => (
      <button className="font-mono text-xs font-medium text-primary hover:underline" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}>{row.original.invoiceNumber}</button>
    ) },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "customer", header: "Customer", accessorFn: (r) => customerName(r.customerId) },
    { accessorKey: "dueDate", header: "Due Date", cell: ({ row }) => (
      <span className={isOverdue(row.original) ? "text-rose-600 dark:text-rose-400 font-medium" : undefined}>{formatDate(row.original.dueDate)}</span>
    ) },
    { id: "total", header: "Total", cell: ({ row }) => formatAmount(computeTotals(row.original.items).grandTotal) },
    { accessorKey: "paidAmount", header: "Paid", cell: ({ row }) => formatAmount(row.original.paidAmount) },
    { id: "status", header: "Status", cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <StatusBadge status={row.original.status} />
        {isOverdue(row.original) && <span title="Overdue"><AlertTriangle className="h-3.5 w-3.5 text-rose-500" /></span>}
      </div>
    ) },
    {
      id: "actions", header: "Actions", enableHiding: false, size: 90,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Receivable" }, { label: "Sales Invoice" }]} />
      <ModuleHeader
        icon={FileSpreadsheet}
        size="lg"
        title="Sales Invoice"
        subtitle="Customer invoices — issue, track payment status and print"
        actions={<>
          <ExportPrintBar />
          <Button size="sm" onClick={() => navigateOrOpenTab(router, BASE_HREF)}><Plus className="h-3.5 w-3.5 mr-1.5" />New Invoice</Button>
        </>}
      />

      <FilterBar onReset={() => { setStatus(ALL); setCustomerId(ALL); setDateFrom(""); setDateTo(""); }}>
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
        <Empty><EmptyHeader><EmptyMedia variant="icon"><FileSpreadsheet /></EmptyMedia><EmptyTitle>No sales invoices yet</EmptyTitle><EmptyDescription>Create your first invoice to get started.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <DataTable columns={columns} data={filtered} storageKey="financeSalesInvoicesGrid" searchColumn="invoiceNumber" searchPlaceholder="Search invoice number..." />
      )}
    </div>
  );
}
