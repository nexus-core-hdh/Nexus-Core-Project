"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark, Eye, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { customerName } from "@/lib/finance-erp/mock/master-data";
import { getCustomerReceipts, receiptUnallocated, type CustomerReceipt } from "@/lib/finance-erp/receivable/customer-receipts";

const ALL = "__all__";
const BASE_HREF = "/dashboard/finance-erp/receivable/customer-receipts";

export default function CustomerReceiptsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CustomerReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<string>(ALL);

  useEffect(() => { getCustomerReceipts().then(setRows).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => rows.filter((r) => method === ALL || r.paymentMethod === method), [rows, method]);
  const methods = useMemo(() => Array.from(new Set(rows.map((r) => r.paymentMethod))), [rows]);

  const columns: ColumnDef<CustomerReceipt>[] = [
    { accessorKey: "receiptNumber", header: "Receipt #", cell: ({ row }) => (
      <button className="font-mono text-xs font-medium text-primary hover:underline" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}>{row.original.receiptNumber}</button>
    ) },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "customer", header: "Customer", accessorFn: (r) => customerName(r.customerId) },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatAmount(row.original.amount) },
    { accessorKey: "paymentMethod", header: "Method" },
    { id: "unallocated", header: "Unallocated", cell: ({ row }) => formatAmount(receiptUnallocated(row.original)) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "Actions", enableHiding: false, size: 90, cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Receivable" }, { label: "Customer Payments / Receipts" }]} />
      <ModuleHeader icon={Landmark} size="lg" title="Customer Payments / Receipts" subtitle="Record incoming payments and allocate them against invoices"
        actions={<><ExportPrintBar /><Button size="sm" onClick={() => navigateOrOpenTab(router, BASE_HREF)}><Plus className="h-3.5 w-3.5 mr-1.5" />New Receipt</Button></>} />

      <FilterBar onReset={() => setMethod(ALL)}>
        <FilterField label="Payment Method">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Methods</SelectItem>{methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        : rows.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Landmark /></EmptyMedia><EmptyTitle>No receipts yet</EmptyTitle><EmptyDescription>Record a customer payment to get started.</EmptyDescription></EmptyHeader></Empty>
        : <DataTable columns={columns} data={filtered} storageKey="financeCustomerReceiptsGrid" searchColumn="receiptNumber" searchPlaceholder="Search receipt number..." />}
    </div>
  );
}
