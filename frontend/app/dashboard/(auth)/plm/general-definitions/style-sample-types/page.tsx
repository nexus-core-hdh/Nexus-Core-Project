"use client";

import { useEffect, useState } from "react";
import { PlmCrudTable } from "../../_components/plm-crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";

interface SampleType { id: string; name: string; code: string; sequence: number; isActive: boolean; description?: string; }
const empty: Omit<SampleType, 'id'> = { name: '', code: '', sequence: 0, isActive: true };

export default function StyleSampleTypesPage() {
  const [data, setData] = useState<SampleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); try { const r = await plmApi.sampleTypes.list(); setData(Array.isArray(r) ? r : []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(empty); setEditing(null); setOpen(true); };
  const openEdit = (row: SampleType) => { setForm({ name: row.name, code: row.code, sequence: row.sequence, isActive: row.isActive, description: row.description || '' }); setEditing(row.id); setOpen(true); };

  const save = async () => {
    if (!form.name || !form.code) return toast.error("Name and code are required");
    setSaving(true);
    try {
      if (editing) { await plmApi.sampleTypes.update(editing, form); toast.success("Updated"); }
      else { await plmApi.sampleTypes.create(form); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const del = async (row: SampleType) => { await plmApi.sampleTypes.delete(row.id); load(); };

  return (
    <div className="p-6">
      <div className="mb-2">
        <p className="text-xs text-muted-foreground">General Definitions › Style Sample Types</p>
        <h1 className="text-xl font-semibold">Style Sample Types</h1>
      </div>
      <PlmCrudTable
        title="" storageKey="styleSampleTypes" data={data} loading={loading} searchKey="name" searchPlaceholder="Search types..."
        onAdd={openAdd} onEdit={openEdit} onDelete={del}
        columns={[
          { key: 'sequence', label: '#', render: (r) => <span className="text-muted-foreground">{r.sequence}</span> },
          { key: 'name', label: 'Name' },
          { key: 'code', label: 'Code', render: (r) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'description', label: 'Description', render: (r) => <span className="text-muted-foreground">{r.description || '—'}</span> },
          { key: 'isActive', label: 'Status', render: (r) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Sample Type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} placeholder="e.g. Proto" /></div>
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm((p: any) => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g. PROTO" /></div>
            <div><Label>Sequence</Label><Input type="number" value={form.sequence} onChange={(e) => setForm((p: any) => ({ ...p, sequence: parseInt(e.target.value) || 0 }))} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isActive: v }))} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
