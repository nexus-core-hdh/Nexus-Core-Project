"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { ListOrdered, Plus, Pencil, Trash2 } from "lucide-react";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { FormTextField, FormSelectField, FormNumberStepperField } from "@/components/forms/form-field";

import { StatusFilter } from "../_components/status-filter";
import {
  numberingSeriesApi, NUMBERING_DOCUMENT_TYPES, ALL_BRANCHES_OPTION, type NumberingSeries,
} from "@/lib/finance-erp/settings/numbering-series";
import { makeId } from "@/lib/finance-erp/mock/create-store";

const EMPTY: NumberingSeries = {
  id: "", documentType: "Demand", prefix: "", startingNumber: 1, currentNumber: 1,
  format: "{PREFIX}-{YYYY}-{SEQ}", branch: ALL_BRANCHES_OPTION, status: "Active",
};

export default function NumberingSeriesPage() {
  const [rows, setRows] = useState<NumberingSeries[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NumberingSeries>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<NumberingSeries | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => numberingSeriesApi.list().then(setRows);
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing({ ...EMPTY, id: makeId("num") }); setDialogOpen(true); };
  const openEdit = (r: NumberingSeries) => { setEditing(r); setDialogOpen(true); };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!editing.prefix.trim()) return toast.error("Prefix is required.");
      if (editing.startingNumber < 1) return toast.error("Starting Number must be at least 1.");
      if (editing.currentNumber < editing.startingNumber) return toast.error("Current Number cannot be less than Starting Number.");
      const exists = rows.some((r) => r.id === editing.id);
      if (exists) await numberingSeriesApi.update(editing.id, editing);
      else await numberingSeriesApi.create(editing);
      toast.success(exists ? "Numbering series updated" : "Numbering series created");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save numbering series");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    await numberingSeriesApi.remove(deleteTarget.id);
    toast.success("Numbering series removed");
    load();
  };

  const columns: ColumnDef<NumberingSeries>[] = [
    { accessorKey: "documentType", header: "Document Type", cell: ({ row }) => <span className="font-medium">{row.original.documentType}</span> },
    { accessorKey: "prefix", header: "Prefix", cell: ({ row }) => <span className="font-mono text-xs">{row.original.prefix}</span> },
    { accessorKey: "format", header: "Format", cell: ({ row }) => <span className="font-mono text-xs">{row.original.format}</span> },
    { accessorKey: "startingNumber", header: "Starting Number" },
    { accessorKey: "currentNumber", header: "Current Number" },
    { accessorKey: "branch", header: "Branch" },
    { accessorKey: "status", header: "Status", filterFn: "equalsString", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", enableHiding: false, size: 90,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit numbering series" aria-label="Edit numbering series" onClick={() => openEdit(row.original)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete numbering series" aria-label="Delete numbering series" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Finance Settings" }, { label: "Numbering Series" }]} />
      <ModuleHeader
        icon={ListOrdered}
        title="Numbering Series"
        subtitle="Document numbering formats for every Finance document type"
        actions={<Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Series</Button>}
      />
      <DataTable
        columns={columns} data={rows} storageKey="financeNumberingSeriesGrid" searchColumn="documentType" searchPlaceholder="Search document types..."
        toolbarExtra={(table) => <StatusFilter table={table} options={["Active", "Inactive"]} />}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dismissOnOutside dismissOnEscape>
          <DialogHeader>
            <DialogTitle>{rows.some((r) => r.id === editing.id) ? "Edit Numbering Series" : "Add Numbering Series"}</DialogTitle>
            <DialogDescription>Combination of Document Type + Branch must be unique.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormSelectField
              label="Document Type" value={editing.documentType} onChange={(v) => setEditing({ ...editing, documentType: v as NumberingSeries["documentType"] })}
              options={NUMBERING_DOCUMENT_TYPES.map((d) => ({ value: d, label: d }))}
            />
            <FormSelectField
              label="Branch" value={editing.branch} onChange={(v) => setEditing({ ...editing, branch: v })}
              options={numberingSeriesApi.branchOptions().map((b) => ({ value: b, label: b }))}
            />
            <FormTextField label="Prefix" value={editing.prefix} onChange={(v) => setEditing({ ...editing, prefix: v.toUpperCase() })} />
            <FormTextField label="Format" value={editing.format} onChange={(v) => setEditing({ ...editing, format: v })} />
            <FormNumberStepperField label="Starting Number" value={editing.startingNumber} onChange={(v) => setEditing({ ...editing, startingNumber: Number(v) || 1 })} />
            <FormNumberStepperField label="Current Number" value={editing.currentNumber} onChange={(v) => setEditing({ ...editing, currentNumber: Number(v) || 1 })} />
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
        title="Delete numbering series?"
        description={`This will permanently remove the "${deleteTarget?.documentType ?? ""}" numbering series.`}
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}
