"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ReceiptText, Eye, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { customerName, TAX_RATES } from "@/lib/finance-erp/mock/master-data";
import { getSalesTaxInvoices, taxableTotal, taxAmount, invoiceTotal, type SalesTaxInvoice } from "@/lib/finance-erp/receivable/sales-tax-invoice";

const BASE_HREF = "/dashboard/finance-erp/receivable/sales-tax-invoice";

export default function SalesTaxInvoiceListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SalesTaxInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getSalesTaxInvoices().then(setRows).finally(() => setLoading(false)); }, []);

  const columns: ColumnDef<SalesTaxInvoice>[] = [
    { accessorKey: "invoiceNumber", header: "Tax Invoice #", cell: ({ row }) => (
      <button className="font-mono text-xs font-medium text-primary hover:underline" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}>{row.original.invoiceNumber}</button>
    ) },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "customer", header: "Customer", accessorFn: (r) => customerName(r.customerId) },
    { accessorKey: "taxRegistrationNo", header: "Tax Reg. No" },
    { id: "rate", header: "Tax Rate", accessorFn: (r) => `${TAX_RATES.find((t) => t.id === r.taxRateId)?.rate ?? 0}%` },
    { id: "taxable", header: "Taxable Amount", cell: ({ row }) => formatAmount(taxableTotal(row.original)) },
    { id: "tax", header: "Tax Amount", cell: ({ row }) => formatAmount(taxAmount(row.original)) },
    { id: "total", header: "Total", cell: ({ row }) => formatAmount(invoiceTotal(row.original)) },
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
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Receivable" }, { label: "Sales Tax Invoice" }]} />
      <ModuleHeader icon={ReceiptText} size="lg" title="Sales Tax Invoice" subtitle="Statutory sales tax invoices issued to registered customers"
        actions={<><ExportPrintBar /><Button size="sm" onClick={() => navigateOrOpenTab(router, BASE_HREF)}><Plus className="h-3.5 w-3.5 mr-1.5" />New Tax Invoice</Button></>} />

      {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        : rows.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><ReceiptText /></EmptyMedia><EmptyTitle>No tax invoices yet</EmptyTitle><EmptyDescription>Create a statutory sales tax invoice.</EmptyDescription></EmptyHeader></Empty>
        : <DataTable columns={columns} data={rows} storageKey="financeSalesTaxInvoiceGrid" searchColumn="invoiceNumber" searchPlaceholder="Search invoice number..." />}
    </div>
  );
}
