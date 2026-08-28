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
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

const emptyForm = { code: "", name: "", explanation: "", sequence: "", isActive: true };

export default function SampleTaskTypesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      const r = await plmApi.sampleTaskTypes.list({ branchId: user?.branchId });
      setData(Array.isArray(r) ? r : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.code || !form.name) return toast.error("Code and name required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, branchId: user?.branchId, sequence: form.sequence ? parseInt(form.sequence) : 0 };
      if (editing) { await plmApi.sampleTaskTypes.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.sampleTaskTypes.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Sample Task Types</p><h1 className="text-xl font-semibold">Sample Task Types</h1></div>
      <PlmCrudTable title="" storageKey="sampleTaskTypes" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm({ ...emptyForm, sequence: String((data.length + 1) * 1) }); setEditing(null); setOpen(true); }}
        onEdit={(r: any) => { setForm({ ...emptyForm, ...r, sequence: String(r.sequence ?? '') }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r: any) => { await plmApi.sampleTaskTypes.delete(r.id); load(); }}
        columns={[
          { key: 'code', label: 'Code', render: (r: any) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'name', label: 'Name' },
          { key: 'explanation', label: 'Explanation', render: (r: any) => r.explanation || '—' },
          { key: 'isActive', label: 'Status', render: (r: any) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Sample Task Type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><Label>Explanation</Label><Input value={form.explanation} onChange={(e) => set('explanation', e.target.value)} /></div>
            <div><Label>Sequence</Label><Input type="number" value={form.sequence} onChange={(e) => set('sequence', e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
