"use client";

import { useEffect, useState } from "react";
import { PlmCrudTable } from "../../plm/_components/plm-crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Warehouse, ChevronRight } from "lucide-react";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField, FormSwitchField } from "@/components/forms/form-field";

const emptyForm = {
  warehouseCode: "", warehouseName: "", accessCode: "", specialCode: "",
  startDate: "", endDate: "", controlType: 0, mControlType: 0,
  isDefaultMain: false, isDefaultShipment: false, isVirtual: false,
  isWarehouseDeclaration: false, isShowRoom: false, isSwatchCard: false, inUse: true,
};

const toDateInput = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");

export default function WarehousesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await legacyErpApi.warehouses.list();
      const list = Array.isArray(r) ? r : [];
      setData(list.map((w: any) => ({ ...w, id: String(w.id) })));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.warehouseCode || !form.warehouseName) return toast.error("Code and name required");
    setSaving(true);
    try {
      const payload = { ...form, startDate: form.startDate || undefined, endDate: form.endDate || undefined };
      if (editing) { await legacyErpApi.warehouses.update(editing, payload); toast.success("Updated"); }
      else { await legacyErpApi.warehouses.create(payload); toast.success("Created"); }
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Warehouses</span>
      </div>

      <div className="flex items-center gap-4 border-b pb-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
          <Warehouse className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Warehouses</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Storage location master</p>
        </div>
      </div>

      <PlmCrudTable
        title=""
        data={data}
        loading={loading}
        searchKey="warehouseName"
        searchPlaceholder="Search warehouses..."
        addLabel="Create New"
        onAdd={() => { setForm(emptyForm); setEditing(null); setOpen(true); }}
        onEdit={(r: any) => { setForm({ ...emptyForm, ...r, startDate: toDateInput(r.startDate), endDate: toDateInput(r.endDate) }); setEditing(Number(r.id)); setOpen(true); }}
        onDelete={async (r: any) => { await legacyErpApi.warehouses.delete(Number(r.id)); load(); }}
        columns={[
          { key: 'warehouseCode', label: 'Code', render: (r: any) => <Badge variant="outline" className="font-mono">{r.warehouseCode}</Badge> },
          { key: 'warehouseName', label: 'Name', render: (r: any) => <span className="font-medium">{r.warehouseName}</span> },
          { key: 'accessCode', label: 'Access Code', render: (r: any) => r.accessCode || <span className="text-muted-foreground">—</span> },
          { key: 'startDate', label: 'Start Date', render: (r: any) => r.startDate ? new Date(r.startDate).toLocaleDateString() : <span className="text-muted-foreground">—</span> },
          { key: 'endDate', label: 'End Date', render: (r: any) => r.endDate ? new Date(r.endDate).toLocaleDateString() : <span className="text-muted-foreground">—</span> },
          { key: 'inUse', label: 'Status', render: (r: any) => <Badge variant={r.inUse ? 'default' : 'secondary'}>{r.inUse ? 'In Use' : 'Inactive'}</Badge> },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Warehouse' : 'Create Warehouse'}</DialogTitle>
            <DialogDescription>{editing ? 'Update the warehouse details below.' : 'Fill in the details to create a new warehouse.'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormSection title="Identification">
              <FormTextField label="Code" value={form.warehouseCode} onChange={(v) => set('warehouseCode', v)} />
              <FormTextField label="Name" value={form.warehouseName} onChange={(v) => set('warehouseName', v)} span="wide" />
              <FormTextField label="Access Code" value={form.accessCode} onChange={(v) => set('accessCode', v)} />
              <FormTextField label="Special Code" value={form.specialCode} onChange={(v) => set('specialCode', v)} />
              <FormTextField label="Start Date" type="date" value={form.startDate} onChange={(v) => set('startDate', v)} />
              <FormTextField label="End Date" type="date" value={form.endDate} onChange={(v) => set('endDate', v)} />
            </FormSection>

            <FormSection title="Warehouse Attributes">
              <FormSwitchField label="Default Main Warehouse" checked={form.isDefaultMain} onChange={(v) => set('isDefaultMain', v)} />
              <FormSwitchField label="Default Shipment Warehouse" checked={form.isDefaultShipment} onChange={(v) => set('isDefaultShipment', v)} />
              <FormSwitchField label="Virtual Warehouse" checked={form.isVirtual} onChange={(v) => set('isVirtual', v)} />
              <FormSwitchField label="Entrepot" checked={form.isWarehouseDeclaration} onChange={(v) => set('isWarehouseDeclaration', v)} />
              <FormSwitchField label="ShowRoom Warehouse" checked={form.isShowRoom} onChange={(v) => set('isShowRoom', v)} />
              <FormSwitchField label="Swatch Card Warehouse" checked={form.isSwatchCard} onChange={(v) => set('isSwatchCard', v)} />
              <FormSwitchField label="In Use" checked={form.inUse} onChange={(v) => set('inUse', v)} />
            </FormSection>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
