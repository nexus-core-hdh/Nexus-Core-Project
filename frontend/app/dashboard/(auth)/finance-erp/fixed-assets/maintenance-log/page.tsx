"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Wrench, Pencil } from "lucide-react";

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
import { formatAmount, formatDate, todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import {
  maintenanceLogApi, MAINTENANCE_TYPES, VENDORS, type MaintenanceLogEntry, type MaintenanceType, type MaintenanceStatus,
} from "@/lib/finance-erp/fixed-assets/maintenance-log";
import { fixedAssetsApi, type FixedAsset } from "@/lib/finance-erp/fixed-assets/register";

const STATUSES: MaintenanceStatus[] = ["Scheduled", "In Progress", "Completed"];

const EMPTY = { assetId: "", maintenanceDate: todayIso(), type: "Preventive" as MaintenanceType, vendorId: "", cost: "", description: "", nextMaintenanceDate: "", status: "Scheduled" as MaintenanceStatus };

export default function MaintenanceLogPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [rows, setRows] = useState<MaintenanceLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceLogEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    setLoading(true);
    setAssets(fixedAssetsApi.snapshot());
    setRows(await maintenanceLogApi.list());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const assetLabel = (assetId: string) => { const a = assets.find((x) => x.id === assetId); return a ? `${a.assetId} - ${a.name}` : "—"; };
  const vendorLabel = (vendorId: string) => VENDORS.find((v) => v.id === vendorId)?.name ?? "—";

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, assetId: assets[0]?.id ?? "" }); setOpen(true); };
  const openEdit = (r: MaintenanceLogEntry) => {
    setEditing(r);
    setForm({ assetId: r.assetId, maintenanceDate: r.maintenanceDate, type: r.type, vendorId: r.vendorId, cost: String(r.cost), description: r.description, nextMaintenanceDate: r.nextMaintenanceDate, status: r.status });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (!form.assetId) throw new FinanceValidationError("Asset is required.");
      if (!form.maintenanceDate) throw new FinanceValidationError("Maintenance Date is required.");
      if (Number(form.cost) < 0) throw new FinanceValidationError("Cost cannot be negative.");
      if (form.nextMaintenanceDate && form.nextMaintenanceDate < form.maintenanceDate) {
        throw new FinanceValidationError("Next Maintenance Date cannot be before the Maintenance Date.");
      }
      const payload = { ...form, cost: Number(form.cost) || 0 };
      if (editing) await maintenanceLogApi.update(editing.id, payload);
      else await maintenanceLogApi.create(payload);
      toast.success(editing ? "Maintenance record updated" : "Maintenance logged");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save maintenance record");
    } finally { setSaving(false); }
  };

  const columns: ColumnDef<MaintenanceLogEntry>[] = [
    { id: "asset", header: "Asset", cell: ({ row }) => assetLabel(row.original.assetId) },
    { accessorKey: "maintenanceDate", header: "Date", cell: ({ row }) => formatDate(row.original.maintenanceDate) },
    { accessorKey: "type", header: "Type" },
    { id: "vendor", header: "Vendor", cell: ({ row }) => vendorLabel(row.original.vendorId) },
    { accessorKey: "cost", header: "Cost", cell: ({ row }) => formatAmount(row.original.cost) },
    { accessorKey: "description", header: "Description" },
    { accessorKey: "nextMaintenanceDate", header: "Next Maintenance", cell: ({ row }) => formatDate(row.original.nextMaintenanceDate) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "Actions", enableHiding: false, size: 60, cell: ({ row }) => <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row.original)} title="Edit maintenance record" aria-label="Edit maintenance record"><Pencil className="h-3.5 w-3.5" /></Button> },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Maintenance Log" }]} />
      <ModuleHeader icon={Wrench} size="lg" title="Maintenance Log" subtitle="Preventive, corrective and inspection history for fixed assets" actions={<ExportPrintBar />} />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <DataTable columns={columns} data={rows} storageKey="financeMaintenanceLogGrid" onAddClick={openNew} addLabel="Log Maintenance" />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dismissOnEscape dismissOnOutside className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Maintenance Record" : "Log Maintenance"}</DialogTitle><DialogDescription>Track service history and the next scheduled maintenance date.</DialogDescription></DialogHeader>
          <FormSection title="Maintenance Details">
            <FormSelectField label="Asset *" value={form.assetId} onChange={(v) => setForm((f) => ({ ...f, assetId: v }))} options={assets.map((a) => ({ value: a.id, label: `${a.assetId} - ${a.name}` }))} span="wide" />
            <FormTextField label="Maintenance Date" type="date" value={form.maintenanceDate} onChange={(v) => setForm((f) => ({ ...f, maintenanceDate: v }))} />
            <FormSelectField label="Type" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v as MaintenanceType }))} options={MAINTENANCE_TYPES.map((t) => ({ value: t, label: t }))} />
            <FormSelectField label="Vendor" value={form.vendorId} onChange={(v) => setForm((f) => ({ ...f, vendorId: v }))} options={VENDORS.map((v) => ({ value: v.id, label: v.name }))} />
            <FormTextField label="Cost" type="number" value={form.cost} onChange={(v) => setForm((f) => ({ ...f, cost: v }))} />
            <FormTextField label="Next Maintenance Date" type="date" value={form.nextMaintenanceDate} onChange={(v) => setForm((f) => ({ ...f, nextMaintenanceDate: v }))} />
            <FormSelectField label="Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as MaintenanceStatus }))} options={STATUSES.map((s) => ({ value: s, label: s }))} />
            <div className="space-y-2 md:col-span-3">
              <FieldLabel>Description</FieldLabel>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
          </FormSection>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? "Save Changes" : "Log Maintenance"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
