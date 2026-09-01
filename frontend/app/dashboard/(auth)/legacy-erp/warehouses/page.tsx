"use client";

import { useEffect, useState } from "react";
import { PlmCrudTable } from "../../plm/_components/plm-crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Warehouse, ChevronRight } from "lucide-react";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField, FormSwitchField } from "@/components/forms/form-field";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { ModuleHeader } from "@/components/legacy-erp/module-header";

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
  const wl = useWorklist({ storageKey: "warehousesListWorklists" });

  const load = async (worklistOverride?: Worklist | null) => {
    setLoading(true);
    try {
      const worklist = worklistOverride !== undefined ? worklistOverride : wl.activeWorklist;
      const r = worklist
        ? await legacyErpApi.worklistFields.resolve("warehouse-list", worklist.fields.map((f) => ({ source: f.source, key: f.key })))
        : await legacyErpApi.warehouses.list();
      const list = Array.isArray(r) ? (worklist ? wl.normalizeRows(r) : r) : [];
      setData(list.map((w: any) => ({ ...w, id: String(w.id) })));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const onWorklistChange = (id: string) => {
    const worklist = id === STANDARD_WORKLIST_ID ? null : wl.worklists.find((w) => w.id === id) ?? null;
    wl.setActiveWorklistId(id);
    load(worklist);
  };

  const handleSaveWorklists = async (next: Worklist[]) => {
    const { activeWorklist } = await wl.saveWorklists(next);
    load(activeWorklist);
  };

  const activeColumns = wl.activeWorklist ? wl.columnsFor([]) : null;
  const worklistSearchKey = activeColumns?.includes("warehouse:WarehouseName") ? "warehouse:WarehouseName" : undefined;

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  // Shows the code the next Save will get, before Save is ever pressed — a preview only (see
  // warehouse.controller.ts's next-code route). Mirrors yarn-cards/page.tsx's own
  // loadPreviewCode; Code is never user-editable here, on Create or Edit.
  const loadPreviewCode = async () => {
    try {
      const r: any = await legacyErpApi.warehouses.previewNextCode();
      set("warehouseCode", r.code);
    } catch {
      // Non-critical — Save still generates the real code even if this preview fails to load.
    }
  };

  const save = async () => {
    if (!form.warehouseName) return toast.error("Name is required");
    setSaving(true);
    try {
      // id/companyId ride along on `form` because onEdit spreads the full list row (which
      // includes them via ROW_SELECT) into form state — neither is a field on Create/
      // UpdateWarehouseDto, and the API's global ValidationPipe runs with
      // forbidNonWhitelisted: true, so sending them made every update 400 with
      // "property id should not exist". Strip them here rather than relaxing that pipe,
      // which is shared by every other endpoint in the app.
      const { id, companyId, ...rest } = form;
      const payload = { ...rest, startDate: form.startDate || undefined, endDate: form.endDate || undefined };
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

      <ModuleHeader icon={Warehouse} title="Warehouses" subtitle="Storage location master" />

      <PlmCrudTable
        title=""
        storageKey="warehouses"
        columnCustomization="widthOnly"
        data={data}
        loading={loading}
        searchKey={activeColumns ? worklistSearchKey : "warehouseName"}
        searchPlaceholder="Search warehouses..."
        addLabel="Create New"
        onAdd={activeColumns ? undefined : () => { setForm({ ...emptyForm, warehouseCode: "Generating..." }); setEditing(null); setOpen(true); loadPreviewCode(); }}
        onEdit={activeColumns ? undefined : (r: any) => { setForm({ ...emptyForm, ...r, startDate: toDateInput(r.startDate), endDate: toDateInput(r.endDate) }); setEditing(Number(r.id)); setOpen(true); }}
        onDelete={activeColumns ? undefined : async (r: any) => { await legacyErpApi.warehouses.delete(Number(r.id)); load(); }}
        columns={
          activeColumns
            ? activeColumns.map((c) => ({ key: c, label: wl.columnLabel(c), render: (r: any) => formatCell(r[c]) }))
            : [
                { key: 'warehouseCode', label: 'Code', render: (r: any) => <Badge variant="outline" className="font-mono">{r.warehouseCode}</Badge> },
                { key: 'warehouseName', label: 'Name', render: (r: any) => <span className="font-medium">{r.warehouseName}</span> },
                { key: 'accessCode', label: 'Access Code', render: (r: any) => r.accessCode || <span className="text-muted-foreground">—</span> },
                { key: 'startDate', label: 'Start Date', render: (r: any) => r.startDate ? new Date(r.startDate).toLocaleDateString() : <span className="text-muted-foreground">—</span> },
                { key: 'endDate', label: 'End Date', render: (r: any) => r.endDate ? new Date(r.endDate).toLocaleDateString() : <span className="text-muted-foreground">—</span> },
                { key: 'inUse', label: 'Status', render: (r: any) => (
                    <Badge variant={r.inUse ? 'default' : 'secondary'} className={cn(r.inUse && "bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-500")}>
                      {r.inUse ? 'In Use' : 'Inactive'}
                    </Badge>
                  ) },
              ]
        }
      />

      <WorklistBar
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        onActiveWorklistChange={onWorklistChange}
        onDesignOpen={() => wl.setDesignOpen(true)}
      />

      <WorklistDesignModal
        open={wl.designOpen}
        onOpenChange={wl.setDesignOpen}
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        activeTableSource="warehouse"
        primaryScope="warehouse-list"
        gridLabel="the Warehouses grid"
        onSave={handleSaveWorklists}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Warehouse' : 'Create Warehouse'}</DialogTitle>
            <DialogDescription>{editing ? 'Update the warehouse details below.' : 'Fill in the details to create a new warehouse.'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormSection title="Identification">
              {/* Code is read-only everywhere: server-generated on Save (WH-001, ...) and never
                  user-editable, matching yarn-cards/page.tsx's own Code field convention. */}
              <FormTextField label="Code" value={form.warehouseCode} onChange={() => {}} disabled />
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
