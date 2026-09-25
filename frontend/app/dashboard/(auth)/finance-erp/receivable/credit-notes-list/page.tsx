"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileX2, Eye, Pencil, Plus } from "lucide-react";

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
import { getCreditNotes, computeTotals, type CreditNote, type CreditNoteStatus } from "@/lib/finance-erp/receivable/credit-notes";

const ALL = "__all__";
const STATUSES: CreditNoteStatus[] = ["Draft", "Pending Approval", "Approved", "Posted", "Cancelled"];
const BASE_HREF = "/dashboard/finance-erp/receivable/credit-notes";

export default function CreditNotesListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(ALL);

  useEffect(() => { getCreditNotes().then(setRows).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => rows.filter((r) => status === ALL || r.status === status), [rows, status]);

  const columns: ColumnDef<CreditNote>[] = [
    { accessorKey: "creditNoteNumber", header: "Credit Note #", cell: ({ row }) => (
      <button className="font-mono text-xs font-medium text-primary hover:underline" onClick={() => navigateOrOpenTab(router, `${BASE_HREF}?id=${row.original.id}`)}>{row.original.creditNoteNumber}</button>
    ) },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "customer", header: "Customer", accessorFn: (r) => customerName(r.customerId) },
    { accessorKey: "referenceInvoiceId", header: "Reference Invoice" },
    { accessorKey: "reason", header: "Reason" },
    { id: "amount", header: "Amount", cell: ({ row }) => formatAmount(computeTotals(row.original.items).grandTotal) },
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
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Receivable" }, { label: "Credit Note" }]} />
      <ModuleHeader icon={FileX2} size="lg" title="Credit Note" subtitle="Issue credit notes against sales invoices"
        actions={<><ExportPrintBar /><Button size="sm" onClick={() => navigateOrOpenTab(router, BASE_HREF)}><Plus className="h-3.5 w-3.5 mr-1.5" />New Credit Note</Button></>} />

      <FilterBar onReset={() => setStatus(ALL)}>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        : rows.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><FileX2 /></EmptyMedia><EmptyTitle>No credit notes yet</EmptyTitle><EmptyDescription>Issue a credit note against a sales invoice.</EmptyDescription></EmptyHeader></Empty>
        : <DataTable columns={columns} data={filtered} storageKey="financeCreditNotesGrid" searchColumn="creditNoteNumber" searchPlaceholder="Search credit note..." />}
    </div>
  );
}
