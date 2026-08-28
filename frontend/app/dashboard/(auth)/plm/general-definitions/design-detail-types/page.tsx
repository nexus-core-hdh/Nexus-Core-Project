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

interface DDType { id: string; name: string; category?: string; isActive: boolean; description?: string; }
const empty = { name: '', category: '', isActive: true, description: '' };

export default function DesignDetailTypesPage() {
  const [data, setData] = useState<DDType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); try { const r = await plmApi.designDetailTypes.list(); setData(Array.isArray(r) ? r : []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return toast.error("Name is required");
    setSaving(true);
    try {
      if (editing) { await plmApi.designDetailTypes.update(editing, form); toast.success("Updated"); }
      else { await plmApi.designDetailTypes.create(form); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Design Detail Types</p><h1 className="text-xl font-semibold">Design Detail Types</h1></div>
      <PlmCrudTable title="" storageKey="designDetailTypes" data={data} loading={loading} searchKey="name" searchPlaceholder="Search..."
        onAdd={() => { setForm(empty); setEditing(null); setOpen(true); }}
        onEdit={(r) => { setForm({ name: r.name, category: r.category || '', isActive: r.isActive, description: r.description || '' }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r) => { await plmApi.designDetailTypes.delete(r.id); load(); }}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category', render: (r) => <span className="text-muted-foreground">{r.category || '—'}</span> },
          { key: 'isActive', label: 'Status', render: (r) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Detail Type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm((p: any) => ({ ...p, category: e.target.value }))} placeholder="e.g. Construction" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isActive: v }))} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
