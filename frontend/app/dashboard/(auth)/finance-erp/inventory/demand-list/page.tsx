"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Eye, Pencil, Trash2, Plus } from "lucide-react";
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
import { BRANCHES, DEPARTMENTS, branchName, departmentName } from "@/lib/finance-erp/mock/master-data";
import { getDemands, deleteDemand, type DemandDoc, type DemandStatus } from "@/lib/finance-erp/inventory/demand";

const ALL = "__all__";
const STATUSES: DemandStatus[] = ["Draft", "Pending Approval", "Approved", "Rejected", "Cancelled"];

export default function DemandListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DemandDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [status, setStatus] = useState(ALL);
  const [branchId, setBranchId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ status: ALL, branchId: ALL, departmentId: ALL, dateFrom: "", dateTo: "" });

  const load = async () => {
    setLoading(true);
    try {
      setRows(await getDemands());
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load demands");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (applied.status !== ALL && r.status !== applied.status) return false;
      if (applied.branchId !== ALL && r.branchId !== applied.branchId) return false;
      if (applied.departmentId !== ALL && r.departmentId !== applied.departmentId) return false;
      if (applied.dateFrom && r.demandDate < applied.dateFrom) return false;
      if (applied.dateTo && r.demandDate > applied.dateTo) return false;
      return true;
    });
  }, [rows, applied]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteDemand(deleteId);
    toast.success("Demand deleted");
    load();
  };

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const header = ["Demand No", "Date", "Branch", "Department", "Required Date", "Est. Amount", "Status"];
    const lines = filtered.map((r) => [r.demandNumber, r.demandDate, branchName(r.branchId), departmentName(r.departmentId), r.requiredDate, r.totalEstimatedAmount, r.status]);
    const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "demands.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<DemandDoc>[] = [
    { accessorKey: "demandNumber", header: "Demand No", size: 150, cell: ({ row }) => <span className="font-mono text-xs">{row.original.demandNumber}</span> },
    { accessorKey: "demandDate", header: "Date", size: 110, cell: ({ row }) => formatDate(row.original.demandDate) },
    { id: "branch", header: "Branch", size: 150, accessorFn: (r) => branchName(r.branchId) },
    { id: "department", header: "Department", size: 150, accessorFn: (r) => departmentName(r.departmentId) },
    { accessorKey: "requiredDate", header: "Required Date", size: 130, cell: ({ row }) => formatDate(row.original.requiredDate) },
    { accessorKey: "totalEstimatedAmount", header: "Est. Amount", size: 130, cell: ({ row }) => <span className="font-medium">{formatAmount(row.original.totalEstimatedAmount)}</span> },
    { accessorKey: "status", header: "Status", size: 140, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", size: 120, enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => navigateOrOpenTab(router, `/dashboard/finance-erp/inventory/demand?id=${row.original.id}`)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => navigateOrOpenTab(router, `/dashboard/finance-erp/inventory/demand?id=${row.original.id}`)}>
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
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Inventory Management" }, { label: "Demand" }]} />

      <ModuleHeader
        icon={ClipboardList}
        size="lg"
        title="Demand"
        subtitle="Material/stock demand requests raised by departments"
        actions={
          <>
            <ExportPrintBar onExportCsv={exportCsv} />
            <Button size="sm" onClick={() => navigateOrOpenTab(router, "/dashboard/finance-erp/inventory/demand")}>
              <Plus className="h-3.5 w-3.5 mr-2" />New Demand
            </Button>
          </>
        }
      />

      <FilterBar onApply={() => setApplied({ status, branchId, departmentId, dateFrom, dateTo })} onReset={() => {
        setStatus(ALL); setBranchId(ALL); setDepartmentId(ALL); setDateFrom(""); setDateTo("");
        setApplied({ status: ALL, branchId: ALL, departmentId: ALL, dateFrom: "", dateTo: "" });
      }}>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Branch">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Branches</SelectItem>
              {BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Department">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Departments</SelectItem>
              {DEPARTMENTS.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
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
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
            <EmptyTitle>Unable to load demands</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
            <EmptyTitle>No demands yet</EmptyTitle>
            <EmptyDescription>Create your first demand request to get started.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          storageKey="financeDemandGrid"
          searchColumn="demandNumber"
          searchPlaceholder="Search demand no..."
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete Demand"
        description="This will permanently remove this demand request. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
