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
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface Dept { id: string; name: string; code: string; branchId: string; isActive: boolean; description?: string; _count?: { employees: number; processCards: number }; }

export default function DepartmentCardsPage() {
  const [data, setData] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', code: '', description: '', isActive: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      const r = await plmApi.departments.list({ branchId: user?.branchId });
      setData(Array.isArray(r) ? r : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.code) return toast.error("Name and code required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, branchId: user?.branchId };
      if (editing) { await plmApi.departments.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.departments.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Departments</p><h1 className="text-xl font-semibold">Department Cards</h1></div>
      <PlmCrudTable title="" storageKey="departmentCards" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm({ name: '', code: '', description: '', isActive: true }); setEditing(null); setOpen(true); }}
        onEdit={(r) => { setForm({ name: r.name, code: r.code, description: r.description || '', isActive: r.isActive }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r) => { await plmApi.departments.delete(r.id); load(); }}
        columns={[
          { key: 'name', label: 'Department' },
          { key: 'code', label: 'Code', render: (r) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'employees', label: 'Employees', render: (r) => r._count?.employees ?? '—' },
          { key: 'processes', label: 'Processes', render: (r) => r._count?.processCards ?? '—' },
          { key: 'isActive', label: 'Status', render: (r) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Department</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm((p: any) => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isActive: v }))} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
