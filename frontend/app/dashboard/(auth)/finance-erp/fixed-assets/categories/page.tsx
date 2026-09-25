"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Tags, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { DataTable } from "@/components/shared/data-table/data-table";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField, FormSelectField } from "@/components/forms/form-field";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";
import { ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { assetCategoriesApi, DEPRECIATION_METHODS, type AssetCategory, type DepreciationMethod } from "@/lib/finance-erp/fixed-assets/categories";

type FormState = { name: string; code: string; description: string; depreciationMethod: DepreciationMethod; usefulLifeYears: string; residualValuePct: string };
const EMPTY: FormState = { name: "", code: "", description: "", depreciationMethod: "Straight Line", usefulLifeYears: "5", residualValuePct: "0" };

export default function AssetCategoriesPage() {
  const [rows, setRows] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssetCategory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => { setLoading(true); setRows(await assetCategoriesApi.list()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: AssetCategory) => {
    setEditing(c);
    setForm({ name: c.name, code: c.code, description: c.description, depreciationMethod: c.depreciationMethod, usefulLifeYears: String(c.usefulLifeYears), residualValuePct: String(c.residualValuePct) });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (!form.usefulLifeYears || Number(form.usefulLifeYears) <= 0) throw new FinanceValidationError("Useful Life must be greater than zero.");
      if (form.residualValuePct !== "" && (Number(form.residualValuePct) < 0 || Number(form.residualValuePct) > 100)) {
        throw new FinanceValidationError("Residual Value (%) must be between 0 and 100.");
      }
      const payload = {
        name: form.name.trim(), code: form.code.trim(), description: form.description.trim(),
        depreciationMethod: form.depreciationMethod, usefulLifeYears: Number(form.usefulLifeYears) || 1,
        residualValuePct: Number(form.residualValuePct) || 0,
      };
      if (editing) await assetCategoriesApi.update(editing.id, payload);
      else await assetCategoriesApi.create(payload);
      toast.success(editing ? "Category updated" : "Category created");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await assetCategoriesApi.remove(deleteId);
    toast.success("Category removed");
    load();
  };

  const columns: ColumnDef<AssetCategory>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    { accessorKey: "name", header: "Category Name" },
    { accessorKey: "description", header: "Description" },
    { accessorKey: "depreciationMethod", header: "Depreciation Method" },
    { accessorKey: "usefulLifeYears", header: "Useful Life (Yrs)" },
    { accessorKey: "residualValuePct", header: "Residual Value", cell: ({ row }) => `${row.original.residualValuePct}%` },
    {
      id: "actions", header: "Actions", enableHiding: false, size: 90,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row.original)} title="Edit category" aria-label="Edit category"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(row.original.id)} title="Delete category" aria-label="Delete category"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Asset Categories" }]} />
      <ModuleHeader icon={Tags} size="lg" title="Asset Categories" subtitle="Default depreciation method, useful life and residual value per asset class" actions={<ExportPrintBar />} />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <DataTable columns={columns} data={rows} storageKey="financeAssetCategoriesGrid" searchColumn="name" searchPlaceholder="Search categories..." onAddClick={openNew} addLabel="Add Category" />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dismissOnEscape dismissOnOutside className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Asset Category"}</DialogTitle>
            <DialogDescription>Defines the default depreciation basis for assets in this class.</DialogDescription>
          </DialogHeader>
          <FormSection title="Category Details">
            <FormTextField label="Category Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} span="wide" />
            <FormTextField label="Code *" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} />
            <FormTextField label="Description" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} span="wide" />
            <FormSelectField label="Depreciation Method" value={form.depreciationMethod} onChange={(v) => setForm((f) => ({ ...f, depreciationMethod: v as DepreciationMethod }))} options={DEPRECIATION_METHODS.map((m) => ({ value: m, label: m }))} />
            <FormTextField label="Useful Life (Years)" type="number" value={form.usefulLifeYears} onChange={(v) => setForm((f) => ({ ...f, usefulLifeYears: v }))} />
            <FormTextField label="Residual Value (%)" type="number" value={form.residualValuePct} onChange={(v) => setForm((f) => ({ ...f, residualValuePct: v }))} />
          </FormSection>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? "Save Changes" : "Create Category"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Delete Category" description="Existing assets referencing this category will keep their current values, but it will no longer be selectable." confirmLabel="Delete" onConfirm={confirmDelete} />
    </div>
  );
}
