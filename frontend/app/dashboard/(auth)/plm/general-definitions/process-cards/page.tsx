"use client";

import { useEffect, useState } from "react";
import { PlmCrudTable } from "../../_components/plm-crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";

interface Process { id: string; name: string; code: string; departmentId: string; isActive: boolean; standardTime?: number; department?: { name: string }; }

export default function ProcessCardsPage() {
  const [data, setData] = useState<Process[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', code: '', departmentId: '', standardTime: '', isActive: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([plmApi.processCards.list(), plmApi.departments.list()]);
      setData(Array.isArray(r) ? r : []);
      setDepts(Array.isArray(d) ? d : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.code) return toast.error("Name and code required");
    setSaving(true);
    try {
      const payload = { ...form, standardTime: form.standardTime ? parseFloat(form.standardTime) : undefined };
      if (editing) { await plmApi.processCards.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.processCards.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Process Cards</p><h1 className="text-xl font-semibold">Process Cards</h1></div>
      <PlmCrudTable title="" storageKey="processCards" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm({ name: '', code: '', departmentId: '', standardTime: '', isActive: true }); setEditing(null); setOpen(true); }}
        onEdit={(r) => { setForm({ name: r.name, code: r.code, departmentId: r.departmentId, standardTime: r.standardTime || '', isActive: r.isActive }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r) => { await plmApi.processCards.delete(r.id); load(); }}
        columns={[
          { key: 'name', label: 'Process' },
          { key: 'code', label: 'Code', render: (r) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'department', label: 'Department', render: (r) => r.department?.name || '—' },
          { key: 'standardTime', label: 'Std Time (min)', render: (r) => r.standardTime ? `${r.standardTime}` : '—' },
          { key: 'isActive', label: 'Status', render: (r) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Process</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm((p: any) => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
            <div><Label>Department</Label>
              <Select value={form.departmentId || "__none__"} onValueChange={(v) => setForm((p: any) => ({ ...p, departmentId: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Standard Time (min)</Label><Input type="number" value={form.standardTime} onChange={(e) => setForm((p: any) => ({ ...p, standardTime: e.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isActive: v }))} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
