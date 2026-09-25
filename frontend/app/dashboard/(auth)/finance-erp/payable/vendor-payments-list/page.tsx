"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Wallet, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { FilterField, FilterBar, ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { VENDORS, PAYMENT_METHODS } from "@/lib/finance-erp/mock/master-data";
import { getVendorPayments, type VendorPayment } from "@/lib/finance-erp/payable/vendor-payments";

const ALL = "__all__";

export default function VendorPaymentsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorId, setVendorId] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { getVendorPayments().then(setRows).finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (vendorId === ALL || r.vendorId === vendorId) &&
    (method === ALL || r.paymentMethod === method) &&
    (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo)
  ), [rows, vendorId, method, dateFrom, dateTo]);

  const columns: ColumnDef<VendorPayment>[] = [
    { accessorKey: "paymentNumber", header: "Payment #", cell: ({ row }) => <span className="font-mono text-xs">{row.original.paymentNumber}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "vendor", header: "Vendor", cell: ({ row }) => VENDORS.find((v) => v.id === row.original.vendorId)?.name ?? "—" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatAmount(row.original.amount) },
    { accessorKey: "paymentMethod", header: "Method" },
    { accessorKey: "reference", header: "Reference" },
    {
      id: "actions", header: "Actions", enableHiding: false,
      cell: ({ row }) => <Button variant="ghost" size="icon" className="h-7 w-7" title="View / Edit" aria-label="View / Edit payment" onClick={() => navigateOrOpenTab(router, `/dashboard/finance-erp/payable/vendor-payments?id=${row.original.id}`)}><Eye className="h-3.5 w-3.5" /></Button>,
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Vendor Payments" }]} />
      <ModuleHeader icon={Wallet} size="lg" title="Vendor Payments" subtitle="Payments made to vendors and invoice allocations" actions={<ExportPrintBar />} />

      <FilterBar onReset={() => { setVendorId(ALL); setMethod(ALL); setDateFrom(""); setDateTo(""); }}>
        <FilterField label="Vendor">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Vendors</SelectItem>{VENDORS.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Payment Method">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Methods</SelectItem>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
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
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><Wallet /></EmptyMedia><EmptyTitle>No vendor payments yet</EmptyTitle><EmptyDescription>Payments made to vendors will appear here.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <DataTable columns={columns} data={filtered} storageKey="financeVendorPaymentsGrid" searchColumn="paymentNumber" searchPlaceholder="Search payment number..." addLabel="New Payment" onAddClick={() => navigateOrOpenTab(router, "/dashboard/finance-erp/payable/vendor-payments")} />
      )}
    </div>
  );
}
