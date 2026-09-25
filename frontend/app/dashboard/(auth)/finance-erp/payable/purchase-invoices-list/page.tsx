"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Eye, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { FilterField, FilterBar, ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { VENDORS } from "@/lib/finance-erp/mock/master-data";
import {
  getPurchaseInvoices, matchStatusOf, MATCH_STATUSES, PAYMENT_STATUSES, type PurchaseInvoice,
} from "@/lib/finance-erp/payable/purchase-invoices";

const ALL = "__all__";

export default function PurchaseInvoicesListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchFilter, setMatchFilter] = useState(ALL);
  const [vendorId, setVendorId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { getPurchaseInvoices().then(setRows).finally(() => setLoading(false)); }, []);

  const withMatch = useMemo(() => rows.map((r) => ({ ...r, matchStatus: matchStatusOf(r.poId ? r.poAmount : null, r.grnAmount, r.invoiceAmount) })), [rows]);

  const filtered = useMemo(() => withMatch.filter((r) =>
    (matchFilter === ALL || r.matchStatus === matchFilter) &&
    (vendorId === ALL || r.vendorId === vendorId) &&
    (!dateFrom || r.invoiceDate >= dateFrom) &&
    (!dateTo || r.invoiceDate <= dateTo)
  ), [withMatch, matchFilter, vendorId, dateFrom, dateTo]);

  const columns: ColumnDef<typeof withMatch[number]>[] = [
    { accessorKey: "invoiceNumber", header: "Invoice #", cell: ({ row }) => <span className="font-mono text-xs">{row.original.invoiceNumber}</span> },
    { accessorKey: "invoiceDate", header: "Date", cell: ({ row }) => formatDate(row.original.invoiceDate) },
    { id: "vendor", header: "Vendor", cell: ({ row }) => VENDORS.find((v) => v.id === row.original.vendorId)?.name ?? "—" },
    { id: "amount", header: "Amount", cell: ({ row }) => formatAmount(row.original.invoiceAmount) },
    {
      id: "matchStatus", header: "3-Way Match",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={row.original.matchStatus} />
          {row.original.matchStatus === "Mismatch" && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
        </div>
      ),
    },
    { accessorKey: "paymentStatus", header: "Payment Status", cell: ({ row }) => <StatusBadge status={row.original.paymentStatus} /> },
    {
      id: "actions", header: "Actions", enableHiding: false,
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-7 w-7" title="View / Match" onClick={() => navigateOrOpenTab(router, `/dashboard/finance-erp/payable/purchase-invoices?id=${row.original.id}`)}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Purchase Invoice / GRN Matching" }]} />
      <ModuleHeader icon={FileText} size="lg" title="Purchase Invoice / GRN Matching" subtitle="3-way match: Purchase Order → GRN → Invoice" actions={<ExportPrintBar />} />

      <FilterBar onReset={() => { setMatchFilter(ALL); setVendorId(ALL); setDateFrom(""); setDateTo(""); }}>
        <FilterField label="Matching Status">
          <Select value={matchFilter} onValueChange={setMatchFilter}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All</SelectItem>{MATCH_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Vendor">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Vendors</SelectItem>{VENDORS.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
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
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>No purchase invoices yet</EmptyTitle><EmptyDescription>Invoices matched against POs and GRNs will appear here.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          storageKey="financePurchaseInvoicesGrid"
          searchColumn="invoiceNumber"
          searchPlaceholder="Search invoice number..."
          addLabel="New Purchase Invoice"
          onAddClick={() => navigateOrOpenTab(router, "/dashboard/finance-erp/payable/purchase-invoices")}
        />
      )}
    </div>
  );
}
