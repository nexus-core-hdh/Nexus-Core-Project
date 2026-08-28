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

const RESOURCE_TYPES = ['machine', 'tool', 'workstation', 'vehicle', 'software', 'other'];
const STATUS_OPTIONS = ['available', 'in-use', 'maintenance', 'offline'];
interface Resource { id: string; name: string; code: string; type: string; status: string; isActive: boolean; costPerHour?: number; }

export default function ResourceCardsPage() {
  const [data, setData] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', code: '', type: 'machine', status: 'available', costPerHour: '', isActive: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); try { const user = getCurrentUser(); const r = await plmApi.resources.list({ branchId: user?.branchId }); setData(Array.isArray(r) ? r : []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.code) return toast.error("Name and code required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, branchId: user?.branchId, costPerHour: form.costPerHour ? parseFloat(form.costPerHour) : undefined };
      if (editing) { await plmApi.resources.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.resources.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const statusColor: Record<string, string> = { available: 'default', 'in-use': 'secondary', maintenance: 'destructive', offline: 'outline' };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Resource Cards</p><h1 className="text-xl font-semibold">Resource Cards</h1></div>
      <PlmCrudTable title="" storageKey="resourceCards" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm({ name: '', code: '', type: 'machine', status: 'available', costPerHour: '', isActive: true }); setEditing(null); setOpen(true); }}
        onEdit={(r) => { setForm({ name: r.name, code: r.code, type: r.type, status: r.status, costPerHour: r.costPerHour || '', isActive: r.isActive }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r) => { await plmApi.resources.delete(r.id); load(); }}
        columns={[
          { key: 'name', label: 'Resource' },
          { key: 'code', label: 'Code', render: (r) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge variant={(statusColor[r.status] as any) || 'outline'}>{r.status}</Badge> },
          { key: 'costPerHour', label: 'Cost/Hr', render: (r) => r.costPerHour ? `$${r.costPerHour}` : '—' },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Resource</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm((p: any) => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((p: any) => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RESOURCE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p: any) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Cost Per Hour</Label><Input type="number" value={form.costPerHour} onChange={(e) => setForm((p: any) => ({ ...p, costPerHour: e.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isActive: v }))} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
