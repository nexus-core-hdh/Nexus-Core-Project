"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Scale, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { DataTable } from "@/components/shared/data-table/data-table";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField, FormSelectField, FieldLabel } from "@/components/forms/form-field";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { formatAmount, formatDate, todayIso, amountColorClass } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { assetRevaluationsApi, currentValueFor, type AssetRevaluation, type RevaluationStatus } from "@/lib/finance-erp/fixed-assets/revaluation";
import { fixedAssetsApi, type FixedAsset } from "@/lib/finance-erp/fixed-assets/register";

const STATUSES: RevaluationStatus[] = ["Draft", "Pending Approval", "Approved", "Rejected"];

export default function AssetRevaluationPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [rows, setRows] = useState<AssetRevaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRevaluation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ assetId: "", revaluedValue: "", effectiveDate: todayIso(), reason: "", status: "Draft" as RevaluationStatus });

  const load = async () => {
    setLoading(true);
    setAssets(fixedAssetsApi.snapshot());
    setRows(await assetRevaluationsApi.list());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const assetLabel = (assetId: string) => { const a = assets.find((x) => x.id === assetId); return a ? `${a.assetId} - ${a.name}` : "—"; };

  const openNew = () => { setEditing(null); setForm({ assetId: assets[0]?.id ?? "", revaluedValue: "", effectiveDate: todayIso(), reason: "", status: "Draft" }); setOpen(true); };
  const openEdit = (r: AssetRevaluation) => { setEditing(r); setForm({ assetId: r.assetId, revaluedValue: String(r.revaluedValue), effectiveDate: r.effectiveDate, reason: r.reason, status: r.status }); setOpen(true); };

  const save = async () => {
    setSaving(true);
    try {
      if (!form.assetId) throw new FinanceValidationError("Asset is required.");
      // Preserve the record's own historical Current Value on edit — recomputing it live from
      // today's date would silently drift the stored Difference every time an existing
      // revaluation is re-saved (e.g. just to fix a typo in Reason).
      const currentValue = editing ? editing.currentValue : currentValueFor(form.assetId);
      const payload = { assetId: form.assetId, currentValue, revaluedValue: Number(form.revaluedValue) || 0, effectiveDate: form.effectiveDate, reason: form.reason, status: form.status };
      if (editing) await assetRevaluationsApi.update(editing.id, payload);
      else await assetRevaluationsApi.create(payload);
      toast.success(editing ? "Revaluation updated" : "Revaluation recorded");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save revaluation");
    } finally { setSaving(false); }
  };

  const columns: ColumnDef<AssetRevaluation>[] = [
    { id: "asset", header: "Asset", cell: ({ row }) => assetLabel(row.original.assetId) },
    { accessorKey: "currentValue", header: "Current Value", cell: ({ row }) => formatAmount(row.original.currentValue) },
    { accessorKey: "revaluedValue", header: "Revalued Value", cell: ({ row }) => formatAmount(row.original.revaluedValue) },
    { id: "difference", header: "Difference", cell: ({ row }) => { const d = row.original.revaluedValue - row.original.currentValue; return <span className={amountColorClass(d) || "text-emerald-600 dark:text-emerald-400"}>{formatAmount(d)}</span>; } },
    { accessorKey: "effectiveDate", header: "Effective Date", cell: ({ row }) => formatDate(row.original.effectiveDate) },
    { accessorKey: "reason", header: "Reason" },
    { accessorKey: "status", header: "Approval Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "Actions", enableHiding: false, size: 60, cell: ({ row }) => <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row.original)} title="Edit revaluation" aria-label="Edit revaluation"><Pencil className="h-3.5 w-3.5" /></Button> },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Asset Revaluation" }]} />
      <ModuleHeader icon={Scale} size="lg" title="Asset Revaluation" subtitle="Independent revaluation adjustments to asset carrying values" actions={<ExportPrintBar />} />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <DataTable columns={columns} data={rows} storageKey="financeAssetRevaluationGrid" onAddClick={openNew} addLabel="New Revaluation" />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dismissOnEscape dismissOnOutside className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Revaluation" : "New Asset Revaluation"}</DialogTitle><DialogDescription>Current value is pulled automatically from the asset's depreciation schedule.</DialogDescription></DialogHeader>
          <FormSection title="Revaluation Details">
            <FormSelectField label="Asset *" value={form.assetId} onChange={(v) => setForm((f) => ({ ...f, assetId: v }))} options={assets.map((a) => ({ value: a.id, label: `${a.assetId} - ${a.name}` }))} span="wide" />
            <div className="space-y-2">
              <FieldLabel>Current Value</FieldLabel>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
                {editing ? formatAmount(editing.currentValue) : form.assetId ? formatAmount(currentValueFor(form.assetId)) : "—"}
              </div>
            </div>
            <FormTextField label="Revalued Value *" type="number" value={form.revaluedValue} onChange={(v) => setForm((f) => ({ ...f, revaluedValue: v }))} />
            <FormTextField label="Effective Date" type="date" value={form.effectiveDate} onChange={(v) => setForm((f) => ({ ...f, effectiveDate: v }))} />
            <FormSelectField label="Approval Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as RevaluationStatus }))} options={STATUSES.map((s) => ({ value: s, label: s }))} />
            <div className="space-y-2 md:col-span-3">
              <FieldLabel>Reason</FieldLabel>
              <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={2} />
            </div>
          </FormSection>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? "Save Changes" : "Record Revaluation"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
