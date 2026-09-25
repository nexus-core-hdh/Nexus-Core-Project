"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownToLine, Eye, Pencil, Trash2, Plus } from "lucide-react";
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
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { VENDORS, WAREHOUSES, vendorName, warehouseName } from "@/lib/finance-erp/mock/master-data";
import { getReceipts, deleteReceipt, type ReceiptDoc, type ReceiptStatus } from "@/lib/finance-erp/inventory/receipt";

const ALL = "__all__";
const STATUSES: ReceiptStatus[] = ["Draft", "Pending Approval", "Approved", "Partially Received", "Received", "Cancelled"];
const LIST_HREF = "/dashboard/finance-erp/inventory/receipt-list";
const FORM_HREF = "/dashboard/finance-erp/inventory/receipt";

export default function ReceiptListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReceiptDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [status, setStatus] = useState(ALL);
  const [vendorId, setVendorId] = useState(ALL);
  const [warehouseId, setWarehouseId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ status: ALL, vendorId: ALL, warehouseId: ALL, dateFrom: "", dateTo: "" });

  const load = async () => {
    setLoading(true);
    try { setRows(await getReceipts()); setError(null); }
    catch (e: any) { setError(e.message || "Failed to load receipts"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (applied.status !== ALL && r.status !== applied.status) return false;
    if (applied.vendorId !== ALL && r.vendorId !== applied.vendorId) return false;
    if (applied.warehouseId !== ALL && r.warehouseId !== applied.warehouseId) return false;
    if (applied.dateFrom && r.receiptDate < applied.dateFrom) return false;
    if (applied.dateTo && r.receiptDate > applied.dateTo) return false;
    return true;
  }), [rows, applied]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteReceipt(deleteId);
    toast.success("Receipt deleted");
    load();
  };

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const header = ["Receipt No", "Date", "Supplier", "Warehouse", "GRN No", "Amount", "Status"];
    const lines = filtered.map((r) => [r.receiptNumber, r.receiptDate, vendorName(r.vendorId), warehouseName(r.warehouseId), r.grnNumber, r.totalAmount, r.status]);
    const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "receipts.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<ReceiptDoc>[] = [
    { accessorKey: "receiptNumber", header: "Receipt No", size: 150, cell: ({ row }) => <span className="font-mono text-xs">{row.original.receiptNumber}</span> },
    { accessorKey: "receiptDate", header: "Date", size: 110, cell: ({ row }) => formatDate(row.original.receiptDate) },
    { id: "vendor", header: "Supplier", size: 200, accessorFn: (r) => vendorName(r.vendorId) },
    { id: "warehouse", header: "Warehouse", size: 170, accessorFn: (r) => warehouseName(r.warehouseId) },
    { accessorKey: "grnNumber", header: "GRN No", size: 140 },
    { accessorKey: "totalAmount", header: "Amount", size: 130, cell: ({ row }) => <span className="font-medium">{formatAmount(row.original.totalAmount)}</span> },
    { accessorKey: "status", header: "Status", size: 150, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", size: 120, enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="View/Edit" onClick={() => navigateOrOpenTab(router, `${FORM_HREF}?id=${row.original.id}`)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => navigateOrOpenTab(router, `${FORM_HREF}?id=${row.original.id}`)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => setDeleteId(row.original.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Inventory Management" }, { label: "Receipt" }]} />

      <ModuleHeader
        icon={ArrowDownToLine}
        size="lg"
        title="Receipt"
        subtitle="Goods received against purchase orders (GRN)"
        actions={
          <>
            <ExportPrintBar onExportCsv={exportCsv} />
            <Button size="sm" onClick={() => navigateOrOpenTab(router, FORM_HREF)}><Plus className="h-3.5 w-3.5 mr-2" />New Receipt</Button>
          </>
        }
      />

      <FilterBar onApply={() => setApplied({ status, vendorId, warehouseId, dateFrom, dateTo })} onReset={() => {
        setStatus(ALL); setVendorId(ALL); setWarehouseId(ALL); setDateFrom(""); setDateTo("");
        setApplied({ status: ALL, vendorId: ALL, warehouseId: ALL, dateFrom: "", dateTo: "" });
      }}>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Supplier">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Suppliers</SelectItem>{VENDORS.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Warehouse">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Warehouses</SelectItem>{WAREHOUSES.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Date Range">
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
          </div>
        </FilterField>
      </FilterBar>

      {error ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><ArrowDownToLine /></EmptyMedia><EmptyTitle>Unable to load receipts</EmptyTitle><EmptyDescription>{error}</EmptyDescription></EmptyHeader></Empty>
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><ArrowDownToLine /></EmptyMedia><EmptyTitle>No receipts yet</EmptyTitle><EmptyDescription>Record a goods receipt to get started.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <DataTable columns={columns} data={filtered} storageKey="financeReceiptGrid" searchColumn="receiptNumber" searchPlaceholder="Search receipt no..." />
      )}

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Delete Receipt" description="This will permanently remove this receipt. This action cannot be undone." confirmLabel="Delete" onConfirm={handleDelete} />
    </div>
  );
}
