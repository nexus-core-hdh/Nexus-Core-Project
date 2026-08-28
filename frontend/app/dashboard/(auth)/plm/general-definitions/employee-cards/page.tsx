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
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface Employee { id: string; name: string; employeeNumber: string; departmentId: string; designation?: string; isActive: boolean; department?: { name: string }; }

export default function EmployeeCardsPage() {
  const [data, setData] = useState<Employee[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', employeeNumber: '', departmentId: '', designation: '', isActive: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      const [r, d] = await Promise.all([plmApi.employees.list({ branchId: user?.branchId }), plmApi.departments.list()]);
      setData(Array.isArray(r) ? r : []);
      setDepts(Array.isArray(d) ? d : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.employeeNumber || !form.departmentId) return toast.error("Name, employee number, and department required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, branchId: user?.branchId };
      if (editing) { await plmApi.employees.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.employees.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Employee Cards</p><h1 className="text-xl font-semibold">Employee Cards</h1></div>
      <PlmCrudTable title="" storageKey="employeeCards" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm({ name: '', employeeNumber: '', departmentId: '', designation: '', isActive: true }); setEditing(null); setOpen(true); }}
        onEdit={(r) => { setForm({ name: r.name, employeeNumber: r.employeeNumber, departmentId: r.departmentId, designation: r.designation || '', isActive: r.isActive }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r) => { await plmApi.employees.delete(r.id); load(); }}
        columns={[
          { key: 'employeeNumber', label: 'Emp #', render: (r) => <Badge variant="outline">{r.employeeNumber}</Badge> },
          { key: 'name', label: 'Name' },
          { key: 'department', label: 'Department', render: (r) => r.department?.name || '—' },
          { key: 'designation', label: 'Designation', render: (r) => r.designation || '—' },
          { key: 'isActive', label: 'Status', render: (r) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Employee</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Employee Number *</Label><Input value={form.employeeNumber} onChange={(e) => setForm((p: any) => ({ ...p, employeeNumber: e.target.value }))} /></div>
            <div><Label>Department *</Label>
              <Select value={form.departmentId} onValueChange={(v) => setForm((p: any) => ({ ...p, departmentId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Designation</Label><Input value={form.designation} onChange={(e) => setForm((p: any) => ({ ...p, designation: e.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isActive: v }))} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
