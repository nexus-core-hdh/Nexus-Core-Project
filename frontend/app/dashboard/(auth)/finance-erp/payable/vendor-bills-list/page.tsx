"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Receipt, Eye, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

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
import { getVendorBills, updateVendorBill, isOverdue, type VendorBill } from "@/lib/finance-erp/payable/vendor-bills";

const ALL = "__all__";
const PAYMENT_STATUS_OPTS = ["Pending", "Partially Paid", "Paid"];

export default function VendorBillsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(ALL);
  const [vendorId, setVendorId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = () => { setLoading(true); getVendorBills().then(setRows).finally(() => setLoading(false)); };
  useEffect(load, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (status === ALL || r.paymentStatus === status) &&
    (vendorId === ALL || r.vendorId === vendorId) &&
    (!dateFrom || r.billDate >= dateFrom) &&
    (!dateTo || r.billDate <= dateTo)
  ), [rows, status, vendorId, dateFrom, dateTo]);

  const approve = async (b: VendorBill) => { await updateVendorBill(b.id, { approvalStatus: "Approved" }); toast.success(`${b.billNumber} approved`); load(); };

  const columns: ColumnDef<VendorBill>[] = [
    { accessorKey: "billNumber", header: "Bill Number", cell: ({ row }) => <span className="font-mono text-xs">{row.original.billNumber}</span> },
    { id: "vendor", header: "Vendor", cell: ({ row }) => VENDORS.find((v) => v.id === row.original.vendorId)?.name ?? "—" },
    { accessorKey: "billDate", header: "Bill Date", cell: ({ row }) => formatDate(row.original.billDate) },
    {
      id: "dueDate", header: "Due Date",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          {formatDate(row.original.dueDate)}
          {isOverdue(row.original) && <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600"><AlertTriangle className="h-3 w-3" />Overdue</span>}
        </span>
      ),
    },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatAmount(row.original.amount) },
    { id: "paid", header: "Paid", cell: ({ row }) => formatAmount(row.original.paidAmount) },
    { accessorKey: "paymentStatus", header: "Payment Status", cell: ({ row }) => <StatusBadge status={row.original.paymentStatus} /> },
    { accessorKey: "approvalStatus", header: "Approval", cell: ({ row }) => <StatusBadge status={row.original.approvalStatus} /> },
    {
      id: "actions", header: "Actions", enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="View / Edit" onClick={() => navigateOrOpenTab(router, `/dashboard/finance-erp/payable/vendor-bills?id=${row.original.id}`)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {row.original.approvalStatus === "Pending Approval" && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Approve" onClick={() => approve(row.original)}>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Vendor Bills" }]} />
      <ModuleHeader icon={Receipt} size="lg" title="Vendor Bills" subtitle="Bills received from vendors and their payment status" actions={<ExportPrintBar />} />

      <FilterBar onReset={() => { setStatus(ALL); setVendorId(ALL); setDateFrom(""); setDateTo(""); }}>
        <FilterField label="Payment Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All</SelectItem>{PAYMENT_STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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
        <Empty><EmptyHeader><EmptyMedia variant="icon"><Receipt /></EmptyMedia><EmptyTitle>No vendor bills yet</EmptyTitle><EmptyDescription>Bills recorded against vendors will appear here.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <DataTable columns={columns} data={filtered} storageKey="financeVendorBillsGrid" searchColumn="billNumber" searchPlaceholder="Search bill number..." addLabel="New Vendor Bill" onAddClick={() => navigateOrOpenTab(router, "/dashboard/finance-erp/payable/vendor-bills")} />
      )}
    </div>
  );
}
