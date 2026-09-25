"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpFromLine, Eye, Pencil, Trash2, Plus } from "lucide-react";
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
import { formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { WAREHOUSES, DEPARTMENTS, warehouseName, departmentName } from "@/lib/finance-erp/mock/master-data";
import { getIssuances, deleteIssuance, type IssuanceDoc, type IssuanceStatus } from "@/lib/finance-erp/inventory/issuance";

const ALL = "__all__";
const STATUSES: IssuanceStatus[] = ["Draft", "Pending Approval", "Approved", "Cancelled", "Closed"];
const LIST_HREF = "/dashboard/finance-erp/inventory/issuance-list";
const FORM_HREF = "/dashboard/finance-erp/inventory/issuance";

export default function IssuanceListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<IssuanceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [status, setStatus] = useState(ALL);
  const [warehouseId, setWarehouseId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ status: ALL, warehouseId: ALL, departmentId: ALL, dateFrom: "", dateTo: "" });

  const load = async () => {
    setLoading(true);
    try { setRows(await getIssuances()); setError(null); }
    catch (e: any) { setError(e.message || "Failed to load issuances"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (applied.status !== ALL && r.status !== applied.status) return false;
    if (applied.warehouseId !== ALL && r.warehouseId !== applied.warehouseId) return false;
    if (applied.departmentId !== ALL && r.departmentId !== applied.departmentId) return false;
    if (applied.dateFrom && r.issuanceDate < applied.dateFrom) return false;
    if (applied.dateTo && r.issuanceDate > applied.dateTo) return false;
    return true;
  }), [rows, applied]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteIssuance(deleteId);
    toast.success("Issuance cancelled");
    load();
  };

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const header = ["Issuance No", "Date", "Warehouse", "Department", "Items", "Status"];
    const lines = filtered.map((r) => [r.issuanceNumber, r.issuanceDate, warehouseName(r.warehouseId), departmentName(r.departmentId), r.items.length, r.status]);
    const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "issuances.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<IssuanceDoc>[] = [
    { accessorKey: "issuanceNumber", header: "Issuance No", size: 150, cell: ({ row }) => <span className="font-mono text-xs">{row.original.issuanceNumber}</span> },
    { accessorKey: "issuanceDate", header: "Date", size: 110, cell: ({ row }) => formatDate(row.original.issuanceDate) },
    { id: "warehouse", header: "Warehouse", size: 170, accessorFn: (r) => warehouseName(r.warehouseId) },
    { id: "department", header: "Department", size: 150, accessorFn: (r) => departmentName(r.departmentId) },
    { id: "lines", header: "Line Items", size: 100, accessorFn: (r) => r.items.length },
    { accessorKey: "status", header: "Status", size: 140, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", size: 120, enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="View/Edit" onClick={() => navigateOrOpenTab(router, `${FORM_HREF}?id=${row.original.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => navigateOrOpenTab(router, `${FORM_HREF}?id=${row.original.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Cancel" onClick={() => setDeleteId(row.original.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Inventory Management" }, { label: "Issuance" }]} />

      <ModuleHeader icon={ArrowUpFromLine} size="lg" title="Issuance" subtitle="Stock issued from warehouses to departments"
        actions={<><ExportPrintBar onExportCsv={exportCsv} /><Button size="sm" onClick={() => navigateOrOpenTab(router, FORM_HREF)}><Plus className="h-3.5 w-3.5 mr-2" />New Issuance</Button></>} />

      <FilterBar onApply={() => setApplied({ status, warehouseId, departmentId, dateFrom, dateTo })} onReset={() => {
        setStatus(ALL); setWarehouseId(ALL); setDepartmentId(ALL); setDateFrom(""); setDateTo("");
        setApplied({ status: ALL, warehouseId: ALL, departmentId: ALL, dateFrom: "", dateTo: "" });
      }}>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Warehouse">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Warehouses</SelectItem>{WAREHOUSES.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Department">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Departments</SelectItem>{DEPARTMENTS.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
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
        <Empty><EmptyHeader><EmptyMedia variant="icon"><ArrowUpFromLine /></EmptyMedia><EmptyTitle>Unable to load issuances</EmptyTitle><EmptyDescription>{error}</EmptyDescription></EmptyHeader></Empty>
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><ArrowUpFromLine /></EmptyMedia><EmptyTitle>No issuances yet</EmptyTitle><EmptyDescription>Issue stock from a warehouse to get started.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <DataTable columns={columns} data={filtered} storageKey="financeIssuanceGrid" searchColumn="issuanceNumber" searchPlaceholder="Search issuance no..." />
      )}

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Cancel Issuance" description="This will cancel this issuance record. This action cannot be undone." confirmLabel="Cancel Issuance" onConfirm={handleDelete} />
    </div>
  );
}
