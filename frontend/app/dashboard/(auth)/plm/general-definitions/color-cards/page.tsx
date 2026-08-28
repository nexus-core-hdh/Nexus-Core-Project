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

const emptyForm = { code: "", name: "", explanation: "", accessCode: "", color: "#000000", doNotUseForVariantMatrix: false, inUse: true };

export default function ColorCardsPage() {
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
      const r = await plmApi.colors.list({ branchId: user?.branchId });
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
      const payload = { ...form, branchId: user?.branchId };
      if (editing) { await plmApi.colors.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.colors.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Color Cards</p><h1 className="text-xl font-semibold">Color Cards</h1></div>
      <PlmCrudTable title="" storageKey="colorCards" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm(emptyForm); setEditing(null); setOpen(true); }}
        onEdit={(r: any) => { setForm({ ...emptyForm, ...r }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r: any) => { await plmApi.colors.delete(r.id); load(); }}
        columns={[
          { key: 'code', label: 'Code', render: (r: any) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'name', label: 'Name' },
          { key: 'color', label: 'Color', render: (r: any) => <div className="flex items-center gap-2"><span className="h-4 w-4 rounded border inline-block" style={{ backgroundColor: r.color }} />{r.color}</div> },
          { key: 'inUse', label: 'Status', render: (r: any) => <Badge variant={r.inUse ? 'default' : 'secondary'}>{r.inUse ? 'In Use' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Color</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><Label>Explanation</Label><Input value={form.explanation} onChange={(e) => set('explanation', e.target.value)} /></div>
            <div><Label>Access Code</Label><Input value={form.accessCode} onChange={(e) => set('accessCode', e.target.value)} /></div>
            <div><Label>Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} className="h-9 w-14 rounded cursor-pointer border" />
                <Input value={form.color} onChange={(e) => set('color', e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.doNotUseForVariantMatrix} onCheckedChange={(v) => set('doNotUseForVariantMatrix', v)} /><Label>Do NOT Use for Variant Matrix</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.inUse} onCheckedChange={(v) => set('inUse', v)} /><Label>In Use</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
