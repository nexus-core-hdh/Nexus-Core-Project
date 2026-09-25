"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileMinus, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { getDebitNotes, type DebitNote } from "@/lib/finance-erp/payable/debit-notes";

const ALL = "__all__";
const STATUSES = ["Draft", "Pending Approval", "Approved", "Posted", "Cancelled"];

export default function DebitNotesListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(ALL);
  const [vendorId, setVendorId] = useState(ALL);

  useEffect(() => { getDebitNotes().then(setRows).finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => rows.filter((r) => (status === ALL || r.status === status) && (vendorId === ALL || r.vendorId === vendorId)), [rows, status, vendorId]);

  const columns: ColumnDef<DebitNote>[] = [
    { accessorKey: "debitNoteNumber", header: "Debit Note #", cell: ({ row }) => <span className="font-mono text-xs">{row.original.debitNoteNumber}</span> },
    { id: "vendor", header: "Vendor", cell: ({ row }) => VENDORS.find((v) => v.id === row.original.vendorId)?.name ?? "—" },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "referenceInvoice", header: "Reference Invoice" },
    { accessorKey: "reason", header: "Reason" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatAmount(row.original.amount) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", enableHiding: false,
      cell: ({ row }) => <Button variant="ghost" size="icon" className="h-7 w-7" title="View / Edit" aria-label="View / Edit debit note" onClick={() => navigateOrOpenTab(router, `/dashboard/finance-erp/payable/debit-notes?id=${row.original.id}`)}><Eye className="h-3.5 w-3.5" /></Button>,
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Debit Note" }]} />
      <ModuleHeader icon={FileMinus} size="lg" title="Debit Note" subtitle="Debit notes raised against vendor invoices" actions={<ExportPrintBar />} />

      <FilterBar onReset={() => { setStatus(ALL); setVendorId(ALL); }}>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Vendor">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Vendors</SelectItem>{VENDORS.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><FileMinus /></EmptyMedia><EmptyTitle>No debit notes yet</EmptyTitle><EmptyDescription>Debit notes raised against vendors will appear here.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <DataTable columns={columns} data={filtered} storageKey="financeDebitNotesGrid" searchColumn="debitNoteNumber" searchPlaceholder="Search debit note..." addLabel="New Debit Note" onAddClick={() => navigateOrOpenTab(router, "/dashboard/finance-erp/payable/debit-notes")} />
      )}
    </div>
  );
}
