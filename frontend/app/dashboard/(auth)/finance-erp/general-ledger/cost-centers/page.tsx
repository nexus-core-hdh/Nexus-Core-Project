"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { GitBranch, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";
import { FormTextField, FormSelectField } from "@/components/forms/form-field";
import { formatAmount } from "@/lib/finance-erp/utils/format";
import { BRANCHES } from "@/lib/finance-erp/mock/master-data";
import { getCostCenters, createCostCenter, updateCostCenter, deleteCostCenter, type CostCenter, type CostCenterInput } from "@/lib/finance-erp/general-ledger/cost-centers";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";

const EMPTY: CostCenterInput = { code: "", name: "", branchId: BRANCHES[0].id, manager: "", budget: 0, status: "Active" };

export default function CostCentersPage() {
  const [rows, setRows] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CostCenterInput>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => { setLoading(true); setRows(await getCostCenters()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (r: CostCenter) => { setEditingId(r.id); setForm({ code: r.code, name: r.name, branchId: r.branchId, manager: r.manager, budget: r.budget, status: r.status }); setDialogOpen(true); };

  const save = async () => {
    try {
      if (editingId) await updateCostCenter(editingId, form); else await createCostCenter(form);
      toast.success(editingId ? "Cost center updated" : "Cost center created");
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save");
    }
  };

  const columns: ColumnDef<CostCenter>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    { accessorKey: "name", header: "Name" },
    { id: "branch", header: "Branch", cell: ({ row }) => BRANCHES.find((b) => b.id === row.original.branchId)?.name ?? "—" },
    { accessorKey: "manager", header: "Manager" },
    { accessorKey: "budget", header: "Budget", cell: ({ row }) => formatAmount(row.original.budget) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row.original)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(row.original.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Cost Centers" }]} />
      <ModuleHeader icon={GitBranch} size="lg" title="Cost Centers" subtitle="Budget-holding units used across Journal Entries and financial reports" />

      <DataTable columns={columns} data={rows} storageKey="financeCostCentersGrid" searchColumn="name" searchPlaceholder="Search cost centers..." onAddClick={openCreate} addLabel="Add Cost Center" />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Cost Center" : "Add Cost Center"}</DialogTitle><DialogDescription>Code must be unique.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormTextField label="Code *" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} />
            <FormTextField label="Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <FormSelectField label="Branch" value={form.branchId} onChange={(v) => setForm((f) => ({ ...f, branchId: v }))} options={BRANCHES.map((b) => ({ value: b.id, label: b.name }))} />
            <FormTextField label="Manager" value={form.manager} onChange={(v) => setForm((f) => ({ ...f, manager: v }))} />
            <FormTextField label="Budget" type="number" value={form.budget} onChange={(v) => setForm((f) => ({ ...f, budget: Number(v) || 0 }))} />
            <FormSelectField label="Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as CostCenter["status"] }))} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        description="This cost center will be permanently removed."
        confirmLabel="Delete"
        onConfirm={async () => { if (deleteId) { await deleteCostCenter(deleteId); toast.success("Cost center deleted"); load(); } }}
      />
    </div>
  );
}
