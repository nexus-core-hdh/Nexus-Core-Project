"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Percent, Plus, Pencil, Trash2 } from "lucide-react";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { FormTextField, FormSelectField } from "@/components/forms/form-field";

import { StatusFilter } from "../_components/status-filter";
import type { TaxRate } from "@/lib/finance-erp/mock/master-data";
import { taxConfigurationApi, TAX_ACCOUNT_OPTIONS } from "@/lib/finance-erp/settings/tax-configuration";
import { makeId } from "@/lib/finance-erp/mock/create-store";

const EMPTY: TaxRate = { id: "", name: "", type: "Sales Tax", rate: 0, account: TAX_ACCOUNT_OPTIONS[0], status: "Active" };

export default function TaxConfigurationPage() {
  const [rows, setRows] = useState<TaxRate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<TaxRate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => taxConfigurationApi.list().then(setRows);
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing({ ...EMPTY, id: makeId("tax") }); setDialogOpen(true); };
  const openEdit = (r: TaxRate) => { setEditing(r); setDialogOpen(true); };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!editing.name.trim()) return toast.error("Tax Name is required.");
      if (editing.rate < 0 || editing.rate > 100) return toast.error("Rate must be between 0 and 100.");
      const exists = rows.some((r) => r.id === editing.id);
      if (exists) await taxConfigurationApi.update(editing.id, editing);
      else await taxConfigurationApi.create(editing);
      toast.success(exists ? "Tax configuration updated" : "Tax configuration created");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save tax configuration");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    await taxConfigurationApi.remove(deleteTarget.id);
    toast.success("Tax configuration removed");
    load();
  };

  const columns: ColumnDef<TaxRate>[] = [
    { accessorKey: "name", header: "Tax Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <StatusBadge status={row.original.type} className="border-0 bg-muted text-foreground" /> },
    { accessorKey: "rate", header: "Rate", cell: ({ row }) => <span className="font-mono">{row.original.rate}%</span> },
    { accessorKey: "account", header: "Account" },
    { accessorKey: "status", header: "Status", filterFn: "equalsString", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", enableHiding: false, size: 90,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit tax configuration" aria-label="Edit tax configuration" onClick={() => openEdit(row.original)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete tax configuration" aria-label="Delete tax configuration" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Finance Settings" }, { label: "Tax Configuration" }]} />
      <ModuleHeader
        icon={Percent}
        title="Tax Configuration"
        subtitle="Sales Tax and WHT rates used across Payable and Receivable documents"
        actions={<Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Tax</Button>}
      />
      <DataTable
        columns={columns} data={rows} storageKey="financeTaxConfigGrid" searchColumn="name" searchPlaceholder="Search tax configurations..."
        toolbarExtra={(table) => <StatusFilter table={table} options={["Active", "Inactive"]} />}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dismissOnOutside dismissOnEscape>
          <DialogHeader>
            <DialogTitle>{rows.some((r) => r.id === editing.id) ? "Edit Tax Configuration" : "Add Tax Configuration"}</DialogTitle>
            <DialogDescription>Combination of Type + Rate must be unique.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormTextField label="Tax Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} span="wide" />
            <FormSelectField
              label="Type" value={editing.type} onChange={(v) => setEditing({ ...editing, type: v as TaxRate["type"] })}
              options={[{ value: "Sales Tax", label: "Sales Tax" }, { value: "WHT", label: "WHT" }]}
            />
            <FormTextField label="Rate (%)" type="number" value={editing.rate} onChange={(v) => setEditing({ ...editing, rate: Number(v) || 0 })} />
            <FormSelectField
              label="Account" value={editing.account} onChange={(v) => setEditing({ ...editing, account: v })}
              options={TAX_ACCOUNT_OPTIONS.map((a) => ({ value: a, label: a }))}
            />
            <FormSelectField
              label="Status" value={editing.status} onChange={(v) => setEditing({ ...editing, status: v as "Active" | "Inactive" })}
              options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete tax configuration?"
        description={`This will permanently remove "${deleteTarget?.name ?? ""}".`}
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}
