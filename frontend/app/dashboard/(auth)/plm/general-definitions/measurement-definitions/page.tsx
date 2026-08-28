"use client";

import { useEffect, useState } from "react";
import { PlmCrudTable } from "../../_components/plm-crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";

interface MeasDef { id: string; name: string; code: string; unit: string; bodyPart?: string; sequence: number; isActive: boolean; }
const empty = { name: '', code: '', unit: 'cm', bodyPart: '', sequence: 0, isActive: true };

export default function MeasurementDefsPage() {
  const [data, setData] = useState<MeasDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); try { const r = await plmApi.measurementDefs.list(); setData(Array.isArray(r) ? r : []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.code) return toast.error("Name and code required");
    setSaving(true);
    try {
      if (editing) { await plmApi.measurementDefs.update(editing, form); toast.success("Updated"); }
      else { await plmApi.measurementDefs.create(form); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Measurement Definitions</p><h1 className="text-xl font-semibold">Measurement Definitions</h1></div>
      <PlmCrudTable title="" storageKey="measurementDefinitions" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm(empty); setEditing(null); setOpen(true); }}
        onEdit={(r) => { setForm({ name: r.name, code: r.code, unit: r.unit, bodyPart: r.bodyPart || '', sequence: r.sequence, isActive: r.isActive }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r) => { await plmApi.measurementDefs.delete(r.id); load(); }}
        columns={[
          { key: 'sequence', label: '#' },
          { key: 'name', label: 'Measurement' },
          { key: 'code', label: 'Code', render: (r) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'unit', label: 'Unit' },
          { key: 'bodyPart', label: 'Body Part', render: (r) => r.bodyPart || '—' },
          { key: 'isActive', label: 'Status', render: (r) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Measurement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm((p: any) => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm((p: any) => ({ ...p, unit: e.target.value }))} placeholder="cm" /></div>
              <div><Label>Sequence</Label><Input type="number" value={form.sequence} onChange={(e) => setForm((p: any) => ({ ...p, sequence: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <div><Label>Body Part</Label><Input value={form.bodyPart} onChange={(e) => setForm((p: any) => ({ ...p, bodyPart: e.target.value }))} placeholder="e.g. torso" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isActive: v }))} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
